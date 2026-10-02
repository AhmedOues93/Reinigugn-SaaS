-- Buyer reference is EN16931 BT-10 and mandatory in XRechnung.
alter table public.invoices
  add column if not exists buyer_reference text;

alter table public.invoices
  drop constraint if exists invoices_buyer_reference_length;
alter table public.invoices
  add constraint invoices_buyer_reference_length
  check (buyer_reference is null or char_length(buyer_reference) <= 200);

drop function if exists public.create_draft_invoice(uuid, date, date, smallint, text);

create or replace function public.create_draft_invoice(
  p_customer_id uuid,
  p_period_start date,
  p_period_end date,
  p_payment_terms_days smallint default null,
  p_customer_note text default null,
  p_buyer_reference text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  target_customer public.customers;
  terms smallint;
  new_id uuid;
  buyer_ref text := nullif(trim(coalesce(p_buyer_reference, '')), '');
begin
  select * into actor from public.billing_actor();
  if actor.id is null then raise exception 'Billing requires OWNER or OFFICE'; end if;

  select * into target_customer
  from public.customers
  where id = p_customer_id and company_id = actor.company_id;
  if target_customer.id is null then raise exception 'Customer not found in this company'; end if;
  if p_period_end < p_period_start then raise exception 'Invalid service period'; end if;
  if buyer_ref is not null and char_length(buyer_ref) > 200 then raise exception 'Buyer reference is too long'; end if;

  select coalesce(p_payment_terms_days, default_payment_terms_days, 14)
  into terms
  from public.companies
  where id = actor.company_id;
  if terms < 0 or terms > 365 then raise exception 'Invalid payment terms'; end if;

  insert into public.invoices (
    company_id, customer_id, service_period_start, service_period_end,
    payment_terms_days, customer_note, buyer_reference, created_by
  )
  values (
    actor.company_id, target_customer.id, p_period_start, p_period_end,
    terms, nullif(trim(p_customer_note), ''), buyer_ref, actor.id
  )
  returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_draft_invoice(uuid, date, date, smallint, text, text) from public, anon;
grant execute on function public.create_draft_invoice(uuid, date, date, smallint, text, text) to authenticated;