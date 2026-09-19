-- Phase 14: work breaks in the field app, and invoice delivery / reminders.
--
-- 1. Breaks. A time entry can now be paused and resumed. Breaks are their own
--    rows (never edited by a client), and the entry's `duration_minutes` becomes
--    the NET working time: gross minus breaks. Everything that already sums
--    `duration_minutes` (service records, billable jobs, portal) therefore bills
--    and reports net time without further change.
--
-- 2. Delivery. Issuing an invoice fixes it; delivering it is a separate, logged
--    fact. Every attempt — e-mail sent, e-mail failed, e-mail not configured,
--    delivered manually — is recorded with who and when. `sent_at` is set only by
--    a successful or manual delivery, never by a failed or impossible one, so the
--    UI cannot claim a delivery that did not happen. Payment reminders use the
--    same log. None of this touches the immutable fields of an issued invoice.

-- ---------------------------------------------------------------------------
-- 1. Breaks
-- ---------------------------------------------------------------------------

alter table public.job_time_entries
  add column if not exists break_minutes integer not null default 0;
alter table public.job_time_entries drop constraint if exists job_time_entries_break_check;
alter table public.job_time_entries add constraint job_time_entries_break_check check (break_minutes >= 0);

create table public.job_time_breaks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  time_entry_id uuid not null references public.job_time_entries(id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint job_time_breaks_order check (ended_at is null or ended_at >= started_at)
);
create unique index job_time_breaks_one_open_idx on public.job_time_breaks(time_entry_id) where ended_at is null;
create index job_time_breaks_entry_idx on public.job_time_breaks(time_entry_id, started_at);

/*
 * Net duration. Breaks are clamped to the entry's own start/end, so a staff
 * correction of the entry can never produce negative or out-of-range time.
 */
create or replace function public.ensure_time_entry_integrity() returns trigger language plpgsql security definer set search_path = public as $$
declare break_seconds numeric;
begin
  if not exists (select 1 from public.jobs job where job.id = new.job_id and job.company_id = new.company_id) then raise exception 'Time entry job must belong to the same company'; end if;
  if not public.is_active_employee_member(new.member_id, new.company_id) then raise exception 'Time entry member must be an active employee of the same company'; end if;

  select coalesce(sum(greatest(0, extract(epoch from (
           least(coalesce(b.ended_at, new.finished_at, now()), coalesce(new.finished_at, 'infinity'::timestamptz))
           - greatest(b.started_at, new.started_at)
         )))), 0)
    into break_seconds
  from public.job_time_breaks b
  where b.time_entry_id = new.id and (b.ended_at is not null or new.finished_at is not null);

  new.break_minutes := floor(break_seconds / 60)::integer;
  if new.finished_at is null then
    new.duration_minutes := null;
  else
    new.duration_minutes := greatest(0, floor((extract(epoch from (new.finished_at - new.started_at)) - break_seconds) / 60)::integer);
  end if;
  return new;
end;
$$;

create or replace function public.current_employee_member() returns public.company_members
language sql stable security definer set search_path = public as $$
  select member.* from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid() and member.status = 'ACTIVE' and member.role = 'EMPLOYEE'
  limit 1;
$$;

create or replace function public.pause_my_job(p_job_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare actor public.company_members; entry public.job_time_entries; break_id uuid;
begin
  select * into actor from public.current_employee_member();
  if actor.id is null then raise exception 'Employee role required'; end if;
  select * into entry from public.job_time_entries
  where job_id = p_job_id and member_id = actor.id and finished_at is null for update;
  if entry.id is null then raise exception 'No active time entry found'; end if;
  if exists (select 1 from public.job_time_breaks where time_entry_id = entry.id and ended_at is null) then
    raise exception 'A break is already running';
  end if;
  insert into public.job_time_breaks (company_id, time_entry_id) values (entry.company_id, entry.id) returning id into break_id;
  return break_id;
end;
$$;

create or replace function public.resume_my_job(p_job_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare actor public.company_members; entry public.job_time_entries; break_id uuid;
begin
  select * into actor from public.current_employee_member();
  if actor.id is null then raise exception 'Employee role required'; end if;
  select * into entry from public.job_time_entries
  where job_id = p_job_id and member_id = actor.id and finished_at is null for update;
  if entry.id is null then raise exception 'No active time entry found'; end if;
  update public.job_time_breaks set ended_at = now()
  where time_entry_id = entry.id and ended_at is null
  returning id into break_id;
  if break_id is null then raise exception 'No break is running'; end if;
  -- Touch the entry so the trigger refreshes break_minutes.
  update public.job_time_entries set break_minutes = break_minutes where id = entry.id;
  return break_id;
end;
$$;

/* Stopping during a break ends the break at the same instant. */
create or replace function public.stop_my_job(p_job_id uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; entry public.job_time_entries;
begin
  select member.* into actor from public.company_members member join public.profiles profile on profile.id = member.profile_id where profile.auth_user_id = auth.uid() and member.status = 'ACTIVE' and member.role = 'EMPLOYEE' limit 1;
  if actor.id is null then raise exception 'Employee role required'; end if;
  select * into entry from public.job_time_entries where job_id = p_job_id and member_id = actor.id and finished_at is null for update;
  if entry.id is null then raise exception 'No active time entry found'; end if;
  update public.job_time_breaks set ended_at = now() where time_entry_id = entry.id and ended_at is null;
  update public.job_time_entries set finished_at = now(), end_source = 'APP' where id = entry.id;
  if not exists (select 1 from public.job_assignments assignment where assignment.job_id = p_job_id and not exists (select 1 from public.job_time_entries time_entry where time_entry.job_id = p_job_id and time_entry.member_id = assignment.member_id and time_entry.finished_at is not null)) then update public.jobs set status = 'COMPLETED' where id = p_job_id; end if;
  return entry.id;
end;
$$;

alter table public.job_time_breaks enable row level security;
create policy "staff read company time breaks" on public.job_time_breaks
  for select to authenticated using (public.is_company_staff(company_id));
create policy "employees read own time breaks" on public.job_time_breaks
  for select to authenticated using (exists (
    select 1 from public.job_time_entries entry
    join public.company_members member on member.id = entry.member_id
    join public.profiles profile on profile.id = member.profile_id
    where entry.id = job_time_breaks.time_entry_id and profile.auth_user_id = auth.uid()
  ));
revoke all on public.job_time_breaks from anon, authenticated;
grant select on public.job_time_breaks to authenticated;

revoke all on function public.current_employee_member(), public.pause_my_job(uuid), public.resume_my_job(uuid) from public, anon;
grant execute on function public.pause_my_job(uuid), public.resume_my_job(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Invoice delivery and payment reminders
-- ---------------------------------------------------------------------------

create type public.invoice_delivery_kind as enum ('INVOICE', 'REMINDER');
create type public.invoice_delivery_status as enum ('SENT', 'FAILED', 'NOT_CONFIGURED', 'MANUAL');

alter table public.invoices
  add column if not exists sent_at timestamptz,
  add column if not exists last_reminder_at timestamptz,
  add column if not exists reminder_count smallint not null default 0;

create table public.invoice_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  kind public.invoice_delivery_kind not null,
  channel text not null check (channel in ('EMAIL', 'MANUAL')),
  recipient text check (recipient is null or char_length(recipient) <= 320),
  status public.invoice_delivery_status not null,
  detail text check (detail is null or char_length(detail) <= 1000),
  created_by uuid not null references public.company_members(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index invoice_deliveries_invoice_idx on public.invoice_deliveries(invoice_id, created_at desc);

alter table public.invoice_deliveries enable row level security;
create policy "staff read company invoice deliveries" on public.invoice_deliveries
  for select to authenticated using (public.is_company_staff(company_id));
revoke all on public.invoice_deliveries from anon, authenticated;
grant select on public.invoice_deliveries to authenticated;

/*
 * The only writer of the delivery log. The server calls it after it attempted
 * (or deliberately skipped) an e-mail, reporting the real outcome.
 */
create or replace function public.record_invoice_delivery(
  p_invoice_id uuid,
  p_kind public.invoice_delivery_kind,
  p_channel text,
  p_recipient text,
  p_status public.invoice_delivery_status,
  p_detail text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; invoice public.invoices; delivery_id uuid;
begin
  select * into actor from public.billing_actor();
  if actor.id is null then raise exception 'Billing requires OWNER or OFFICE'; end if;
  select * into invoice from public.invoices where id = p_invoice_id and company_id = actor.company_id for update;
  if invoice.id is null then raise exception 'Invoice not found'; end if;
  if p_channel not in ('EMAIL', 'MANUAL') then raise exception 'Invalid channel'; end if;
  if p_channel = 'MANUAL' and p_status <> 'MANUAL' then raise exception 'A manual delivery has status MANUAL'; end if;
  if p_channel = 'EMAIL' and p_status = 'MANUAL' then raise exception 'An e-mail delivery cannot be MANUAL'; end if;

  if p_kind = 'INVOICE' and invoice.status not in ('ISSUED', 'PAID') then
    raise exception 'Only an issued invoice can be delivered';
  end if;
  if p_kind = 'REMINDER' and not (invoice.status = 'ISSUED' and invoice.due_date < current_date) then
    raise exception 'A reminder needs an open, overdue invoice';
  end if;

  insert into public.invoice_deliveries (company_id, invoice_id, kind, channel, recipient, status, detail, created_by)
  values (invoice.company_id, invoice.id, p_kind, p_channel, nullif(trim(p_recipient), ''), p_status, left(p_detail, 1000), actor.id)
  returning id into delivery_id;

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

revoke all on function public.record_invoice_delivery(uuid, public.invoice_delivery_kind, text, text, public.invoice_delivery_status, text) from public, anon;
grant execute on function public.record_invoice_delivery(uuid, public.invoice_delivery_kind, text, text, public.invoice_delivery_status, text) to authenticated;

-- The portal list also reports when an invoice was delivered.
drop function if exists public.list_my_portal_invoices();
create or replace function public.list_my_portal_invoices()
returns table (id uuid, invoice_number text, status public.invoice_status, issue_date date, due_date date, service_period_start date, service_period_end date, currency text, gross_total_cents bigint, is_overdue boolean, paid_at timestamptz)
language sql stable security definer set search_path = public as $$
  select
    invoice.id,
    invoice.invoice_number,
    invoice.status,
    invoice.issue_date,
    invoice.due_date,
    invoice.service_period_start,
    invoice.service_period_end,
    invoice.currency,
    invoice.gross_total_cents,
    invoice.status = 'ISSUED' and invoice.due_date < current_date,
    invoice.paid_at
  from public.current_customer_contact() contact
  join public.invoices invoice
    on invoice.customer_id = contact.customer_id and invoice.company_id = contact.company_id
  where invoice.status <> 'DRAFT'
  order by invoice.issue_date desc, invoice.invoice_number desc;
$$;
revoke all on function public.list_my_portal_invoices() from public, anon;
grant execute on function public.list_my_portal_invoices() to authenticated;
