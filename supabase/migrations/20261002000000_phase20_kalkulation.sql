-- Phase 20 — a real Kalkulation, with a cost side.
--
-- What existed was a price preview: `survey_areas` held m², a frequency and
-- minutes somebody typed in, and the quote multiplied hours by an hourly rate.
-- There was no cost anywhere in the system. A cleaning company that cannot see
-- what a contract costs cannot tell a good one from a loss, and the m² it
-- carefully measured were never used for anything — the minutes were guessed.
--
-- This phase adds the missing half and connects the chain:
--
--   Besichtigung → Kalkulation → Leistungsverzeichnis → Angebot → Vertrag
--
-- Four ideas carry it.
--
-- **Richtleistung.** A service has a productivity — 250 m²/h for an office
-- floor, say — so measured area becomes time instead of guesswork. It is an
-- estimate and is treated as one: every line can be overridden, and an override
-- must say why.
--
-- **A transparent cost per productive hour.** Wage, employer ancillary cost,
-- the share of paid time that is actually productive, and an overhead
-- surcharge. Four company-configurable numbers, one formula, no invented tax
-- defaults.
--
-- **Markup and margin are not the same number.** They are computed and shown
-- separately, from explicit formulas, because confusing them is the most
-- common way a small company prices itself into a loss.
--
-- **A commercial snapshot.** A calculation used for an Angebot is frozen.
-- Changing next year's wage assumption cannot retroactively alter what was
-- offered or what a customer accepted.

-- ---------------------------------------------------------------------------
-- 1. Vocabulary
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'calculation_unit') then
    -- Not everything in this trade is measured in square metres. A window is a
    -- piece, a Grundreinigung is a visit, a winter-service retainer is a flat
    -- amount, and consultancy is an hour.
    create type public.calculation_unit as enum ('QM', 'STUNDE', 'STUECK', 'EINSATZ', 'PAUSCHAL');
  end if;

  if not exists (select 1 from pg_type where typname = 'calculation_frequency') then
    create type public.calculation_frequency as enum ('EINMALIG', 'PRO_WOCHE', 'PRO_MONAT');
  end if;

  if not exists (select 1 from pg_type where typname = 'calculation_status') then
    -- ENTWURF is editable. FINAL is commercial evidence and is frozen.
    create type public.calculation_status as enum ('ENTWURF', 'FINAL', 'VERWORFEN');
  end if;

  if not exists (select 1 from pg_type where typname = 'cost_basis') then
    create type public.cost_basis as enum ('PRO_EINSATZ', 'PRO_MONAT', 'PRO_STUNDE', 'PRO_QM');
  end if;
end $$;

/*
 * Weeks per month, as 13/3. Twelve months of 4 weeks is 48, which loses four
 * weeks of a year's work and four weeks of its cost. The existing quote totals
 * already use this factor; stating it once keeps every part of the chain
 * agreeing.
 */
create or replace function public.weeks_per_month() returns numeric
language sql immutable as $$ select 13::numeric / 3 $$;

-- ---------------------------------------------------------------------------
-- 2. Leistungskatalog
--
-- The company's own services and what they assume about them. Tenant-specific,
-- because a productivity that is right for one firm's equipment and standards
-- is wrong for another's.
--
-- Nothing here is authoritative: these are defaults that get copied into a
-- calculation line, where the office can change them. Editing the catalogue
-- later cannot reach back into a calculation that already used it.
-- ---------------------------------------------------------------------------

create table if not exists public.service_catalog_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  category text check (category is null or char_length(trim(category)) between 1 and 80),
  description text check (description is null or char_length(description) <= 2000),

  calculation_unit public.calculation_unit not null default 'QM',
  -- m² per hour for QM. An estimate, always overridable on the line.
  default_productivity_per_hour numeric(10, 2)
    check (default_productivity_per_hour is null or (default_productivity_per_hour > 0 and default_productivity_per_hour <= 100000)),
  -- For STUECK / EINSATZ, where productivity is expressed as time instead.
  default_minutes_per_unit numeric(10, 2)
    check (default_minutes_per_unit is null or (default_minutes_per_unit >= 0 and default_minutes_per_unit <= 100000)),

  default_material_cents bigint not null default 0 check (default_material_cents >= 0),
  default_material_basis public.cost_basis not null default 'PRO_EINSATZ',

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One name per company, so a catalogue cannot quietly grow duplicates that
  -- price differently.
  unique (company_id, name)
);
create index if not exists service_catalog_company_idx
  on public.service_catalog_items (company_id, is_active, category, name);

-- ---------------------------------------------------------------------------
-- 3. Company calculation assumptions
--
-- Four numbers the office sets once and revisits when wages move. Deliberately
-- NOT seeded with plausible-looking German defaults: an invented
-- Lohnnebenkosten rate that looks official is worse than an empty field,
-- because nobody checks it. They start at zero and the UI says what they are.
--
-- This is costing, not Lohnabrechnung. Nothing here computes anybody's pay.
-- ---------------------------------------------------------------------------

create table if not exists public.company_calculation_defaults (
  company_id uuid primary key references public.companies(id) on delete cascade,
  -- The wage a calculation is based on, not what any individual earns.
  wage_cents_per_hour bigint not null default 0 check (wage_cents_per_hour between 0 and 100000000),
  -- Employer ancillary labour cost, in basis points: 2100 = 21 %.
  ancillary_rate_bp integer not null default 0 check (ancillary_rate_bp between 0 and 20000),
  -- The share of paid time that is productive at the customer's site: 8500 =
  -- 85 %. Travel between sites, briefings, holiday and sickness are paid and
  -- are not productive, so an hour on site costs more than an hour of wage.
  productive_rate_bp integer not null default 10000 check (productive_rate_bp between 1000 and 10000),
  -- Company overhead carried by the hour, in basis points.
  overhead_rate_bp integer not null default 0 check (overhead_rate_bp between 0 and 20000),
  -- The margin the office aims at. Margin, not markup — see §6.
  target_margin_bp integer not null default 0 check (target_margin_bp between 0 and 9000),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 4. The calculation
--
-- The assumptions are copied onto the calculation rather than referenced.
-- That is the whole point of A7: a calculation carries the commercial world as
-- it stood when it was made, so next year's wage review cannot rewrite last
-- year's offer.
-- ---------------------------------------------------------------------------

create table if not exists public.calculations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,

  -- Where it came from and who it is for. A calculation can precede the
  -- customer existing, which is why the lead is an option.
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  cleaning_object_id uuid references public.cleaning_objects(id) on delete set null,
  site_survey_id uuid references public.site_surveys(id) on delete set null,

  title text not null check (char_length(trim(title)) between 2 and 160),
  notes text check (notes is null or char_length(notes) <= 4000),

  status public.calculation_status not null default 'ENTWURF',
  version integer not null default 1 check (version >= 1),
  -- A revision points at what it replaces, so the history reads forwards.
  supersedes_calculation_id uuid references public.calculations(id) on delete set null,

  -- --- the assumptions, as they stood (copied from the company defaults) ----
  wage_cents_per_hour bigint not null default 0 check (wage_cents_per_hour >= 0),
  ancillary_rate_bp integer not null default 0 check (ancillary_rate_bp between 0 and 20000),
  productive_rate_bp integer not null default 10000 check (productive_rate_bp between 1000 and 10000),
  overhead_rate_bp integer not null default 0 check (overhead_rate_bp between 0 and 20000),
  target_margin_bp integer not null default 0 check (target_margin_bp between 0 and 9000),

  -- --- costs that belong to the visit, not to one service ------------------
  travel_cents_per_visit bigint not null default 0 check (travel_cents_per_visit >= 0),
  setup_minutes_per_visit numeric(10, 2) not null default 0 check (setup_minutes_per_visit >= 0),
  other_cost_cents_per_month bigint not null default 0 check (other_cost_cents_per_month >= 0),

  -- How often the team attends the object. Setup and travel are per visit, so
  -- this is what turns them into a monthly cost.
  visits_per_week numeric(6, 3) not null default 1 check (visits_per_week >= 0 and visits_per_week <= 21),

  -- --- derived, recomputed by recalculate_calculation ----------------------
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  personnel_cost_cents_per_hour bigint not null default 0,
  minutes_per_visit numeric(12, 2) not null default 0,
  monthly_minutes numeric(14, 2) not null default 0,
  personnel_cost_cents_month bigint not null default 0,
  material_cost_cents_month bigint not null default 0,
  machine_cost_cents_month bigint not null default 0,
  travel_cost_cents_month bigint not null default 0,
  other_cost_cents_month bigint not null default 0,
  total_cost_cents_month bigint not null default 0,
  total_cost_cents_visit bigint not null default 0,
  cost_cents_per_productive_hour bigint not null default 0,
  -- The rate below which this contract loses money.
  break_even_rate_cents_per_hour bigint not null default 0,

  -- Sonderleistungen — a Grundreinigung before the contract starts, a one-off
  -- window clean — are billed once and must not be smeared into the monthly
  -- picture, or the recurring contract looks more profitable than it is.
  one_off_minutes numeric(12, 2) not null default 0,
  one_off_cost_cents bigint not null default 0,
  one_off_price_cents bigint not null default 0,

  proposed_price_cents_month bigint not null default 0,
  -- The office's decision, which is allowed to differ from the proposal.
  price_override_cents_month bigint check (price_override_cents_month is null or price_override_cents_month >= 0),
  price_override_reason text check (price_override_reason is null or char_length(price_override_reason) <= 1000),
  selling_price_cents_month bigint not null default 0,

  contribution_cents_month bigint not null default 0,
  margin_bp integer not null default 0,
  markup_bp integer not null default 0,

  created_by uuid not null references public.company_members(id) on delete restrict,
  finalised_at timestamptz,
  finalised_by uuid references public.company_members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calculations_owner_check check (num_nonnulls(lead_id, customer_id) >= 1),
  constraint calculations_final_check check ((status = 'FINAL') = (finalised_at is not null)),
  constraint calculations_override_reason check (
    price_override_cents_month is null or char_length(trim(coalesce(price_override_reason, ''))) >= 3
  )
);
create index if not exists calculations_company_idx
  on public.calculations (company_id, status, created_at desc);
create index if not exists calculations_survey_idx on public.calculations (site_survey_id);

create table if not exists public.calculation_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  calculation_id uuid not null references public.calculations(id) on delete cascade,
  position smallint not null default 1,

  -- Where in the building. Free text, because a Besichtigung produces whatever
  -- names the building actually uses.
  area_name text not null check (char_length(trim(area_name)) between 1 and 160),
  area_sqm numeric(10, 2) check (area_sqm is null or (area_sqm > 0 and area_sqm <= 1000000)),
  -- What is done there. The catalogue item is a provenance link; the name and
  -- every assumption are copied, so the line stands on its own.
  catalog_item_id uuid references public.service_catalog_items(id) on delete set null,
  service_name text not null check (char_length(trim(service_name)) between 2 and 160),
  -- Customer-facing scope text for the Leistungsverzeichnis.
  scope_note text check (scope_note is null or char_length(scope_note) <= 1000),

  calculation_unit public.calculation_unit not null default 'QM',
  quantity numeric(12, 3) not null default 1 check (quantity >= 0 and quantity <= 10000000),
  frequency public.calculation_frequency not null default 'PRO_WOCHE',
  frequency_count numeric(6, 3) not null default 1 check (frequency_count >= 0 and frequency_count <= 31),
  -- Which weekdays, where the office wants to record it. Planning detail, not
  -- part of the arithmetic.
  service_weekdays smallint[],

  productivity_per_hour numeric(10, 2)
    check (productivity_per_hour is null or (productivity_per_hour > 0 and productivity_per_hour <= 100000)),
  minutes_per_unit numeric(10, 2)
    check (minutes_per_unit is null or (minutes_per_unit >= 0 and minutes_per_unit <= 100000)),

  -- The professional escape hatch. A Richtleistung is an average; the office
  -- has seen this building. An override has to say why, so a reviewer can tell
  -- judgement from a typo.
  minutes_override numeric(12, 2) check (minutes_override is null or (minutes_override >= 0 and minutes_override <= 100000)),
  override_reason text check (override_reason is null or char_length(override_reason) <= 1000),

  material_cents bigint not null default 0 check (material_cents >= 0),
  material_basis public.cost_basis not null default 'PRO_EINSATZ',
  machine_cents bigint not null default 0 check (machine_cents >= 0),
  machine_basis public.cost_basis not null default 'PRO_EINSATZ',
  other_cents bigint not null default 0 check (other_cents >= 0),
  other_basis public.cost_basis not null default 'PRO_EINSATZ',

  -- --- derived --------------------------------------------------------------
  minutes_per_service numeric(12, 2) not null default 0,
  services_per_month numeric(10, 3) not null default 0,
  monthly_minutes numeric(14, 2) not null default 0,
  personnel_cost_cents_month bigint not null default 0,
  material_cost_cents_month bigint not null default 0,
  machine_cost_cents_month bigint not null default 0,
  other_cost_cents_month bigint not null default 0,
  total_cost_cents_month bigint not null default 0,
  proposed_price_cents_month bigint not null default 0,
  -- Filled instead of the monthly figures when frequency is EINMALIG.
  one_off_cost_cents bigint not null default 0,
  one_off_price_cents bigint not null default 0,

  created_at timestamptz not null default now(),

  constraint calculation_lines_override_reason check (
    minutes_override is null or char_length(trim(coalesce(override_reason, ''))) >= 3
  )
);
create index if not exists calculation_lines_calc_idx
  on public.calculation_lines (calculation_id, position);

create trigger calculations_set_updated_at
  before update on public.calculations
  for each row execute procedure public.set_updated_at();
create trigger service_catalog_set_updated_at
  before update on public.service_catalog_items
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Time: what a Richtleistung actually means
--
--   QM       minutes = m² / (m² per hour) * 60
--   STUECK   minutes = pieces * minutes per piece
--   STUNDE   minutes = hours * 60
--   EINSATZ  minutes = minutes per visit, quantity ignored
--   PAUSCHAL minutes = 0 — a flat amount buys no time
--
-- An override replaces the result, whatever the unit.
-- ---------------------------------------------------------------------------

create or replace function public.calculate_line_minutes(
  p_unit public.calculation_unit,
  p_quantity numeric,
  p_productivity_per_hour numeric,
  p_minutes_per_unit numeric,
  p_minutes_override numeric
) returns numeric language sql immutable as $$
  select round(coalesce(
    p_minutes_override,
    case p_unit
      when 'QM' then
        case when coalesce(p_productivity_per_hour, 0) > 0
             then coalesce(p_quantity, 0) / p_productivity_per_hour * 60
             else 0 end
      when 'STUECK'  then coalesce(p_quantity, 0) * coalesce(p_minutes_per_unit, 0)
      when 'STUNDE'  then coalesce(p_quantity, 0) * 60
      when 'EINSATZ' then coalesce(p_minutes_per_unit, 0)
      else 0
    end
  ), 2);
$$;

/*
 * How often a line happens in a month.
 *   EINMALIG   0 — a one-off is not part of the recurring monthly picture
 *   PRO_WOCHE  count * 13/3
 *   PRO_MONAT  count
 */
create or replace function public.calculate_services_per_month(
  p_frequency public.calculation_frequency,
  p_count numeric
) returns numeric language sql immutable as $$
  select round(case p_frequency
    when 'PRO_WOCHE' then coalesce(p_count, 0) * public.weeks_per_month()
    when 'PRO_MONAT' then coalesce(p_count, 0)
    else 0
  end, 3);
$$;

/*
 * Personnel cost of one productive hour.
 *
 *   wage_with_ancillary       = wage * (1 + ancillary)
 *   cost_per_productive_hour  = wage_with_ancillary / productive_share
 *   with_overhead             = cost_per_productive_hour * (1 + overhead)
 *
 * The division is the part people miss. If only 85 % of paid time is spent
 * productively on site, an hour of work on site carries 1/0.85 of an hour of
 * wage — the rest is travel, briefing, holiday and sickness, all of it paid.
 */
create or replace function public.personnel_cost_per_hour(
  p_wage_cents bigint,
  p_ancillary_bp integer,
  p_productive_bp integer,
  p_overhead_bp integer
) returns bigint language sql immutable as $$
  select greatest(round(
    coalesce(p_wage_cents, 0)::numeric
      * (1 + coalesce(p_ancillary_bp, 0)::numeric / 10000)
      / greatest(coalesce(p_productive_bp, 10000)::numeric / 10000, 0.01)
      * (1 + coalesce(p_overhead_bp, 0)::numeric / 10000)
  ), 0)::bigint;
$$;

/*
 * Turns a cost component into a monthly amount, whatever it is quoted against.
 */
create or replace function public.cost_to_month(
  p_cents bigint,
  p_basis public.cost_basis,
  p_services_per_month numeric,
  p_monthly_hours numeric,
  p_sqm numeric
) returns bigint language sql immutable as $$
  select round(coalesce(p_cents, 0)::numeric * case p_basis
    when 'PRO_EINSATZ' then coalesce(p_services_per_month, 0)
    when 'PRO_MONAT'   then 1
    when 'PRO_STUNDE'  then coalesce(p_monthly_hours, 0)
    when 'PRO_QM'      then coalesce(p_sqm, 0)
  end)::bigint;
$$;

-- ---------------------------------------------------------------------------
-- 6. Price: markup and margin are different numbers
--
--   margin = (price - cost) / price      -- share OF THE PRICE that is profit
--   markup = (price - cost) / cost       -- uplift ON THE COST
--
--   price from a target margin:  cost / (1 - margin)
--   price from a target markup:  cost * (1 + markup)
--
-- At a 30 % target these give 1.429x and 1.3x of cost. Treating them as the
-- same number is how a company quietly prices itself below break-even, so the
-- engine works from margin, stores both, and the UI labels them.
-- ---------------------------------------------------------------------------

create or replace function public.price_from_margin(p_cost_cents bigint, p_margin_bp integer)
returns bigint language sql immutable as $$
  select case
    when coalesce(p_margin_bp, 0) <= 0 then coalesce(p_cost_cents, 0)
    -- A 100 % margin has no finite price; the check constraint caps it at 90 %.
    else round(coalesce(p_cost_cents, 0)::numeric / (1 - p_margin_bp::numeric / 10000))::bigint
  end;
$$;

create or replace function public.margin_bp(p_price_cents bigint, p_cost_cents bigint)
returns integer language sql immutable as $$
  select case when coalesce(p_price_cents, 0) = 0 then 0
    else round((p_price_cents - coalesce(p_cost_cents, 0))::numeric / p_price_cents * 10000)::integer end;
$$;

create or replace function public.markup_bp(p_price_cents bigint, p_cost_cents bigint)
returns integer language sql immutable as $$
  select case when coalesce(p_cost_cents, 0) = 0 then 0
    else round((coalesce(p_price_cents, 0) - p_cost_cents)::numeric / p_cost_cents * 10000)::integer end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Recalculation
--
-- One function owns every derived number, so a screen cannot disagree with the
-- stored total. Called after every mutation, and never on a FINAL calculation.
-- ---------------------------------------------------------------------------

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
  price_month bigint;
  productive_hours numeric;
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
  price_month := coalesce(calc.price_override_cents_month,
                          public.price_from_margin(cost_month, calc.target_margin_bp));

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
    selling_price_cents_month = price_month,
    contribution_cents_month = price_month - cost_month,
    margin_bp = public.margin_bp(price_month, cost_month),
    markup_bp = public.markup_bp(price_month, cost_month),
    one_off_minutes = round(sum_one_off_minutes, 2),
    one_off_cost_cents = sum_one_off_cost,
    one_off_price_cents = sum_one_off_price
  where id = calc.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Immutability of a finalised calculation
--
-- FINAL is the commercial snapshot an Angebot rests on. The only permitted
-- change afterwards is the bookkeeping that links it to a quote, and
-- withdrawal. Everything commercial is refused.
-- ---------------------------------------------------------------------------

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
  then
    raise exception 'A finalised Kalkulation cannot be changed. Create a revision instead.';
  end if;
  return new;
end;
$$;

drop trigger if exists calculations_final_immutable on public.calculations;
create trigger calculations_final_immutable
  before update or delete on public.calculations
  for each row execute procedure public.guard_final_calculation();

create or replace function public.guard_final_calculation_lines()
returns trigger language plpgsql set search_path = public as $$
declare parent_status public.calculation_status;
begin
  select status into parent_status from public.calculations
  where id = coalesce(new.calculation_id, old.calculation_id);
  if parent_status = 'FINAL' then
    raise exception 'The lines of a finalised Kalkulation cannot be changed. Create a revision instead.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists calculation_lines_final_immutable on public.calculation_lines;
create trigger calculation_lines_final_immutable
  before insert or update or delete on public.calculation_lines
  for each row execute procedure public.guard_final_calculation_lines();

-- ---------------------------------------------------------------------------
-- 9. Row-level security
--
-- Commercial data is the most sensitive thing in this system. Wage
-- assumptions, cost and margin are readable by OWNER and OFFICE only — not by
-- employees, and never by a customer contact, who is also a `company_members`
-- row and would otherwise be caught by a careless "same company" policy.
-- ---------------------------------------------------------------------------

alter table public.service_catalog_items enable row level security;
alter table public.company_calculation_defaults enable row level security;
alter table public.calculations enable row level security;
alter table public.calculation_lines enable row level security;

drop policy if exists "billing staff read catalog" on public.service_catalog_items;
create policy "billing staff read catalog" on public.service_catalog_items
for select to authenticated using (public.is_company_staff(company_id));

drop policy if exists "billing staff read calculation defaults" on public.company_calculation_defaults;
create policy "billing staff read calculation defaults" on public.company_calculation_defaults
for select to authenticated using (public.is_company_staff(company_id));

drop policy if exists "billing staff read calculations" on public.calculations;
create policy "billing staff read calculations" on public.calculations
for select to authenticated using (public.is_company_staff(company_id));

drop policy if exists "billing staff read calculation lines" on public.calculation_lines;
create policy "billing staff read calculation lines" on public.calculation_lines
for select to authenticated using (public.is_company_staff(company_id));

-- Reads only. Every write goes through a function below that re-derives the
-- actor and refuses anybody who is not OWNER or OFFICE.
revoke all on public.service_catalog_items, public.company_calculation_defaults,
  public.calculations, public.calculation_lines from public, anon;
grant select on public.service_catalog_items, public.company_calculation_defaults,
  public.calculations, public.calculation_lines to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Writes
-- ---------------------------------------------------------------------------

create or replace function public.set_calculation_defaults(
  p_wage_cents bigint,
  p_ancillary_bp integer,
  p_productive_bp integer,
  p_overhead_bp integer,
  p_target_margin_bp integer
) returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Kalkulation requires OWNER or OFFICE'; end if;

  insert into public.company_calculation_defaults
    (company_id, wage_cents_per_hour, ancillary_rate_bp, productive_rate_bp, overhead_rate_bp, target_margin_bp)
  values (actor.company_id, coalesce(p_wage_cents, 0), coalesce(p_ancillary_bp, 0),
          coalesce(p_productive_bp, 10000), coalesce(p_overhead_bp, 0), coalesce(p_target_margin_bp, 0))
  on conflict (company_id) do update set
    wage_cents_per_hour = excluded.wage_cents_per_hour,
    ancillary_rate_bp = excluded.ancillary_rate_bp,
    productive_rate_bp = excluded.productive_rate_bp,
    overhead_rate_bp = excluded.overhead_rate_bp,
    target_margin_bp = excluded.target_margin_bp,
    updated_at = now();
end;
$$;

create or replace function public.save_catalog_item(
  p_id uuid,
  p_name text,
  p_category text,
  p_unit public.calculation_unit,
  p_productivity numeric,
  p_minutes_per_unit numeric,
  p_material_cents bigint,
  p_material_basis public.cost_basis,
  p_description text default null,
  p_is_active boolean default true
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; item_id uuid;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Kalkulation requires OWNER or OFFICE'; end if;
  if char_length(trim(coalesce(p_name, ''))) < 2 then raise exception 'A service needs a name'; end if;

  if p_id is null then
    insert into public.service_catalog_items
      (company_id, name, category, calculation_unit, default_productivity_per_hour,
       default_minutes_per_unit, default_material_cents, default_material_basis, description, is_active)
    values (actor.company_id, trim(p_name), nullif(trim(coalesce(p_category, '')), ''), p_unit,
            p_productivity, p_minutes_per_unit, coalesce(p_material_cents, 0),
            coalesce(p_material_basis, 'PRO_EINSATZ'), nullif(trim(coalesce(p_description, '')), ''),
            coalesce(p_is_active, true))
    returning id into item_id;
  else
    update public.service_catalog_items set
      name = trim(p_name),
      category = nullif(trim(coalesce(p_category, '')), ''),
      calculation_unit = p_unit,
      default_productivity_per_hour = p_productivity,
      default_minutes_per_unit = p_minutes_per_unit,
      default_material_cents = coalesce(p_material_cents, 0),
      default_material_basis = coalesce(p_material_basis, 'PRO_EINSATZ'),
      description = nullif(trim(coalesce(p_description, '')), ''),
      is_active = coalesce(p_is_active, true)
    where id = p_id and company_id = actor.company_id
    returning id into item_id;
    if item_id is null then raise exception 'Service not found'; end if;
  end if;
  return item_id;
end;
$$;

/*
 * A new calculation. Copies the company's current assumptions onto itself, so
 * from this moment it is insulated from later changes to them.
 *
 * When a Besichtigung is given, its measured areas become lines: the m² that
 * were walked and recorded finally drive the time, through the catalogue's
 * Richtleistung.
 */
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
    created_by
  ) values (
    actor.company_id, p_lead_id, p_customer_id, p_cleaning_object_id, p_site_survey_id, trim(p_title),
    coalesce(defaults.wage_cents_per_hour, 0), coalesce(defaults.ancillary_rate_bp, 0),
    coalesce(defaults.productive_rate_bp, 10000), coalesce(defaults.overhead_rate_bp, 0),
    coalesce(defaults.target_margin_bp, 0), actor.id
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
        coalesce(item.default_material_cents, 0), coalesce(item.default_material_basis, 'PRO_EINSATZ'),
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

create or replace function public.save_calculation_line(
  p_id uuid,
  p_calculation_id uuid,
  p_area_name text,
  p_service_name text,
  p_unit public.calculation_unit,
  p_quantity numeric,
  p_frequency public.calculation_frequency,
  p_frequency_count numeric,
  p_area_sqm numeric default null,
  p_catalog_item_id uuid default null,
  p_productivity numeric default null,
  p_minutes_per_unit numeric default null,
  p_minutes_override numeric default null,
  p_override_reason text default null,
  p_material_cents bigint default 0,
  p_material_basis public.cost_basis default 'PRO_EINSATZ',
  p_machine_cents bigint default 0,
  p_machine_basis public.cost_basis default 'PRO_EINSATZ',
  p_other_cents bigint default 0,
  p_other_basis public.cost_basis default 'PRO_EINSATZ',
  p_scope_note text default null,
  p_service_weekdays smallint[] default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; calc public.calculations; line_id uuid; next_position smallint;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Kalkulation requires OWNER or OFFICE'; end if;
  select * into calc from public.calculations
  where id = p_calculation_id and company_id = actor.company_id for update;
  if calc.id is null then raise exception 'Kalkulation not found'; end if;
  if calc.status <> 'ENTWURF' then raise exception 'Only a draft Kalkulation can be changed'; end if;
  if p_minutes_override is not null and char_length(trim(coalesce(p_override_reason, ''))) < 3 then
    raise exception 'An overridden time needs a reason';
  end if;

  if p_id is null then
    select coalesce(max(position), 0) + 1 into next_position
    from public.calculation_lines where calculation_id = calc.id;
    insert into public.calculation_lines (
      company_id, calculation_id, position, area_name, area_sqm, catalog_item_id, service_name,
      scope_note, calculation_unit, quantity, frequency, frequency_count, service_weekdays,
      productivity_per_hour, minutes_per_unit, minutes_override, override_reason,
      material_cents, material_basis, machine_cents, machine_basis, other_cents, other_basis
    ) values (
      actor.company_id, calc.id, next_position, trim(p_area_name), p_area_sqm, p_catalog_item_id,
      trim(p_service_name), nullif(trim(coalesce(p_scope_note, '')), ''), p_unit, coalesce(p_quantity, 1),
      p_frequency, coalesce(p_frequency_count, 1), p_service_weekdays,
      p_productivity, p_minutes_per_unit, p_minutes_override,
      nullif(trim(coalesce(p_override_reason, '')), ''),
      coalesce(p_material_cents, 0), coalesce(p_material_basis, 'PRO_EINSATZ'),
      coalesce(p_machine_cents, 0), coalesce(p_machine_basis, 'PRO_EINSATZ'),
      coalesce(p_other_cents, 0), coalesce(p_other_basis, 'PRO_EINSATZ')
    ) returning id into line_id;
  else
    update public.calculation_lines set
      area_name = trim(p_area_name), area_sqm = p_area_sqm, catalog_item_id = p_catalog_item_id,
      service_name = trim(p_service_name), scope_note = nullif(trim(coalesce(p_scope_note, '')), ''),
      calculation_unit = p_unit, quantity = coalesce(p_quantity, 1),
      frequency = p_frequency, frequency_count = coalesce(p_frequency_count, 1),
      service_weekdays = p_service_weekdays,
      productivity_per_hour = p_productivity, minutes_per_unit = p_minutes_per_unit,
      minutes_override = p_minutes_override,
      override_reason = nullif(trim(coalesce(p_override_reason, '')), ''),
      material_cents = coalesce(p_material_cents, 0), material_basis = coalesce(p_material_basis, 'PRO_EINSATZ'),
      machine_cents = coalesce(p_machine_cents, 0), machine_basis = coalesce(p_machine_basis, 'PRO_EINSATZ'),
      other_cents = coalesce(p_other_cents, 0), other_basis = coalesce(p_other_basis, 'PRO_EINSATZ')
    where id = p_id and calculation_id = calc.id
    returning id into line_id;
    if line_id is null then raise exception 'Kalkulationsposition not found'; end if;
  end if;

  perform public.recalculate_calculation(calc.id);
  return line_id;
end;
$$;

create or replace function public.remove_calculation_line(p_line_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members; calc_id uuid; calc_status public.calculation_status;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Kalkulation requires OWNER or OFFICE'; end if;
  select line.calculation_id, calc.status into calc_id, calc_status
  from public.calculation_lines line
  join public.calculations calc on calc.id = line.calculation_id
  where line.id = p_line_id and line.company_id = actor.company_id;
  if calc_id is null then raise exception 'Kalkulationsposition not found'; end if;
  if calc_status <> 'ENTWURF' then raise exception 'Only a draft Kalkulation can be changed'; end if;
  delete from public.calculation_lines where id = p_line_id;
  perform public.recalculate_calculation(calc_id);
end;
$$;

/*
 * The commercial settings of the calculation as a whole: what the office
 * assumes, what it charges for travel and setup, and the price it has decided
 * on. Assumptions stay editable while the calculation is a draft — that is what
 * "what if the wage were higher" means — and freeze at FINAL.
 */
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
  p_notes text default null
) returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members; calc public.calculations;
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

  update public.calculations set
    title = coalesce(nullif(trim(coalesce(p_title, '')), ''), title),
    wage_cents_per_hour = coalesce(p_wage_cents, wage_cents_per_hour),
    ancillary_rate_bp = coalesce(p_ancillary_bp, ancillary_rate_bp),
    productive_rate_bp = coalesce(p_productive_bp, productive_rate_bp),
    overhead_rate_bp = coalesce(p_overhead_bp, overhead_rate_bp),
    target_margin_bp = coalesce(p_target_margin_bp, target_margin_bp),
    travel_cents_per_visit = coalesce(p_travel_cents_per_visit, travel_cents_per_visit),
    setup_minutes_per_visit = coalesce(p_setup_minutes_per_visit, setup_minutes_per_visit),
    other_cost_cents_per_month = coalesce(p_other_cost_cents_per_month, other_cost_cents_per_month),
    visits_per_week = coalesce(p_visits_per_week, visits_per_week),
    -- Passing null clears the override and returns to the calculated price.
    price_override_cents_month = p_price_override_cents_month,
    price_override_reason = nullif(trim(coalesce(p_price_override_reason, '')), ''),
    notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes)
  where id = calc.id;

  perform public.recalculate_calculation(calc.id);
end;
$$;

/*
 * Freezing. After this the numbers are evidence: an Angebot can rest on them
 * and a wage review next spring cannot reach back and change what was offered.
 */
create or replace function public.finalise_calculation(p_calculation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members; calc public.calculations; line_count integer;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Kalkulation requires OWNER or OFFICE'; end if;
  select * into calc from public.calculations
  where id = p_calculation_id and company_id = actor.company_id for update;
  if calc.id is null then raise exception 'Kalkulation not found'; end if;
  if calc.status <> 'ENTWURF' then raise exception 'This Kalkulation is not a draft'; end if;

  select count(*) into line_count from public.calculation_lines where calculation_id = calc.id;
  if line_count = 0 then raise exception 'A Kalkulation needs at least one position'; end if;

  perform public.recalculate_calculation(calc.id);
  update public.calculations
  set status = 'FINAL', finalised_at = now(), finalised_by = actor.id
  where id = calc.id;
end;
$$;

/*
 * A revision. The frozen original stays exactly as it was and the copy starts
 * as a draft carrying the same numbers, so "what changed between v1 and v2" is
 * always answerable.
 */
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

revoke all on function
  public.set_calculation_defaults(bigint, integer, integer, integer, integer),
  public.save_catalog_item(uuid, text, text, public.calculation_unit, numeric, numeric, bigint, public.cost_basis, text, boolean),
  public.create_calculation(text, uuid, uuid, uuid, uuid, uuid),
  public.save_calculation_line(uuid, uuid, text, text, public.calculation_unit, numeric, public.calculation_frequency, numeric, numeric, uuid, numeric, numeric, numeric, text, bigint, public.cost_basis, bigint, public.cost_basis, bigint, public.cost_basis, text, smallint[]),
  public.remove_calculation_line(uuid),
  public.update_calculation(uuid, text, bigint, integer, integer, integer, integer, bigint, numeric, bigint, numeric, bigint, text, text),
  public.finalise_calculation(uuid),
  public.revise_calculation(uuid),
  public.recalculate_calculation(uuid)
from public, anon;

grant execute on function
  public.set_calculation_defaults(bigint, integer, integer, integer, integer),
  public.save_catalog_item(uuid, text, text, public.calculation_unit, numeric, numeric, bigint, public.cost_basis, text, boolean),
  public.create_calculation(text, uuid, uuid, uuid, uuid, uuid),
  public.save_calculation_line(uuid, uuid, text, text, public.calculation_unit, numeric, public.calculation_frequency, numeric, numeric, uuid, numeric, numeric, numeric, text, bigint, public.cost_basis, bigint, public.cost_basis, bigint, public.cost_basis, text, smallint[]),
  public.remove_calculation_line(uuid),
  public.update_calculation(uuid, text, bigint, integer, integer, integer, integer, bigint, numeric, bigint, numeric, bigint, text, text),
  public.finalise_calculation(uuid),
  public.revise_calculation(uuid)
to authenticated;

grant execute on function
  public.weeks_per_month(),
  public.calculate_line_minutes(public.calculation_unit, numeric, numeric, numeric, numeric),
  public.calculate_services_per_month(public.calculation_frequency, numeric),
  public.personnel_cost_per_hour(bigint, integer, integer, integer),
  public.cost_to_month(bigint, public.cost_basis, numeric, numeric, numeric),
  public.price_from_margin(bigint, integer),
  public.margin_bp(bigint, bigint),
  public.markup_bp(bigint, bigint)
to authenticated;
