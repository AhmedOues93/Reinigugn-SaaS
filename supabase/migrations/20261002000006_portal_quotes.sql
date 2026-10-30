-- Authenticated portal customers can read only their own offers.

create or replace function public.get_my_portal_quote(p_quote_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  contact public.customer_contacts;
  target public.quotes;
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
