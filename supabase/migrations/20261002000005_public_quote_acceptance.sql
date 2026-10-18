-- Customer-facing offer access and digital acceptance.
--
-- Public URLs carry a high-entropy token. Only its SHA-256 hash is stored.
-- Public readers receive a curated customer-facing JSON document; internal
-- calculation cost, wage and margin fields never leave the database.

alter table public.quotes
  add column if not exists public_token_hash text,
  add column if not exists public_access_expires_at timestamptz,
  add column if not exists accepted_by_name text,
  add column if not exists acceptance_note text,
  add column if not exists accepted_via text;

create unique index if not exists quotes_public_token_hash_uidx
  on public.quotes(public_token_hash)
  where public_token_hash is not null;

alter table public.quotes
  drop constraint if exists quotes_accepted_via_check;

alter table public.quotes
  add constraint quotes_accepted_via_check
  check (accepted_via is null or accepted_via in ('STAFF', 'PUBLIC_LINK', 'PORTAL'));

create or replace function public.set_quote_public_access(
  p_quote_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  target public.quotes;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;

  select * into target
  from public.quotes
  where id = p_quote_id and company_id = actor.company_id
  for update;

  if target.id is null then raise exception 'Quote not found'; end if;
  if target.status <> 'SENT' then raise exception 'Only a sent quote can be shared'; end if;
  if p_token_hash is null or length(p_token_hash) <> 64 then raise exception 'Invalid token hash'; end if;
  if p_expires_at <= now() then raise exception 'Access must expire in the future'; end if;

  update public.quotes
  set public_token_hash = p_token_hash,
      public_access_expires_at = p_expires_at,
      updated_at = now()
  where id = target.id;

  return target.id;
end;
$$;

revoke all on function public.set_quote_public_access(uuid, text, timestamptz) from public, anon;
grant execute on function public.set_quote_public_access(uuid, text, timestamptz) to authenticated;

create or replace function public.get_public_quote(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target public.quotes;
  result jsonb;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 256 then
    return null;
  end if;

  select * into target
  from public.quotes
  where public_token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'::text), 'hex')
    and public_access_expires_at > now()
    and status in ('SENT', 'ACCEPTED')
  limit 1;

  if target.id is null then return null; end if;

  select jsonb_build_object(
    'id', target.id,
    'quote_number', target.quote_number,
    'status', target.status,
    'title', target.title,
    'intro', target.intro,
    'recipient_snapshot', target.recipient_snapshot,
    'company_snapshot', target.company_snapshot,
    'sent_at', target.sent_at,
    'created_at', target.created_at,
    'valid_until', target.valid_until,
    'currency', target.currency,
    'net_total_cents', target.net_total_cents,
    'vat_total_cents', target.vat_total_cents,
    'gross_total_cents', target.gross_total_cents,
    'recurring_net_monthly_cents', target.recurring_net_monthly_cents,
    'accepted_at', target.accepted_at,
    'accepted_by_name', target.accepted_by_name,
    'acceptance_note', target.acceptance_note,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', line.position,
        'description', line.description,
        'quantity', line.quantity,
        'unit', line.unit,
        'unit_price_cents', line.unit_price_cents,
        'vat_rate_basis_points', line.vat_rate_basis_points,
        'recurrence', line.recurrence,
        'net_amount_cents', line.net_amount_cents,
        'vat_amount_cents', line.vat_amount_cents,
        'gross_amount_cents', line.gross_amount_cents
      ) order by line.position)
      from public.quote_lines line
      where line.quote_id = target.id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.get_public_quote(text) from public;
grant execute on function public.get_public_quote(text) to anon, authenticated;

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
  if p_token is null or length(p_token) < 32 or length(p_token) > 256 then
    raise exception 'Invalid offer link';
  end if;
  if char_length(signer) < 2 or char_length(signer) > 160 then
    raise exception 'Please enter your name';
  end if;
  if note is not null and char_length(note) > 1000 then
    raise exception 'Note is too long';
  end if;

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
    set status = 'WON',
        converted_customer_id = target_customer,
        lost_reason = null,
        updated_at = now()
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
      company_id, customer_id, name, street, postal_code, city, access_instructions, is_active
    )
    values (
      target.company_id,
      target_customer,
      coalesce(survey.site_name, target.title),
      coalesce(survey.street, lead_row.street),
      coalesce(survey.postal_code, lead_row.postal_code),
      coalesce(survey.city, lead_row.city),
      survey.access_notes,
      true
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
      select line.unit_price_cents, line.vat_rate_basis_points, line.unit
        into agreed_price, agreed_vat, agreed_unit
      from public.quote_lines line
      where line.quote_id = target.id and line.recurrence <> 'ONE_OFF'
      order by line.position
      limit 1;
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
      case agreed_unit
        when 'Einsatz' then 'PAUSCHALE_PRO_EINSATZ'::public.billing_mode
        when 'Std' then 'STUNDENSATZ'::public.billing_mode
        else 'MONATSPAUSCHALE'::public.billing_mode
      end,
      'KEINE_ABNAHME_ERFORDERLICH'::public.acceptance_policy
    )
    returning id into target_schedule;
  end if;

  update public.quotes
  set status = 'ACCEPTED',
      accepted_at = now(),
      accepted_by_name = signer,
      acceptance_note = note,
      accepted_via = 'PUBLIC_LINK',
      created_customer_id = target_customer,
      created_object_id = target_object,
      created_schedule_id = target_schedule,
      updated_at = now()
  where id = target.id;

  if target.lead_id is not null then
    update public.leads
    set status = 'WON',
        converted_customer_id = coalesce(converted_customer_id, target_customer),
        lost_reason = null,
        updated_at = now()
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

create or replace function public.list_my_portal_quotes()
returns table (
  id uuid,
  quote_number text,
  status public.quote_status,
  title text,
  sent_at timestamptz,
  valid_until date,
  gross_total_cents bigint,
  recurring_net_monthly_cents bigint,
  currency text,
  accepted_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    quote.id, quote.quote_number, quote.status, quote.title,
    quote.sent_at, quote.valid_until, quote.gross_total_cents,
    quote.recurring_net_monthly_cents, quote.currency, quote.accepted_at
  from public.current_customer_contact() contact
  join public.quotes quote
    on quote.company_id = contact.company_id
   and coalesce(quote.customer_id, quote.created_customer_id) = contact.customer_id
  where quote.status in ('SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED')
  order by quote.created_at desc;
$$;

revoke all on function public.list_my_portal_quotes() from public, anon;
grant execute on function public.list_my_portal_quotes() to authenticated;
