-- A portal customer may see the remaining balance of their own invoices,
-- without obtaining direct access to the payments table or staff details.
-- Keep the existing RPC intact for backwards compatibility during rollout.
create function public.list_my_portal_invoices_with_balance()
returns table (
  id uuid, invoice_number text, status public.invoice_status,
  issue_date date, due_date date, service_period_start date,
  service_period_end date, currency text, gross_total_cents bigint,
  is_overdue boolean, paid_at timestamptz, outstanding_cents bigint
)
language sql stable security definer set search_path = public as $$
  select invoice.id, invoice.invoice_number, invoice.status,
    invoice.issue_date, invoice.due_date, invoice.service_period_start,
    invoice.service_period_end, invoice.currency, invoice.gross_total_cents,
    invoice.status = 'ISSUED' and invoice.due_date < current_date,
    invoice.paid_at,
    case when invoice.status = 'ISSUED' then
      greatest(invoice.gross_total_cents - coalesce((
        select sum(payment.amount_cents)::bigint
        from public.invoice_payments payment
        where payment.invoice_id = invoice.id and payment.company_id = invoice.company_id
      ), 0), 0)::bigint
    else 0::bigint end
  from public.current_customer_contact() contact
  join public.invoices invoice
    on invoice.customer_id = contact.customer_id and invoice.company_id = contact.company_id
  where auth.uid() is not null and invoice.status <> 'DRAFT'
  order by invoice.issue_date desc, invoice.invoice_number desc;
$$;

revoke all on function public.list_my_portal_invoices_with_balance() from public, anon;
grant execute on function public.list_my_portal_invoices_with_balance() to authenticated;
