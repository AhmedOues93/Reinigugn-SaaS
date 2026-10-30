-- Sales pipeline invariants: Lead -> Besichtigung -> Kalkulation -> Angebot ->
-- acceptance, and the authorisation boundaries around it. Run by
-- supabase/test/run.sh against a database with every migration applied.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;

create or replace function pg_temp.sign_in(p_user uuid) returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', p_user::text, true); set role authenticated; end; $$;
create or replace function pg_temp.sign_out() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', true); end; $$;
create or replace function pg_temp.assert(p_condition boolean, p_message text) returns void language plpgsql as $$
begin if not p_condition then raise exception 'ASSERTION FAILED: %', p_message; end if; end; $$;
create or replace function pg_temp.assert_rejected(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if position(lower(p_expected) in lower(sqlerrm)) = 0 then
      raise exception 'WRONG REJECTION for %: expected "%", got "%"', p_sql, p_expected, sqlerrm;
    end if; return;
  end;
  raise exception 'NOT REJECTED: % (expected "%")', p_sql, p_expected;
end; $$;

insert into auth.users (id, email) values
  ('a1000000-0000-4000-8000-000000000001', 'sales-owner@example.test'),
  ('a1000000-0000-4000-8000-000000000002', 'sales-employee@example.test'),
  ('a1000000-0000-4000-8000-000000000003', 'rival-owner@example.test');

select pg_temp.sign_in('a1000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Pipeline GmbH');
select pg_temp.sign_in('a1000000-0000-4000-8000-000000000003');
select public.create_company_for_current_user('Rivale Zwei GmbH');
select pg_temp.sign_out();

create temporary table sctx as
select (select id from public.companies where name = 'Pipeline GmbH') as company_a,
       (select id from public.companies where name = 'Rivale Zwei GmbH') as company_b,
       (select id from public.profiles where auth_user_id = 'a1000000-0000-4000-8000-000000000002') as employee_profile;
grant select on sctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select company_a, employee_profile, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status from sctx;

update public.companies set default_hourly_rate_cents = 3600 where id = (select company_a from sctx);

-- An existing customer, so the "exactly one owner" rule is tested with two real
-- ids rather than one id and a NULL.
insert into public.customers (company_id, name) select company_a, 'Bestandskunde' from sctx;

-- ---------------------------------------------------------------------------
-- Lead -> survey -> calculation
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a1000000-0000-4000-8000-000000000001');

create temporary table lead1 as
select public.create_lead('Kanzlei Berger & Partner', 'Frau Berger', 'berger@example.test', '+49 40 111',
                          'Rathausmarkt 5', '20095', 'Hamburg', 'Website', 'Sucht wöchentliche Unterhaltsreinigung.') as id;
grant select on lead1 to authenticated;
select pg_temp.assert((select status = 'NEW' from public.leads where id = (select id from lead1)), 'a new lead starts as NEW');

create temporary table survey1 as
select public.schedule_site_survey((select id from lead1), null, 'Kanzlei Rathausmarkt', now() + interval '2 days',
                                   null, 'Rathausmarkt 5', '20095', 'Hamburg', 'Schlüssel bei der Rezeption.') as id;
grant select on survey1 to authenticated;
select pg_temp.assert((select status = 'SURVEY_BOOKED' from public.leads where id = (select id from lead1)),
                      'booking a survey advances the lead');
select pg_temp.assert_rejected(
  format('select public.schedule_site_survey(%L, %L, ''Beides'', now(), null, null, null, null, null)',
         (select id from lead1), (select id from public.customers limit 1)),
  'exactly one lead or customer');

-- Two measured areas: 120 min/visit and 45 min/visit at the company rate.
select public.add_survey_area((select id from survey1), 'Büroflächen', 240, 'Linoleum', 2, 120, null, null);
select public.add_survey_area((select id from survey1), 'Sanitär', 30, 'Fliesen', 2, 45, 4200, null);
select public.complete_site_survey((select id from survey1), 'Aufzug vorhanden, Anlieferung über Hof.');
select pg_temp.assert((select status = 'COMPLETED' and completed_at is not null from public.site_surveys where id = (select id from survey1)),
                      'a completed survey records when it happened');
select pg_temp.assert_rejected(format('select public.complete_site_survey(%L, null)', (select id from survey1)),
                               'Only a planned survey');

-- ---------------------------------------------------------------------------
-- Kalkulation -> quote
-- ---------------------------------------------------------------------------
create temporary table quote1 as
select public.create_quote_from_survey((select id from survey1), 'Unterhaltsreinigung Kanzlei Rathausmarkt', 30) as id;
grant select on quote1 to authenticated;

select pg_temp.assert((select count(*) = 2 from public.quote_lines where quote_id = (select id from quote1)),
                      'every measured area becomes a quote line');
-- 120 min = 2.000 h at 3600 => 7200 net; 45 min = 0.750 h at 4200 => 3150 net.
-- VAT is rounded per line, half away from zero, which is the commercial rule:
-- 7200 -> 1368 and 3150 -> 599 (not 598), so 1967 in total.
select pg_temp.assert(
  (select net_total_cents = 10350 and vat_total_cents = 1967 and gross_total_cents = 12317 from public.quotes where id = (select id from quote1)),
  'quote totals are derived from minutes and the hourly rate, per area');

select pg_temp.assert(
  (select vat_amount_cents = 599 from public.quote_lines
   where quote_id = (select id from quote1) and net_amount_cents = 3150),
  'a half-cent of VAT rounds up, not to even');
-- Both lines are weekly: 10350 * 13/3 = 44850 per month.
select pg_temp.assert((select recurring_net_monthly_cents = 44850 from public.quotes where id = (select id from quote1)),
                      'the recurring monthly value is derived from the weekly lines');
select pg_temp.assert((select status = 'QUOTED' from public.leads where id = (select id from lead1)),
                      'producing a quote advances the lead');
select pg_temp.assert((select count(*) = 2 from public.quote_lines where quote_id = (select id from quote1) and survey_area_id is not null),
                      'each line keeps a link back to the area it was calculated from');

-- An area with no rate anywhere cannot be silently priced at zero.
select pg_temp.sign_out();
update public.companies set default_hourly_rate_cents = null where id = (select company_a from sctx);
select pg_temp.sign_in('a1000000-0000-4000-8000-000000000001');
create temporary table survey2 as
select public.schedule_site_survey((select id from lead1), null, 'Zweitobjekt', now() + interval '3 days', null, null, null, null, null) as id;
grant select on survey2 to authenticated;
select public.add_survey_area((select id from survey2), 'Ohne Satz', 10, null, 1, 30, null, null);
select pg_temp.assert_rejected(format('select public.create_quote_from_survey(%L, ''Ohne Satz'', 30)', (select id from survey2)),
                               'No hourly rate');
select pg_temp.sign_out();
update public.companies set default_hourly_rate_cents = 3600 where id = (select company_a from sctx);
select pg_temp.sign_in('a1000000-0000-4000-8000-000000000001');

-- Drafts hold no number; sending assigns one and freezes the quote.
select pg_temp.assert((select quote_number is null and sent_at is null from public.quotes where id = (select id from quote1)),
                      'a draft quote consumes no number');
select pg_temp.assert(public.send_quote((select id from quote1)) = format('AN-%s-0001', extract(year from current_date)::int),
                      'the first quote of a company and year is numbered 0001');
select pg_temp.assert(
  (select recipient_snapshot ->> 'name' = 'Kanzlei Berger & Partner' and company_snapshot ->> 'name' = 'Pipeline GmbH'
   from public.quotes where id = (select id from quote1)),
  'sending snapshots both parties');

select pg_temp.assert_rejected(
  format('select public.add_quote_line(%L, ''Nachtrag'', 1, ''Std'', 100, 1900, ''ONE_OFF'')', (select id from quote1)),
  'Only a draft quote');
select pg_temp.sign_out();
select pg_temp.assert_rejected(format('update public.quotes set gross_total_cents = 1 where id = %L', (select id from quote1)), 'immutable');
select pg_temp.assert_rejected(format('delete from public.quotes where id = %L', (select id from quote1)), 'cannot be deleted');
select pg_temp.assert_rejected(format('update public.quote_lines set unit_price_cents = 1 where quote_id = %L', (select id from quote1)),
                               'cannot be changed');
select pg_temp.sign_in('a1000000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- Acceptance: the conversion into the operational tables
-- ---------------------------------------------------------------------------
select pg_temp.assert_rejected(format('select public.accept_quote(%L, array[9]::smallint[])', (select id from quote1)), 'Invalid weekday');
select pg_temp.assert_rejected(
  format('select public.accept_quote(%L, array[1]::smallint[], ''10:00''::time, ''08:00''::time)', (select id from quote1)),
  'Invalid service window');

create temporary table converted as
select public.accept_quote((select id from quote1), array[1, 4]::smallint[], '07:00', '09:30') as customer_id;
grant select on converted to authenticated;

select pg_temp.assert((select status = 'ACCEPTED' and accepted_at is not null from public.quotes where id = (select id from quote1)),
                      'the quote records its acceptance');
select pg_temp.assert((select status = 'WON' and converted_customer_id = (select customer_id from converted) from public.leads where id = (select id from lead1)),
                      'the lead is won and points at the customer it became');
select pg_temp.assert((select name = 'Kanzlei Berger & Partner' and city = 'Hamburg' from public.customers where id = (select customer_id from converted)),
                      'the customer is created from the lead');
select pg_temp.assert(
  (select o.name = 'Kanzlei Rathausmarkt' and o.access_instructions = 'Schlüssel bei der Rezeption.'
   from public.cleaning_objects o join public.quotes q on q.created_object_id = o.id where q.id = (select id from quote1)),
  'the site is created from the survey, access notes included');
select pg_temp.assert(
  (select count(*) = 2 from public.schedule_rules r join public.quotes q on q.created_schedule_id = r.service_schedule_id
   where q.id = (select id from quote1)),
  'the recurring plan gets one rule per chosen weekday');
select pg_temp.assert(
  (select s.billing_unit_price_cents = 3600 from public.service_schedules s join public.quotes q on q.created_schedule_id = s.id
   where q.id = (select id from quote1)),
  'the agreed rate is carried into the schedule so billing does not re-derive it');
select pg_temp.assert_rejected(format('select public.accept_quote(%L)', (select id from quote1)), 'Only a sent quote');

-- A quote with no recurring line must not fabricate a schedule.
create temporary table quote2 as
select public.create_quote_from_survey((select id from survey2), 'Einmalige Grundreinigung', 14) as id;
grant select on quote2 to authenticated;
select public.remove_quote_line((select id from public.quote_lines where quote_id = (select id from quote2) limit 1));
select public.add_quote_line((select id from quote2), 'Grundreinigung', 8, 'Std', 5000, 1900, 'ONE_OFF');
select pg_temp.assert(public.send_quote((select id from quote2)) = format('AN-%s-0002', extract(year from current_date)::int),
                      'quote numbering continues without gaps');
select public.accept_quote((select id from quote2), array[2]::smallint[]);
select pg_temp.assert((select created_schedule_id is null and created_object_id is not null from public.quotes where id = (select id from quote2)),
                      'a one-off quote creates a site but no recurring plan');
select pg_temp.assert((select recurring_net_monthly_cents = 0 from public.quotes where id = (select id from quote2)),
                      'a one-off quote has no monthly recurring value');

-- ---------------------------------------------------------------------------
-- Authorisation
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a1000000-0000-4000-8000-000000000002');  -- EMPLOYEE
select pg_temp.assert((select count(*) from public.leads) = 0, 'an employee reads no lead');
select pg_temp.assert((select count(*) from public.quotes) = 0, 'an employee reads no quote');
select pg_temp.assert((select count(*) from public.quote_lines) = 0, 'an employee reads no quote line, so no price');
select pg_temp.assert((select count(*) from public.survey_areas) = 0, 'an employee reads no calculation');
select pg_temp.assert_rejected(
  'select public.create_lead(''X'', null, null, null, null, null, null, null, null)', 'OWNER or OFFICE');
select pg_temp.assert_rejected(format('select public.send_quote(%L)', (select id from quote2)), 'OWNER or OFFICE');
select pg_temp.assert_rejected(format('select public.accept_quote(%L)', (select id from quote1)), 'OWNER or OFFICE');

select pg_temp.sign_in('a1000000-0000-4000-8000-000000000003');  -- other tenant
select pg_temp.assert((select count(*) from public.leads) = 0, 'an owner reads no lead of another tenant');
select pg_temp.assert((select count(*) from public.quotes) = 0, 'an owner reads no quote of another tenant');
select pg_temp.assert_rejected(format('select public.send_quote(%L)', (select id from quote2)), 'Quote not found');
select pg_temp.assert_rejected(format('select public.accept_quote(%L)', (select id from quote1)), 'Quote not found');
select pg_temp.assert_rejected(
  format('select public.add_survey_area(%L, ''Fremd'', 1, null, 1, 10, 100, null)', (select id from survey1)), 'Survey not found');
select pg_temp.assert_rejected(
  format('select public.set_lead_status(%L, ''CONTACTED'')', (select id from lead1)), 'Lead not found');

-- A lead is never won by hand; only acceptance may do it.
select pg_temp.sign_in('a1000000-0000-4000-8000-000000000001');
select pg_temp.assert_rejected(format('select public.set_lead_status(%L, ''WON'')', (select id from lead1)),
                               'won by accepting its quote');
select pg_temp.assert_rejected(format('select public.set_lead_status(%L, ''LOST'')', (select id from lead1)),
                               'A reason is required');

-- ---------------------------------------------------------------------------
-- An accepted quote must leave the office with visits, not just a plan.
-- Before this was enforced, `accept_quote` created the customer, the site and
-- the recurring plan and generated nothing: the planning board stayed empty
-- until somebody thought to toggle the plan off and on again.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a1000000-0000-4000-8000-000000000001');

create temporary table accepted as
select created_schedule_id as schedule_id from public.quotes where id = (select id from quote1);

select pg_temp.assert((select schedule_id from accepted) is not null,
                      'accepting a recurring quote creates a plan');
select pg_temp.assert(
  (select count(*) from public.jobs where service_schedule_id = (select schedule_id from accepted)) > 0,
  'accepting a recurring quote also generates its visits');

-- Every generated visit carries the customer and the site, so the field app and
-- billing both have what they need without a second lookup.
select pg_temp.assert(
  (select count(*) from public.jobs
    where service_schedule_id = (select schedule_id from accepted)
      and (customer_id is null or cleaning_object_id is null)) = 0,
  'every generated visit carries its customer and site');

-- Re-generating the same horizon must never duplicate a visit.
select public.generate_jobs_for_schedule((select schedule_id from accepted), current_date + 56);
select pg_temp.assert(
  (select count(*) from (
     select scheduled_date, count(*) c from public.jobs
      where service_schedule_id = (select schedule_id from accepted)
      group by scheduled_date having count(*) > 1) duplicates) = 0,
  'regenerating the horizon creates no duplicate visit');

select pg_temp.sign_out();
\o
rollback;
\pset tuples_only off
\echo 'sales pipeline invariants: all assertions passed'
