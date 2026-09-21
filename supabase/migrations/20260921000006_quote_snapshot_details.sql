-- Phase 25: richer immutable offer snapshots for professional PDFs.
create or replace function public.send_quote(p_quote_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  quote public.quotes;
  company public.companies;
  lead_row public.leads;
  customer_row public.customers;
  calc_row public.calculations;
  object_row public.cleaning_objects;
  survey_row public.site_surveys;
  send_year smallint := extract(year from current_date)::smallint;
  next_number integer;
  formatted text;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;

  select * into quote
  from public.quotes
  where id = p_quote_id and company_id = actor.company_id
  for update;

  if quote.id is null then raise exception 'Quote not found'; end if;
  if quote.status <> 'DRAFT' then raise exception 'Only a draft quote can be sent'; end if;
  if not exists (select 1 from public.quote_lines where quote_id = quote.id) then
    raise exception 'A quote needs at least one line';
  end if;

  select * into company from public.companies where id = actor.company_id;
  if quote.lead_id is not null then
    select * into lead_row from public.leads where id = quote.lead_id;
  end if;
  if quote.customer_id is not null then
    select * into customer_row from public.customers where id = quote.customer_id;
  end if;
  if quote.calculation_id is not null then
    select * into calc_row from public.calculations where id = quote.calculation_id;
  end if;
  if quote.site_survey_id is not null then
    select * into survey_row from public.site_surveys where id = quote.site_survey_id;
  end if;

  if calc_row.cleaning_object_id is not null then
    select * into object_row
    from public.cleaning_objects
    where id = calc_row.cleaning_object_id and company_id = actor.company_id;
  elsif lead_row.cleaning_object_id is not null then
    select * into object_row
    from public.cleaning_objects
    where id = lead_row.cleaning_object_id and company_id = actor.company_id;
  end if;

  insert into public.quote_number_counters (company_id, year, last_number)
  values (actor.company_id, send_year, 0)
  on conflict (company_id, year) do nothing;

  select last_number + 1 into next_number
  from public.quote_number_counters
  where company_id = actor.company_id and year = send_year
  for update;

  update public.quote_number_counters
  set last_number = next_number
  where company_id = actor.company_id and year = send_year;

  formatted := format('AN-%s-%s', send_year, lpad(next_number::text, 4, '0'));

  update public.quotes
  set
    status = 'SENT',
    quote_number = formatted,
    sent_at = now(),
    recipient_snapshot = jsonb_build_object(
      'name', coalesce(customer_row.name, lead_row.organisation),
      'contact_person', coalesce(customer_row.contact_person, lead_row.contact_person),
      'email', coalesce(customer_row.email, lead_row.email),
      'street', coalesce(customer_row.billing_address, lead_row.street),
      'postal_code', coalesce(customer_row.postal_code, lead_row.postal_code),
      'city', coalesce(customer_row.city, lead_row.city),
      'country', coalesce(customer_row.billing_country, 'Deutschland'),
      'vat_id', customer_row.vat_id,
      'object_name', coalesce(object_row.name, survey_row.site_name),
      'object_street', coalesce(object_row.street, survey_row.street),
      'object_postal_code', coalesce(object_row.postal_code, survey_row.postal_code),
      'object_city', coalesce(object_row.city, survey_row.city)
    ),
    company_snapshot = jsonb_build_object(
      'name', company.name,
      'legal_form', company.legal_form,
      'street', company.street,
      'postal_code', company.postal_code,
      'city', company.city,
      'country', company.country,
      'phone', company.phone,
      'email', company.email,
      'website', company.website,
      'tax_number', company.tax_number,
      'vat_id', company.vat_id,
      'iban', company.iban,
      'bic', company.bic,
      'default_payment_terms_days', company.default_payment_terms_days
    ),
    updated_at = now()
  where id = quote.id;

  return formatted;
end;
$$;

revoke all on function public.send_quote(uuid) from public, anon;
grant execute on function public.send_quote(uuid) to authenticated;
