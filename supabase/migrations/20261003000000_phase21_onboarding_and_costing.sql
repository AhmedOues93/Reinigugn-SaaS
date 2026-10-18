-- Phase 21 — a company that is usable on its first day.
--
-- Phase 20 gave the Kalkulation a cost side. What it did not give anybody was a
-- way to get started: a new OWNER typed a company name, landed on an empty
-- dashboard, and met "Im Leistungskatalog ist noch nichts hinterlegt" the first
-- time they tried to price anything. Every assumption started at zero, which is
-- honest and useless.
--
-- This migration adds what a first day needs, and deepens the costing model
-- where a real Gebäudereinigung needs more than four numbers.
--
-- Nothing from phase 20 changes meaning. `productive_rate_bp` is still the
-- stored, snapshotted share of productive time and is still what the
-- calculation uses — what is new is a transparent way to *derive* it from days
-- the office actually knows, instead of guessing a percentage.

-- ===========================================================================
-- 1. Company: the few fields a first-run wizard needs
-- ===========================================================================

alter table public.companies
  -- Who signs. Appears on offers and invoices; not the same as the account owner.
  add column if not exists managing_director text
    check (managing_director is null or char_length(trim(managing_director)) between 2 and 160),
  -- The rate this company normally invoices at. 1900 = 19 %.
  add column if not exists default_vat_rate_basis_points integer not null default 1900
    check (default_vat_rate_basis_points between 0 and 10000),
  -- Which Reinigungsarten this company actually offers, used once to seed a
  -- starting catalogue and afterwards only as a hint on empty screens.
  add column if not exists service_focus text[] not null default '{}',
  -- Wizard progress. Null means it was never started; a completed step list
  -- means the wizard does not reappear.
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_steps text[] not null default '{}';

comment on column public.companies.service_focus is
  'Reinigungsarten this company offers. Seeds the initial Leistungskatalog; never a restriction on what can be calculated.';
comment on column public.companies.onboarding_steps is
  'Completed first-run wizard steps, so a returning owner is not walked through it again.';

-- ===========================================================================
-- 2. A transparent personnel model
--
-- `productive_rate_bp` asks for a single percentage, and almost nobody knows
-- theirs. What an office does know is how many days a year a cleaner is paid
-- for and not at a customer's site: holiday, public holidays, sickness,
-- training — plus the time each day spent travelling between objects.
--
-- Those are now inputs, and the percentage is derived from them. The derived
-- value is still written into `productive_rate_bp`, so every phase-20
-- calculation, snapshot and test keeps working unchanged; a company that
-- prefers to set the percentage directly still can.
-- ===========================================================================

alter table public.company_calculation_defaults
  add column if not exists weekly_hours numeric(5, 2) not null default 39
    check (weekly_hours > 0 and weekly_hours <= 80),
  add column if not exists working_days_per_week numeric(3, 1) not null default 5
    check (working_days_per_week > 0 and working_days_per_week <= 7),
  add column if not exists vacation_days integer not null default 0 check (vacation_days between 0 and 200),
  add column if not exists public_holidays integer not null default 0 check (public_holidays between 0 and 60),
  add column if not exists sick_days integer not null default 0 check (sick_days between 0 and 200),
  add column if not exists training_days integer not null default 0 check (training_days between 0 and 200),
  -- Travel between objects and briefing, per working day. Paid, not productive.
  add column if not exists unproductive_minutes_per_day numeric(6, 2) not null default 0
    check (unproductive_minutes_per_day >= 0 and unproductive_minutes_per_day <= 600),
  -- True when the office set the percentage by hand instead.
  add column if not exists productive_rate_is_manual boolean not null default true,
  -- A floor under the selling price, independent of the margin calculation.
  add column if not exists min_hourly_rate_cents bigint not null default 0
    check (min_hourly_rate_cents between 0 and 100000000),
  -- Starting points for a new calculation's own cost lines.
  add column if not exists default_material_cents_per_visit bigint not null default 0 check (default_material_cents_per_visit >= 0),
  add column if not exists default_machine_cents_per_month bigint not null default 0 check (default_machine_cents_per_month >= 0),
  add column if not exists default_travel_cents_per_visit bigint not null default 0 check (default_travel_cents_per_visit >= 0),
  add column if not exists default_setup_minutes_per_visit numeric(6, 2) not null default 0 check (default_setup_minutes_per_visit >= 0);

/*
 * The productive share, worked out from days rather than guessed.
 *
 *   Arbeitstage brutto  = Arbeitstage je Woche × 52
 *   Ausfalltage         = Urlaub + Feiertage + Krankheit + Schulung
 *   Anwesenheitstage    = Arbeitstage brutto − Ausfalltage
 *   Tagesanteil         = 1 − (unproduktive Minuten ÷ Minuten je Arbeitstag)
 *   produktiver Anteil  = (Anwesenheitstage ÷ Arbeitstage brutto) × Tagesanteil
 *
 * Both factors matter and they multiply. A cleaner present 88 % of the year who
 * spends 45 of each 468 daily minutes travelling is productive for about 79.5 %
 * of paid time — and an hour on site therefore costs 1 ÷ 0.795 hours of wage.
 *
 * Clamped to a sane band: a derived share of zero would make cost infinite, and
 * one above 100 % is not a thing.
 */
create or replace function public.derive_productive_rate_bp(
  p_weekly_hours numeric,
  p_working_days_per_week numeric,
  p_vacation_days integer,
  p_public_holidays integer,
  p_sick_days integer,
  p_training_days integer,
  p_unproductive_minutes_per_day numeric
) returns integer language plpgsql immutable as $$
declare
  gross_days numeric;
  absent_days numeric;
  present_days numeric;
  minutes_per_day numeric;
  day_share numeric;
  year_share numeric;
begin
  gross_days := coalesce(p_working_days_per_week, 5) * 52;
  if gross_days <= 0 then return 10000; end if;

  absent_days := coalesce(p_vacation_days, 0) + coalesce(p_public_holidays, 0)
               + coalesce(p_sick_days, 0) + coalesce(p_training_days, 0);
  present_days := greatest(gross_days - absent_days, 0);
  year_share := present_days / gross_days;

  minutes_per_day := coalesce(p_weekly_hours, 39) / greatest(coalesce(p_working_days_per_week, 5), 0.1) * 60;
  day_share := case
    when minutes_per_day <= 0 then 1
    else greatest(1 - coalesce(p_unproductive_minutes_per_day, 0) / minutes_per_day, 0)
  end;

  -- The floor mirrors the column check on productive_rate_bp: below 10 % the
  -- arithmetic stops describing anything real.
  return greatest(least(round(year_share * day_share * 10000)::integer, 10000), 1000);
end;
$$;

grant execute on function public.derive_productive_rate_bp(numeric, numeric, integer, integer, integer, integer, numeric)
  to authenticated;

/*
 * Saving the assumptions. When the office supplies the day-based inputs, the
 * productive share is derived; when it sets the percentage itself, that wins.
 * Either way one number lands in `productive_rate_bp`, which is what every
 * calculation reads — the model got richer, the contract did not change.
 */
create or replace function public.set_calculation_defaults_v2(
  p_wage_cents bigint,
  p_ancillary_bp integer,
  p_overhead_bp integer,
  p_target_margin_bp integer,
  p_productive_bp integer default null,
  p_weekly_hours numeric default null,
  p_working_days_per_week numeric default null,
  p_vacation_days integer default null,
  p_public_holidays integer default null,
  p_sick_days integer default null,
  p_training_days integer default null,
  p_unproductive_minutes_per_day numeric default null,
  p_min_hourly_rate_cents bigint default null,
  p_material_cents_per_visit bigint default null,
  p_machine_cents_per_month bigint default null,
  p_travel_cents_per_visit bigint default null,
  p_setup_minutes_per_visit numeric default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  actor public.company_members;
  derived integer;
  manual boolean;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Kalkulation requires OWNER or OFFICE'; end if;

  manual := p_productive_bp is not null;
  derived := case
    when manual then p_productive_bp
    else public.derive_productive_rate_bp(
      coalesce(p_weekly_hours, 39), coalesce(p_working_days_per_week, 5),
      coalesce(p_vacation_days, 0), coalesce(p_public_holidays, 0),
      coalesce(p_sick_days, 0), coalesce(p_training_days, 0),
      coalesce(p_unproductive_minutes_per_day, 0))
  end;

  insert into public.company_calculation_defaults (
    company_id, wage_cents_per_hour, ancillary_rate_bp, productive_rate_bp, overhead_rate_bp, target_margin_bp,
    weekly_hours, working_days_per_week, vacation_days, public_holidays, sick_days, training_days,
    unproductive_minutes_per_day, productive_rate_is_manual, min_hourly_rate_cents,
    default_material_cents_per_visit, default_machine_cents_per_month,
    default_travel_cents_per_visit, default_setup_minutes_per_visit
  ) values (
    actor.company_id, coalesce(p_wage_cents, 0), coalesce(p_ancillary_bp, 0), derived,
    coalesce(p_overhead_bp, 0), coalesce(p_target_margin_bp, 0),
    coalesce(p_weekly_hours, 39), coalesce(p_working_days_per_week, 5),
    coalesce(p_vacation_days, 0), coalesce(p_public_holidays, 0),
    coalesce(p_sick_days, 0), coalesce(p_training_days, 0),
    coalesce(p_unproductive_minutes_per_day, 0), manual, coalesce(p_min_hourly_rate_cents, 0),
    coalesce(p_material_cents_per_visit, 0), coalesce(p_machine_cents_per_month, 0),
    coalesce(p_travel_cents_per_visit, 0), coalesce(p_setup_minutes_per_visit, 0)
  )
  on conflict (company_id) do update set
    wage_cents_per_hour = excluded.wage_cents_per_hour,
    ancillary_rate_bp = excluded.ancillary_rate_bp,
    productive_rate_bp = excluded.productive_rate_bp,
    overhead_rate_bp = excluded.overhead_rate_bp,
    target_margin_bp = excluded.target_margin_bp,
    weekly_hours = excluded.weekly_hours,
    working_days_per_week = excluded.working_days_per_week,
    vacation_days = excluded.vacation_days,
    public_holidays = excluded.public_holidays,
    sick_days = excluded.sick_days,
    training_days = excluded.training_days,
    unproductive_minutes_per_day = excluded.unproductive_minutes_per_day,
    productive_rate_is_manual = excluded.productive_rate_is_manual,
    min_hourly_rate_cents = excluded.min_hourly_rate_cents,
    default_material_cents_per_visit = excluded.default_material_cents_per_visit,
    default_machine_cents_per_month = excluded.default_machine_cents_per_month,
    default_travel_cents_per_visit = excluded.default_travel_cents_per_visit,
    default_setup_minutes_per_visit = excluded.default_setup_minutes_per_visit,
    updated_at = now();
end;
$$;

revoke all on function public.set_calculation_defaults_v2(bigint, integer, integer, integer, integer, numeric, numeric, integer, integer, integer, integer, numeric, bigint, bigint, bigint, bigint, numeric)
  from public, anon;
grant execute on function public.set_calculation_defaults_v2(bigint, integer, integer, integer, integer, numeric, numeric, integer, integer, integer, integer, numeric, bigint, bigint, bigint, bigint, numeric)
  to authenticated;

-- ===========================================================================
-- 3. Turnus: the frequencies a cleaning contract actually uses
--
-- EINMALIG / PRO_WOCHE / PRO_MONAT covered the common cases and nothing else.
-- A Glasreinigung is quarterly, a Grundreinigung half-yearly, a Treppenhaus
-- every fortnight. Expressing "vierteljährlich" as 0.333 per month works
-- arithmetically and reads as a mistake on a Leistungsverzeichnis.
--
-- Added as new enum values, so every existing row and every frozen snapshot
-- keeps the value it already has.
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'calculation_frequency' and e.enumlabel = 'VIERZEHNTAEGIG') then
    alter type public.calculation_frequency add value 'VIERZEHNTAEGIG';
  end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'calculation_frequency' and e.enumlabel = 'VIERTELJAEHRLICH') then
    alter type public.calculation_frequency add value 'VIERTELJAEHRLICH';
  end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'calculation_frequency' and e.enumlabel = 'HALBJAEHRLICH') then
    alter type public.calculation_frequency add value 'HALBJAEHRLICH';
  end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                 where t.typname = 'calculation_frequency' and e.enumlabel = 'JAEHRLICH') then
    alter type public.calculation_frequency add value 'JAEHRLICH';
  end if;
end $$;
