-- Phase 20c — numbers that never collide, and an invitation that says what
-- actually happened.
--
-- ===========================================================================
-- 1. Customer, object and personnel numbers
-- ===========================================================================
--
-- All three were allocated as `count(*) + 1`, under an advisory lock. The lock
-- made it concurrency-safe and nothing made it correct, because a count is not
-- a sequence.
--
-- Each column already has a per-company unique index, so the failure is not the
-- quiet one you would expect. With K-0001, K-0002 and K-0003 on file, deleting
-- K-0002 leaves two rows; the next customer is offered K-0003, which is taken:
--
--     ERROR: duplicate key value violates unique constraint
--            "customers_company_number_unique_idx"
--
-- Deleting one customer therefore stops the company creating any further
-- customers, permanently, and the same holds for objects and employees. That is
-- reproduced in supabase/test/numbering.test.sql.
--
-- A counter fixes both problems at once: it only ever moves forward, so a
-- number that has been issued is never offered again — which also means a
-- personnel number that appears in an old roster, or a customer number printed
-- on a five-year-old invoice, cannot turn up on somebody else.

create table if not exists public.company_number_counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  -- 'CUSTOMER' | 'OBJECT' | 'EMPLOYEE'
  sequence_key text not null check (char_length(sequence_key) between 2 and 32),
  last_number integer not null default 0 check (last_number >= 0),
  primary key (company_id, sequence_key)
);

alter table public.company_number_counters enable row level security;
-- No policy: the counter is internal bookkeeping, reached only by the
-- security-definer allocator below. Staff have no reason to read it.
revoke all on public.company_number_counters from public, anon, authenticated;

/*
 * Hands out the next number for one company and one sequence.
 *
 * `on conflict do update ... returning` is a single atomic statement: two
 * concurrent inserts cannot receive the same value, and no advisory lock is
 * needed. The counter never decreases, so a deleted record's number is retired
 * with it.
 */
create or replace function public.next_company_number(p_company_id uuid, p_sequence_key text)
returns integer language plpgsql security definer set search_path = public as $$
declare allocated integer;
begin
  insert into public.company_number_counters (company_id, sequence_key, last_number)
  values (p_company_id, p_sequence_key, 1)
  on conflict (company_id, sequence_key)
  do update set last_number = public.company_number_counters.last_number + 1
  returning last_number into allocated;
  return allocated;
end;
$$;

revoke all on function public.next_company_number(uuid, text) from public, anon;

/*
 * Bring the counters up to whatever the company has already issued, so an
 * existing database does not start handing out numbers that are in use.
 * Reads the numeric tail of the existing values rather than counting rows.
 */
insert into public.company_number_counters (company_id, sequence_key, last_number)
select company_id, 'CUSTOMER',
       coalesce(max(nullif(regexp_replace(customer_number, '\D', '', 'g'), '')::integer), 0)
from public.customers where customer_number is not null group by company_id
on conflict (company_id, sequence_key) do update
set last_number = greatest(public.company_number_counters.last_number, excluded.last_number);

insert into public.company_number_counters (company_id, sequence_key, last_number)
select company_id, 'OBJECT',
       coalesce(max(nullif(regexp_replace(object_number, '\D', '', 'g'), '')::integer), 0)
from public.cleaning_objects where object_number is not null group by company_id
on conflict (company_id, sequence_key) do update
set last_number = greatest(public.company_number_counters.last_number, excluded.last_number);

insert into public.company_number_counters (company_id, sequence_key, last_number)
select company_id, 'EMPLOYEE',
       coalesce(max(nullif(regexp_replace(employee_number, '\D', '', 'g'), '')::integer), 0)
from public.employee_details where employee_number is not null group by company_id
on conflict (company_id, sequence_key) do update
set last_number = greatest(public.company_number_counters.last_number, excluded.last_number);

/*
 * The three triggers, now allocating instead of counting. A number supplied by
 * hand is still respected — the office is allowed to keep its own scheme — and
 * the unique index still stops two records sharing one.
 */
create or replace function public.assign_customer_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.customer_number is null or trim(new.customer_number) = '' then
    new.customer_number := 'K-' || lpad(public.next_company_number(new.company_id, 'CUSTOMER')::text, 4, '0');
  end if;
  return new;
end;
$$;

create or replace function public.assign_object_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.object_number is null or trim(new.object_number) = '' then
    new.object_number := 'O-' || lpad(public.next_company_number(new.company_id, 'OBJECT')::text, 4, '0');
  end if;
  return new;
end;
$$;

create or replace function public.assign_employee_number() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.employee_number is null or trim(new.employee_number) = '' then
    new.employee_number := 'M-' || lpad(public.next_company_number(new.company_id, 'EMPLOYEE')::text, 4, '0');
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- 2. Invitation states
-- ===========================================================================
--
-- `get_invitation_preview` returns nothing unless the invitation is live, so
-- the page could only ever say one thing:
--
--     "Der Einladungslink ist ungültig, abgelaufen oder wurde bereits verwendet."
--
-- Three quite different situations, one message. The most common of them — an
-- employee who already completed their account and opens the old mail again —
-- is the one where that wording is worst: it reads like a failure, when in fact
-- everything worked and they simply need to sign in.
--
-- This adds a status alongside the preview. It deliberately returns the status
-- and nothing else for a token that is not live: whoever holds the link has
-- already seen the address, but there is no reason to hand out the name, the
-- role or the company again once it is spent.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'invitation_state') then
    create type public.invitation_state as enum (
      'GUELTIG',        -- open and within its expiry
      'ANGENOMMEN',     -- already completed; the person can simply sign in
      'ABGELAUFEN',     -- expired without being used
      'ZURUECKGEZOGEN', -- revoked, usually because a newer one was sent
      'UNBEKANNT'       -- no such token
    );
  end if;
end $$;

create or replace function public.get_invitation_state(p_token text)
returns public.invitation_state
language plpgsql stable security definer set search_path = public as $$
declare invitation public.company_invitations;
begin
  select * into invitation from public.company_invitations
  where token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'::text), 'hex');

  if invitation.id is null then return 'UNBEKANNT'; end if;
  -- Accepted is checked first: a used invitation that has since passed its
  -- expiry date is still, to the person holding it, an accepted one.
  if invitation.accepted_at is not null then return 'ANGENOMMEN'; end if;
  if invitation.revoked_at is not null then return 'ZURUECKGEZOGEN'; end if;
  if invitation.expires_at <= now() then return 'ABGELAUFEN'; end if;
  return 'GUELTIG';
end;
$$;

revoke all on function public.get_invitation_state(text) from public;
grant execute on function public.get_invitation_state(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. What the office sees
--
-- The employee list could not distinguish "invited, waiting" from "invited
-- three weeks ago and the link is dead". Both showed as INVITED, and the
-- office had no way to know a resend was needed until the employee said so.
--
-- Account status and employment data are different things and are reported as
-- such: this answers "can this person log in", not "are they employed".
-- ---------------------------------------------------------------------------

create or replace function public.list_member_account_states()
returns table (
  member_id uuid,
  status public.membership_status,
  invitation_state public.invitation_state,
  invitation_expires_at timestamptz,
  invitation_sent_at timestamptz,
  -- The office action that makes sense, so a screen does not re-derive it and
  -- get it subtly wrong: NONE | RESEND
  suggested_action text
)
language sql stable security definer set search_path = public as $$
  select
    member.id,
    member.status,
    case
      when member.status = 'ACTIVE' then 'ANGENOMMEN'::public.invitation_state
      when latest.id is null then 'UNBEKANNT'::public.invitation_state
      when latest.accepted_at is not null then 'ANGENOMMEN'::public.invitation_state
      when latest.revoked_at is not null then 'ZURUECKGEZOGEN'::public.invitation_state
      when latest.expires_at <= now() then 'ABGELAUFEN'::public.invitation_state
      else 'GUELTIG'::public.invitation_state
    end,
    latest.expires_at,
    latest.created_at,
    -- Only a membership still waiting on somebody can be resent. An ACTIVE
    -- employee has an account; offering to invite them again is nonsense and
    -- the RPC refuses it anyway.
    case when member.status = 'INVITED' then 'RESEND' else 'NONE' end
  from public.company_members member
  left join lateral (
    select * from public.company_invitations invitation
    where invitation.member_id = member.id
    -- A live invitation wins over a withdrawn one, then the newest, then the
    -- id. Ordering by created_at alone is not deterministic: a resend revokes
    -- the old row and inserts the new one, and two rows written in the same
    -- transaction carry the same `now()`.
    order by (invitation.revoked_at is null) desc, invitation.created_at desc, invitation.id desc
    limit 1
  ) latest on true
  where public.is_company_staff(member.company_id);
$$;

revoke all on function public.list_member_account_states() from public, anon;
grant execute on function public.list_member_account_states() to authenticated;
