-- Phase 20b — one commercial truth, from the Besichtigung to the invoice.
--
-- The calculation now knows what the work costs and what it should sell for.
-- This migration carries that number forward without anybody retyping it:
--
--   Kalkulation (FINAL)
--     → Leistungsverzeichnis   what the customer is promised
--     → Angebot                what it costs them
--     → Annahme                agreed
--     → Leistungsplan          how it will be billed, month after month
--
-- It also fixes a defect the phase-19 audit turned up. `accept_quote` copied
-- the first recurring quote line's `unit_price_cents` into the schedule's
-- `billing_unit_price_cents`. Those lines were priced per HOUR ('Std'), and
-- phase 19 made every schedule default to `PAUSCHALE_PRO_EINSATZ` — a price
-- per VISIT. So an accepted offer produced a contract whose "flat price per
-- visit" was really an hourly rate, and the first invoice would have been
-- wrong by however many hours the visit took. The accepted terms now set the
-- billing mode and the price together, because they only make sense together.

-- ---------------------------------------------------------------------------
-- 1. The link from an Angebot back to the numbers behind it
-- ---------------------------------------------------------------------------

alter table public.quotes
  add column if not exists calculation_id uuid references public.calculations(id) on delete set null;

comment on column public.quotes.calculation_id is
  'The finalised Kalkulation this offer was generated from. Frozen, so later assumption changes cannot alter what was offered.';

-- How the office agreed to bill, decided when the offer is written rather than
-- guessed when the plan is created.
alter table public.quotes
  add column if not exists billing_mode public.billing_mode not null default 'MONATSPAUSCHALE';

comment on column public.quotes.billing_mode is
  'The billing arrangement these commercial terms describe. Carried into the Leistungsplan on acceptance.';

-- ---------------------------------------------------------------------------
-- 2. Leistungsverzeichnis
--
-- What is performed, for the customer. Deliberately returns no cost, no wage
-- assumption, no margin and no contribution: this feeds a PDF and a portal,
-- and the internal side of the calculation must never travel with it.
--
-- Staff-only by RLS as well, because the *source* is commercial data; the
-- customer-facing copy is the Angebot, which carries prices and nothing else.
-- ---------------------------------------------------------------------------

create or replace function public.get_leistungsverzeichnis(p_calculation_id uuid)
returns table (
  -- `position` is reserved in a RETURNS TABLE column list.
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
  -- A readable German frequency, so a PDF does not have to reimplement it.
  frequency_label text
)
language sql stable security definer set search_path = public as $$
  select
    line.position,
    line.area_name,
    line.area_sqm,
    line.service_name,
    line.scope_note,
    line.calculation_unit,
    line.quantity,
    line.frequency,
    line.frequency_count,
    line.service_weekdays,
    case line.frequency
      when 'EINMALIG' then 'einmalig'
      when 'PRO_MONAT' then
        case when line.frequency_count = 1 then 'monatlich'
             else rtrim(trim(to_char(line.frequency_count, 'FM999990.99')), '.') || '× monatlich' end
      else
        case when line.frequency_count = 1 then 'wöchentlich'
             else rtrim(trim(to_char(line.frequency_count, 'FM999990.99')), '.') || '× wöchentlich' end
    end
  from public.calculation_lines line
  join public.calculations calc on calc.id = line.calculation_id
  where line.calculation_id = p_calculation_id
    and public.is_company_staff(calc.company_id)
  order by line.position;
$$;

revoke all on function public.get_leistungsverzeichnis(uuid) from public, anon;
grant execute on function public.get_leistungsverzeichnis(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Angebot from a finalised Kalkulation
--
-- Extends the existing quote system rather than replacing it: the same
-- `quotes` and `quote_lines`, the same numbering, sending, acceptance and
-- snapshotting. What is new is where the numbers come from.
--
-- The quote carries only prices. Cost, wage and margin stay behind.
-- ---------------------------------------------------------------------------

create or replace function public.create_quote_from_calculation(
  p_calculation_id uuid,
  p_title text default null,
  p_valid_days integer default 30,
  p_billing_mode public.billing_mode default 'MONATSPAUSCHALE'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor public.company_members;
  calc public.calculations;
  line public.calculation_lines;
  new_quote uuid;
  next_position smallint := 0;
  monthly_visits numeric;
  price_per_visit bigint;
  hourly_price bigint;
  monthly_hours numeric;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;

  select * into calc from public.calculations
  where id = p_calculation_id and company_id = actor.company_id;
  if calc.id is null then raise exception 'Kalkulation not found'; end if;
  -- A draft can still move; an offer must rest on something that cannot.
  if calc.status <> 'FINAL' then
    raise exception 'Only a finalised Kalkulation can become an Angebot';
  end if;

  insert into public.quotes (
    company_id, lead_id, customer_id, site_survey_id, calculation_id, billing_mode,
    title, valid_until, created_by
  ) values (
    actor.company_id, calc.lead_id, calc.customer_id, calc.site_survey_id, calc.id,
    coalesce(p_billing_mode, 'MONATSPAUSCHALE'),
    coalesce(nullif(trim(coalesce(p_title, '')), ''), calc.title),
    current_date + greatest(least(coalesce(p_valid_days, 30), 365), 1), actor.id
  ) returning id into new_quote;

  monthly_visits := round(calc.visits_per_week * public.weeks_per_month(), 3);
  monthly_hours := round(calc.monthly_minutes / 60, 3);

  -- The recurring work, expressed the way it will actually be billed.
  if calc.selling_price_cents_month > 0 then
    next_position := next_position + 1;
    if p_billing_mode = 'PAUSCHALE_PRO_EINSATZ' and monthly_visits > 0 then
      price_per_visit := round(calc.selling_price_cents_month / monthly_visits)::bigint;
      insert into public.quote_lines (
        company_id, quote_id, position, description, quantity, unit,
        unit_price_cents, vat_rate_basis_points, recurrence
      ) values (
        actor.company_id, new_quote, next_position,
        calc.title || ' · Pauschale je Einsatz', 1, 'Einsatz',
        price_per_visit, 1900, 'WEEKLY'
      );
    elsif p_billing_mode = 'STUNDENSATZ' and monthly_hours > 0 then
      hourly_price := round(calc.selling_price_cents_month / monthly_hours)::bigint;
      insert into public.quote_lines (
        company_id, quote_id, position, description, quantity, unit,
        unit_price_cents, vat_rate_basis_points, recurrence
      ) values (
        actor.company_id, new_quote, next_position,
        calc.title || ' · Stundensatz', 1, 'Std', hourly_price, 1900, 'WEEKLY'
      );
    else
      insert into public.quote_lines (
        company_id, quote_id, position, description, quantity, unit,
        unit_price_cents, vat_rate_basis_points, recurrence
      ) values (
        actor.company_id, new_quote, next_position,
        calc.title || ' · Monatspauschale', 1, 'Monat',
        calc.selling_price_cents_month, 1900, 'MONTHLY'
      );
    end if;
  end if;

  -- Sonderleistungen keep their own lines, billed once.
  for line in
    select * from public.calculation_lines
    where calculation_id = calc.id and frequency = 'EINMALIG' and one_off_price_cents > 0
    order by position
  loop
    next_position := next_position + 1;
    insert into public.quote_lines (
      company_id, quote_id, position, description, quantity, unit,
      unit_price_cents, vat_rate_basis_points, recurrence
    ) values (
      actor.company_id, new_quote, next_position,
      line.area_name || ' · ' || line.service_name, 1, 'Pauschal',
      line.one_off_price_cents, 1900, 'ONE_OFF'
    );
  end loop;

  if calc.lead_id is not null then
    update public.leads set status = 'QUOTED' where id = calc.lead_id and status <> 'WON';
  end if;
  return new_quote;
end;
$$;

revoke all on function public.create_quote_from_calculation(uuid, text, integer, public.billing_mode)
  from public, anon;
grant execute on function public.create_quote_from_calculation(uuid, text, integer, public.billing_mode)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Acceptance initialises the contract from the accepted terms
--
-- Everything about the previous version is kept — customer creation from the
-- lead, the site, the schedule, the rules, the first eight weeks of visits.
-- Three things change:
--
--   * the billing mode comes from the accepted offer instead of defaulting,
--   * the unit price is read from the line that matches that mode, so an
--     hourly rate can never be stored as a price per visit,
--   * the Kundenabnahme policy of the new contract is set explicitly, so the
--     phase-19 acceptance model applies from the first visit.
-- ---------------------------------------------------------------------------

-- Replaced rather than overloaded: PostgreSQL will not let a function's
-- defaults be removed in place, and two overloads that differ only by a
-- defaulted trailing argument are ambiguous to call. Dropping the old shape and
-- giving the new argument a default means every existing four-argument caller
-- keeps working unchanged.
drop function if exists public.accept_quote(uuid, smallint[], time, time);

create or replace function public.accept_quote(
  p_quote_id uuid,
  p_weekdays smallint[] default null,
  p_start_time time default '08:00',
  p_end_time time default '10:00',
  p_acceptance_policy public.acceptance_policy default 'KEINE_ABNAHME_ERFORDERLICH'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor public.company_members;
  quote public.quotes;
  survey public.site_surveys;
  lead_row public.leads;
  calc public.calculations;
  target_customer uuid;
  new_object uuid;
  new_schedule uuid;
  recurring_lines integer;
  weekday smallint;
  days smallint[] := coalesce(p_weekdays, array[1]::smallint[]);
  agreed_price bigint;
  agreed_vat integer;
  agreed_unit text;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;
  select * into quote from public.quotes where id = p_quote_id and company_id = actor.company_id for update;
  if quote.id is null then raise exception 'Quote not found'; end if;
  if quote.status <> 'SENT' then raise exception 'Only a sent quote can be accepted'; end if;
  if p_end_time <= p_start_time then raise exception 'Invalid service window'; end if;
  if array_length(days, 1) is null then raise exception 'At least one weekday is required'; end if;
  foreach weekday in array days loop
    if weekday < 1 or weekday > 7 then raise exception 'Invalid weekday'; end if;
  end loop;

  if quote.site_survey_id is not null then
    select * into survey from public.site_surveys where id = quote.site_survey_id;
  end if;
  if quote.calculation_id is not null then
    select * into calc from public.calculations where id = quote.calculation_id;
  end if;

  -- 1. The customer: an existing one, or created from the lead.
  if quote.customer_id is not null then
    target_customer := quote.customer_id;
  else
    select * into lead_row from public.leads where id = quote.lead_id for update;
    if lead_row.id is null then raise exception 'Quote has neither a customer nor a lead'; end if;
    if lead_row.converted_customer_id is not null then
      target_customer := lead_row.converted_customer_id;
    else
      insert into public.customers (company_id, name, contact_person, email, phone, billing_address, postal_code, city)
      values (actor.company_id, lead_row.organisation, lead_row.contact_person, lead_row.email, lead_row.phone,
              lead_row.street, lead_row.postal_code, lead_row.city)
      returning id into target_customer;
    end if;
    update public.leads set status = 'WON', converted_customer_id = target_customer, lost_reason = null
    where id = lead_row.id;
  end if;

  -- 2. The site, from the survey when there is one.
  insert into public.cleaning_objects (company_id, customer_id, name, street, postal_code, city, access_instructions)
  values (actor.company_id, target_customer,
          coalesce(survey.site_name, quote.title),
          survey.street, survey.postal_code, survey.city, survey.access_notes)
  returning id into new_object;

  -- 3. The recurring plan, only when the quote actually contains recurring work.
  select count(*) into recurring_lines from public.quote_lines
  where quote_id = quote.id and recurrence <> 'ONE_OFF';

  if recurring_lines > 0 then
    /*
     * The price is read from the line whose unit matches the agreed billing
     * mode, so the number stored as `billing_unit_price_cents` always means
     * what the mode says it means. Picking "the first recurring line" is what
     * previously stored an hourly rate as a price per visit.
     */
    agreed_unit := case quote.billing_mode
      when 'PAUSCHALE_PRO_EINSATZ' then 'Einsatz'
      when 'STUNDENSATZ' then 'Std'
      else 'Monat'
    end;

    select line.unit_price_cents, line.vat_rate_basis_points into agreed_price, agreed_vat
    from public.quote_lines line
    where line.quote_id = quote.id and line.recurrence <> 'ONE_OFF' and line.unit = agreed_unit
    order by line.position limit 1;

    if agreed_price is null then
      -- An offer written before this phase, or edited by hand. Fall back to the
      -- first recurring line but keep the mode honest about what that price is.
      select line.unit_price_cents, line.vat_rate_basis_points, line.unit
        into agreed_price, agreed_vat, agreed_unit
      from public.quote_lines line
      where line.quote_id = quote.id and line.recurrence <> 'ONE_OFF'
      order by line.position limit 1;
    end if;

    insert into public.service_schedules (
      company_id, customer_id, cleaning_object_id, name, valid_from, is_active,
      billing_description, billing_unit_price_cents, billing_vat_rate_basis_points,
      billing_mode, acceptance_policy
    ) values (
      actor.company_id, target_customer, new_object, quote.title, current_date, true,
      quote.title, agreed_price, coalesce(agreed_vat, 1900),
      case agreed_unit
        when 'Einsatz' then 'PAUSCHALE_PRO_EINSATZ'::public.billing_mode
        when 'Std' then 'STUNDENSATZ'::public.billing_mode
        else 'MONATSPAUSCHALE'::public.billing_mode
      end,
      coalesce(p_acceptance_policy, 'KEINE_ABNAHME_ERFORDERLICH')
    ) returning id into new_schedule;

    foreach weekday in array days loop
      insert into public.schedule_rules (service_schedule_id, weekday, planned_start_time, planned_end_time, is_active)
      values (new_schedule, weekday, p_start_time, p_end_time, true);
    end loop;

    -- 4. The visits themselves. Without this the agreed plan exists but nobody
    --    is scheduled to clean anything.
    perform public.generate_jobs_for_schedule(new_schedule, current_date + 56);
  end if;

  update public.quotes set
    status = 'ACCEPTED', accepted_at = now(),
    created_customer_id = target_customer, created_object_id = new_object, created_schedule_id = new_schedule
  where id = quote.id;

  return target_customer;
end;
$$;

revoke all on function public.accept_quote(uuid, smallint[], time, time, public.acceptance_policy) from public, anon;
grant execute on function public.accept_quote(uuid, smallint[], time, time, public.acceptance_policy) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Reading a calculation, for the office screens
-- ---------------------------------------------------------------------------

create or replace function public.list_calculations(p_status public.calculation_status default null)
returns table (
  id uuid,
  title text,
  status public.calculation_status,
  version integer,
  customer_name text,
  lead_name text,
  monthly_minutes numeric,
  total_cost_cents_month bigint,
  selling_price_cents_month bigint,
  contribution_cents_month bigint,
  margin_bp integer,
  quote_id uuid,
  quote_number text,
  quote_status public.quote_status,
  created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    calc.id, calc.title, calc.status, calc.version,
    target_customer.name, lead.organisation,
    calc.monthly_minutes, calc.total_cost_cents_month, calc.selling_price_cents_month,
    calc.contribution_cents_month, calc.margin_bp,
    quote.id, quote.invoice_safe_number, quote.status, calc.created_at
  from public.sales_actor() actor
  join public.calculations calc on calc.company_id = actor.company_id
  left join public.customers target_customer on target_customer.id = calc.customer_id
  left join public.leads lead on lead.id = calc.lead_id
  left join lateral (
    select q.id, q.quote_number as invoice_safe_number, q.status
    from public.quotes q where q.calculation_id = calc.id
    order by q.created_at desc limit 1
  ) quote on true
  where p_status is null or calc.status = p_status
  order by calc.created_at desc;
$$;

revoke all on function public.list_calculations(public.calculation_status) from public, anon;
grant execute on function public.list_calculations(public.calculation_status) to authenticated;
