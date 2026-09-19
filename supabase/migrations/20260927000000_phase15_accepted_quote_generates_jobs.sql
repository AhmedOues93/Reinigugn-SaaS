-- Phase 15 — an accepted quote must produce visits, not just a plan.
--
-- `accept_quote` created the customer, the site and the recurring plan, but
-- nothing ever called `generate_jobs_for_schedule`. The office accepted an
-- offer, was told the plan had been created, and then found an empty planning
-- board: the only way to get the agreed visits was to open the plan and toggle
-- it off and on again. The work was sold and nobody was scheduled to do it.
--
-- The body below is the existing one with a single `perform` added after the
-- weekday rules are written. Generating here rather than in the caller means
-- the guarantee holds for every caller, now and later.
--
-- The horizon matches the planning screen's own (eight weeks). Generation is
-- idempotent — `generate_jobs_for_schedule` skips dates it has already covered
-- — so topping the horizon up later never duplicates a visit.

create or replace function public.accept_quote(
  p_quote_id uuid,
  p_weekdays smallint[] default null,
  p_start_time time default '08:00',
  p_end_time time default '10:00'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor public.company_members;
  quote public.quotes;
  survey public.site_surveys;
  lead_row public.leads;
  target_customer uuid;
  new_object uuid;
  new_schedule uuid;
  recurring_lines integer;
  weekday smallint;
  days smallint[] := coalesce(p_weekdays, array[1]::smallint[]);
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
    insert into public.service_schedules (company_id, customer_id, cleaning_object_id, name, valid_from, is_active, billing_description, billing_unit_price_cents, billing_vat_rate_basis_points)
    select actor.company_id, target_customer, new_object, quote.title, current_date, true,
           quote.title,
           -- The agreed rate carried into billing, so the first invoice does not
           -- have to re-derive what was sold.
           (select l.unit_price_cents from public.quote_lines l where l.quote_id = quote.id and l.recurrence <> 'ONE_OFF' order by l.position limit 1),
           (select l.vat_rate_basis_points from public.quote_lines l where l.quote_id = quote.id and l.recurrence <> 'ONE_OFF' order by l.position limit 1)
    returning id into new_schedule;

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

revoke all on function public.accept_quote(uuid, smallint[], time, time) from public, anon;
grant execute on function public.accept_quote(uuid, smallint[], time, time) to authenticated;
