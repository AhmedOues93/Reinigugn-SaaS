-- Phase 21: first-run setup, the seeded Leistungskatalog, the extended Turnus
-- set, the transparent personnel model, and customer surcharges kept apart
-- from costs.
--
-- Run with supabase/test/run.sh. Every statement is assertive: the script fails
-- loudly if an invariant does not hold.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;

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
-- 1. The personnel model, before anything is stored
--
-- 5 days a week over 52 weeks is 260 paid working days. 30 holiday + 11 public
-- holidays + 10 sick + 2 training is 53 days absent, leaving 207 present —
-- 79.6 % of the year. 39 hours over 5 days is 468 minutes a day, of which 45
-- are travel and briefing, leaving 90.4 % of each day.
--
--   0.7961 × 0.9038 = 0.7196
-- ---------------------------------------------------------------------------
select pg_temp.assert(public.derive_productive_rate_bp(39, 5, 30, 11, 10, 2, 45) = 7196,
  'the productive share is the year share times the day share');
select pg_temp.assert(public.derive_productive_rate_bp(39, 5, 0, 0, 0, 0, 0) = 10000,
  'no absence and no travel is a fully productive year');
-- Both factors matter, and leaving either out overstates capacity.
select pg_temp.assert(public.derive_productive_rate_bp(39, 5, 30, 11, 10, 2, 0) = 7962,
  'absent days alone account for roughly a fifth of paid time');
select pg_temp.assert(public.derive_productive_rate_bp(39, 5, 0, 0, 0, 0, 45) = 9038,
  'daily travel alone accounts for roughly a tenth');
-- A derived share of zero would make the cost of an hour infinite.
select pg_temp.assert(public.derive_productive_rate_bp(39, 5, 200, 60, 200, 200, 400) = 1000,
  'the derived share is floored at 10 %, matching the column check');
select pg_temp.assert(public.derive_productive_rate_bp(39, 0, 0, 0, 0, 0, 0) = 10000,
  'a zero working week does not divide by zero');

-- ---------------------------------------------------------------------------
-- 2. Every Turnus a cleaning contract actually uses
-- ---------------------------------------------------------------------------
select pg_temp.assert(public.calculate_services_per_month('PRO_WOCHE', 5) = 21.667,
  'five a week is 21.667 visits a month');
select pg_temp.assert(public.calculate_services_per_month('VIERZEHNTAEGIG', 1) = 2.167,
  'a fortnightly service is half a weekly one');
select pg_temp.assert(public.calculate_services_per_month('PRO_MONAT', 1) = 1,
  'monthly is monthly');
select pg_temp.assert(public.calculate_services_per_month('VIERTELJAEHRLICH', 1) = 0.333,
  'quarterly is a third of a month');
select pg_temp.assert(public.calculate_services_per_month('HALBJAEHRLICH', 1) = 0.167,
  'half-yearly is a sixth of a month');
select pg_temp.assert(public.calculate_services_per_month('JAEHRLICH', 1) = 0.083,
  'yearly is a twelfth of a month');
select pg_temp.assert(public.calculate_services_per_month('EINMALIG', 1) = 0,
  'a one-off is not part of the monthly picture');

-- The customer reads words, not a decimal. "0,33× pro Monat" on a
-- Leistungsverzeichnis reads as a mistake.
select pg_temp.assert(public.frequency_label('PRO_WOCHE', 5) = '5× wöchentlich',
  'five a week reads as a count');
select pg_temp.assert(public.frequency_label('PRO_WOCHE', 1) = 'wöchentlich',
  'once a week needs no count');
select pg_temp.assert(public.frequency_label('VIERZEHNTAEGIG', 1) = '14-täglich', 'fortnightly');
select pg_temp.assert(public.frequency_label('VIERTELJAEHRLICH', 1) = 'vierteljährlich', 'quarterly');
select pg_temp.assert(public.frequency_label('HALBJAEHRLICH', 1) = 'halbjährlich', 'half-yearly');
select pg_temp.assert(public.frequency_label('JAEHRLICH', 1) = 'jährlich', 'yearly');
select pg_temp.assert(public.frequency_label('EINMALIG', 1) = 'einmalig', 'one-off');

-- ---------------------------------------------------------------------------
-- 3. Two tenants
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'p21-owner-a@example.test'),
  ('a2222222-2222-2222-2222-222222222222', 'p21-office-a@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'p21-employee-a@example.test'),
  ('b1111111-1111-1111-1111-111111111111', 'p21-owner-b@example.test');

select pg_temp.sign_in('a1111111-1111-1111-1111-111111111111');
select public.create_company_for_current_user('Phase21 Reinigung GmbH');
select pg_temp.sign_in('b1111111-1111-1111-1111-111111111111');
select public.create_company_for_current_user('Phase21 Rivale GmbH');
select pg_temp.sign_out();

create temporary table p21ctx as
select
  (select id from public.companies where name = 'Phase21 Reinigung GmbH') as company_a,
  (select id from public.companies where name = 'Phase21 Rivale GmbH') as company_b,
  (select id from public.profiles where auth_user_id = 'a2222222-2222-2222-2222-222222222222') as office_profile,
  (select id from public.profiles where auth_user_id = 'a3333333-3333-3333-3333-333333333333') as employee_profile;
grant select on p21ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select company_a, office_profile, 'OFFICE'::public.company_role, 'ACTIVE'::public.membership_status from p21ctx
union all
select company_a, employee_profile, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status from p21ctx;

insert into public.customers (company_id, name) select company_a, 'Phase21 Hausverwaltung' from p21ctx;

create temporary table p21ids as select
  (select id from public.customers where company_id = (select company_a from p21ctx)) as customer;
grant select on p21ids to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The company profile belongs to the OWNER
--
-- The profile carries the tax identifiers and appears on every invoice, so the
-- office may run the business on it but not rewrite whose business it is.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a2222222-2222-2222-2222-222222222222');
select pg_temp.assert_rejected(
  'select public.save_company_profile(p_managing_director := ''Hacker'')',
  'Only the OWNER');
select pg_temp.assert_rejected(
  'select public.save_company_profile(p_vat_rate_bp := 0)', 'Only the OWNER');

select pg_temp.sign_in('a1111111-1111-1111-1111-111111111111');
select public.save_company_profile(
  p_managing_director := 'Marlene Kowalski', p_city := 'Hamburg', p_vat_rate_bp := 700);
select pg_temp.assert(
  (select managing_director = 'Marlene Kowalski' and city = 'Hamburg'
      and default_vat_rate_basis_points = 700
   from public.companies where id = (select company_a from p21ctx)),
  'the owner can set the profile, including a reduced VAT rate');
-- Omitting a field leaves it alone rather than clearing it.
select public.save_company_profile(p_phone := '040 123456');
select pg_temp.assert(
  (select managing_director = 'Marlene Kowalski' and phone = '040 123456'
   from public.companies where id = (select company_a from p21ctx)),
  'a partial save does not clear the fields it omits');

-- ---------------------------------------------------------------------------
-- 5. A Leistungskatalog that is not empty on day one
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a2222222-2222-2222-2222-222222222222');
create temporary table seeded as
select public.set_service_focus(array['UNTERHALTSREINIGUNG', 'SANITAERREINIGUNG', 'GLASREINIGUNG']) as count;
grant select on seeded to authenticated;

select pg_temp.assert((select count from seeded) > 0,
  'choosing a focus seeds a starting catalogue');
select pg_temp.assert(
  (select count(*) from public.service_catalog_items
   where company_id = (select company_a from p21ctx)) = (select count from seeded),
  'every seeded service belongs to the company that asked for it');
-- Every seeded m² service must carry a Richtleistung, or it contributes no
-- time and silently prices at zero.
select pg_temp.assert(
  (select count(*) from public.service_catalog_items
   where company_id = (select company_a from p21ctx)
     and calculation_unit = 'QM' and coalesce(default_productivity_per_hour, 0) <= 0) = 0,
  'a seeded m² service always has a Richtleistung');

-- Repeating it is safe: seeding must never overwrite what the office has since
-- edited, and must not produce duplicates.
create temporary table one_item as
select id, name, category from public.service_catalog_items
where company_id = (select company_a from p21ctx) and calculation_unit = 'QM'
order by name limit 1;
grant select on one_item to authenticated;

select public.save_catalog_item((select id from one_item), (select name from one_item),
  (select category from one_item), 'QM', 111, null, 0, 'PRO_EINSATZ');
select pg_temp.assert(public.seed_service_catalog(array['UNTERHALTSREINIGUNG', 'SANITAERREINIGUNG']) = 0,
  'seeding the same focus again adds nothing');
select pg_temp.assert(
  (select default_productivity_per_hour = 111 from public.service_catalog_items
   where id = (select id from one_item)),
  'and leaves an edited Richtleistung alone');
select pg_temp.assert(
  (select count(*) from public.service_catalog_items
   where company_id = (select company_a from p21ctx)) = (select count from seeded),
  'and adds no duplicate rows');

-- The other tenant's catalogue is untouched by any of it.
select pg_temp.assert(
  (select count(*) from public.service_catalog_items where company_id = (select company_b from p21ctx)) = 0,
  'seeding one company does not reach another');

-- ---------------------------------------------------------------------------
-- 6. Assumptions: derived, or set by hand, and the database records which
-- ---------------------------------------------------------------------------
select public.set_calculation_defaults_v2(
  p_wage_cents := 1500, p_ancillary_bp := 2100, p_overhead_bp := 1000, p_target_margin_bp := 3000,
  p_weekly_hours := 39, p_working_days_per_week := 5,
  p_vacation_days := 30, p_public_holidays := 11, p_sick_days := 10, p_training_days := 2,
  p_unproductive_minutes_per_day := 45,
  p_min_hourly_rate_cents := 2800,
  p_travel_cents_per_visit := 800, p_setup_minutes_per_visit := 10,
  p_material_cents_per_visit := 300, p_machine_cents_per_month := 0);

select pg_temp.assert(
  (select productive_rate_bp = 7196 and productive_rate_is_manual = false
   from public.company_calculation_defaults where company_id = (select company_a from p21ctx)),
  'the days decide the productive share, and the choice is recorded');

-- An explicit percentage wins, and is marked as such.
select public.set_calculation_defaults_v2(
  p_wage_cents := 1500, p_ancillary_bp := 2100, p_overhead_bp := 1000, p_target_margin_bp := 3000,
  p_productive_bp := 8500,
  p_weekly_hours := 39, p_working_days_per_week := 5, p_vacation_days := 30,
  p_public_holidays := 11, p_sick_days := 10, p_training_days := 2,
  p_unproductive_minutes_per_day := 45,
  p_min_hourly_rate_cents := 2800,
  p_travel_cents_per_visit := 800, p_setup_minutes_per_visit := 10,
  p_material_cents_per_visit := 300, p_machine_cents_per_month := 0);
select pg_temp.assert(
  (select productive_rate_bp = 8500 and productive_rate_is_manual = true
   from public.company_calculation_defaults where company_id = (select company_a from p21ctx)),
  'an explicit percentage overrides the day model and says so');

-- An employee has no business in the costing model, phase 21 columns included.
select pg_temp.sign_in('a3333333-3333-3333-3333-333333333333');
select pg_temp.assert(
  (select count(*) from public.company_calculation_defaults) = 0,
  'an employee cannot read the wage assumptions');
select pg_temp.assert_rejected(
  'select public.set_calculation_defaults_v2(1, 0, 0, 0)', 'OWNER or OFFICE');
select pg_temp.assert_rejected(
  'select public.set_service_focus(array[''INDUSTRIE''])', 'OWNER or OFFICE');

-- ---------------------------------------------------------------------------
-- 7. A calculation carries the whole model, not just its result
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a2222222-2222-2222-2222-222222222222');
create temporary table p21calc as
select public.create_calculation('Phase21 Objekt', null, (select customer from p21ids)) as id;
grant select on p21calc to authenticated;

select pg_temp.assert(
  (select weekly_hours = 39 and working_days_per_week = 5 and vacation_days = 30
      and public_holidays = 11 and sick_days = 10 and training_days = 2
      and unproductive_minutes_per_day = 45 and productive_rate_is_manual = true
      and min_hourly_rate_cents = 2800
   from public.calculations where id = (select id from p21calc)),
  'a new Kalkulation copies the personnel model and the minimum rate onto itself');
select pg_temp.assert(
  (select travel_cents_per_visit = 800 and setup_minutes_per_visit = 10
   from public.calculations where id = (select id from p21calc)),
  'and the cost starting points the company configured');

-- Switching this calculation to the day model re-derives its share, and does
-- not touch the company defaults.
select public.update_calculation((select id from p21calc),
  p_vacation_days := 30, p_public_holidays := 11, p_sick_days := 10,
  p_training_days := 2, p_unproductive_minutes_per_day := 45);
select pg_temp.assert(
  (select productive_rate_bp = 7196 and productive_rate_is_manual = false
   from public.calculations where id = (select id from p21calc)),
  'sending the days re-derives this calculation''s productive share');
select pg_temp.assert(
  (select productive_rate_bp = 8500 from public.company_calculation_defaults
   where company_id = (select company_a from p21ctx)),
  'and leaves the company defaults where they were');

-- ---------------------------------------------------------------------------
-- 8. An incomplete calculation says so
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select 'KEINE_POSITIONEN' = any(incomplete_reasons)
   from public.calculations where id = (select id from p21calc)),
  'a calculation with no positions is reported as incomplete');

select public.update_calculation((select id from p21calc), p_visits_per_week := 5);
select public.save_calculation_line(null, (select id from p21calc), 'Bürogeschoss',
  'Unterhaltsreinigung Büro', 'QM', 500, 'PRO_WOCHE', 5,
  p_area_sqm := 500, p_productivity := 250, p_material_cents := 300,
  p_service_weekdays := array[1, 3, 5]::smallint[]);

select pg_temp.assert(
  (select service_weekdays = array[1, 3, 5]::smallint[]
   from public.calculation_lines where calculation_id = (select id from p21calc)),
  'the service weekdays are stored on the position');
select pg_temp.assert(
  (select cardinality(incomplete_reasons) = 0
   from public.calculations where id = (select id from p21calc)),
  'with a wage, a position and a margin nothing is missing');

-- A quarterly position costs a third of a monthly one, not the same.
select public.save_calculation_line(null, (select id from p21calc), 'Fensterfront',
  'Glasreinigung', 'QM', 300, 'VIERTELJAEHRLICH', 1, p_productivity := 35);
select pg_temp.assert(
  (select services_per_month = 0.333 and monthly_minutes = round(300.0 / 35 * 60 * 0.333, 2)
   from public.calculation_lines
   where calculation_id = (select id from p21calc) and area_name = 'Fensterfront'),
  'a quarterly position contributes a third of a month');

-- ---------------------------------------------------------------------------
-- 9. Surcharges are revenue, and are never counted as cost
-- ---------------------------------------------------------------------------
create temporary table before_surcharge as
select total_cost_cents_month as cost, selling_price_cents_month as price,
       base_price_cents_month as base
from public.calculations where id = (select id from p21calc);
grant select on before_surcharge to authenticated;

select public.update_calculation((select id from p21calc),
  p_surcharge_travel_cents_month := 5000,
  p_surcharge_small_order_cents_month := 2500,
  p_surcharge_offpeak_bp := 1000);

select pg_temp.assert(
  (select total_cost_cents_month = (select cost from before_surcharge)
   from public.calculations where id = (select id from p21calc)),
  'a customer surcharge does not change what the work costs');
select pg_temp.assert(
  (select base_price_cents_month = (select base from before_surcharge)
   from public.calculations where id = (select id from p21calc)),
  'nor the base price it is added to');
select pg_temp.assert(
  (select surcharge_cents_month = 5000 + 2500 + round(base_price_cents_month::numeric * 0.10)
   from public.calculations where id = (select id from p21calc)),
  'the percentage surcharge applies to the base price, not to the total');
select pg_temp.assert(
  (select selling_price_cents_month = base_price_cents_month + surcharge_cents_month
   from public.calculations where id = (select id from p21calc)),
  'the selling price is the base price plus the surcharges');
select pg_temp.assert(
  (select contribution_cents_month = selling_price_cents_month - total_cost_cents_month
      and margin_bp = public.margin_bp(selling_price_cents_month, total_cost_cents_month)
   from public.calculations where id = (select id from p21calc)),
  'the contribution and the margin follow the surcharged price');

-- The company's own travel cost and the customer's Anfahrtspauschale are
-- different columns, and raising one must not move the other.
select pg_temp.assert(
  (select travel_cost_cents_month > 0 and surcharge_travel_cents_month = 5000
      and travel_cost_cents_month <> surcharge_travel_cents_month
   from public.calculations where id = (select id from p21calc)),
  'the travel cost and the travel surcharge are separate figures');

-- The rate actually achieved, against the floor the company set itself.
select pg_temp.assert(
  (select price_cents_per_productive_hour
        = round(selling_price_cents_month / round(monthly_minutes / 60, 4))::bigint
   from public.calculations where id = (select id from p21calc)),
  'the achieved hourly rate is price divided by productive hours');
select pg_temp.assert(
  (select min_price_cents_month = round(2800 * round(monthly_minutes / 60, 4))::bigint
   from public.calculations where id = (select id from p21calc)),
  'the minimum rate is restated as a monthly price so the two can be compared');

-- ---------------------------------------------------------------------------
-- 10. What leaves the building carries no internal figure
-- ---------------------------------------------------------------------------
create temporary table lv as
select * from public.get_leistungsverzeichnis((select id from p21calc));
grant select on lv to authenticated;

select pg_temp.assert(
  (select count(*) from lv where frequency_label = 'vierteljährlich') = 1,
  'the Leistungsverzeichnis names the Turnus in words');
select pg_temp.assert(
  (select count(*) from information_schema.columns
   where table_name = 'lv' and table_schema like 'pg_temp%'
     and (column_name like '%cost%' or column_name like '%price%'
          or column_name like '%margin%' or column_name like '%wage%')) = 0,
  'and exposes no cost, price, wage or margin column');

-- ---------------------------------------------------------------------------
-- 11. The snapshot holds, surcharges and personnel model included
-- ---------------------------------------------------------------------------
select public.finalise_calculation((select id from p21calc));

select pg_temp.assert_rejected(
  format('select public.update_calculation(%L, p_surcharge_offpeak_bp := 0)', (select id from p21calc)),
  'draft');
select pg_temp.assert_rejected(
  format('select public.update_calculation(%L, p_vacation_days := 0)', (select id from p21calc)),
  'draft');

create temporary table frozen21 as
select selling_price_cents_month as price, surcharge_cents_month as surcharge,
       productive_rate_bp as productive, vacation_days as vacation
from public.calculations where id = (select id from p21calc);
grant select on frozen21 to authenticated;

-- Changing the company assumptions afterwards must not reach back into it.
select public.set_calculation_defaults_v2(
  p_wage_cents := 9900, p_ancillary_bp := 5000, p_overhead_bp := 5000, p_target_margin_bp := 5000,
  p_vacation_days := 0, p_public_holidays := 0, p_sick_days := 0, p_training_days := 0,
  p_unproductive_minutes_per_day := 0, p_min_hourly_rate_cents := 0);
select pg_temp.assert(
  (select selling_price_cents_month = (select price from frozen21)
      and surcharge_cents_month = (select surcharge from frozen21)
      and productive_rate_bp = (select productive from frozen21)
      and vacation_days = (select vacation from frozen21)
   from public.calculations where id = (select id from p21calc)),
  'a later change to the company model leaves a finalised Kalkulation alone');

-- A revision is a new draft of the same thinking, and must not silently reset
-- the model or the surcharges to whatever the company defaults now say.
create temporary table revision as
select public.revise_calculation((select id from p21calc)) as id;
grant select on revision to authenticated;

select pg_temp.assert(
  (select status = 'ENTWURF' and vacation_days = (select vacation from frozen21)
      and productive_rate_bp = (select productive from frozen21)
      and surcharge_travel_cents_month = 5000
      and surcharge_small_order_cents_month = 2500
      and surcharge_offpeak_bp = 1000
      and min_hourly_rate_cents = 2800
   from public.calculations where id = (select id from revision)),
  'a revision carries the personnel model, the surcharges and the minimum rate forward');
select pg_temp.assert(
  (select service_weekdays = array[1, 3, 5]::smallint[] from public.calculation_lines
   where calculation_id = (select id from revision) and area_name = 'Bürogeschoss'),
  'and the weekdays on each position');

-- ---------------------------------------------------------------------------
-- 12. First-run status is derived from what exists, not from clicks
-- ---------------------------------------------------------------------------
create temporary table status as select * from public.get_onboarding_status();
grant select on status to authenticated;

select pg_temp.assert(
  (select has_catalog and has_customer and has_calculation from status),
  'the checklist reflects the catalogue, customer and calculation that exist');
select pg_temp.assert((select has_employee from status),
  'and the employee that was actually added');
select pg_temp.assert((select not has_quote from status),
  'and does not claim an Angebot that was never created');
select pg_temp.assert((select onboarding_completed_at is null from status),
  'the wizard is not finished until somebody finishes it');

select public.complete_onboarding_step('unternehmen');
select public.complete_onboarding_step('unternehmen');
select pg_temp.assert(
  (select cardinality(onboarding_steps) = 1
   from public.companies where id = (select company_a from p21ctx)),
  'completing the same step twice records it once');

select public.complete_onboarding_step('abschluss', true);
select pg_temp.assert(
  (select onboarding_completed_at is not null
   from public.companies where id = (select company_a from p21ctx)),
  'finishing the wizard is recorded once and for all');

-- ---------------------------------------------------------------------------
-- 13. Another tenant sees none of it
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('b1111111-1111-1111-1111-111111111111');
select pg_temp.assert(
  (select count(*) from public.calculations where id = (select id from p21calc)) = 0,
  'another tenant cannot read the Kalkulation');
select pg_temp.assert(
  (select count(*) from public.service_catalog_items
   where company_id = (select company_a from p21ctx)) = 0,
  'nor the seeded catalogue');
select pg_temp.assert_rejected(
  format('select public.update_calculation(%L, p_surcharge_offpeak_bp := 0)', (select id from revision)),
  'not found');
-- Its own first-run status describes its own company, and reports the empty
-- state honestly rather than borrowing the neighbour's progress.
select pg_temp.assert(
  (select not has_catalog and not has_customer and not has_calculation
      and cardinality(service_focus) = 0 and onboarding_completed_at is null
   from public.get_onboarding_status()),
  'a second tenant starts from its own empty state');

rollback;

\o
\echo 'phase 21 invariants: all assertions passed'
