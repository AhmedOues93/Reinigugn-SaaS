-- Phase 16b — what the provider tells us afterwards.
--
-- "Accepted by Resend" is the strongest thing the send path can claim. Whether
-- the mailbox took it is decided minutes later, and only the provider knows: a
-- bounce, a complaint, or a silent delivery. Without somewhere to put that, an
-- invoice reads as "sent" forever even when it hard-bounced, and the office
-- chases a payment for a document nobody received.
--
-- This is the landing area for those events. It is deliberately small — a log
-- keyed by the provider's own event id — because the webhook handler must be
-- able to do exactly one thing safely: insert, or notice it already has.
--
-- No RLS policy grants write access. Events arrive through a verified webhook
-- and are written by a security-definer function, never by a signed-in user.

create table if not exists public.mail_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('resend', 'smtp')),
  -- The provider's identifier for the event itself. Unique, so a webhook
  -- retried by the provider — which they all do — cannot be recorded twice.
  provider_event_id text not null check (char_length(provider_event_id) <= 200),
  -- The provider's identifier for the message, matching
  -- invoice_deliveries.provider_message_id where the message came from here.
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 400),
  event_type text not null check (char_length(event_type) <= 80),
  recipient text check (recipient is null or char_length(recipient) <= 320),
  occurred_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists mail_events_message_idx
  on public.mail_events (provider_message_id, occurred_at desc);

alter table public.mail_events enable row level security;

-- Staff may read the events belonging to their own company's deliveries, so
-- "this invoice bounced" is visible where the invoice is. No insert, update or
-- delete policy exists for anyone: writes go through the function below.
drop policy if exists "staff read own company mail events" on public.mail_events;
create policy "staff read own company mail events" on public.mail_events
for select using (
  exists (
    select 1
    from public.invoice_deliveries delivery
    where delivery.provider_message_id = mail_events.provider_message_id
      and public.is_company_staff(delivery.company_id)
  )
);

/*
 * Records one provider event.
 *
 * Idempotent by the provider's event id: a replayed webhook returns the row
 * already stored and touches nothing else. The caller is the webhook route,
 * which has already verified the signature — this function does not and cannot
 * check authenticity, so it must never be reachable by a signed-in user.
 */
create or replace function public.record_mail_event(
  p_provider text,
  p_provider_event_id text,
  p_provider_message_id text,
  p_event_type text,
  p_recipient text,
  p_occurred_at timestamptz,
  p_payload jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare event_id uuid;
begin
  if p_provider not in ('resend', 'smtp') then raise exception 'Unknown mail provider'; end if;
  if coalesce(trim(p_provider_event_id), '') = '' then raise exception 'An event id is required'; end if;

  insert into public.mail_events (
    provider, provider_event_id, provider_message_id, event_type, recipient, occurred_at, payload
  )
  values (
    p_provider, p_provider_event_id, nullif(trim(p_provider_message_id), ''),
    left(p_event_type, 80), nullif(trim(p_recipient), ''), coalesce(p_occurred_at, now()),
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (provider, provider_event_id) do nothing
  returning id into event_id;

  if event_id is null then
    select id into event_id from public.mail_events
    where provider = p_provider and provider_event_id = p_provider_event_id;
  end if;
  return event_id;
end;
$$;

-- Not callable by a browser session under any role: the only legitimate caller
-- is the webhook route, which holds no user session.
revoke all on function public.record_mail_event(text, text, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;
