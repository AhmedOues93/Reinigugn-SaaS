-- Accepted commercial terms are immutable.
-- The Leistungsplan must carry the billing mode and Kundenabnahme that were
-- actually offered and accepted. Operational scheduling may add weekdays and
-- times, but it cannot rewrite commercial terms.

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
      raise exception 'Accepted offer has no recurring price matching its agreed billing mode';
    end if;

    insert into public.service_schedules (
      company_id, customer_id, cleaning_object_id, name, valid_from, is_active,
      billing_description, billing_unit_price_cents, billing_vat_rate_basis_points,
      billing_mode, acceptance_policy
    ) values (
      actor.company_id, target_customer, new_object, quote.title, current_date, true,
      quote.title, agreed_price, coalesce(agreed_vat, 1900),
      quote.billing_mode,
      quote.acceptance_policy
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

create or replace function public.accept_public_quote(
  p_token text,
  p_name text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.quotes;
  survey public.site_surveys;
  lead_row public.leads;
  calc public.calculations;
  target_customer uuid;
  target_object uuid;
  target_schedule uuid;
  recurring_lines integer;
  agreed_price bigint;
  agreed_vat integer;
  agreed_unit text;
  signer text := trim(coalesce(p_name, ''));
  note text := nullif(trim(coalesce(p_note, '')), '');
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 256 then raise exception 'Invalid offer link'; end if;
  if char_length(signer) < 2 or char_length(signer) > 160 then raise exception 'Please enter your name'; end if;
  if note is not null and char_length(note) > 1000 then raise exception 'Note is too long'; end if;

  select * into target
  from public.quotes
  where public_token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'::text), 'hex')
    and public_access_expires_at > now()
  for update;

  if target.id is null then raise exception 'Offer link is invalid or expired'; end if;
  if target.status = 'ACCEPTED' then
    return jsonb_build_object('status', 'ACCEPTED', 'accepted_at', target.accepted_at);
  end if;
  if target.status <> 'SENT' then raise exception 'Offer cannot be accepted'; end if;
  if target.valid_until is not null and target.valid_until < current_date then
    update public.quotes set status = 'EXPIRED', updated_at = now() where id = target.id;
    raise exception 'Offer has expired';
  end if;

  if target.site_survey_id is not null then
    select * into survey from public.site_surveys where id = target.site_survey_id;
  end if;
  if target.calculation_id is not null then
    select * into calc from public.calculations where id = target.calculation_id;
  end if;
  if target.lead_id is not null then
    select * into lead_row from public.leads where id = target.lead_id for update;
  end if;

  if target.customer_id is not null then
    target_customer := target.customer_id;
  elsif lead_row.converted_customer_id is not null then
    target_customer := lead_row.converted_customer_id;
  else
    if lead_row.id is null then raise exception 'Offer has no customer data'; end if;
    insert into public.customers (
      company_id, name, contact_person, email, phone,
      billing_address, postal_code, city
    )
    values (
      target.company_id, lead_row.organisation, lead_row.contact_person,
      lead_row.email, lead_row.phone, lead_row.street,
      lead_row.postal_code, lead_row.city
    )
    returning id into target_customer;

    update public.leads
    set status = 'WON', converted_customer_id = target_customer,
        lost_reason = null, updated_at = now()
    where id = lead_row.id;
  end if;

  target_object := coalesce(calc.cleaning_object_id, lead_row.cleaning_object_id);
  if target_object is not null then
    if not exists (
      select 1 from public.cleaning_objects object
      where object.id = target_object
        and object.company_id = target.company_id
        and object.customer_id = target_customer
    ) then
      raise exception 'Offer object does not belong to customer';
    end if;
  else
    insert into public.cleaning_objects (
      company_id, customer_id, name, street, postal_code, city,
      access_instructions, is_active
    )
    values (
      target.company_id, target_customer, coalesce(survey.site_name, target.title),
      coalesce(survey.street, lead_row.street),
      coalesce(survey.postal_code, lead_row.postal_code),
      coalesce(survey.city, lead_row.city),
      survey.access_notes, true
    )
    returning id into target_object;
  end if;

  select count(*) into recurring_lines
  from public.quote_lines line
  where line.quote_id = target.id and line.recurrence <> 'ONE_OFF';

  if recurring_lines > 0 then
    agreed_unit := case target.billing_mode
      when 'PAUSCHALE_PRO_EINSATZ' then 'Einsatz'
      when 'STUNDENSATZ' then 'Std'
      else 'Monat'
    end;

    select line.unit_price_cents, line.vat_rate_basis_points
      into agreed_price, agreed_vat
    from public.quote_lines line
    where line.quote_id = target.id
      and line.recurrence <> 'ONE_OFF'
      and line.unit = agreed_unit
    order by line.position
    limit 1;

    if agreed_price is null then
      raise exception 'Accepted offer has no recurring price matching its agreed billing mode';
    end if;

    insert into public.service_schedules (
      company_id, customer_id, cleaning_object_id, name,
      valid_from, is_active, billing_description,
      billing_unit_price_cents, billing_vat_rate_basis_points,
      billing_mode, acceptance_policy
    )
    values (
      target.company_id, target_customer, target_object, target.title,
      current_date, true, target.title, agreed_price, coalesce(agreed_vat, 1900),
      target.billing_mode,
      target.acceptance_policy
    )
    returning id into target_schedule;
  end if;

  update public.quotes
  set status = 'ACCEPTED', accepted_at = now(), accepted_by_name = signer,
      acceptance_note = note, accepted_via = 'PUBLIC_LINK',
      created_customer_id = target_customer, created_object_id = target_object,
      created_schedule_id = target_schedule, updated_at = now()
  where id = target.id;

  if target.lead_id is not null then
    update public.leads
    set status = 'WON',
        converted_customer_id = coalesce(converted_customer_id, target_customer),
        lost_reason = null, updated_at = now()
    where id = target.lead_id;
  end if;

  return jsonb_build_object(
    'status', 'ACCEPTED',
    'customer_id', target_customer,
    'object_id', target_object,
    'schedule_id', target_schedule
  );
end;
$$;

revoke all on function public.accept_public_quote(text, text, text) from public;
grant execute on function public.accept_public_quote(text, text, text) to anon, authenticated;
