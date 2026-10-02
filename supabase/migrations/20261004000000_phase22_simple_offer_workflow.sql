-- Phase 22 — simple offer workflow.
-- Keep sales provenance normalized while the UI presents one short flow:
-- customer/object -> services -> calculation -> quote -> order.

alter table public.leads
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists cleaning_object_id uuid references public.cleaning_objects(id) on delete set null,
  add column if not exists cleaning_type text,
  add column if not exists desired_start date,
  add column if not exists frequency text,
  add column if not exists preferred_time text;

create index if not exists leads_customer_idx on public.leads(company_id, customer_id)
  where customer_id is not null;
create index if not exists leads_object_idx on public.leads(company_id, cleaning_object_id)
  where cleaning_object_id is not null;

create or replace function public.create_lead_v2(
  p_organisation text,
  p_contact_person text default null,
  p_email text default null,
  p_phone text default null,
  p_street text default null,
  p_postal_code text default null,
  p_city text default null,
  p_source text default null,
  p_notes text default null,
  p_customer_id uuid default null,
  p_cleaning_object_id uuid default null,
  p_cleaning_type text default null,
  p_desired_start date default null,
  p_frequency text default null,
  p_preferred_time text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  actor record;
  new_id uuid;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.company_id = actor.company_id and c.is_active
  ) then
    raise exception 'Customer is not available';
  end if;

  if p_cleaning_object_id is not null and not exists (
    select 1 from public.cleaning_objects o
    where o.id = p_cleaning_object_id and o.company_id = actor.company_id
      and (p_customer_id is null or o.customer_id = p_customer_id)
  ) then
    raise exception 'Cleaning object is not available for this customer';
  end if;

  insert into public.leads (
    company_id, organisation, contact_person, email, phone, street, postal_code, city,
    source, notes, customer_id, cleaning_object_id, cleaning_type, desired_start,
    frequency, preferred_time, created_by
  ) values (
    actor.company_id, trim(p_organisation), nullif(trim(p_contact_person), ''),
    nullif(trim(p_email), ''), nullif(trim(p_phone), ''), nullif(trim(p_street), ''),
    nullif(trim(p_postal_code), ''), nullif(trim(p_city), ''), nullif(trim(p_source), ''),
    nullif(trim(p_notes), ''), p_customer_id, p_cleaning_object_id,
    nullif(trim(p_cleaning_type), ''), p_desired_start, nullif(trim(p_frequency), ''),
    nullif(trim(p_preferred_time), ''), actor.id
  ) returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_lead_v2(text,text,text,text,text,text,text,text,text,uuid,uuid,text,date,text,text) from public;
grant execute on function public.create_lead_v2(text,text,text,text,text,text,text,text,text,uuid,uuid,text,date,text,text) to authenticated;

comment on function public.create_lead_v2(text,text,text,text,text,text,text,text,text,uuid,uuid,text,date,text,text)
is 'Creates a normalized sales lead/prospect. Existing customer/object links and cleaning requirements stay queryable instead of being packed into notes.';


-- Reuse an existing object on acceptance instead of silently duplicating it.
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

  -- 2. Reuse an explicitly linked object. Only create a new site when this
  -- offer really represents a new object.
  new_object := coalesce(calc.cleaning_object_id, lead_row.cleaning_object_id);
  if new_object is not null then
    if not exists (
      select 1 from public.cleaning_objects o
      where o.id = new_object and o.company_id = actor.company_id and o.customer_id = target_customer
    ) then
      raise exception 'Cleaning object does not belong to the accepted customer';
    end if;
  else
    insert into public.cleaning_objects (company_id, customer_id, name, street, postal_code, city, access_instructions)
    values (actor.company_id, target_customer,
            coalesce(survey.site_name, quote.title),
            coalesce(survey.street, lead_row.street),
            coalesce(survey.postal_code, lead_row.postal_code),
            coalesce(survey.city, lead_row.city),
            survey.access_notes)
    returning id into new_object;
  end if;

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
