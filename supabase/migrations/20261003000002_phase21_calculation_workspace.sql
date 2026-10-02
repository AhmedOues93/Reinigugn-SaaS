-- Phase 21 — the Kalkulation as a workspace rather than a form.
--
-- Phase 20 produced a correct cost and a correct price. What it could not do is
-- show its working: `productive_rate_bp` was a percentage with no provenance,
-- there was nowhere to put a Kleinauftragszuschlag that is revenue rather than
-- cost, and a calculation with no wage and no positions reported a tidy margin
-- of 0,0 % as though that meant something.
--
-- Three additions, none of which changes an existing number:
--
-- **The personnel model is snapshotted, not just its result.** The days behind
-- the productive share are copied onto the calculation like every other
-- assumption, so a calculation from March can still explain itself in November.
--
-- **Customer surcharges are separated from costs.** A Anfahrtspauschale the
-- customer pays and the fuel the company burns are different things. Costs go
-- into the cost side and are covered by the margin; surcharges are added to the
-- price. Nothing is counted twice, because they live in different columns and
-- enter the arithmetic at different points.
--
-- **An incomplete calculation says so.** Missing inputs produce a list of what
-- is missing rather than a plausible-looking zero.
--
-- Every new column defaults to a value that reproduces phase-20 behaviour
-- exactly, so existing rows — including frozen ones — keep the figures they
-- were finalised with.

-- ===========================================================================
-- 1. The assumptions this calculation was made under
-- ===========================================================================

alter table public.calculations
  -- The personnel model behind `productive_rate_bp`, copied at creation. A
  -- snapshot of the inputs, so the derivation can be shown months later.
  add column if not exists weekly_hours numeric(5, 2) not null default 39
    check (weekly_hours > 0 and weekly_hours <= 80),
  add column if not exists working_days_per_week numeric(3, 1) not null default 5
    check (working_days_per_week > 0 and working_days_per_week <= 7),
  add column if not exists vacation_days integer not null default 0 check (vacation_days between 0 and 200),
  add column if not exists public_holidays integer not null default 0 check (public_holidays between 0 and 60),
  add column if not exists sick_days integer not null default 0 check (sick_days between 0 and 200),
  add column if not exists training_days integer not null default 0 check (training_days between 0 and 200),
  add column if not exists unproductive_minutes_per_day numeric(6, 2) not null default 0
    check (unproductive_minutes_per_day >= 0 and unproductive_minutes_per_day <= 600),
  -- True when somebody typed the percentage instead of deriving it. Existing
  -- rows default to true, which is exactly what they are: a percentage set by
  -- hand, with no day model behind it.
  add column if not exists productive_rate_is_manual boolean not null default true,

  -- --- customer surcharges, which are revenue and not cost ------------------
  --
  -- Deliberately separate columns from `travel_cents_per_visit` and
  -- `other_cost_cents_per_month`. Those are what the work costs the company and
  -- are covered by the margin. These are what the customer is additionally
  -- charged, and they are added after the margin has done its job.
  add column if not exists surcharge_travel_cents_month bigint not null default 0
    check (surcharge_travel_cents_month >= 0),
  add column if not exists surcharge_small_order_cents_month bigint not null default 0
    check (surcharge_small_order_cents_month >= 0),
  -- Nacht-, Sonn- und Feiertagsarbeit, as a percentage of the base price.
  add column if not exists surcharge_offpeak_bp integer not null default 0
    check (surcharge_offpeak_bp between 0 and 10000),
  add column if not exists surcharge_note text
    check (surcharge_note is null or char_length(surcharge_note) <= 1000),

  -- A floor under the hourly rate, snapshotted from the company defaults. Not
  -- enforced: a company may knowingly go below it, and the screen says so.
  add column if not exists min_hourly_rate_cents bigint not null default 0
    check (min_hourly_rate_cents between 0 and 100000000),

  -- --- derived ---------------------------------------------------------------
  -- The price before surcharges: the proposal, or the office's override.
  add column if not exists base_price_cents_month bigint not null default 0,
  add column if not exists surcharge_cents_month bigint not null default 0,
  add column if not exists price_cents_per_productive_hour bigint not null default 0,
  -- What the minimum hourly rate implies for this contract, so the two figures
  -- can be compared directly instead of in somebody's head.
  add column if not exists min_price_cents_month bigint not null default 0,
  -- Stable codes for what is missing; the UI supplies the German wording.
  add column if not exists incomplete_reasons text[] not null default '{}';

comment on column public.calculations.surcharge_travel_cents_month is
  'Anfahrtspauschale charged to the customer. Revenue, not cost — the company''s own travel cost is travel_cents_per_visit.';
comment on column public.calculations.incomplete_reasons is
  'Stable codes for missing inputs. Empty means every figure on the calculation rests on a real input.';

-- ===========================================================================
-- 2. Recalculation, with the price split into base and surcharge
--
-- The cost side is unchanged, line for line, from phase 20. What changed is
-- everything after `cost_month`:
--
--   Grundpreis  = Preisvorgabe  oder  Kosten ÷ (1 − Zielmarge)
--   Zuschläge   = Anfahrt + Kleinauftrag + Grundpreis × Zuschlagssatz
--   Verkaufspreis = Grundpreis + Zuschläge
--   Deckungsbeitrag = Verkaufspreis − Kosten
--
-- A surcharge raises revenue and therefore raises the margin. That is correct:
-- the cost it relates to is already in the cost side, or it is not a cost at
-- all. What must never happen is adding the same euro to both — which is why
-- the columns are separate and the UI says which is which.
-- ===========================================================================

create or replace function public.recalculate_calculation(p_calculation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  calc public.calculations;
  line public.calculation_lines;
  hourly bigint;
  line_hours numeric;
  visits_month numeric;
  setup_minutes_month numeric;
  sum_minutes numeric := 0;
  sum_personnel bigint := 0;
  sum_material bigint := 0;
  sum_machine bigint := 0;
  sum_other bigint := 0;
  sum_price bigint := 0;
  sum_one_off_minutes numeric := 0;
  sum_one_off_cost bigint := 0;
  sum_one_off_price bigint := 0;
  cost_month bigint;
  base_price bigint;
  surcharge bigint;
  price_month bigint;
  productive_hours numeric;
  line_count integer := 0;
  gaps text[] := '{}';
begin
  select * into calc from public.calculations where id = p_calculation_id for update;
  if calc.id is null then return; end if;

  hourly := public.personnel_cost_per_hour(
    calc.wage_cents_per_hour, calc.ancillary_rate_bp, calc.productive_rate_bp, calc.overhead_rate_bp);
  visits_month := round(calc.visits_per_week * public.weeks_per_month(), 3);
  setup_minutes_month := round(calc.setup_minutes_per_visit * visits_month, 2);

  for line in select * from public.calculation_lines where calculation_id = calc.id order by position loop
    declare
      minutes numeric;
      per_month numeric;
      -- Prefixed deliberately: a plpgsql variable sharing a column name makes
      -- `set monthly_minutes = monthly_minutes` ambiguous and the function
      -- throws for every caller.
      line_monthly_minutes numeric;
      personnel bigint;
      material bigint;
      machine bigint;
      other bigint;
      line_total bigint;
    begin
      line_count := line_count + 1;
      minutes := public.calculate_line_minutes(
        line.calculation_unit, line.quantity, line.productivity_per_hour,
        line.minutes_per_unit, line.minutes_override);
      per_month := public.calculate_services_per_month(line.frequency, line.frequency_count);

      if line.frequency = 'EINMALIG' then
        -- Costed once, at one occurrence, and kept out of the monthly figures.
        line_hours := round(minutes / 60, 4);
        personnel := round(line_hours * hourly)::bigint;
        material := public.cost_to_month(line.material_cents, line.material_basis, 1, line_hours, line.area_sqm);
        machine  := public.cost_to_month(line.machine_cents, line.machine_basis, 1, line_hours, line.area_sqm);
        other    := public.cost_to_month(line.other_cents, line.other_basis, 1, line_hours, line.area_sqm);
        line_total := personnel + material + machine + other;

        update public.calculation_lines set
          minutes_per_service = minutes,
          services_per_month = 0,
          monthly_minutes = 0,
          personnel_cost_cents_month = 0,
          material_cost_cents_month = 0,
          machine_cost_cents_month = 0,
          other_cost_cents_month = 0,
          total_cost_cents_month = 0,
          proposed_price_cents_month = 0,
          one_off_cost_cents = line_total,
          one_off_price_cents = public.price_from_margin(line_total, calc.target_margin_bp)
        where id = line.id;

        sum_one_off_minutes := sum_one_off_minutes + minutes;
        sum_one_off_cost := sum_one_off_cost + line_total;
        sum_one_off_price := sum_one_off_price + public.price_from_margin(line_total, calc.target_margin_bp);
      else
        line_monthly_minutes := round(minutes * per_month, 2);
        line_hours := round(line_monthly_minutes / 60, 4);

        personnel := round(line_hours * hourly)::bigint;
        material := public.cost_to_month(line.material_cents, line.material_basis, per_month, line_hours, line.area_sqm);
        machine  := public.cost_to_month(line.machine_cents, line.machine_basis, per_month, line_hours, line.area_sqm);
        other    := public.cost_to_month(line.other_cents, line.other_basis, per_month, line_hours, line.area_sqm);
        line_total := personnel + material + machine + other;

        update public.calculation_lines set
          minutes_per_service = minutes,
          services_per_month = per_month,
          monthly_minutes = line_monthly_minutes,
          personnel_cost_cents_month = personnel,
          material_cost_cents_month = material,
          machine_cost_cents_month = machine,
          other_cost_cents_month = other,
          total_cost_cents_month = line_total,
          proposed_price_cents_month = public.price_from_margin(line_total, calc.target_margin_bp),
          one_off_cost_cents = 0,
          one_off_price_cents = 0
        where id = line.id;

        sum_minutes := sum_minutes + line_monthly_minutes;
        sum_personnel := sum_personnel + personnel;
        sum_material := sum_material + material;
        sum_machine := sum_machine + machine;
        sum_other := sum_other + other;
        sum_price := sum_price + public.price_from_margin(line_total, calc.target_margin_bp);
      end if;
    end;
  end loop;

  -- Rüstzeit is time the team is paid for at this object, so it carries
  -- personnel cost exactly like cleaning time does.
  sum_minutes := sum_minutes + setup_minutes_month;
  sum_personnel := sum_personnel + round(setup_minutes_month / 60 * hourly)::bigint;
  productive_hours := round(sum_minutes / 60, 4);

  cost_month := sum_personnel + sum_material + sum_machine + sum_other
              + round(calc.travel_cents_per_visit * visits_month)::bigint
              + calc.other_cost_cents_per_month;

  base_price := coalesce(calc.price_override_cents_month,
                         public.price_from_margin(cost_month, calc.target_margin_bp));
  surcharge := calc.surcharge_travel_cents_month
             + calc.surcharge_small_order_cents_month
             + round(base_price::numeric * calc.surcharge_offpeak_bp / 10000)::bigint;
  price_month := base_price + surcharge;

  -- What is missing, stated rather than papered over. A calculation without a
  -- wage still computes — it computes zero — and a zero cost with a target
  -- margin produces a zero price and a margin of 0,0 %, which reads like an
  -- answer. It is not one.
  if line_count = 0 then gaps := gaps || 'KEINE_POSITIONEN'::text; end if;
  if calc.wage_cents_per_hour = 0 then gaps := gaps || 'KEIN_LOHN'::text; end if;
  if sum_minutes = 0 and sum_one_off_minutes = 0 then gaps := gaps || 'KEINE_ZEIT'::text; end if;
  if calc.target_margin_bp = 0 and calc.price_override_cents_month is null then
    gaps := gaps || 'KEINE_ZIELMARGE'::text;
  end if;
  if price_month = 0 then gaps := gaps || 'KEIN_PREIS'::text; end if;

  update public.calculations set
    personnel_cost_cents_per_hour = hourly,
    minutes_per_visit = case when visits_month > 0 then round(sum_minutes / visits_month, 2) else round(sum_minutes, 2) end,
    monthly_minutes = round(sum_minutes, 2),
    personnel_cost_cents_month = sum_personnel,
    material_cost_cents_month = sum_material,
    machine_cost_cents_month = sum_machine,
    travel_cost_cents_month = round(calc.travel_cents_per_visit * visits_month)::bigint,
    other_cost_cents_month = sum_other + calc.other_cost_cents_per_month,
    total_cost_cents_month = cost_month,
    total_cost_cents_visit = case when visits_month > 0 then round(cost_month / visits_month)::bigint else cost_month end,
    cost_cents_per_productive_hour = case when productive_hours > 0 then round(cost_month / productive_hours)::bigint else 0 end,
    -- What one productive hour must earn for this contract to break even.
    break_even_rate_cents_per_hour = case when productive_hours > 0 then round(cost_month / productive_hours)::bigint else 0 end,
    proposed_price_cents_month = public.price_from_margin(cost_month, calc.target_margin_bp),
    base_price_cents_month = base_price,
    surcharge_cents_month = surcharge,
    selling_price_cents_month = price_month,
    price_cents_per_productive_hour =
      case when productive_hours > 0 then round(price_month / productive_hours)::bigint else 0 end,
    min_price_cents_month = round(calc.min_hourly_rate_cents * productive_hours)::bigint,
    contribution_cents_month = price_month - cost_month,
    margin_bp = public.margin_bp(price_month, cost_month),
    markup_bp = public.markup_bp(price_month, cost_month),
    one_off_minutes = round(sum_one_off_minutes, 2),
    one_off_cost_cents = sum_one_off_cost,
    one_off_price_cents = sum_one_off_price,
    incomplete_reasons = gaps
  where id = calc.id;
end;
$$;

-- ===========================================================================
-- 3. A finalised calculation stays finalised
--
-- The guard listed the columns that carry commercial meaning. The surcharges
-- and the personnel model now carry it too, so they join the list.
-- ===========================================================================

create or replace function public.guard_final_calculation()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'FINAL' then raise exception 'A finalised Kalkulation cannot be deleted'; end if;
    return old;
  end if;

  if old.status <> 'FINAL' then return new; end if;
  -- Withdrawing is allowed and visible; it does not rewrite anything.
  if new.status = 'VERWORFEN' then return new; end if;

  if new.status is distinct from old.status
     or new.wage_cents_per_hour is distinct from old.wage_cents_per_hour
     or new.ancillary_rate_bp is distinct from old.ancillary_rate_bp
     or new.productive_rate_bp is distinct from old.productive_rate_bp
     or new.overhead_rate_bp is distinct from old.overhead_rate_bp
     or new.target_margin_bp is distinct from old.target_margin_bp
     or new.travel_cents_per_visit is distinct from old.travel_cents_per_visit
     or new.setup_minutes_per_visit is distinct from old.setup_minutes_per_visit
     or new.other_cost_cents_per_month is distinct from old.other_cost_cents_per_month
     or new.visits_per_week is distinct from old.visits_per_week
     or new.total_cost_cents_month is distinct from old.total_cost_cents_month
     or new.selling_price_cents_month is distinct from old.selling_price_cents_month
     or new.price_override_cents_month is distinct from old.price_override_cents_month
     or new.margin_bp is distinct from old.margin_bp
     -- Phase 21: the surcharges are part of what the customer was quoted.
     or new.surcharge_travel_cents_month is distinct from old.surcharge_travel_cents_month
     or new.surcharge_small_order_cents_month is distinct from old.surcharge_small_order_cents_month
     or new.surcharge_offpeak_bp is distinct from old.surcharge_offpeak_bp
     -- `base_price_cents_month` is deliberately absent: it is derived from the
     -- override, the margin and the cost, all of which are already guarded, and
     -- listing it would block the backfill that restates it for existing rows.
     -- …and the personnel model is what the cost side rests on.
     or new.weekly_hours is distinct from old.weekly_hours
     or new.working_days_per_week is distinct from old.working_days_per_week
     or new.vacation_days is distinct from old.vacation_days
     or new.public_holidays is distinct from old.public_holidays
     or new.sick_days is distinct from old.sick_days
     or new.training_days is distinct from old.training_days
     or new.unproductive_minutes_per_day is distinct from old.unproductive_minutes_per_day
  then
    raise exception 'A finalised Kalkulation cannot be changed. Create a revision instead.';
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 4. Writing the new assumptions
--
-- The old signature is dropped rather than overloaded: every parameter has a
-- default, so two versions would make every call ambiguous.
-- ===========================================================================

drop function if exists public.update_calculation(
  uuid, text, bigint, integer, integer, integer, integer, bigint, numeric, bigint, numeric, bigint, text, text);

create or replace function public.update_calculation(
  p_calculation_id uuid,
  p_title text default null,
  p_wage_cents bigint default null,
  p_ancillary_bp integer default null,
  p_productive_bp integer default null,
  p_overhead_bp integer default null,
  p_target_margin_bp integer default null,
  p_travel_cents_per_visit bigint default null,
  p_setup_minutes_per_visit numeric default null,
  p_other_cost_cents_per_month bigint default null,
  p_visits_per_week numeric default null,
  p_price_override_cents_month bigint default null,
  p_price_override_reason text default null,
  p_notes text default null,
  -- Phase 21: the personnel model. Supplying these without p_productive_bp
  -- derives the share; supplying p_productive_bp sets it directly.
  p_weekly_hours numeric default null,
  p_working_days_per_week numeric default null,
  p_vacation_days integer default null,
  p_public_holidays integer default null,
  p_sick_days integer default null,
  p_training_days integer default null,
  p_unproductive_minutes_per_day numeric default null,
  -- Phase 21: customer surcharges, which are revenue and not cost.
  p_surcharge_travel_cents_month bigint default null,
  p_surcharge_small_order_cents_month bigint default null,
  p_surcharge_offpeak_bp integer default null,
  p_surcharge_note text default null,
  p_min_hourly_rate_cents bigint default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  actor public.company_members;
  calc public.calculations;
  day_model_sent boolean;
  next_productive integer;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Kalkulation requires OWNER or OFFICE'; end if;
  select * into calc from public.calculations
  where id = p_calculation_id and company_id = actor.company_id for update;
  if calc.id is null then raise exception 'Kalkulation not found'; end if;
  if calc.status <> 'ENTWURF' then raise exception 'Only a draft Kalkulation can be changed'; end if;
  if p_price_override_cents_month is not null
     and char_length(trim(coalesce(p_price_override_reason, ''))) < 3 then
    raise exception 'A price that departs from the calculation needs a reason';
  end if;

  day_model_sent := num_nonnulls(
    p_weekly_hours, p_working_days_per_week, p_vacation_days,
    p_public_holidays, p_sick_days, p_training_days, p_unproductive_minutes_per_day) > 0;

  -- An explicit percentage always wins; otherwise the days decide, and only
  -- when days were actually sent. A caller that touches neither leaves the
  -- snapshotted share exactly as it was.
  next_productive := case
    when p_productive_bp is not null then p_productive_bp
    when day_model_sent then public.derive_productive_rate_bp(
      coalesce(p_weekly_hours, calc.weekly_hours),
      coalesce(p_working_days_per_week, calc.working_days_per_week),
      coalesce(p_vacation_days, calc.vacation_days),
      coalesce(p_public_holidays, calc.public_holidays),
      coalesce(p_sick_days, calc.sick_days),
      coalesce(p_training_days, calc.training_days),
      coalesce(p_unproductive_minutes_per_day, calc.unproductive_minutes_per_day))
    else calc.productive_rate_bp
  end;

  update public.calculations set
    title = coalesce(nullif(trim(coalesce(p_title, '')), ''), title),
    wage_cents_per_hour = coalesce(p_wage_cents, wage_cents_per_hour),
    ancillary_rate_bp = coalesce(p_ancillary_bp, ancillary_rate_bp),
    productive_rate_bp = next_productive,
    productive_rate_is_manual = case
      when p_productive_bp is not null then true
      when day_model_sent then false
      else productive_rate_is_manual
    end,
    weekly_hours = coalesce(p_weekly_hours, weekly_hours),
    working_days_per_week = coalesce(p_working_days_per_week, working_days_per_week),
    vacation_days = coalesce(p_vacation_days, vacation_days),
    public_holidays = coalesce(p_public_holidays, public_holidays),
    sick_days = coalesce(p_sick_days, sick_days),
    training_days = coalesce(p_training_days, training_days),
    unproductive_minutes_per_day = coalesce(p_unproductive_minutes_per_day, unproductive_minutes_per_day),
    overhead_rate_bp = coalesce(p_overhead_bp, overhead_rate_bp),
    target_margin_bp = coalesce(p_target_margin_bp, target_margin_bp),
    travel_cents_per_visit = coalesce(p_travel_cents_per_visit, travel_cents_per_visit),
    setup_minutes_per_visit = coalesce(p_setup_minutes_per_visit, setup_minutes_per_visit),
    other_cost_cents_per_month = coalesce(p_other_cost_cents_per_month, other_cost_cents_per_month),
    visits_per_week = coalesce(p_visits_per_week, visits_per_week),
    surcharge_travel_cents_month = coalesce(p_surcharge_travel_cents_month, surcharge_travel_cents_month),
    surcharge_small_order_cents_month = coalesce(p_surcharge_small_order_cents_month, surcharge_small_order_cents_month),
    surcharge_offpeak_bp = coalesce(p_surcharge_offpeak_bp, surcharge_offpeak_bp),
    surcharge_note = nullif(trim(coalesce(p_surcharge_note, surcharge_note, '')), ''),
    min_hourly_rate_cents = coalesce(p_min_hourly_rate_cents, min_hourly_rate_cents),
    -- Passing null clears the override and returns to the calculated price.
    price_override_cents_month = p_price_override_cents_month,
    price_override_reason = nullif(trim(coalesce(p_price_override_reason, '')), ''),
    notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes)
  where id = calc.id;

  perform public.recalculate_calculation(calc.id);
end;
$$;

revoke all on function public.update_calculation(
  uuid, text, bigint, integer, integer, integer, integer, bigint, numeric, bigint, numeric, bigint, text, text,
  numeric, numeric, integer, integer, integer, integer, numeric,
  bigint, bigint, integer, text, bigint) from public, anon;
grant execute on function public.update_calculation(
  uuid, text, bigint, integer, integer, integer, integer, bigint, numeric, bigint, numeric, bigint, text, text,
  numeric, numeric, integer, integer, integer, integer, numeric,
  bigint, bigint, integer, text, bigint) to authenticated;

-- ===========================================================================
-- 5. A new calculation starts where the company's costing already is
--
-- Phase 20 copied five numbers. The personnel model, the cost starting points
-- and the minimum rate were added since and are copied too — the same idea,
-- applied to the assumptions that now exist. Existing rows are untouched,
-- which is the entire reason these are copies and not references.
-- ===========================================================================

create or replace function public.create_calculation(
  p_title text,
  p_lead_id uuid default null,
  p_customer_id uuid default null,
  p_site_survey_id uuid default null,
  p_cleaning_object_id uuid default null,
  p_catalog_item_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor public.company_members;
  defaults public.company_calculation_defaults;
  survey public.site_surveys;
  area public.survey_areas;
  item public.service_catalog_items;
  new_id uuid;
  position_counter smallint := 0;
  weekly numeric := 0;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Kalkulation requires OWNER or OFFICE'; end if;
  if char_length(trim(coalesce(p_title, ''))) < 2 then raise exception 'A Kalkulation needs a title'; end if;

  if p_site_survey_id is not null then
    select * into survey from public.site_surveys
    where id = p_site_survey_id and company_id = actor.company_id;
    if survey.id is null then raise exception 'Survey not found'; end if;
  end if;
  if p_lead_id is null and p_customer_id is null and survey.id is not null then
    p_lead_id := survey.lead_id;
    p_customer_id := survey.customer_id;
  end if;
  if p_lead_id is null and p_customer_id is null then
    raise exception 'A Kalkulation needs a lead or a customer';
  end if;

  select * into defaults from public.company_calculation_defaults where company_id = actor.company_id;
  if p_catalog_item_id is not null then
    select * into item from public.service_catalog_items
    where id = p_catalog_item_id and company_id = actor.company_id;
  end if;

  insert into public.calculations (
    company_id, lead_id, customer_id, cleaning_object_id, site_survey_id, title,
    wage_cents_per_hour, ancillary_rate_bp, productive_rate_bp, overhead_rate_bp, target_margin_bp,
    weekly_hours, working_days_per_week, vacation_days, public_holidays, sick_days, training_days,
    unproductive_minutes_per_day, productive_rate_is_manual,
    travel_cents_per_visit, setup_minutes_per_visit, other_cost_cents_per_month,
    min_hourly_rate_cents, created_by
  ) values (
    actor.company_id, p_lead_id, p_customer_id, p_cleaning_object_id, p_site_survey_id, trim(p_title),
    coalesce(defaults.wage_cents_per_hour, 0), coalesce(defaults.ancillary_rate_bp, 0),
    coalesce(defaults.productive_rate_bp, 10000), coalesce(defaults.overhead_rate_bp, 0),
    coalesce(defaults.target_margin_bp, 0),
    coalesce(defaults.weekly_hours, 39), coalesce(defaults.working_days_per_week, 5),
    coalesce(defaults.vacation_days, 0), coalesce(defaults.public_holidays, 0),
    coalesce(defaults.sick_days, 0), coalesce(defaults.training_days, 0),
    coalesce(defaults.unproductive_minutes_per_day, 0),
    coalesce(defaults.productive_rate_is_manual, true),
    coalesce(defaults.default_travel_cents_per_visit, 0),
    coalesce(defaults.default_setup_minutes_per_visit, 0),
    coalesce(defaults.default_machine_cents_per_month, 0),
    coalesce(defaults.min_hourly_rate_cents, 0), actor.id
  ) returning id into new_id;

  if survey.id is not null then
    for area in select * from public.survey_areas where site_survey_id = survey.id order by position loop
      position_counter := position_counter + 1;
      weekly := greatest(weekly, area.services_per_week);
      insert into public.calculation_lines (
        company_id, calculation_id, position, area_name, area_sqm,
        catalog_item_id, service_name, calculation_unit, quantity,
        frequency, frequency_count, productivity_per_hour, minutes_per_unit,
        material_cents, material_basis,
        -- The surveyed minutes are kept as an override so nothing measured on
        -- site is lost, and the reason says where the number came from.
        minutes_override, override_reason
      ) values (
        actor.company_id, new_id, position_counter, area.name, area.area_sqm,
        item.id, coalesce(item.name, 'Unterhaltsreinigung'),
        coalesce(item.calculation_unit, 'QM'),
        coalesce(area.area_sqm, 1),
        'PRO_WOCHE', area.services_per_week,
        item.default_productivity_per_hour, item.default_minutes_per_unit,
        coalesce(item.default_material_cents, coalesce(defaults.default_material_cents_per_visit, 0)),
        coalesce(item.default_material_basis, 'PRO_EINSATZ'),
        case when item.default_productivity_per_hour is null then area.minutes_per_service else null end,
        case when item.default_productivity_per_hour is null then 'Aus der Besichtigung übernommen' else null end
      );
    end loop;
    if weekly > 0 then
      update public.calculations set visits_per_week = least(weekly, 21) where id = new_id;
    end if;
  end if;

  perform public.recalculate_calculation(new_id);
  return new_id;
end;
$$;

-- ===========================================================================
-- 6. A revision carries the whole snapshot forward
--
-- A revision is a new draft of the same commercial thinking. Copying only the
-- phase-20 columns would silently reset the personnel model and the surcharges
-- to their defaults, which looks like the office changed its mind.
-- ===========================================================================

create or replace function public.revise_calculation(p_calculation_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; calc public.calculations; new_id uuid;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Kalkulation requires OWNER or OFFICE'; end if;
  select * into calc from public.calculations
  where id = p_calculation_id and company_id = actor.company_id;
  if calc.id is null then raise exception 'Kalkulation not found'; end if;

  insert into public.calculations (
    company_id, lead_id, customer_id, cleaning_object_id, site_survey_id, title, notes,
    version, supersedes_calculation_id,
    wage_cents_per_hour, ancillary_rate_bp, productive_rate_bp, overhead_rate_bp, target_margin_bp,
    travel_cents_per_visit, setup_minutes_per_visit, other_cost_cents_per_month, visits_per_week,
    -- Phase 21: the personnel model and the customer surcharges belong to the
    -- same commercial thinking and travel with it. The price override does not
    -- — a revision starts from the calculated price, as it did in phase 20.
    weekly_hours, working_days_per_week, vacation_days, public_holidays, sick_days, training_days,
    unproductive_minutes_per_day, productive_rate_is_manual,
    surcharge_travel_cents_month, surcharge_small_order_cents_month, surcharge_offpeak_bp, surcharge_note,
    min_hourly_rate_cents,
    created_by
  )
  select calc.company_id, calc.lead_id, calc.customer_id, calc.cleaning_object_id, calc.site_survey_id,
         calc.title, calc.notes,
         (select coalesce(max(version), 0) + 1 from public.calculations sibling
          where sibling.company_id = calc.company_id
            and coalesce(sibling.site_survey_id, sibling.id) = coalesce(calc.site_survey_id, calc.id)),
         calc.id,
         calc.wage_cents_per_hour, calc.ancillary_rate_bp, calc.productive_rate_bp,
         calc.overhead_rate_bp, calc.target_margin_bp,
         calc.travel_cents_per_visit, calc.setup_minutes_per_visit,
         calc.other_cost_cents_per_month, calc.visits_per_week,
         calc.weekly_hours, calc.working_days_per_week, calc.vacation_days, calc.public_holidays,
         calc.sick_days, calc.training_days, calc.unproductive_minutes_per_day,
         calc.productive_rate_is_manual,
         calc.surcharge_travel_cents_month, calc.surcharge_small_order_cents_month,
         calc.surcharge_offpeak_bp, calc.surcharge_note,
         calc.min_hourly_rate_cents,
         actor.id
  returning id into new_id;

  insert into public.calculation_lines (
    company_id, calculation_id, position, area_name, area_sqm, catalog_item_id, service_name,
    scope_note, calculation_unit, quantity, frequency, frequency_count, service_weekdays,
    productivity_per_hour, minutes_per_unit, minutes_override, override_reason,
    material_cents, material_basis, machine_cents, machine_basis, other_cents, other_basis
  )
  select company_id, new_id, position, area_name, area_sqm, catalog_item_id, service_name,
         scope_note, calculation_unit, quantity, frequency, frequency_count, service_weekdays,
         productivity_per_hour, minutes_per_unit, minutes_override, override_reason,
         material_cents, material_basis, machine_cents, machine_basis, other_cents, other_basis
  from public.calculation_lines where calculation_id = calc.id order by position;

  perform public.recalculate_calculation(new_id);
  return new_id;
end;
$$;

-- ===========================================================================
-- 7. Seeding a catalogue for a named company
--
-- `seed_service_catalog(focus)` resolves the company from the signed-in actor,
-- which is right for the wizard and useless for anything that runs without a
-- session — the demo seed, or a future support tool. The catalogue itself moves
-- into a function that takes the company explicitly, and the original becomes a
-- thin wrapper, so there is still exactly one list of services.
-- ===========================================================================

create or replace function public.seed_service_catalog_for(p_company_id uuid, p_focus text[])
returns integer language plpgsql security definer set search_path = public as $$
declare
  seeded integer := 0;
  entry record;
begin
  if p_company_id is null then return 0; end if;

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
      p_company_id, entry.name, entry.category, entry.unit::public.calculation_unit,
      entry.productivity, entry.minutes_per_unit,
      entry.material_cents, entry.basis::public.cost_basis, entry.description
    )
    on conflict (company_id, name) do nothing;
    if found then seeded := seeded + 1; end if;
  end loop;

  return seeded;
end;
$$;

-- Not granted to `authenticated`: naming the company is exactly the parameter a
-- caller must not control. The session-bound wrapper below is the only door.
revoke all on function public.seed_service_catalog_for(uuid, text[]) from public, anon, authenticated;

create or replace function public.seed_service_catalog(p_focus text[])
returns integer language plpgsql security definer set search_path = public as $$
declare actor public.company_members;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Kalkulation requires OWNER or OFFICE'; end if;
  return public.seed_service_catalog_for(actor.company_id, p_focus);
end;
$$;

revoke all on function public.seed_service_catalog(text[]) from public, anon;
grant execute on function public.seed_service_catalog(text[]) to authenticated;

-- ===========================================================================
-- 8. Backfill
--
-- Existing drafts get the derived figures they are missing — base price,
-- surcharge (zero), the price per productive hour and the incomplete list.
-- Finalised calculations are deliberately left alone: recalculating one would
-- trip the guard, and correctly so.
-- ===========================================================================

do $$
declare draft_id uuid;
begin
  for draft_id in select id from public.calculations where status = 'ENTWURF' loop
    perform public.recalculate_calculation(draft_id);
  end loop;
end $$;

-- A frozen calculation keeps every figure it was finalised with. Only the two
-- columns that are pure restatements of what is already stored are filled in,
-- so the workspace does not show an empty base price next to a real total.
update public.calculations set
  base_price_cents_month = selling_price_cents_month,
  surcharge_cents_month = 0
where status <> 'ENTWURF' and base_price_cents_month = 0;
