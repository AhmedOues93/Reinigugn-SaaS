-- Phase 24: customer portal offer decisions.
-- Reuse the already-tested public acceptance engine instead of maintaining a
-- second copy of customer/object/schedule conversion logic.

create or replace function public.accept_portal_quote(
  p_quote_id uuid,
  p_name text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  contact record;
  target record;
  raw_token text;
  result jsonb;
begin
  select * into contact from public.current_customer_contact();
  if contact.id is null then raise exception 'Customer portal access required'; end if;

  select * into target
  from public.quotes
  where id = p_quote_id
    and company_id = contact.company_id
    and coalesce(customer_id, created_customer_id) = contact.customer_id
  for update;

  if target.id is null then raise exception 'Quote not found'; end if;
  if target.status = 'ACCEPTED' then
    return jsonb_build_object('status', 'ACCEPTED', 'accepted_at', target.accepted_at);
  end if;
  if target.status <> 'SENT' then raise exception 'Quote cannot be accepted'; end if;

  -- The core acceptance function is token based. Create a transaction-local
  -- high-entropy token, run the same acceptance path, then remove public access
  -- before commit. The temporary credential is never returned to the client.
  raw_token := encode(extensions.gen_random_bytes(32), 'hex');

  update public.quotes
  set public_token_hash = encode(extensions.digest(convert_to(raw_token, 'UTF8'), 'sha256'::text), 'hex'),
      public_access_expires_at = now() + interval '5 minutes',
      updated_at = now()
  where id = target.id;

  result := public.accept_public_quote(raw_token, p_name, p_note);

  update public.quotes
  set accepted_via = 'PORTAL',
      public_token_hash = null,
      public_access_expires_at = null,
      updated_at = now()
  where id = target.id;

  return result;
end;
$$;

revoke all on function public.accept_portal_quote(uuid, text, text) from public, anon;
grant execute on function public.accept_portal_quote(uuid, text, text) to authenticated;

create or replace function public.decline_portal_quote(
  p_quote_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  contact record;
  target record;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  select * into contact from public.current_customer_contact();
  if contact.id is null then raise exception 'Customer portal access required'; end if;
  if reason is not null and char_length(reason) > 1000 then raise exception 'Reason is too long'; end if;

  select * into target
  from public.quotes
  where id = p_quote_id
    and company_id = contact.company_id
    and coalesce(customer_id, created_customer_id) = contact.customer_id
  for update;

  if target.id is null then raise exception 'Quote not found'; end if;
  if target.status <> 'SENT' then raise exception 'Quote cannot be declined'; end if;

  update public.quotes
  set status = 'DECLINED',
      decline_reason = reason,
      updated_at = now()
  where id = target.id;
end;
$$;

revoke all on function public.decline_portal_quote(uuid, text) from public, anon;
grant execute on function public.decline_portal_quote(uuid, text) to authenticated;

-- Portal detail needs the decline reason after a customer decision.
create or replace function public.get_my_portal_quote(p_quote_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  contact record;
  target record;
  result jsonb;
begin
  select * into contact from public.current_customer_contact();
  if contact.id is null then return null; end if;

  select * into target
  from public.quotes
  where id = p_quote_id
    and company_id = contact.company_id
    and coalesce(customer_id, created_customer_id) = contact.customer_id
    and status in ('SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED')
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
    'decline_reason', target.decline_reason,
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

revoke all on function public.get_my_portal_quote(uuid) from public, anon;
grant execute on function public.get_my_portal_quote(uuid) to authenticated;
