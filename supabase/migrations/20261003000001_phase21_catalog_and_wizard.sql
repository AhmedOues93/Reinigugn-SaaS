-- Phase 21b — the new Turnus values become arithmetic, a company starts with a
-- usable Leistungskatalog, and the first run has somewhere to go.
--
-- Split from 20261003000000 because PostgreSQL will not let a new enum value be
-- *used* in the same transaction that adds it.

-- ===========================================================================
-- 1. Turnus arithmetic
--
-- Each frequency converted to occurrences per month. A year is twelve months
-- and 13/3 weeks per month, consistently with everything phase 20 already does.
-- ===========================================================================

create or replace function public.calculate_services_per_month(
  p_frequency public.calculation_frequency,
  p_count numeric
) returns numeric language sql immutable as $$
  select round(case p_frequency
    when 'PRO_WOCHE'        then coalesce(p_count, 0) * public.weeks_per_month()
    when 'VIERZEHNTAEGIG'   then coalesce(p_count, 0) * public.weeks_per_month() / 2
    when 'PRO_MONAT'        then coalesce(p_count, 0)
    when 'VIERTELJAEHRLICH' then coalesce(p_count, 0) / 3
    when 'HALBJAEHRLICH'    then coalesce(p_count, 0) / 6
    when 'JAEHRLICH'        then coalesce(p_count, 0) / 12
    -- EINMALIG is costed once, outside the monthly picture.
    else 0
  end, 3);
$$;
-- Three decimals, exactly as in phase 20. `services_per_month` is a
-- numeric(10,3) and a fourth decimal would never survive being stored, but it
-- would survive long enough to shift `monthly_minutes` by a hundredth of a
-- minute — which is a different number in an existing draft for no gain.

/*
 * The same frequencies in German, for the Leistungsverzeichnis. One place, so a
 * PDF and a screen cannot word it differently.
 */
create or replace function public.frequency_label(
  p_frequency public.calculation_frequency,
  p_count numeric
) returns text language sql immutable as $$
  select case p_frequency
    when 'EINMALIG' then 'einmalig'
    when 'PRO_WOCHE' then
      case when p_count = 1 then 'wöchentlich'
           else rtrim(trim(to_char(p_count, 'FM999990.99')), '.') || '× wöchentlich' end
    when 'VIERZEHNTAEGIG' then '14-täglich'
    when 'PRO_MONAT' then
      case when p_count = 1 then 'monatlich'
           else rtrim(trim(to_char(p_count, 'FM999990.99')), '.') || '× monatlich' end
    when 'VIERTELJAEHRLICH' then
      case when p_count = 1 then 'vierteljährlich'
           else rtrim(trim(to_char(p_count, 'FM999990.99')), '.') || '× vierteljährlich' end
    when 'HALBJAEHRLICH' then
      case when p_count = 1 then 'halbjährlich'
           else rtrim(trim(to_char(p_count, 'FM999990.99')), '.') || '× halbjährlich' end
    else
      case when p_count = 1 then 'jährlich'
           else rtrim(trim(to_char(p_count, 'FM999990.99')), '.') || '× jährlich' end
  end;
$$;

grant execute on function public.frequency_label(public.calculation_frequency, numeric) to authenticated;

-- The Leistungsverzeichnis now uses the shared label function.
create or replace function public.get_leistungsverzeichnis(p_calculation_id uuid)
returns table (
  line_position smallint,
  area_name text,
  area_sqm numeric,
  service_name text,
  scope_note text,
  calculation_unit public.calculation_unit,
  quantity numeric,
  frequency public.calculation_frequency,
  frequency_count numeric,
  service_weekdays smallint[],
  frequency_label text
)
language sql stable security definer set search_path = public as $$
  select
    line.position, line.area_name, line.area_sqm, line.service_name, line.scope_note,
    line.calculation_unit, line.quantity, line.frequency, line.frequency_count,
    line.service_weekdays,
    public.frequency_label(line.frequency, line.frequency_count)
  from public.calculation_lines line
  join public.calculations calc on calc.id = line.calculation_id
  where line.calculation_id = p_calculation_id
    and public.is_company_staff(calc.company_id)
  order by line.position;
$$;

-- ===========================================================================
-- 2. A starting Leistungskatalog
--
-- "Im Leistungskatalog ist noch nichts hinterlegt" is the first thing a new
-- company used to meet when it tried to price something, and an empty catalogue
-- means every Richtleistung has to be invented on the spot.
--
-- These are **starting points, not industry standards and not guarantees.**
-- Productivity in this trade depends on the building, the equipment, the agreed
-- quality level and the crew. Every value is editable, and the UI says so.
-- The ranges below are conservative mid-points a company can calibrate from its
-- own Nachkalkulation.
--
-- Seeded per chosen Reinigungsschwerpunkt, once, and never overwriting a
-- service the company has already defined.
-- ===========================================================================

create or replace function public.seed_service_catalog(p_focus text[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  actor public.company_members;
  seeded integer := 0;
  entry record;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Kalkulation requires OWNER or OFFICE'; end if;

  for entry in
    select * from (values
      -- (focus, name, category, unit, productivity m²/h, minutes/unit, material cents, basis, description)
      ('UNTERHALTSREINIGUNG', 'Unterhaltsreinigung Büro', 'Unterhaltsreinigung', 'QM', 250::numeric, null::numeric, 300::bigint, 'PRO_EINSATZ',
       'Papierkörbe, Oberflächen, Böden nebelfeucht, Sichtreinigung.'),
      ('UNTERHALTSREINIGUNG', 'Unterhaltsreinigung Verkehrsfläche', 'Unterhaltsreinigung', 'QM', 400, null, 200, 'PRO_EINSATZ',
       'Flure und Verkehrsflächen, Böden nebelfeucht.'),
      ('BUEROREINIGUNG', 'Büroreinigung Einzelbüro', 'Büroreinigung', 'QM', 220, null, 300, 'PRO_EINSATZ',
       'Schreibtischfreie Flächen, Böden, Papierkörbe.'),
      ('BUEROREINIGUNG', 'Konferenz- und Besprechungsraum', 'Büroreinigung', 'QM', 200, null, 300, 'PRO_EINSATZ',
       'Tische, Stühle, Böden, Bestuhlung richten.'),
      ('SANITAERREINIGUNG', 'Sanitärreinigung', 'Sanitärreinigung', 'QM', 60, null, 800, 'PRO_EINSATZ',
       'WC, Urinale, Waschbecken, Armaturen, Spiegel, Böden; Desinfektion nach Plan.'),
      ('SANITAERREINIGUNG', 'Sanitärkontrolle / Nachfüllen', 'Sanitärreinigung', 'EINSATZ', null, 15, 400, 'PRO_EINSATZ',
       'Sichtkontrolle, Verbrauchsmaterial auffüllen.'),
      ('TREPPENHAUSREINIGUNG', 'Treppenhausreinigung', 'Treppenhaus', 'QM', 180, null, 200, 'PRO_EINSATZ',
       'Treppen, Podeste, Handläufe, Briefkastenanlage.'),
      ('TREPPENHAUSREINIGUNG', 'Kellerflur und Nebenräume', 'Treppenhaus', 'QM', 300, null, 150, 'PRO_EINSATZ',
       'Kellergänge, Trockenräume, Waschküche.'),
      ('GLASREINIGUNG', 'Glasreinigung beidseitig', 'Glasreinigung', 'QM', 35, null, 250, 'PRO_EINSATZ',
       'Glasflächen beidseitig, Rahmen feucht abwischen.'),
      ('GLASREINIGUNG', 'Glasreinigung einseitig', 'Glasreinigung', 'QM', 60, null, 200, 'PRO_EINSATZ',
       'Glasflächen einseitig, ohne Rahmen.'),
      ('GRUNDREINIGUNG', 'Grundreinigung Hartboden', 'Grundreinigung', 'QM', 45, null, 1200, 'PRO_EINSATZ',
       'Grundreinigung mit Maschineneinsatz, Beschichtung nach Vereinbarung.'),
      ('GRUNDREINIGUNG', 'Grundreinigung Sanitär', 'Grundreinigung', 'QM', 25, null, 1500, 'PRO_EINSATZ',
       'Intensivreinigung inkl. Fugen, Kalkentfernung.'),
      ('BAUENDREINIGUNG', 'Bauendreinigung', 'Bauendreinigung', 'QM', 30, null, 1500, 'PRO_EINSATZ',
       'Feinreinigung nach Bauarbeiten, Entfernung von Bauschmutz und Etiketten.'),
      ('BAUENDREINIGUNG', 'Baugrobreinigung', 'Bauendreinigung', 'QM', 80, null, 800, 'PRO_EINSATZ',
       'Grobe Bauabfälle, Kehren, Vorreinigung.'),
      ('PRAXISREINIGUNG', 'Praxisreinigung Behandlungsraum', 'Praxis und Pflege', 'QM', 120, null, 900, 'PRO_EINSATZ',
       'Reinigung mit Flächendesinfektion nach Hygieneplan.'),
      ('PRAXISREINIGUNG', 'Praxisreinigung Wartebereich', 'Praxis und Pflege', 'QM', 200, null, 500, 'PRO_EINSATZ',
       'Wartezimmer, Empfang, Kontaktflächen.'),
      ('KITA_SCHULE', 'Reinigung Klassen- und Gruppenraum', 'Kita und Schule', 'QM', 220, null, 300, 'PRO_EINSATZ',
       'Böden, Tische, Kontaktflächen.'),
      ('KITA_SCHULE', 'Reinigung Sanitär Kita/Schule', 'Kita und Schule', 'QM', 55, null, 800, 'PRO_EINSATZ',
       'Kindgerechte Sanitäranlagen, erhöhte Frequenz.'),
      ('INDUSTRIE', 'Industrie- und Hallenreinigung', 'Industrie', 'QM', 600, null, 400, 'PRO_EINSATZ',
       'Maschinelle Hallenreinigung mit Aufsitzmaschine.'),
      ('INDUSTRIE', 'Sozialräume Industrie', 'Industrie', 'QM', 90, null, 700, 'PRO_EINSATZ',
       'Umkleiden, Duschen, Pausenräume.'),
      ('SONDERREINIGUNG', 'Sonderreinigung nach Aufwand', 'Sonderreinigung', 'STUNDE', null, null, 0, 'PRO_EINSATZ',
       'Nach Aufwand abgerechnete Sonderleistung.'),
      ('SONDERREINIGUNG', 'Entrümpelung / Entsorgung', 'Sonderreinigung', 'STUNDE', null, null, 0, 'PRO_EINSATZ',
       'Räumung inkl. Entsorgung nach Aufwand.')
    ) as t(focus, name, category, unit, productivity, minutes_per_unit, material_cents, basis, description)
    where t.focus = any(coalesce(p_focus, '{}'))
  loop
    -- `on conflict do nothing` on (company_id, name): a company that has
    -- already defined this service keeps its own values.
    insert into public.service_catalog_items (
      company_id, name, category, calculation_unit,
      default_productivity_per_hour, default_minutes_per_unit,
      default_material_cents, default_material_basis, description
    ) values (
      actor.company_id, entry.name, entry.category, entry.unit::public.calculation_unit,
      entry.productivity, entry.minutes_per_unit,
      entry.material_cents, entry.basis::public.cost_basis, entry.description
    )
    on conflict (company_id, name) do nothing;
    if found then seeded := seeded + 1; end if;
  end loop;

  return seeded;
end;
$$;

revoke all on function public.seed_service_catalog(text[]) from public, anon;
grant execute on function public.seed_service_catalog(text[]) to authenticated;

-- ===========================================================================
-- 3. The first-run wizard
--
-- Progress is stored on the company so a half-finished setup survives a closed
-- tab, and a finished one never reappears. Nothing here is mandatory: the
-- wizard can be left at any point and every value is editable afterwards in
-- Einstellungen.
-- ===========================================================================

create or replace function public.save_company_profile(
  p_name text default null,
  p_legal_form text default null,
  p_managing_director text default null,
  p_street text default null,
  p_postal_code text default null,
  p_city text default null,
  p_country text default null,
  p_phone text default null,
  p_email text default null,
  p_website text default null,
  p_tax_number text default null,
  p_vat_id text default null,
  p_billing_email text default null,
  p_iban text default null,
  p_bic text default null,
  p_payment_terms_days smallint default null,
  p_vat_rate_bp integer default null
) returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members;
begin
  -- The company profile is the owner's, not the office's: it appears on every
  -- invoice and carries the tax identifiers.
  select member.* into actor from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid() and member.role = 'OWNER' and member.status = 'ACTIVE'
  limit 1;
  if actor.id is null then raise exception 'Only the OWNER may change the company profile'; end if;

  update public.companies set
    name = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
    legal_form = coalesce(nullif(trim(coalesce(p_legal_form, '')), ''), legal_form),
    managing_director = coalesce(nullif(trim(coalesce(p_managing_director, '')), ''), managing_director),
    street = coalesce(nullif(trim(coalesce(p_street, '')), ''), street),
    postal_code = coalesce(nullif(trim(coalesce(p_postal_code, '')), ''), postal_code),
    city = coalesce(nullif(trim(coalesce(p_city, '')), ''), city),
    country = coalesce(nullif(trim(coalesce(p_country, '')), ''), country),
    phone = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone),
    email = coalesce(nullif(trim(coalesce(p_email, '')), ''), email),
    website = coalesce(nullif(trim(coalesce(p_website, '')), ''), website),
    tax_number = coalesce(nullif(trim(coalesce(p_tax_number, '')), ''), tax_number),
    vat_id = coalesce(nullif(trim(coalesce(p_vat_id, '')), ''), vat_id),
    billing_email = coalesce(nullif(trim(coalesce(p_billing_email, '')), ''), billing_email),
    iban = coalesce(nullif(trim(coalesce(p_iban, '')), ''), iban),
    bic = coalesce(nullif(trim(coalesce(p_bic, '')), ''), bic),
    default_payment_terms_days = coalesce(p_payment_terms_days, default_payment_terms_days),
    default_vat_rate_basis_points = coalesce(p_vat_rate_bp, default_vat_rate_basis_points)
  where id = actor.company_id;
end;
$$;

create or replace function public.set_service_focus(p_focus text[])
returns integer language plpgsql security definer set search_path = public as $$
declare actor public.company_members; seeded integer;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Requires OWNER or OFFICE'; end if;

  update public.companies set service_focus = coalesce(p_focus, '{}') where id = actor.company_id;
  -- Seeding is a side effect of choosing, and is safe to repeat: existing
  -- services are never overwritten.
  seeded := public.seed_service_catalog(p_focus);
  return seeded;
end;
$$;

create or replace function public.complete_onboarding_step(p_step text, p_finished boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Requires OWNER or OFFICE'; end if;
  if p_step is null or char_length(trim(p_step)) = 0 then raise exception 'A step is required'; end if;

  update public.companies set
    onboarding_steps = (
      select array_agg(distinct step)
      from unnest(array_append(onboarding_steps, trim(p_step))) as step
    ),
    onboarding_completed_at = case
      when p_finished then coalesce(onboarding_completed_at, now())
      else onboarding_completed_at
    end
  where id = actor.company_id;
end;
$$;

/*
 * What the first-run checklist shows, counted from what the company actually
 * has rather than from what it clicked. A checklist that ticks itself when you
 * press "weiter" teaches people to ignore it.
 */
create or replace function public.get_onboarding_status()
returns table (
  onboarding_completed_at timestamptz,
  steps text[],
  service_focus text[],
  has_company_address boolean,
  has_tax_details boolean,
  has_calculation_defaults boolean,
  has_catalog boolean,
  has_customer boolean,
  has_object boolean,
  has_employee boolean,
  has_survey boolean,
  has_calculation boolean,
  has_quote boolean
)
language sql stable security definer set search_path = public as $$
  select
    company.onboarding_completed_at,
    company.onboarding_steps,
    company.service_focus,
    company.street is not null and company.city is not null,
    company.tax_number is not null or company.vat_id is not null,
    coalesce(defaults.wage_cents_per_hour, 0) > 0,
    exists (select 1 from public.service_catalog_items item
            where item.company_id = company.id and item.is_active),
    exists (select 1 from public.customers c where c.company_id = company.id),
    exists (select 1 from public.cleaning_objects o where o.company_id = company.id),
    exists (select 1 from public.company_members m
            where m.company_id = company.id and m.role in ('OFFICE', 'EMPLOYEE')),
    exists (select 1 from public.site_surveys s where s.company_id = company.id),
    exists (select 1 from public.calculations c where c.company_id = company.id),
    exists (select 1 from public.quotes q where q.company_id = company.id)
  from public.sales_actor() actor
  join public.companies company on company.id = actor.company_id
  left join public.company_calculation_defaults defaults on defaults.company_id = company.id;
$$;

revoke all on function
  public.save_company_profile(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, smallint, integer),
  public.set_service_focus(text[]),
  public.complete_onboarding_step(text, boolean),
  public.get_onboarding_status()
from public, anon;

grant execute on function
  public.save_company_profile(text, text, text, text, text, text, text, text, text, text, text, text, text, text, text, smallint, integer),
  public.set_service_focus(text[]),
  public.complete_onboarding_step(text, boolean),
  public.get_onboarding_status()
to authenticated;

-- ===========================================================================
-- 4. New calculations start from the company's cost defaults
--
-- Phase 20 copied wage, ancillary, productive share, overhead and margin. The
-- material, machine, travel and setup assumptions were added in this phase and
-- are copied too — a new calculation should begin where the company's costing
-- already is, not at zero.
--
-- Existing calculations are untouched: this only affects rows created from now
-- on, which is the whole point of copying rather than referencing.
-- ===========================================================================

create or replace function public.apply_calculation_defaults(p_calculation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare calc public.calculations; defaults public.company_calculation_defaults;
begin
  select * into calc from public.calculations where id = p_calculation_id;
  if calc.id is null or calc.status <> 'ENTWURF' then return; end if;
  select * into defaults from public.company_calculation_defaults where company_id = calc.company_id;
  if defaults.company_id is null then return; end if;

  update public.calculations set
    travel_cents_per_visit = case when travel_cents_per_visit = 0
      then defaults.default_travel_cents_per_visit else travel_cents_per_visit end,
    setup_minutes_per_visit = case when setup_minutes_per_visit = 0
      then defaults.default_setup_minutes_per_visit else setup_minutes_per_visit end,
    other_cost_cents_per_month = case when other_cost_cents_per_month = 0
      then defaults.default_machine_cents_per_month else other_cost_cents_per_month end
  where id = calc.id;

  perform public.recalculate_calculation(calc.id);
end;
$$;

revoke all on function public.apply_calculation_defaults(uuid) from public, anon;
