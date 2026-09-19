-- Kundenabnahme invariants: the three acceptance policies, who may accept,
-- what a dispute does to billability, and what stays fixed once a customer has
-- accepted.
--
-- Run with supabase/test/run.sh. Every statement is assertive: the script fails
-- loudly if an invariant does not hold.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;

/*
 * Impersonate a signed-in user. Switching to the `authenticated` role matters:
 * as the owning superuser, PostgreSQL bypasses row-level security entirely, so
 * the isolation assertions below would pass without proving anything.
 */
create or replace function pg_temp.sign_in(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set role authenticated;
end; $$;

create or replace function pg_temp.sign_out() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', true); end; $$;

create or replace function pg_temp.assert(p_condition boolean, p_message text) returns void language plpgsql as $$
begin if not p_condition then raise exception 'ASSERTION FAILED: %', p_message; end if; end; $$;

create or replace function pg_temp.assert_rejected(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_expected) in lower(sqlerrm)) = 0 then
      raise exception 'WRONG REJECTION for %: expected "%", got "%"', p_sql, p_expected, sqlerrm;
    end if;
    return;
  end;
  raise exception 'NOT REJECTED: % (expected "%")', p_sql, p_expected;
end; $$;

-- ---------------------------------------------------------------------------
-- One tenant with every role, a second tenant to check isolation against, and
-- a second customer inside the first tenant — the sharpest case, because
-- company scoping alone would let it through.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'office-a@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'employee-a@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'contact-a@example.test'),
  ('55555555-5555-5555-5555-555555555555', 'other-contact-a@example.test'),
  ('66666666-6666-6666-6666-666666666666', 'owner-b@example.test');

select pg_temp.sign_in('11111111-1111-1111-1111-111111111111');
select public.create_company_for_current_user('Glanz GmbH');
select pg_temp.sign_in('66666666-6666-6666-6666-666666666666');
select public.create_company_for_current_user('Rivale GmbH');
select pg_temp.sign_out();

create temporary table ctx as
select
  (select id from public.companies where name = 'Glanz GmbH') as company_a,
  (select id from public.profiles where auth_user_id = '11111111-1111-1111-1111-111111111111') as owner_profile,
  (select id from public.profiles where auth_user_id = '22222222-2222-2222-2222-222222222222') as office_profile,
  (select id from public.profiles where auth_user_id = '33333333-3333-3333-3333-333333333333') as employee_profile,
  (select id from public.profiles where auth_user_id = '44444444-4444-4444-4444-444444444444') as contact_profile,
  (select id from public.profiles where auth_user_id = '55555555-5555-5555-5555-555555555555') as other_contact_profile;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select company_a, office_profile, 'OFFICE'::public.company_role, 'ACTIVE'::public.membership_status from ctx
union all select company_a, employee_profile, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status from ctx
union all select company_a, contact_profile, 'CUSTOMER'::public.company_role, 'ACTIVE'::public.membership_status from ctx
union all select company_a, other_contact_profile, 'CUSTOMER'::public.company_role, 'ACTIVE'::public.membership_status from ctx;

insert into public.customers (company_id, name, billing_address, postal_code, city)
select company_a, 'Hausverwaltung Nord', 'Musterweg 1', '20095', 'Hamburg' from ctx;
insert into public.customers (company_id, name) select company_a, 'Zweiter Kunde' from ctx;

insert into public.cleaning_objects (company_id, customer_id, name, street, postal_code, city)
select ctx.company_a, c.id, 'Bürohaus Alster', 'Musterweg 1', '20095', 'Hamburg'
from ctx join public.customers c on c.company_id = ctx.company_a and c.name = 'Hausverwaltung Nord';
insert into public.cleaning_objects (company_id, customer_id, name, street, postal_code, city)
select ctx.company_a, c.id, 'Fremdobjekt', 'Anderswo 2', '20099', 'Hamburg'
from ctx join public.customers c on c.company_id = ctx.company_a and c.name = 'Zweiter Kunde';

-- Each portal contact belongs to exactly one customer.
insert into public.customer_contacts (company_id, customer_id, member_id)
select ctx.company_a, c.id, m.id from ctx
join public.customers c on c.company_id = ctx.company_a and c.name = 'Hausverwaltung Nord'
join public.company_members m on m.profile_id = ctx.contact_profile;
insert into public.customer_contacts (company_id, customer_id, member_id)
select ctx.company_a, c.id, m.id from ctx
join public.customers c on c.company_id = ctx.company_a and c.name = 'Zweiter Kunde'
join public.company_members m on m.profile_id = ctx.other_contact_profile;

create temporary table ids as
select
  (select id from public.customers where company_id = (select company_a from ctx) and name = 'Hausverwaltung Nord') as customer,
  (select id from public.customers where company_id = (select company_a from ctx) and name = 'Zweiter Kunde') as other_customer,
  (select id from public.cleaning_objects where name = 'Bürohaus Alster') as object,
  (select id from public.company_members where profile_id = (select employee_profile from ctx)) as employee_member;
grant select on ids to authenticated;

/*
 * A planned, assigned visit. `p_policy` is set where the office would set it —
 * on the job, for a one-off — or left null to inherit from the contract.
 */
create or replace function pg_temp.plan_job(p_title text, p_policy public.acceptance_policy default null, p_schedule uuid default null)
returns uuid language plpgsql as $$
declare job_id uuid;
begin
  -- Fixture setup, not part of what is under test: planning is an office action
  -- and is exercised by the planning suite.
  reset role;
  insert into public.jobs (company_id, customer_id, cleaning_object_id, service_schedule_id, title,
                           scheduled_date, planned_start_at, planned_end_at, acceptance_policy)
  select ctx.company_a, ids.customer, ids.object, p_schedule, p_title,
         current_date, current_date + time '07:00', current_date + time '10:00', p_policy
  from ctx cross join ids
  returning id into job_id;
  insert into public.job_assignments (company_id, job_id, member_id)
  select (select company_a from ctx), job_id, (select employee_member from ids);
  return job_id;
end; $$;

/*
 * The employee works the visit through the same RPCs the field app calls.
 *
 * `now()` is fixed for the whole transaction, so start and stop would otherwise
 * land on the same instant and fail the entry's own `finished_at > started_at`
 * check. Backing the start up an hour is the test harness standing in for time
 * passing, and is done outside the employee's session so no policy is bypassed
 * in the part of the flow actually under test.
 */
create or replace function pg_temp.work_job(p_job_id uuid) returns void language plpgsql as $$
begin
  perform pg_temp.sign_in('33333333-3333-3333-3333-333333333333');
  perform public.start_my_job(p_job_id);

  reset role;
  update public.job_time_entries set started_at = now() - interval '60 minutes'
  where job_id = p_job_id and finished_at is null;

  perform pg_temp.sign_in('33333333-3333-3333-3333-333333333333');
  perform public.stop_my_job(p_job_id);
end; $$;

-- ---------------------------------------------------------------------------
-- Policy 1: KEINE_ABNAHME_ERFORDERLICH
--
-- Finishing is the whole story. The record is complete and the work is ready
-- for the billing queue, with nobody asked to approve anything.
-- ---------------------------------------------------------------------------
create temporary table plain as select pg_temp.plan_job('Unterhaltsreinigung') as id;
grant select on plain to authenticated;
select pg_temp.work_job((select id from plain));

select pg_temp.sign_out();
select pg_temp.assert(
  (select status = 'ERFASST' and acceptance_policy = 'KEINE_ABNAHME_ERFORDERLICH'
      and acceptance_method = 'KEINE' and accepted_at is null
   from public.service_records where job_id = (select id from plain)),
  'a visit with no acceptance requirement is simply recorded');

select pg_temp.assert(
  (select net_minutes >= 0 and finished_at is not null and jsonb_array_length(performed_by) = 1
   from public.service_records where job_id = (select id from plain)),
  'the record snapshots the times and who performed the work');

select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select pg_temp.assert(
  (select count(*) from public.list_billable_jobs((select customer from ids), current_date - 1, current_date + 1)
   where job_id = (select id from plain)) = 1,
  'and it is ready to invoice');

-- Nobody signs a visit that needs no signature — not even the employee who
-- did it and would otherwise be allowed to take a signature.
select pg_temp.sign_in('33333333-3333-3333-3333-333333333333');
select pg_temp.assert_rejected(
  format('select public.sign_service_record_on_site(%L, ''Herr Meier'')', (select id from plain)),
  'not set up for an on-site signature');
select pg_temp.sign_in('44444444-4444-4444-4444-444444444444');
select pg_temp.assert_rejected(
  format('select public.confirm_my_portal_service(%L)', (select id from plain)),
  'not up for acceptance in the portal');

-- ---------------------------------------------------------------------------
-- Finishing twice produces one record, not two.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('33333333-3333-3333-3333-333333333333');
select pg_temp.assert_rejected(
  format('select public.stop_my_job(%L)', (select id from plain)),
  'No active time entry');
select pg_temp.sign_out();
select pg_temp.assert(
  (select count(*) from public.service_records where job_id = (select id from plain)) = 1,
  'a double Finish cannot produce a second Leistungsnachweis');
-- Even called directly, which is what a retried action would do.
select pg_temp.assert(
  public.build_service_record((select id from plain)) =
    (select id from public.service_records where job_id = (select id from plain)),
  'rebuilding returns the existing record rather than duplicating it');

-- ---------------------------------------------------------------------------
-- Policy 2: VOR_ORT_UNTERSCHRIFT
-- ---------------------------------------------------------------------------
create temporary table onsite as select pg_temp.plan_job('Grundreinigung', 'VOR_ORT_UNTERSCHRIFT') as id;
grant select on onsite to authenticated;
select pg_temp.work_job((select id from onsite));

select pg_temp.sign_out();
select pg_temp.assert(
  (select status = 'ABNAHME_AUSSTEHEND' from public.service_records where job_id = (select id from onsite)),
  'a visit needing a signature waits for one');

select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select pg_temp.assert(
  (select count(*) from public.list_billable_jobs((select customer from ids), current_date - 1, current_date + 1)
   where job_id = (select id from onsite)) = 0,
  'and is NOT offered for invoicing while it waits');

-- The employee holding the phone takes the signature; a colleague cannot.
select pg_temp.sign_in('44444444-4444-4444-4444-444444444444');
select pg_temp.assert_rejected(
  format('select public.sign_service_record_on_site(%L, ''Herr Meier'')', (select id from onsite)),
  'assigned to this visit');
select pg_temp.sign_in('66666666-6666-6666-6666-666666666666');
select pg_temp.assert_rejected(
  format('select public.sign_service_record_on_site(%L, ''Herr Meier'')', (select id from onsite)),
  'assigned to this visit');

select pg_temp.sign_in('33333333-3333-3333-3333-333333333333');
select pg_temp.assert_rejected(
  format('select public.sign_service_record_on_site(%L, '''')', (select id from onsite)),
  'name of the person accepting');
-- A signature file has to belong to this visit.
select pg_temp.assert_rejected(
  format('select public.sign_service_record_on_site(%L, ''Herr Meier'', %L)',
    (select id from onsite), (select company_a from ctx)::text || '/service/' || (select id from plain)::text || '/' || gen_random_uuid()::text || '.png'),
  'does not belong to this visit');

select public.sign_service_record_on_site(
  (select id from onsite), '  Herr Meier  ',
  (select company_a from ctx)::text || '/service/' || (select id from onsite)::text || '/' || gen_random_uuid()::text || '.png');

select pg_temp.sign_out();
select pg_temp.assert(
  (select status = 'ABGENOMMEN' and acceptance_method = 'VOR_ORT_UNTERSCHRIFT'
      and accepted_by_name = 'Herr Meier' and accepted_at is not null and signature_storage_path is not null
   from public.service_records where job_id = (select id from onsite)),
  'the signature records who signed, how and when');

select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select pg_temp.assert(
  (select count(*) from public.list_billable_jobs((select customer from ids), current_date - 1, current_date + 1)
   where job_id = (select id from onsite)) = 1,
  'once signed, the work is ready to invoice');

select pg_temp.sign_in('33333333-3333-3333-3333-333333333333');
select pg_temp.assert_rejected(
  format('select public.sign_service_record_on_site(%L, ''Frau Schmidt'')', (select id from onsite)),
  'already been accepted');

-- ---------------------------------------------------------------------------
-- Policy 3: PORTAL_ABNAHME — the customer confirms
-- ---------------------------------------------------------------------------
create temporary table portal as select pg_temp.plan_job('Sonderreinigung', 'PORTAL_ABNAHME') as id;
grant select on portal to authenticated;
select pg_temp.work_job((select id from portal));

select pg_temp.sign_in('44444444-4444-4444-4444-444444444444');
select pg_temp.assert(
  (select needs_my_action from public.list_my_portal_acceptances() where job_id = (select id from portal)),
  'the customer is shown the service waiting for them');
select pg_temp.assert(
  (select status = 'ABNAHME_AUSSTEHEND' from public.get_my_portal_acceptance((select id from portal))),
  'and can open it');

-- Another customer of the SAME company must not reach it by guessing the id.
select pg_temp.sign_in('55555555-5555-5555-5555-555555555555');
select pg_temp.assert(
  (select count(*) from public.get_my_portal_acceptance((select id from portal))) = 0,
  'another customer of the same company cannot read it');
select pg_temp.assert_rejected(
  format('select public.confirm_my_portal_service(%L)', (select id from portal)),
  'not found');
select pg_temp.assert_rejected(
  format('select public.dispute_my_portal_service(%L, ''Test'', ''Test'')', (select id from portal)),
  'not found');
select pg_temp.assert(
  (select count(*) from public.service_records where job_id = (select id from portal)) = 0,
  'and cannot read the row at all');

-- Another tenant likewise.
select pg_temp.sign_in('66666666-6666-6666-6666-666666666666');
select pg_temp.assert_rejected(
  format('select public.confirm_my_portal_service(%L)', (select id from portal)),
  'Portal access required');
select pg_temp.assert(
  (select count(*) from public.service_records where job_id = (select id from portal)) = 0,
  'another tenant cannot read the record');

-- The employee does not get to accept on the customer's behalf.
select pg_temp.sign_in('33333333-3333-3333-3333-333333333333');
select pg_temp.assert_rejected(
  format('select public.confirm_my_portal_service(%L)', (select id from portal)),
  'Portal access required');
select pg_temp.assert_rejected(
  format('select public.sign_service_record_on_site(%L, ''Herr Meier'')', (select id from portal)),
  'not set up for an on-site signature');

-- Nor does the office, other than through the documented dispute release.
select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select pg_temp.assert_rejected(
  format('select public.confirm_my_portal_service(%L)', (select id from portal)),
  'Portal access required');
select pg_temp.assert_rejected(
  format('update public.service_records set status = ''ABGENOMMEN'' where job_id = %L', (select id from portal)),
  'permission denied');

-- The right person confirms.
select pg_temp.sign_in('44444444-4444-4444-4444-444444444444');
select public.confirm_my_portal_service((select id from portal));
select pg_temp.assert(
  (select status = 'ABGENOMMEN' and acceptance_method = 'PORTAL_BESTAETIGUNG'
   from public.get_my_portal_acceptance((select id from portal))),
  'the customer accepts in the portal and the method says so');
select pg_temp.assert_rejected(
  format('select public.confirm_my_portal_service(%L)', (select id from portal)),
  'already been accepted');

select pg_temp.sign_out();
select pg_temp.assert(
  (select accepted_by_member_id is not null and accepted_by_name is not null
   from public.service_records where job_id = (select id from portal)),
  'and the accepting contact is recorded');

-- ---------------------------------------------------------------------------
-- The customer reports a problem instead
-- ---------------------------------------------------------------------------
create temporary table disputed as select pg_temp.plan_job('Sonderreinigung Treppenhaus', 'PORTAL_ABNAHME') as id;
grant select on disputed to authenticated;
select pg_temp.work_job((select id from disputed));

select pg_temp.sign_in('44444444-4444-4444-4444-444444444444');
create temporary table complaint as
select public.dispute_my_portal_service((select id from disputed), 'Treppenhaus nicht gereinigt', 'Das zweite Obergeschoss wurde ausgelassen.') as id;
grant select on complaint to authenticated;

select pg_temp.sign_out();
select pg_temp.assert(
  (select status = 'PROBLEM_GEMELDET' and disputed_at is not null and complaint_id = (select id from complaint)
   from public.service_records where job_id = (select id from disputed)),
  'a reported problem is recorded and linked to a Reklamation');

-- The existing complaint model is reused, not duplicated.
select pg_temp.assert(
  (select job_id = (select id from disputed) and status = 'OPEN'
   from public.complaints where id = (select id from complaint)),
  'the Reklamation points back at the same visit');

-- The evidence is untouched by the complaint.
select pg_temp.assert(
  (select jsonb_array_length(performed_by) = 1 and net_minutes is not null
   from public.service_records where job_id = (select id from disputed)),
  'the original evidence survives the dispute intact');

select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select pg_temp.assert(
  (select count(*) from public.list_billable_jobs((select customer from ids), current_date - 1, current_date + 1)
   where job_id = (select id from disputed)) = 0,
  'a disputed service is not billable');
select pg_temp.assert(
  (select queue from public.list_service_records(current_date - 1, current_date + 1)
   where job_id = (select id from disputed)) = 'PROBLEM_GEMELDET',
  'and the office sees it as needing attention');

-- The customer cannot keep re-reporting, nor accept what they disputed.
select pg_temp.sign_in('44444444-4444-4444-4444-444444444444');
select pg_temp.assert_rejected(
  format('select public.dispute_my_portal_service(%L, ''Nochmal'', ''Nochmal'')', (select id from disputed)),
  'already been reported');
select pg_temp.assert_rejected(
  format('select public.confirm_my_portal_service(%L)', (select id from disputed)),
  'office is looking into it');

-- --- The office resolves it -------------------------------------------------
select pg_temp.sign_in('33333333-3333-3333-3333-333333333333');
select pg_temp.assert_rejected(
  format('select public.resolve_service_dispute(%L, ''BUERO_FREIGABE'')', (select id from disputed)),
  'Only OWNER or OFFICE');

select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select pg_temp.assert_rejected(
  format('select public.resolve_service_dispute(%L, ''EGAL'')', (select id from disputed)),
  'Unknown resolution');

-- Back to the customer: the office fixed something and asks again.
select public.resolve_service_dispute((select id from disputed), 'ZURUECK_ZUR_ABNAHME', 'Nachgereinigt am Folgetag');
select pg_temp.sign_out();
select pg_temp.assert(
  (select status = 'ABNAHME_AUSSTEHEND' and disputed_at is null and accepted_at is null
   from public.service_records where job_id = (select id from disputed)),
  'resolving returns the service to the customer, still unaccepted');

select pg_temp.sign_in('44444444-4444-4444-4444-444444444444');
select public.confirm_my_portal_service((select id from disputed));
select pg_temp.sign_out();
select pg_temp.assert(
  (select status = 'ABGENOMMEN' from public.service_records where job_id = (select id from disputed)),
  'and the customer can then accept it');

-- --- The other outcome: the office releases it itself -----------------------
create temporary table released as select pg_temp.plan_job('Sonderreinigung Tiefgarage', 'PORTAL_ABNAHME') as id;
grant select on released to authenticated;
select pg_temp.work_job((select id from released));
select pg_temp.sign_in('44444444-4444-4444-4444-444444444444');
select public.dispute_my_portal_service((select id from released), 'Fleck übersehen', 'An der Einfahrt ist noch ein Ölfleck.');
select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select public.resolve_service_dispute((select id from released), 'BUERO_FREIGABE', 'Telefonisch geklärt, Gutschrift vereinbart');
select pg_temp.sign_out();
select pg_temp.assert(
  (select status = 'ABGENOMMEN' and acceptance_method = 'BUERO_FREIGABE'
   from public.service_records where job_id = (select id from released)),
  'an office release is recorded as an office release, never as a customer confirmation');

-- ---------------------------------------------------------------------------
-- Immutability
--
-- Once accepted, the evidence is fixed. Not hidden — refused.
-- ---------------------------------------------------------------------------
select pg_temp.assert_rejected(
  format('update public.service_records set net_minutes = 999 where job_id = %L', (select id from portal)),
  'cannot be changed');
select pg_temp.assert_rejected(
  format('update public.service_records set checklist_snapshot = ''[{"title":"Nie passiert","completed":true}]''::jsonb where job_id = %L',
    (select id from portal)),
  'cannot be changed');
select pg_temp.assert_rejected(
  format('update public.service_records set accepted_by_name = ''Jemand anderes'' where job_id = %L', (select id from portal)),
  'cannot be changed');
select pg_temp.assert_rejected(
  format('update public.service_records set status = ''ERFASST'' where job_id = %L', (select id from portal)),
  'cannot be changed');

-- Editing the job afterwards cannot rewrite what the customer accepted.
update public.jobs set title = 'Nachträglich umbenannt' where id = (select id from portal);
select pg_temp.assert(
  (select title = 'Sonderreinigung' from public.service_records where job_id = (select id from portal)),
  'renaming the job does not rewrite the accepted Leistungsnachweis');

-- The documented way out, and who may use it.
select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select pg_temp.assert_rejected(
  format('select public.revoke_service_acceptance(%L, ''Falsch erfasst'')', (select id from portal)),
  'Only the OWNER');
select pg_temp.sign_in('11111111-1111-1111-1111-111111111111');
select pg_temp.assert_rejected(
  format('select public.revoke_service_acceptance(%L, ''x'')', (select id from portal)),
  'reason is required');

select public.revoke_service_acceptance((select id from portal), 'Falscher Leistungszeitraum erfasst');
select pg_temp.sign_out();
select pg_temp.assert(
  (select status = 'ABNAHME_AUSSTEHEND' and accepted_at is null and acceptance_method is null
      and signature_storage_path is null
   from public.service_records where job_id = (select id from portal)),
  'revoking clears the acceptance');
-- The audit trail is readable by the office, which is who it is for.
select pg_temp.sign_in('11111111-1111-1111-1111-111111111111');
select pg_temp.assert(
  (select count(*) from public.list_service_record_events((select id from portal))
   where event = 'FREIGABE_WIDERRUFEN') = 1,
  'and leaves the revocation in the audit trail');
select pg_temp.assert(
  (select count(*) from public.list_service_record_events((select id from portal))) >= 3,
  'alongside the creation and the acceptance it replaced');
select pg_temp.sign_out();
select pg_temp.assert(
  (select note like '%Falscher Leistungszeitraum%' and note like '%PORTAL_BESTAETIGUNG%'
   from public.service_record_events happening
   join public.service_records record on record.id = happening.service_record_id
   where record.job_id = (select id from portal) and happening.event = 'FREIGABE_WIDERRUFEN'),
  'the audit line preserves what was revoked, by whom and why');

-- ---------------------------------------------------------------------------
-- Billing modes: recorded time never silently becomes money
-- ---------------------------------------------------------------------------
insert into public.service_schedules
  (company_id, customer_id, cleaning_object_id, name, valid_from, billing_unit_price_cents, billing_vat_rate_basis_points, billing_mode)
select ctx.company_a, ids.customer, ids.object, 'Pauschalvertrag', current_date - 30, 4800, 1900, 'PAUSCHALE_PRO_EINSATZ' from ctx cross join ids;
insert into public.service_schedules
  (company_id, customer_id, cleaning_object_id, name, valid_from, billing_unit_price_cents, billing_vat_rate_basis_points, billing_mode)
select ctx.company_a, ids.customer, ids.object, 'Stundenvertrag', current_date - 30, 3200, 1900, 'STUNDENSATZ' from ctx cross join ids;
insert into public.service_schedules
  (company_id, customer_id, cleaning_object_id, name, valid_from, billing_unit_price_cents, billing_vat_rate_basis_points, billing_mode)
select ctx.company_a, ids.customer, ids.object, 'Monatsvertrag', current_date - 30, 95000, 1900, 'MONATSPAUSCHALE' from ctx cross join ids;

create temporary table flat as
select pg_temp.plan_job('Pauschale Reinigung', null,
  (select id from public.service_schedules where name = 'Pauschalvertrag')) as id;
create temporary table hourly as
select pg_temp.plan_job('Reinigung nach Aufwand', null,
  (select id from public.service_schedules where name = 'Stundenvertrag')) as id;
create temporary table monthly as
select pg_temp.plan_job('Reinigung im Monatsvertrag', null,
  (select id from public.service_schedules where name = 'Monatsvertrag')) as id;
grant select on flat, hourly, monthly to authenticated;

select pg_temp.work_job((select id from flat));
select pg_temp.work_job((select id from hourly));
select pg_temp.work_job((select id from monthly));

-- Give the two priced visits a realistic duration to bill against.
select pg_temp.sign_out();
update public.job_time_entries set started_at = now() - interval '150 minutes', finished_at = now()
where job_id in ((select id from flat), (select id from hourly));
update public.service_records set net_minutes = 150 where job_id in ((select id from flat), (select id from hourly));

select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select pg_temp.assert(
  (select suggested_quantity = 1 and suggested_unit = 'Einsatz' and billing_mode = 'PAUSCHALE_PRO_EINSATZ'
   from public.list_billable_jobs((select customer from ids), current_date - 1, current_date + 1)
   where job_id = (select id from flat)),
  'a fixed-price visit bills as one visit, whatever the clock said');
select pg_temp.assert(
  (select suggested_quantity = 2.5 and suggested_unit = 'Std' and billing_mode = 'STUNDENSATZ'
   from public.list_billable_jobs((select customer from ids), current_date - 1, current_date + 1)
   where job_id = (select id from hourly)),
  'only an explicitly hourly contract turns recorded time into quantity');
select pg_temp.assert(
  (select count(*) from public.list_billable_jobs((select customer from ids), current_date - 1, current_date + 1)
   where job_id = (select id from monthly)) = 0,
  'a monthly flat-rate visit is never offered as a per-visit line');
select pg_temp.assert(
  (select queue from public.list_service_records(current_date - 1, current_date + 1)
   where job_id = (select id from monthly)) = 'MONATSPAUSCHALE',
  'but it is still visible to the office, under its own heading');

-- ---------------------------------------------------------------------------
-- Invoiced work leaves the queue and cannot be billed twice
-- ---------------------------------------------------------------------------
create temporary table inv as
select public.create_draft_invoice((select customer from ids), current_date - 30, current_date + 1, 14::smallint, null) as id;
grant select on inv to authenticated;
select public.add_invoice_line((select id from inv), 'Pauschale Reinigung', 1, 'Einsatz', 4800, 1900,
  (select id from flat), null, (select object from ids));

select pg_temp.assert(
  (select count(*) from public.list_billable_jobs((select customer from ids), current_date - 1, current_date + 1)
   where job_id = (select id from flat)) = 0,
  'work on a live invoice is no longer billable');
select pg_temp.assert(
  (select queue from public.list_service_records(current_date - 1, current_date + 1)
   where job_id = (select id from flat)) = 'ABGERECHNET',
  'and the office sees it as invoiced');

-- An accepted service already on an invoice is not revocable behind the
-- invoice's back: the correction belongs on the invoice, which the billing
-- side already knows how to do.
select public.add_invoice_line((select id from inv), 'Grundreinigung', 1, 'Einsatz', 35000, 1900,
  (select id from onsite), null, (select object from ids));
select public.issue_invoice((select id from inv), current_date);

select pg_temp.sign_in('11111111-1111-1111-1111-111111111111');
select pg_temp.assert(
  (select status = 'ABGENOMMEN' from public.service_records where job_id = (select id from onsite)),
  'the signed visit is accepted and now invoiced');
select pg_temp.assert_rejected(
  format('select public.revoke_service_acceptance(%L, ''Doch nicht erbracht'')', (select id from onsite)),
  'already invoiced');

-- ---------------------------------------------------------------------------
-- A contract that asks for something nobody can deliver
-- ---------------------------------------------------------------------------
insert into public.service_schedules
  (company_id, customer_id, cleaning_object_id, name, valid_from, acceptance_policy)
select ctx.company_a, ids.other_customer,
  (select id from public.cleaning_objects where name = 'Fremdobjekt'),
  'Portalabnahme ohne Kontakt', current_date - 10, 'PORTAL_ABNAHME'
from ctx cross join ids;

select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select pg_temp.assert(
  (select count(*) from public.list_acceptance_config_warnings()
   where schedule_name = 'Portalabnahme ohne Kontakt') = 0,
  'a customer WITH a portal contact raises no warning');

-- Take the portal contact away, which is what makes the plan impossible.
select pg_temp.sign_out();
delete from public.customer_contacts
where member_id = (select id from public.company_members where profile_id = (select other_contact_profile from ctx));

select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select pg_temp.assert(
  (select count(*) from public.list_acceptance_config_warnings()
   where schedule_name = 'Portalabnahme ohne Kontakt') = 1,
  'a portal acceptance with no portal contact is reported to the office');

-- ---------------------------------------------------------------------------
-- The policy is resolved from the contract, not chosen by the employee
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  public.resolve_acceptance_policy((select id from flat)) = 'KEINE_ABNAHME_ERFORDERLICH',
  'a plan with no policy set means no acceptance is required');

update public.service_schedules set acceptance_policy = 'PORTAL_ABNAHME' where name = 'Pauschalvertrag';
create temporary table inherited as
select pg_temp.plan_job('Erbt vom Vertrag', null,
  (select id from public.service_schedules where name = 'Pauschalvertrag')) as id;
grant select on inherited to authenticated;
select pg_temp.assert(
  public.resolve_acceptance_policy((select id from inherited)) = 'PORTAL_ABNAHME',
  'a visit inherits its contract''s policy without anyone choosing it');

-- The object is the fallback for a visit with no contract at all.
update public.cleaning_objects set acceptance_policy = 'VOR_ORT_UNTERSCHRIFT' where id = (select object from ids);
create temporary table adhoc as select pg_temp.plan_job('Einmalige Zusatzarbeit') as id;
grant select on adhoc to authenticated;
select pg_temp.assert(
  public.resolve_acceptance_policy((select id from adhoc)) = 'VOR_ORT_UNTERSCHRIFT',
  'an ad-hoc visit falls back to the object''s house rule');

-- And the office can override for one visit, which is what a Sonderleistung is.
update public.jobs set acceptance_policy = 'KEINE_ABNAHME_ERFORDERLICH' where id = (select id from adhoc);
select pg_temp.assert(
  public.resolve_acceptance_policy((select id from adhoc)) = 'KEINE_ABNAHME_ERFORDERLICH',
  'a per-visit override wins over both');

select pg_temp.sign_out();
rollback;
\o
\echo 'Kundenabnahme invariants: all assertions passed'
