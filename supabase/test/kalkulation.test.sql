-- Kalkulation invariants: productivity into time, the cost side, the
-- difference between markup and margin, the commercial snapshot, and who may
-- see any of it.
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
-- 1. Pure arithmetic, before anything is stored
-- ---------------------------------------------------------------------------

-- Richtleistung: 500 m² at 250 m²/h is two hours.
select pg_temp.assert(public.calculate_line_minutes('QM', 500, 250, null, null) = 120,
  '500 m² at 250 m²/h is 120 minutes');
select pg_temp.assert(public.calculate_line_minutes('QM', 500, 250, null, 90) = 90,
  'a manual time overrides the Richtleistung');
select pg_temp.assert(public.calculate_line_minutes('STUECK', 20, null, 3, null) = 60,
  '20 pieces at 3 minutes each is an hour');
select pg_temp.assert(public.calculate_line_minutes('STUNDE', 2.5, null, null, null) = 150,
  'two and a half hours is 150 minutes');
select pg_temp.assert(public.calculate_line_minutes('EINSATZ', 99, null, 45, null) = 45,
  'a per-visit time ignores the quantity');
select pg_temp.assert(public.calculate_line_minutes('PAUSCHAL', 10, null, null, null) = 0,
  'a flat amount buys no time');
-- A missing productivity must not silently become a division by zero.
select pg_temp.assert(public.calculate_line_minutes('QM', 500, null, null, null) = 0,
  'no Richtleistung yields no time rather than an error');

-- Frequency into a month, at 13/3 weeks.
select pg_temp.assert(public.calculate_services_per_month('PRO_WOCHE', 5) = 21.667,
  'five a week is 21.667 visits a month');
select pg_temp.assert(public.calculate_services_per_month('PRO_MONAT', 1) = 1,
  'monthly is monthly');
select pg_temp.assert(public.calculate_services_per_month('EINMALIG', 1) = 0,
  'a one-off is not part of the monthly picture');

-- Personnel cost: 15,00 € wage, 21 % ancillary, 85 % productive, 10 % overhead.
--   1500 × 1.21 ÷ 0.85 × 1.10 = 2349
select pg_temp.assert(public.personnel_cost_per_hour(1500, 2100, 8500, 1000) = 2349,
  'the personnel cost formula is wage × (1+ancillary) ÷ productive × (1+overhead)');
-- The division by the productive share is the part that is easy to leave out.
select pg_temp.assert(public.personnel_cost_per_hour(1500, 0, 10000, 0) = 1500,
  'with no ancillary cost and fully productive time, cost equals wage');
select pg_temp.assert(public.personnel_cost_per_hour(1500, 0, 5000, 0) = 3000,
  'half the paid time being productive doubles the cost of a productive hour');

-- Markup and margin are different numbers from the same pair.
select pg_temp.assert(public.price_from_margin(10000, 3000) = 14286,
  'a 30 % margin prices 100,00 € of cost at 142,86 €');
select pg_temp.assert(public.margin_bp(14286, 10000) = 3000, 'margin = (price − cost) ÷ price');
select pg_temp.assert(public.markup_bp(14286, 10000) = 4286, 'markup = (price − cost) ÷ cost');
select pg_temp.assert(public.markup_bp(13000, 10000) = 3000 and public.margin_bp(13000, 10000) = 2308,
  'cost plus 30 % is a 30 % markup but only a 23.08 % margin');
select pg_temp.assert(public.price_from_margin(10000, 0) = 10000, 'no margin means price equals cost');
select pg_temp.assert(public.margin_bp(0, 1000) = 0, 'a zero price does not divide by zero');
select pg_temp.assert(public.markup_bp(1000, 0) = 0, 'a zero cost does not divide by zero');

-- Cost bases.
select pg_temp.assert(public.cost_to_month(500, 'PRO_MONAT', 21.667, 40, 500) = 500,
  'a monthly cost is already monthly');
select pg_temp.assert(public.cost_to_month(500, 'PRO_STUNDE', 21.667, 40, 500) = 20000,
  'an hourly cost multiplies by the monthly hours');
select pg_temp.assert(public.cost_to_month(5, 'PRO_QM', 21.667, 40, 500) = 2500,
  'a per-m² cost multiplies by the area');

-- ---------------------------------------------------------------------------
-- 2. A tenant, its people, and a second tenant to check isolation against
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'office-a@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'employee-a@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'contact-a@example.test'),
  ('55555555-5555-5555-5555-555555555555', 'owner-b@example.test');

select pg_temp.sign_in('11111111-1111-1111-1111-111111111111');
select public.create_company_for_current_user('Glanz GmbH');
select pg_temp.sign_in('55555555-5555-5555-5555-555555555555');
select public.create_company_for_current_user('Rivale GmbH');
select pg_temp.sign_out();

create temporary table ctx as
select
  (select id from public.companies where name = 'Glanz GmbH') as company_a,
  (select id from public.profiles where auth_user_id = '22222222-2222-2222-2222-222222222222') as office_profile,
  (select id from public.profiles where auth_user_id = '33333333-3333-3333-3333-333333333333') as employee_profile,
  (select id from public.profiles where auth_user_id = '44444444-4444-4444-4444-444444444444') as contact_profile;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select company_a, office_profile, 'OFFICE'::public.company_role, 'ACTIVE'::public.membership_status from ctx
union all select company_a, employee_profile, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status from ctx
union all select company_a, contact_profile, 'CUSTOMER'::public.company_role, 'ACTIVE'::public.membership_status from ctx;

insert into public.customers (company_id, name) select company_a, 'Hausverwaltung Nord' from ctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company_a, c.id, 'Bürohaus Alster' from ctx join public.customers c on c.company_id = ctx.company_a;
insert into public.customer_contacts (company_id, customer_id, member_id)
select ctx.company_a, c.id, m.id from ctx
join public.customers c on c.company_id = ctx.company_a
join public.company_members m on m.profile_id = ctx.contact_profile;

create temporary table ids as select
  (select id from public.customers where company_id = (select company_a from ctx)) as customer,
  (select id from public.cleaning_objects where company_id = (select company_a from ctx)) as object;
grant select on ids to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Assumptions, catalogue, and a calculation built from them
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select public.set_calculation_defaults(1500, 2100, 8500, 1000, 3000);

create temporary table katalog as
select public.save_catalog_item(null, 'Unterhaltsreinigung Büro', 'Unterhalt', 'QM', 250, null, 300, 'PRO_EINSATZ') as id;
grant select on katalog to authenticated;

create temporary table calc as
select public.create_calculation('Bürohaus Alster', null, (select customer from ids)) as id;
grant select on calc to authenticated;

-- The assumptions were copied onto the calculation, not referenced.
select pg_temp.assert(
  (select wage_cents_per_hour = 1500 and ancillary_rate_bp = 2100
      and productive_rate_bp = 8500 and target_margin_bp = 3000
   from public.calculations where id = (select id from calc)),
  'a new Kalkulation copies the company assumptions onto itself');

select public.update_calculation((select id from calc), p_visits_per_week := 5,
  p_travel_cents_per_visit := 800, p_setup_minutes_per_visit := 10);
select public.save_calculation_line(null, (select id from calc), 'Bürogeschoss 1',
  'Unterhaltsreinigung Büro', 'QM', 500, 'PRO_WOCHE', 5,
  p_area_sqm := 500, p_catalog_item_id := (select id from katalog),
  p_productivity := 250, p_material_cents := 300);

-- --- time --------------------------------------------------------------------
select pg_temp.assert(
  (select minutes_per_service = 120 and services_per_month = 21.667 and monthly_minutes = 2600.04
   from public.calculation_lines where calculation_id = (select id from calc)),
  'the measured area becomes time through the Richtleistung');

-- --- cost --------------------------------------------------------------------
select pg_temp.assert(
  (select personnel_cost_cents_per_hour = 2349 from public.calculations where id = (select id from calc)),
  'the calculation carries its own cost per productive hour');
select pg_temp.assert(
  (select material_cost_cents_month = 6500 from public.calculations where id = (select id from calc)),
  'material at 3,00 € a visit over 21.667 visits is 65,00 € a month');
select pg_temp.assert(
  (select travel_cost_cents_month = 17334 from public.calculations where id = (select id from calc)),
  'travel is costed per visit and converted to a month');
-- Rüstzeit is paid working time and must carry personnel cost.
select pg_temp.assert(
  (select monthly_minutes > 2600.04 from public.calculations where id = (select id from calc)),
  'setup time is added to the monthly working time');

-- --- price -------------------------------------------------------------------
select pg_temp.assert(
  (select selling_price_cents_month = public.price_from_margin(total_cost_cents_month, 3000)
   from public.calculations where id = (select id from calc)),
  'the proposed price follows from cost and the target margin');
select pg_temp.assert(
  (select margin_bp = 3000 and markup_bp = 4286 from public.calculations where id = (select id from calc)),
  'the same figures are a 30 % margin and a 42.86 % markup');
select pg_temp.assert(
  (select contribution_cents_month = selling_price_cents_month - total_cost_cents_month
   from public.calculations where id = (select id from calc)),
  'the contribution is price minus cost');
select pg_temp.assert(
  (select break_even_rate_cents_per_hour > 0 and break_even_rate_cents_per_hour < selling_price_cents_month
   from public.calculations where id = (select id from calc)),
  'a break-even hourly rate is derived');

-- --- overrides ---------------------------------------------------------------
select pg_temp.assert_rejected(
  format('select public.save_calculation_line(null, %L, ''Keller'', ''Reinigung'', ''QM'', 100, ''PRO_WOCHE'', 1, p_minutes_override := 30)',
    (select id from calc)),
  'needs a reason');
select public.save_calculation_line(null, (select id from calc), 'Keller', 'Sonderreinigung Keller',
  'QM', 100, 'PRO_WOCHE', 1, p_minutes_override := 30, p_override_reason := 'stark verwinkelt');
select pg_temp.assert(
  (select minutes_per_service = 30 and override_reason = 'stark verwinkelt'
   from public.calculation_lines where calculation_id = (select id from calc) and area_name = 'Keller'),
  'an overridden time is used and its reason is kept');

-- --- a Sonderleistung must not pollute the monthly figures -------------------
create temporary table before_one_off as
select total_cost_cents_month as cost from public.calculations where id = (select id from calc);
grant select on before_one_off to authenticated;
select public.save_calculation_line(null, (select id from calc), 'Gesamtobjekt', 'Grundreinigung',
  'STUNDE', 8, 'EINMALIG', 1);
select pg_temp.assert(
  (select total_cost_cents_month = (select cost from before_one_off)
   from public.calculations where id = (select id from calc)),
  'a one-off leaves the monthly cost untouched');
select pg_temp.assert(
  (select one_off_cost_cents = 8 * 2349 and one_off_price_cents = public.price_from_margin(8 * 2349, 3000)
   from public.calculations where id = (select id from calc)),
  'and is costed and priced on its own');

-- --- an explicit price is allowed, with a reason -----------------------------
select pg_temp.assert_rejected(
  format('select public.update_calculation(%L, p_price_override_cents_month := 100000)', (select id from calc)),
  'needs a reason');
select public.update_calculation((select id from calc), p_price_override_cents_month := 100000,
  p_price_override_reason := 'Einstiegspreis, Folgeauftrag erwartet');
select pg_temp.assert(
  (select selling_price_cents_month = 100000 and margin_bp = public.margin_bp(100000, total_cost_cents_month)
   from public.calculations where id = (select id from calc)),
  'an explicit price is used and the margin recomputed against it');
-- Back to the calculated price.
select public.update_calculation((select id from calc), p_target_margin_bp := 3000);
select pg_temp.assert(
  (select price_override_cents_month is null and selling_price_cents_month = proposed_price_cents_month
   from public.calculations where id = (select id from calc)),
  'clearing the override returns to the calculated price');

-- ---------------------------------------------------------------------------
-- 4. Authorization and isolation
-- ---------------------------------------------------------------------------

-- An employee has no business in a commercial calculation, reading or writing.
select pg_temp.sign_in('33333333-3333-3333-3333-333333333333');
select pg_temp.assert(
  (select count(*) from public.calculations where id = (select id from calc)) = 0,
  'an employee cannot read a Kalkulation');
select pg_temp.assert(
  (select count(*) from public.calculation_lines where calculation_id = (select id from calc)) = 0,
  'nor its positions');
select pg_temp.assert(
  (select count(*) from public.company_calculation_defaults) = 0,
  'nor the wage assumptions');
select pg_temp.assert_rejected(
  format('select public.update_calculation(%L, p_target_margin_bp := 100)', (select id from calc)),
  'OWNER or OFFICE');
select pg_temp.assert_rejected(
  'select public.set_calculation_defaults(9999, 0, 10000, 0, 0)', 'OWNER or OFFICE');

-- A customer contact is a company member too, and must be caught by the same
-- policy — this is the case a careless "same company" rule would let through.
select pg_temp.sign_in('44444444-4444-4444-4444-444444444444');
select pg_temp.assert(
  (select count(*) from public.calculations where id = (select id from calc)) = 0,
  'a customer contact cannot read internal costs or margin');
select pg_temp.assert(
  (select count(*) from public.calculation_lines) = 0, 'nor any calculation position');
select pg_temp.assert(
  (select count(*) from public.company_calculation_defaults) = 0, 'nor the wage assumptions');

-- Another tenant, by id.
select pg_temp.sign_in('55555555-5555-5555-5555-555555555555');
select pg_temp.assert(
  (select count(*) from public.calculations where id = (select id from calc)) = 0,
  'another tenant cannot read the Kalkulation');
select pg_temp.assert_rejected(
  format('select public.update_calculation(%L, p_target_margin_bp := 100)', (select id from calc)),
  'not found');
select pg_temp.assert_rejected(
  format('select public.finalise_calculation(%L)', (select id from calc)), 'not found');
select pg_temp.assert(
  (select count(*) from public.get_leistungsverzeichnis((select id from calc))) = 0,
  'another tenant gets nothing from the Leistungsverzeichnis');

-- Nobody writes the tables directly, not even the office.
select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select pg_temp.assert_rejected(
  format('update public.calculations set selling_price_cents_month = 1 where id = %L', (select id from calc)),
  'permission denied');
select pg_temp.assert_rejected(
  format('insert into public.calculation_lines (company_id, calculation_id, area_name, service_name) values (%L, %L, ''X'', ''Y'')',
    (select company_a from ctx), (select id from calc)),
  'permission denied');

-- ---------------------------------------------------------------------------
-- 5. The commercial snapshot
-- ---------------------------------------------------------------------------
select public.finalise_calculation((select id from calc));
select pg_temp.assert(
  (select status = 'FINAL' and finalised_at is not null from public.calculations where id = (select id from calc)),
  'a Kalkulation can be frozen');

select pg_temp.assert_rejected(
  format('select public.update_calculation(%L, p_target_margin_bp := 5000)', (select id from calc)),
  'draft');
select pg_temp.assert_rejected(
  format('select public.save_calculation_line(null, %L, ''Neu'', ''Neu'', ''QM'', 1, ''PRO_WOCHE'', 1, p_productivity := 100)',
    (select id from calc)),
  'draft');
select pg_temp.assert_rejected(
  format('select public.recalculate_calculation(%L)', (select id from calc)), 'permission denied');

-- Changing the catalogue and the company assumptions must not reach back.
create temporary table frozen as
select total_cost_cents_month as cost, selling_price_cents_month as price, wage_cents_per_hour as wage
from public.calculations where id = (select id from calc);
grant select on frozen to authenticated;

select public.set_calculation_defaults(3000, 4000, 6000, 3000, 5000);
select public.save_catalog_item((select id from katalog), 'Unterhaltsreinigung Büro', 'Unterhalt', 'QM', 50, null, 9900, 'PRO_EINSATZ');

select pg_temp.assert(
  (select total_cost_cents_month = (select cost from frozen)
      and selling_price_cents_month = (select price from frozen)
      and wage_cents_per_hour = (select wage from frozen)
   from public.calculations where id = (select id from calc)),
  'neither a wage change nor a catalogue change alters a finalised Kalkulation');
select pg_temp.assert(
  (select productivity_per_hour = 250 from public.calculation_lines
   where calculation_id = (select id from calc) and area_name = 'Bürogeschoss 1'),
  'the line keeps the Richtleistung it was calculated with');

-- A revision is a new draft; the original stays exactly as it was.
create temporary table revision as select public.revise_calculation((select id from calc)) as id;
grant select on revision to authenticated;
select pg_temp.assert(
  (select status = 'ENTWURF' and supersedes_calculation_id = (select id from calc) and version > 1
   from public.calculations where id = (select id from revision)),
  'a revision is a new draft pointing at what it replaces');
select pg_temp.assert(
  (select status = 'FINAL' and total_cost_cents_month = (select cost from frozen)
   from public.calculations where id = (select id from calc)),
  'and the original is untouched');
select pg_temp.assert(
  (select count(*) from public.calculation_lines where calculation_id = (select id from revision)) =
  (select count(*) from public.calculation_lines where calculation_id = (select id from calc)),
  'the revision carries the same positions');

-- ---------------------------------------------------------------------------
-- 6. Leistungsverzeichnis: no internal figures leave
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select count(*) from public.get_leistungsverzeichnis((select id from calc))) = 3,
  'the Leistungsverzeichnis lists every position');
select pg_temp.assert(
  (select frequency_label = '5× wöchentlich' from public.get_leistungsverzeichnis((select id from calc))
   where line_position = 1),
  'and states the frequency in plain German');
-- The function's return type is the guarantee: there is nowhere for a cost to go.
select pg_temp.assert(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'get_leistungsverzeichnis'
  ) and (
    select count(*) from pg_proc p
    where p.proname = 'get_leistungsverzeichnis'
      and pg_get_function_result(p.oid) not like '%cost%'
      and pg_get_function_result(p.oid) not like '%margin%'
      and pg_get_function_result(p.oid) not like '%price%'
      and pg_get_function_result(p.oid) not like '%wage%'
  ) = 1,
  'the Leistungsverzeichnis exposes no cost, margin, price or wage column');

-- ---------------------------------------------------------------------------
-- 7. Angebot and the contract it initialises
-- ---------------------------------------------------------------------------
select pg_temp.assert_rejected(
  format('select public.create_quote_from_calculation(%L)', (select id from revision)),
  'finalised');

create temporary table quote as
select public.create_quote_from_calculation(
  (select id from calc),
  null,
  30,
  'MONATSPAUSCHALE',
  'PORTAL_ABNAHME'
) as id;
grant select on quote to authenticated;

select pg_temp.assert(
  (select calculation_id = (select id from calc) and billing_mode = 'MONATSPAUSCHALE'
   from public.quotes where id = (select id from quote)),
  'the Angebot records which Kalkulation it rests on and how it will be billed');
select pg_temp.assert(
  (select unit_price_cents = (select price from frozen) and unit = 'Monat'
   from public.quote_lines where quote_id = (select id from quote) and recurrence = 'MONTHLY'),
  'the monthly line carries the calculated selling price');
select pg_temp.assert(
  (select count(*) from public.quote_lines where quote_id = (select id from quote) and recurrence = 'ONE_OFF') = 1,
  'the Sonderleistung is its own one-off line');

select public.send_quote((select id from quote));
-- The acceptance call deliberately passes a different legacy value. The
-- commercial term was already agreed in the Angebot and must win.
select public.accept_quote(
  (select id from quote),
  array[1,2,3,4,5]::smallint[],
  '06:00',
  '08:00',
  'KEINE_ABNAHME_ERFORDERLICH'
);

/*
 * The defect this phase fixes. `accept_quote` used to copy the first recurring
 * line's unit price — an HOURLY rate — into `billing_unit_price_cents`, while
 * phase 19 made every schedule default to PAUSCHALE_PRO_EINSATZ, a price per
 * VISIT. The price and the mode now come from the same agreed line.
 */
select pg_temp.assert(
  (select s.billing_mode = 'MONATSPAUSCHALE'
      and s.billing_unit_price_cents = (select price from frozen)
      and s.acceptance_policy = 'PORTAL_ABNAHME'
   from public.service_schedules s
   where s.id = (select created_schedule_id from public.quotes where id = (select id from quote))),
  'the accepted terms initialise the Leistungsplan with a matching price and billing mode');

-- Accepting an offer priced per visit stores a per-visit price, not an hourly one.
create temporary table calc2 as
select public.create_calculation('Zweites Objekt', null, (select customer from ids)) as id;
grant select on calc2 to authenticated;
select public.update_calculation((select id from calc2), p_visits_per_week := 5, p_target_margin_bp := 2000);
select public.save_calculation_line(null, (select id from calc2), 'Halle', 'Hallenreinigung',
  'QM', 1000, 'PRO_WOCHE', 5, p_productivity := 500);
select public.finalise_calculation((select id from calc2));

create temporary table quote2 as
select public.create_quote_from_calculation((select id from calc2), null, 30, 'PAUSCHALE_PRO_EINSATZ') as id;
grant select on quote2 to authenticated;
select pg_temp.assert(
  (select unit = 'Einsatz' from public.quote_lines where quote_id = (select id from quote2) limit 1),
  'a per-visit offer is priced per visit');

select public.send_quote((select id from quote2));
select public.accept_quote((select id from quote2), array[1]::smallint[], '06:00', '08:00');
select pg_temp.assert(
  (select s.billing_mode = 'PAUSCHALE_PRO_EINSATZ'
   from public.service_schedules s
   where s.id = (select created_schedule_id from public.quotes where id = (select id from quote2))),
  'and the contract is set to bill per visit, not per hour');

-- An hourly offer likewise.
create temporary table calc3 as
select public.create_calculation('Drittes Objekt', null, (select customer from ids)) as id;
grant select on calc3 to authenticated;
select public.update_calculation((select id from calc3), p_visits_per_week := 2, p_target_margin_bp := 2500);
select public.save_calculation_line(null, (select id from calc3), 'Treppenhaus', 'Treppenhausreinigung',
  'QM', 300, 'PRO_WOCHE', 2, p_productivity := 150);
select public.finalise_calculation((select id from calc3));
create temporary table quote3 as
select public.create_quote_from_calculation((select id from calc3), null, 30, 'STUNDENSATZ') as id;
grant select on quote3 to authenticated;
select public.send_quote((select id from quote3));
select public.accept_quote((select id from quote3), array[2]::smallint[], '06:00', '08:00');
select pg_temp.assert(
  (select s.billing_mode = 'STUNDENSATZ'
   from public.service_schedules s
   where s.id = (select created_schedule_id from public.quotes where id = (select id from quote3))),
  'an hourly offer produces an hourly contract');

-- A finalised Kalkulation behind a sent offer still cannot be edited.
select pg_temp.assert_rejected(
  format('select public.update_calculation(%L, p_target_margin_bp := 1)', (select id from calc2)), 'draft');

select pg_temp.sign_out();
rollback;
\o
\echo 'Kalkulation invariants: all assertions passed'
