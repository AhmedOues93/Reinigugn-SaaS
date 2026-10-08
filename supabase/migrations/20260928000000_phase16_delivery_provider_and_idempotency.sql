-- Phase 16 — transactional e-mail through a provider, recorded honestly.
--
-- Two gaps this closes.
--
-- 1. A delivery row said only "SENT". When a customer claims an invoice never
--    arrived, the office had nothing to give support: no provider, no message
--    id, nothing to search for in the provider's dashboard.
--
-- 2. `record_invoice_delivery` inserted unconditionally. A double-clicked send
--    button, or a server action replayed after a network hiccup, produced two
--    successful rows for one message — and for a reminder, incremented
--    `reminder_count` twice, which changes what the customer is told.
--
-- The fix is an idempotency key supplied by the caller. A repeat with the same
-- key returns the row already recorded and changes nothing else, so a retry is
-- safe at the database as well as at the provider.

alter table public.invoice_deliveries
  add column if not exists provider text check (provider is null or provider in ('resend', 'smtp')),
  add column if not exists provider_message_id text
    check (provider_message_id is null or char_length(provider_message_id) <= 400),
  add column if not exists idempotency_key text
    check (idempotency_key is null or char_length(idempotency_key) <= 100);

-- One attempt per key per invoice. Partial, so historical rows and manual
-- records — which have no key — are unaffected.
create unique index if not exists invoice_deliveries_idempotency_idx
  on public.invoice_deliveries (invoice_id, kind, idempotency_key)
  where idempotency_key is not null;

create or replace function public.record_invoice_delivery(
  p_invoice_id uuid,
  p_kind public.invoice_delivery_kind,
  p_channel text,
  p_recipient text,
  p_status public.invoice_delivery_status,
  p_detail text default null,
  p_provider text default null,
  p_provider_message_id text default null,
  p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor public.company_members;
  invoice public.invoices;
  delivery_id uuid;
  existing uuid;
begin
  select * into actor from public.billing_actor();
  if actor.id is null then raise exception 'Billing requires OWNER or OFFICE'; end if;
  select * into invoice from public.invoices where id = p_invoice_id and company_id = actor.company_id for update;
  if invoice.id is null then raise exception 'Invoice not found'; end if;
  if p_channel not in ('EMAIL', 'MANUAL') then raise exception 'Invalid channel'; end if;
  if p_channel = 'MANUAL' and p_status <> 'MANUAL' then raise exception 'A manual delivery has status MANUAL'; end if;
  if p_channel = 'EMAIL' and p_status = 'MANUAL' then raise exception 'An e-mail delivery cannot be MANUAL'; end if;
  if p_provider is not null and p_provider not in ('resend', 'smtp') then raise exception 'Unknown mail provider'; end if;

  -- A replay of the same attempt is not a new delivery. Returning the original
  -- row means the caller still gets an id, and nothing is counted twice.
  if p_idempotency_key is not null then
    select id into existing from public.invoice_deliveries
    where invoice_id = invoice.id and kind = p_kind and idempotency_key = p_idempotency_key;
    if existing is not null then return existing; end if;
  end if;

  if p_kind = 'INVOICE' and invoice.status not in ('ISSUED', 'PAID') then
    raise exception 'Only an issued invoice can be delivered';
  end if;
  if p_kind = 'REMINDER' and not (invoice.status = 'ISSUED' and invoice.due_date < current_date) then
    raise exception 'A reminder needs an open, overdue invoice';
  end if;

  insert into public.invoice_deliveries (
    company_id, invoice_id, kind, channel, recipient, status, detail, created_by,
    provider, provider_message_id, idempotency_key
  )
  values (
    invoice.company_id, invoice.id, p_kind, p_channel, nullif(trim(p_recipient), ''),
    p_status, left(p_detail, 1000), actor.id,
    p_provider, left(p_provider_message_id, 400), p_idempotency_key
  )
  returning id into delivery_id;

  -- Only an accepted message moves the invoice on. A FAILED attempt is logged
  -- and changes nothing, so retrying stays correct.
  if p_status in ('SENT', 'MANUAL') then
    if p_kind = 'INVOICE' then
      update public.invoices set sent_at = coalesce(sent_at, now()) where id = invoice.id;
    else
      update public.invoices set last_reminder_at = now(), reminder_count = reminder_count + 1 where id = invoice.id;
    end if;
  end if;
  return delivery_id;
end;
$$;

revoke all on function public.record_invoice_delivery(
  uuid, public.invoice_delivery_kind, text, text, public.invoice_delivery_status, text, text, text, text
) from public, anon;
grant execute on function public.record_invoice_delivery(
  uuid, public.invoice_delivery_kind, text, text, public.invoice_delivery_status, text, text, text, text
) to authenticated;

-- The six-argument signature the previous release used is now ambiguous with
-- the new defaults, and nothing should call it.
drop function if exists public.record_invoice_delivery(
  uuid, public.invoice_delivery_kind, text, text, public.invoice_delivery_status, text
);
