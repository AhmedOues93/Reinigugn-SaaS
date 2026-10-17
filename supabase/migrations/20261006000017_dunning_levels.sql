-- Auditable 3-step dunning trail. Fees and interest are explicit inputs;
-- ReinPlan never invents legal amounts or rates.
alter table public.invoice_deliveries
  add column if not exists reminder_level smallint,
  add column if not exists reminder_fee_cents bigint,
  add column if not exists reminder_interest_cents bigint;

alter table public.invoice_deliveries
  drop constraint if exists invoice_deliveries_reminder_level_check,
  drop constraint if exists invoice_deliveries_reminder_fee_check,
  drop constraint if exists invoice_deliveries_reminder_interest_check;

alter table public.invoice_deliveries
  add constraint invoice_deliveries_reminder_level_check
    check (reminder_level is null or reminder_level between 1 and 3),
  add constraint invoice_deliveries_reminder_fee_check
    check (reminder_fee_cents is null or reminder_fee_cents >= 0),
  add constraint invoice_deliveries_reminder_interest_check
    check (reminder_interest_cents is null or reminder_interest_cents >= 0);

create or replace function public.record_invoice_delivery_v2(
  p_invoice_id uuid,
  p_kind public.invoice_delivery_kind,
  p_channel text,
  p_recipient text,
  p_status public.invoice_delivery_status,
  p_detail text default null,
  p_provider text default null,
  p_provider_message_id text default null,
  p_idempotency_key text default null,
  p_reminder_level smallint default null,
  p_reminder_fee_cents bigint default 0,
  p_reminder_interest_cents bigint default 0
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  invoice public.invoices;
  delivery_id uuid;
  expected_level smallint;
begin
  select * into actor from public.billing_actor();
  if actor.id is null then raise exception 'Billing requires OWNER or OFFICE'; end if;

  select * into invoice
  from public.invoices
  where id = p_invoice_id and company_id = actor.company_id
  for update;

  if invoice.id is null then raise exception 'Invoice not found'; end if;

  if p_kind = 'REMINDER' then
    expected_level := least(invoice.reminder_count + 1, 3);
    if invoice.reminder_count >= 3 then
      raise exception 'All three dunning levels have already been recorded';
    end if;
    if p_reminder_level is null or p_reminder_level <> expected_level then
      raise exception 'Invalid dunning level';
    end if;
    if coalesce(p_reminder_fee_cents, 0) < 0 or coalesce(p_reminder_interest_cents, 0) < 0 then
      raise exception 'Dunning amounts cannot be negative';
    end if;
  elsif p_reminder_level is not null or coalesce(p_reminder_fee_cents, 0) <> 0 or coalesce(p_reminder_interest_cents, 0) <> 0 then
    raise exception 'Dunning details belong to reminders only';
  end if;

  delivery_id := public.record_invoice_delivery(
    p_invoice_id,
    p_kind,
    p_channel,
    p_recipient,
    p_status,
    p_detail,
    p_provider,
    p_provider_message_id,
    p_idempotency_key
  );

  if p_kind = 'REMINDER' then
    update public.invoice_deliveries
    set reminder_level = p_reminder_level,
        reminder_fee_cents = coalesce(p_reminder_fee_cents, 0),
        reminder_interest_cents = coalesce(p_reminder_interest_cents, 0)
    where id = delivery_id
      and company_id = actor.company_id
      and reminder_level is null;
  end if;

  return delivery_id;
end;
$$;

revoke all on function public.record_invoice_delivery_v2(
  uuid, public.invoice_delivery_kind, text, text, public.invoice_delivery_status,
  text, text, text, text, smallint, bigint, bigint
) from public, anon;
grant execute on function public.record_invoice_delivery_v2(
  uuid, public.invoice_delivery_kind, text, text, public.invoice_delivery_status,
  text, text, text, text, smallint, bigint, bigint
) to authenticated;