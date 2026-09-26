-- Phase 18b — how an invoice becomes paid, recorded properly.
--
-- Before this, `mark_invoice_paid` set `status = 'PAID'` and a timestamp. That
-- is enough to make a badge turn green and nothing else. It did not record who
-- decided the money had arrived, how it arrived, or what reference matched it
-- to a bank line — so "why is this marked paid?" had no answer, and a mistake
-- could not be traced or undone with any confidence.
--
-- Payments now live in their own table. That is not ceremony: it is what makes
-- the next steps possible without rebuilding the invoice.
--
--   * A bank-statement import later inserts rows with source = 'BANK_IMPORT'
--     and the bank's own reference, and the invoice reaches PAID by exactly
--     the same rule.
--   * A Stripe webhook later inserts source = 'STRIPE' with the payment intent
--     as external_reference.
--   * Partial payments already work: the invoice becomes PAID when the
--     payments reach the gross total, not when the first one is entered.
--
-- No automatic detection is implemented or implied here. Every row this phase
-- can create is source = 'MANUAL', entered by a person who looked at a bank
-- statement.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type public.payment_method as enum ('BANK_TRANSFER', 'CASH', 'CARD', 'DIRECT_DEBIT', 'OTHER');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_source') then
    -- Only MANUAL is reachable today. The others exist so adding them later is
    -- a migration about behaviour, not about the shape of the data.
    create type public.payment_source as enum ('MANUAL', 'BANK_IMPORT', 'STRIPE');
  end if;
end $$;

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  -- Minor units, like every other amount in this schema. Never a float.
  amount_cents bigint not null check (amount_cents > 0),
  currency text not null default 'EUR' check (char_length(currency) = 3),
  -- The date the money arrived, which is rarely the date somebody typed it in.
  paid_on date not null,
  method public.payment_method not null default 'BANK_TRANSFER',
  -- What ties this to a bank line: a Verwendungszweck, a transaction id.
  reference text check (reference is null or char_length(reference) <= 200),
  note text check (note is null or char_length(note) <= 500),
  source public.payment_source not null default 'MANUAL',
  -- The provider's or bank's own identifier, once there is one.
  external_reference text check (external_reference is null or char_length(external_reference) <= 200),
  -- Makes a double-submitted confirmation harmless.
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) <= 100),
  recorded_by uuid not null references public.company_members(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists invoice_payments_invoice_idx
  on public.invoice_payments (invoice_id, paid_on);
create unique index if not exists invoice_payments_idempotency_idx
  on public.invoice_payments (invoice_id, idempotency_key)
  where idempotency_key is not null;
-- An imported or provider payment is recorded once, whatever retries happen.
create unique index if not exists invoice_payments_external_idx
  on public.invoice_payments (source, external_reference)
  where external_reference is not null;

alter table public.invoice_payments enable row level security;

-- Staff read their own company's payments. Nobody writes from a session: the
-- only way in is the function below, which checks the role and the state.
drop policy if exists "staff read own company payments" on public.invoice_payments;
create policy "staff read own company payments" on public.invoice_payments
for select using (public.is_company_staff(company_id));

-- Reading is granted, writing deliberately is not: with no insert, update or
-- delete privilege, a payment can only ever come from the function below, and
-- a recorded payment cannot be quietly altered or removed afterwards.
revoke all on public.invoice_payments from public, anon;
grant select on public.invoice_payments to authenticated;

/*
 * Records one payment against an issued invoice, and settles it when the
 * payments reach the total.
 *
 * Refuses everything that should be refused: a customer or employee calling it,
 * another tenant's invoice, a draft, a cancelled invoice, an already-settled
 * invoice, a future date, an amount that overshoots what is owed, and a repeat
 * of a confirmation that already went through.
 */
create or replace function public.record_invoice_payment(
  p_invoice_id uuid,
  p_paid_on date default current_date,
  p_method public.payment_method default 'BANK_TRANSFER',
  p_reference text default null,
  p_amount_cents bigint default null,
  p_note text default null,
  p_idempotency_key text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor public.company_members;
  invoice public.invoices;
  already bigint;
  amount bigint;
  payment_id uuid;
  existing uuid;
begin
  select * into actor from public.billing_actor();
  if actor.id is null then raise exception 'Billing requires OWNER or OFFICE'; end if;

  select * into invoice from public.invoices
  where id = p_invoice_id and company_id = actor.company_id for update;
  if invoice.id is null then raise exception 'Invoice not found'; end if;

  -- A replayed confirmation is not a second payment.
  if p_idempotency_key is not null then
    select id into existing from public.invoice_payments
    where invoice_id = invoice.id and idempotency_key = p_idempotency_key;
    if existing is not null then return existing; end if;
  end if;

  if invoice.status = 'DRAFT' then raise exception 'A draft invoice has not been sent and cannot be paid'; end if;
  if invoice.status = 'CANCELLED' then raise exception 'A cancelled invoice cannot be paid'; end if;
  if invoice.status = 'PAID' then raise exception 'This invoice is already settled'; end if;

  if p_paid_on > current_date then raise exception 'A payment cannot be dated in the future'; end if;
  -- Catches the common typo — a payment booked into the wrong year — without
  -- ever stranding an invoice. `issue_invoice` accepts a forward date, and an
  -- invoice dated next March must still be payable when the money arrives, so
  -- the comparison only applies once the invoice date has actually passed.
  if invoice.issue_date is not null
     and invoice.issue_date <= current_date
     and p_paid_on < invoice.issue_date then
    raise exception 'A payment cannot predate the invoice';
  end if;

  select coalesce(sum(amount_cents), 0) into already
  from public.invoice_payments where invoice_id = invoice.id;

  -- Defaulting to the outstanding amount is what makes the common case — one
  -- transfer for the whole invoice — a single confirmation.
  amount := coalesce(p_amount_cents, invoice.gross_total_cents - already);
  if amount <= 0 then raise exception 'A payment must be greater than zero'; end if;
  if already + amount > invoice.gross_total_cents then
    raise exception 'That is more than the % remaining on this invoice',
      (invoice.gross_total_cents - already);
  end if;

  insert into public.invoice_payments (
    company_id, invoice_id, amount_cents, currency, paid_on, method,
    reference, note, source, idempotency_key, recorded_by
  )
  values (
    invoice.company_id, invoice.id, amount, invoice.currency, p_paid_on, p_method,
    nullif(trim(p_reference), ''), nullif(trim(p_note), ''), 'MANUAL', p_idempotency_key, actor.id
  )
  returning id into payment_id;

  -- Settled only when the money is all there. A partial payment leaves the
  -- invoice open, which is what the office needs to see.
  if already + amount >= invoice.gross_total_cents then
    update public.invoices
    set status = 'PAID', paid_at = (p_paid_on::timestamptz + time '12:00')
    where id = invoice.id;
  end if;

  return payment_id;
end;
$$;

revoke all on function public.record_invoice_payment(uuid, date, public.payment_method, text, bigint, text, text)
  from public, anon;
grant execute on function public.record_invoice_payment(uuid, date, public.payment_method, text, bigint, text, text)
  to authenticated;

/*
 * The old entry point, kept working and now routed through the new one so a
 * payment recorded the old way still leaves a trail.
 */
create or replace function public.mark_invoice_paid(p_invoice_id uuid, p_paid_at timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.record_invoice_payment(
    p_invoice_id,
    coalesce(p_paid_at, now())::date,
    'BANK_TRANSFER'::public.payment_method,
    null, null, null, null
  );
end;
$$;

revoke all on function public.mark_invoice_paid(uuid, timestamptz) from public, anon;
grant execute on function public.mark_invoice_paid(uuid, timestamptz) to authenticated;

/** What has been paid on an invoice, for the office's audit trail. */
create or replace function public.list_invoice_payments(p_invoice_id uuid)
returns table (
  id uuid, amount_cents bigint, currency text, paid_on date,
  method public.payment_method, reference text, note text,
  source public.payment_source, recorded_by_name text, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    payment.id, payment.amount_cents, payment.currency, payment.paid_on,
    payment.method, payment.reference, payment.note, payment.source,
    coalesce(nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''), 'Büro'),
    payment.created_at
  from public.invoice_payments payment
  join public.invoices invoice on invoice.id = payment.invoice_id
  left join public.company_members member on member.id = payment.recorded_by
  left join public.profiles profile on profile.id = member.profile_id
  where payment.invoice_id = p_invoice_id
    and public.is_company_staff(invoice.company_id)
  order by payment.paid_on, payment.created_at;
$$;

revoke all on function public.list_invoice_payments(uuid) from public, anon;
grant execute on function public.list_invoice_payments(uuid) to authenticated;
