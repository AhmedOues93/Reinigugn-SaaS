-- Phase 24: complete public quote decisions.

create or replace function public.decline_public_quote(
  p_token text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target record;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 256 then
    raise exception 'Invalid offer link';
  end if;
  if reason is not null and char_length(reason) > 1000 then
    raise exception 'Reason is too long';
  end if;

  select * into target
  from public.quotes
  where public_token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'::text), 'hex')
    and public_access_expires_at > now()
  for update;

  if target.id is null then raise exception 'Offer link is invalid or expired'; end if;
  if target.status = 'DECLINED' then return jsonb_build_object('status', 'DECLINED'); end if;
  if target.status <> 'SENT' then raise exception 'Offer cannot be declined'; end if;

  update public.quotes
  set status = 'DECLINED', decline_reason = reason, updated_at = now()
  where id = target.id;

  return jsonb_build_object('status', 'DECLINED');
end;
$$;

revoke all on function public.decline_public_quote(text, text) from public;
grant execute on function public.decline_public_quote(text, text) to anon, authenticated;

create or replace function public.get_public_quote(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target record;
  result jsonb;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 256 then return null; end if;

  select * into target
  from public.quotes
  where public_token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'::text), 'hex')
    and public_access_expires_at > now()
    and status in ('SENT', 'ACCEPTED', 'DECLINED')
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

revoke all on function public.get_public_quote(text) from public;
grant execute on function public.get_public_quote(text) to anon, authenticated;
