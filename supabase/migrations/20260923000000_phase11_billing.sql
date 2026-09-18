-- Phase 11: Rechnungen / Abrechnung.
--
-- Money is stored in integer minor units (cents) throughout. Every amount on an
-- invoice is computed by a trigger from quantity, unit price and VAT rate, so a
-- total can never be supplied by a client and can never drift from its lines.
--
-- OVERDUE is deliberately NOT a stored status: it is derived from the due date of
-- an ISSUED invoice, so it cannot go stale between a batch job and reality.

create type public.invoice_status as enum ('DRAFT', 'ISSUED', 'PAID', 'CANCELLED');

-- A recurring agreement can carry the rate it was sold at, which is where a
-- draft invoice takes its price and description from.
alter table public.service_schedules
  add column if not exists billing_description text,
  add column if not exists billing_unit_price_cents bigint,
  add column if not exists billing_vat_rate_basis_points integer;
alter table public.service_schedules drop constraint if exists service_schedules_billing_check;
alter table public.service_schedules add constraint service_schedules_billing_check check (
  (billing_unit_price_cents is null or billing_unit_price_cents between 0 and 100000000)
  and (billing_vat_rate_basis_points is null or billing_vat_rate_basis_points between 0 and 10000)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,

  -- Assigned only when the invoice is issued, so drafts never consume a number.
  invoice_number text,
  status public.invoice_status not null default 'DRAFT',

  -- Snapshots taken at issue time. An issued invoice must keep showing the data
  -- it was issued with, even after the customer or the company master data moves.
  customer_snapshot jsonb,
  company_snapshot jsonb,

  service_period_start date not null,
  service_period_end date not null,
  issue_date date,
  due_date date,
  payment_terms_days smallint not null default 14,
  currency text not null default 'EUR',

  net_total_cents bigint not null default 0,
  vat_total_cents bigint not null default 0,
  gross_total_cents bigint not null default 0,

  customer_note text,
  internal_note text,

  paid_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid references public.company_members(id) on delete set null,
  cancellation_reason text,
  -- Set on a correction invoice, pointing at the invoice it replaces.
  corrects_invoice_id uuid references public.invoices(id) on delete restrict,

  created_by uuid not null references public.company_members(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint invoices_period_check check (service_period_end >= service_period_start),
  constraint invoices_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint invoices_terms_check check (payment_terms_days between 0 and 365),
  constraint invoices_number_when_issued check ((status = 'DRAFT') = (invoice_number is null)),
  constraint invoices_issued_dates check ((status = 'DRAFT') = (issue_date is null)),
  constraint invoices_cancel_reason check (
    (cancelled_at is null and cancellation_reason is null) or (cancelled_at is not null and cancellation_reason is not null)
  ),
  constraint invoices_notes_length check (
    (customer_note is null or char_length(customer_note) <= 2000)
    and (internal_note is null or char_length(internal_note) <= 2000)
  )
);

create unique index invoices_company_number_idx on public.invoices(company_id, invoice_number) where invoice_number is not null;
create index invoices_company_status_idx on public.invoices(company_id, status, due_date);
create index invoices_customer_idx on public.invoices(customer_id, issue_date desc);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  position smallint not null default 1,

  description text not null check (char_length(trim(description)) between 1 and 500),
  quantity numeric(12, 3) not null check (quantity > 0 and quantity <= 1000000),
  unit text not null default 'Stk' check (char_length(trim(unit)) between 1 and 20),
  unit_price_cents bigint not null check (unit_price_cents >= 0 and unit_price_cents <= 100000000),
  vat_rate_basis_points integer not null default 1900 check (vat_rate_basis_points between 0 and 10000),

  -- Written by a trigger from the three inputs above; never accepted from a client.
  net_amount_cents bigint not null default 0,
  vat_amount_cents bigint not null default 0,
  gross_amount_cents bigint not null default 0,

  -- Provenance: which visit or which agreement this line bills.
  job_id uuid references public.jobs(id) on delete restrict,
  service_schedule_id uuid references public.service_schedules(id) on delete set null,
  cleaning_object_id uuid references public.cleaning_objects(id) on delete set null,

  -- Mirrored from the parent invoice so the duplicate-billing index below can be
  -- enforced by the database rather than only by the function that writes lines.
  invoice_status public.invoice_status not null default 'DRAFT',

  created_at timestamptz not null default now()
);

create index invoice_lines_invoice_idx on public.invoice_lines(invoice_id, position);

/*
 * Duplicate-billing prevention. A completed visit may appear on at most one
 * invoice that has not been cancelled. Cancelling an invoice releases its jobs so
 * a correction can bill them again.
 */
create unique index invoice_lines_job_once_idx
  on public.invoice_lines(company_id, job_id)
  where job_id is not null and invoice_status <> 'CANCELLED';

-- Gapless, per-company, per-year numbering. The counter row is locked for the
-- duration of the issuing transaction, so two concurrent issues cannot collide.
create table public.invoice_number_counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  year smallint not null,
  last_number integer not null default 0,
  primary key (company_id, year)
);

create trigger invoices_set_updated_at before update on public.invoices
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Deterministic amounts
-- ---------------------------------------------------------------------------

create or replace function public.compute_invoice_line_amounts()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Rounded per line, then summed, so the printed line amounts always add up to
  -- the printed totals.
  new.net_amount_cents := round(new.quantity * new.unit_price_cents);
  new.vat_amount_cents := round(new.net_amount_cents::numeric * new.vat_rate_basis_points / 10000);
  new.gross_amount_cents := new.net_amount_cents + new.vat_amount_cents;
  return new;
end;
$$;

create trigger invoice_lines_compute_amounts
  before insert or update on public.invoice_lines
  for each row execute procedure public.compute_invoice_line_amounts();

create or replace function public.refresh_invoice_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update public.invoices invoice set
    net_total_cents = coalesce(totals.net, 0),
    vat_total_cents = coalesce(totals.vat, 0),
    gross_total_cents = coalesce(totals.gross, 0)
  from (
    select
      sum(line.net_amount_cents) as net,
      sum(line.vat_amount_cents) as vat,
      sum(line.gross_amount_cents) as gross
    from public.invoice_lines line where line.invoice_id = target_invoice
  ) totals
  where invoice.id = target_invoice;
  return null;
end;
$$;

create trigger invoice_lines_refresh_totals
  after insert or update or delete on public.invoice_lines
  for each row execute procedure public.refresh_invoice_totals();

-- Company and line integrity: a line can never point at another tenant's data.
create or replace function public.ensure_invoice_line_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare parent public.invoices;
begin
  select * into parent from public.invoices where id = new.invoice_id;
  if parent.id is null then raise exception 'Invoice not found'; end if;
  if parent.company_id <> new.company_id then raise exception 'Invoice line belongs to another company'; end if;
  new.invoice_status := parent.status;
  if new.job_id is not null and not exists (
    select 1 from public.jobs job
    where job.id = new.job_id and job.company_id = parent.company_id and job.customer_id = parent.customer_id
  ) then raise exception 'Job does not belong to this customer'; end if;
  if new.cleaning_object_id is not null and not exists (
    select 1 from public.cleaning_objects object
    where object.id = new.cleaning_object_id and object.company_id = parent.company_id and object.customer_id = parent.customer_id
  ) then raise exception 'Object does not belong to this customer'; end if;
  if new.service_schedule_id is not null and not exists (
    select 1 from public.service_schedules schedule
    where schedule.id = new.service_schedule_id and schedule.company_id = parent.company_id
  ) then raise exception 'Schedule belongs to another company'; end if;
  return new;
end;
$$;

create trigger invoice_lines_integrity
  before insert or update on public.invoice_lines
  for each row execute procedure public.ensure_invoice_line_integrity();

-- Keep the mirrored status on lines in step with the invoice.
create or replace function public.sync_invoice_line_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    update public.invoice_lines set invoice_status = new.status where invoice_id = new.id;
  end if;
  return null;
end;
$$;

create trigger invoices_sync_line_status
  after update on public.invoices
  for each row execute procedure public.sync_invoice_line_status();

-- ---------------------------------------------------------------------------
-- Immutability of issued invoices
-- ---------------------------------------------------------------------------

/*
 * An issued invoice is a legal document. Its number, dates, snapshots, amounts
 * and lines can never change again. Only the narrow transitions the business
 * actually needs are permitted: recording payment, and cancellation. Corrections
 * are new invoices that reference the cancelled one, never a rewrite.
 */
create or replace function public.guard_issued_invoice()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'DRAFT' then raise exception 'An issued invoice cannot be deleted'; end if;
    return old;
  end if;

  if old.status = 'DRAFT' then return new; end if;

  if new.invoice_number is distinct from old.invoice_number
    or new.company_id is distinct from old.company_id
    or new.customer_id is distinct from old.customer_id
    or new.issue_date is distinct from old.issue_date
    or new.due_date is distinct from old.due_date
    or new.service_period_start is distinct from old.service_period_start
    or new.service_period_end is distinct from old.service_period_end
    or new.currency is distinct from old.currency
    or new.net_total_cents is distinct from old.net_total_cents
    or new.vat_total_cents is distinct from old.vat_total_cents
    or new.gross_total_cents is distinct from old.gross_total_cents
    or new.customer_snapshot is distinct from old.customer_snapshot
    or new.company_snapshot is distinct from old.company_snapshot
    or new.customer_note is distinct from old.customer_note
    or new.created_by is distinct from old.created_by
  then
    raise exception 'An issued invoice is immutable; cancel it and issue a correction instead';
  end if;

  if old.status = 'CANCELLED' and new.status <> 'CANCELLED' then
    raise exception 'A cancelled invoice cannot be reopened';
  end if;
  if old.status = 'PAID' and new.status not in ('PAID', 'CANCELLED') then
    raise exception 'A paid invoice can only be cancelled';
  end if;

  return new;
end;
$$;

create trigger invoices_guard_issued
  before update or delete on public.invoices
  for each row execute procedure public.guard_issued_invoice();

create or replace function public.guard_issued_invoice_lines()
returns trigger language plpgsql set search_path = public as $$
declare parent_status public.invoice_status;
begin
  select status into parent_status from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);
  -- The status mirror on existing rows is maintained by a trigger on invoices,
  -- which must stay allowed.
  if tg_op = 'UPDATE' and new.invoice_status is distinct from old.invoice_status
    and new.net_amount_cents = old.net_amount_cents and new.description = old.description then
    return new;
  end if;
  if parent_status is not null and parent_status <> 'DRAFT' then
    raise exception 'Lines of an issued invoice cannot be changed';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger invoice_lines_guard_issued
  before insert or update or delete on public.invoice_lines
  for each row execute procedure public.guard_issued_invoice_lines();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_number_counters enable row level security;

-- OWNER and OFFICE manage billing. EMPLOYEE has no policy at all here, so the
-- employee app cannot read a single invoice row, let alone a price.
create policy "staff read company invoices" on public.invoices
for select to authenticated using (public.is_company_staff(company_id));

create policy "staff read company invoice lines" on public.invoice_lines
for select to authenticated using (public.is_company_staff(company_id));

-- All writes go through the functions below, which validate and snapshot.
revoke all on public.invoices, public.invoice_lines, public.invoice_number_counters from anon, authenticated;
grant select on public.invoices, public.invoice_lines to authenticated;

-- ---------------------------------------------------------------------------
-- Staff operations
-- ---------------------------------------------------------------------------

create or replace function public.billing_actor()
returns public.company_members language sql stable security definer set search_path = public as $$
  select member.* from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid() and member.role in ('OWNER', 'OFFICE') and member.status = 'ACTIVE'
  limit 1;
$$;

create or replace function public.create_draft_invoice(
  p_customer_id uuid,
  p_period_start date,
  p_period_end date,
  p_payment_terms_days smallint default null,
  p_customer_note text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; target_customer public.customers; terms smallint; new_id uuid;
begin
  select * into actor from public.billing_actor();
  if actor.id is null then raise exception 'Billing requires OWNER or OFFICE'; end if;

  -- The tenant comes from the actor, never from the request.
  select * into target_customer from public.customers where id = p_customer_id and company_id = actor.company_id;
  if target_customer.id is null then raise exception 'Customer not found in this company'; end if;
  if p_period_end < p_period_start then raise exception 'Invalid service period'; end if;

  select coalesce(p_payment_terms_days, default_payment_terms_days, 14) into terms
  from public.companies where id = actor.company_id;
  if terms < 0 or terms > 365 then raise exception 'Invalid payment terms'; end if;

  insert into public.invoices (company_id, customer_id, service_period_start, service_period_end, payment_terms_days, customer_note, created_by)
  values (actor.company_id, target_customer.id, p_period_start, p_period_end, terms, nullif(trim(p_customer_note), ''), actor.id)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.add_invoice_line(
  p_invoice_id uuid,
  p_description text,
  p_quantity numeric,
  p_unit text,
  p_unit_price_cents bigint,
  p_vat_rate_basis_points integer,
  p_job_id uuid default null,
  p_service_schedule_id uuid default null,
  p_cleaning_object_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; invoice public.invoices; next_position smallint; new_id uuid;
begin
  select * into actor from public.billing_actor();
  if actor.id is null then raise exception 'Billing requires OWNER or OFFICE'; end if;
  select * into invoice from public.invoices where id = p_invoice_id and company_id = actor.company_id for update;
  if invoice.id is null then raise exception 'Invoice not found'; end if;
  if invoice.status <> 'DRAFT' then raise exception 'Only a draft invoice can be edited'; end if;

  if p_job_id is not null and exists (
    select 1 from public.invoice_lines line
    where line.company_id = actor.company_id and line.job_id = p_job_id and line.invoice_status <> 'CANCELLED'
  ) then raise exception 'This job has already been billed'; end if;

  select coalesce(max(position), 0) + 1 into next_position from public.invoice_lines where invoice_id = invoice.id;

  insert into public.invoice_lines (company_id, invoice_id, position, description, quantity, unit, unit_price_cents, vat_rate_basis_points, job_id, service_schedule_id, cleaning_object_id)
  values (actor.company_id, invoice.id, next_position, trim(p_description), p_quantity, coalesce(nullif(trim(p_unit), ''), 'Stk'), p_unit_price_cents, coalesce(p_vat_rate_basis_points, 1900), p_job_id, p_service_schedule_id, p_cleaning_object_id)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.remove_invoice_line(p_line_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members; parent_status public.invoice_status;
begin
  select * into actor from public.billing_actor();
  if actor.id is null then raise exception 'Billing requires OWNER or OFFICE'; end if;
  select invoice.status into parent_status from public.invoice_lines line
  join public.invoices invoice on invoice.id = line.invoice_id
  where line.id = p_line_id and line.company_id = actor.company_id;
  if parent_status is null then raise exception 'Invoice line not found'; end if;
  if parent_status <> 'DRAFT' then raise exception 'Only a draft invoice can be edited'; end if;
  delete from public.invoice_lines where id = p_line_id and company_id = actor.company_id;
end;
$$;

/*
 * Billable visits: completed jobs of one customer in a period that no live
 * invoice already bills. This is the provenance link from services to billing.
 */
create or replace function public.list_billable_jobs(p_customer_id uuid, p_from date, p_to date)
returns table (job_id uuid, scheduled_date date, title text, object_id uuid, object_name text, duration_minutes integer, service_schedule_id uuid, suggested_unit_price_cents bigint, suggested_vat_rate_basis_points integer)
language sql stable security definer set search_path = public as $$
  select
    job.id,
    job.scheduled_date,
    job.title,
    object.id,
    object.name,
    coalesce((select sum(entry.duration_minutes)::integer from public.job_time_entries entry where entry.job_id = job.id and entry.finished_at is not null), 0),
    job.service_schedule_id,
    schedule.billing_unit_price_cents,
    schedule.billing_vat_rate_basis_points
  from public.billing_actor() actor
  join public.jobs job on job.company_id = actor.company_id and job.customer_id = p_customer_id
  join public.cleaning_objects object on object.id = job.cleaning_object_id
  left join public.service_schedules schedule on schedule.id = job.service_schedule_id
  where job.status = 'COMPLETED'
    and job.scheduled_date between p_from and p_to
    and not exists (
      select 1 from public.invoice_lines line
      where line.job_id = job.id and line.invoice_status <> 'CANCELLED'
    )
  order by job.scheduled_date, object.name;
$$;

/*
 * Issue a draft. This is the point of no return: the invoice takes the next
 * number for its company and year, snapshots both parties, fixes its dates, and
 * becomes immutable.
 */
create or replace function public.issue_invoice(p_invoice_id uuid, p_issue_date date default current_date)
returns text language plpgsql security definer set search_path = public as $$
declare
  actor public.company_members;
  invoice public.invoices;
  company public.companies;
  target_customer public.customers;
  issue_year smallint := extract(year from p_issue_date)::smallint;
  next_number integer;
  formatted_number text;
begin
  select * into actor from public.billing_actor();
  if actor.id is null then raise exception 'Billing requires OWNER or OFFICE'; end if;
  select * into invoice from public.invoices where id = p_invoice_id and company_id = actor.company_id for update;
  if invoice.id is null then raise exception 'Invoice not found'; end if;
  if invoice.status <> 'DRAFT' then raise exception 'Only a draft invoice can be issued'; end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = invoice.id) then
    raise exception 'An invoice needs at least one line';
  end if;

  select * into company from public.companies where id = actor.company_id;
  select * into target_customer from public.customers where id = invoice.customer_id;

  -- Locking the counter row serialises concurrent issues for this company.
  insert into public.invoice_number_counters (company_id, year, last_number)
  values (actor.company_id, issue_year, 0)
  on conflict (company_id, year) do nothing;

  select last_number + 1 into next_number
  from public.invoice_number_counters
  where company_id = actor.company_id and year = issue_year
  for update;

  update public.invoice_number_counters set last_number = next_number
  where company_id = actor.company_id and year = issue_year;

  formatted_number := format('RE-%s-%s', issue_year, lpad(next_number::text, 4, '0'));

  update public.invoices set
    status = 'ISSUED',
    invoice_number = formatted_number,
    issue_date = p_issue_date,
    due_date = p_issue_date + invoice.payment_terms_days,
    customer_snapshot = jsonb_build_object(
      'name', target_customer.name,
      'customer_number', target_customer.customer_number,
      'contact_person', target_customer.contact_person,
      'email', target_customer.email,
      'billing_address', target_customer.billing_address,
      'postal_code', target_customer.postal_code,
      'city', target_customer.city
    ),
    company_snapshot = jsonb_build_object(
      'name', company.name,
      'legal_form', company.legal_form,
      'street', company.street,
      'postal_code', company.postal_code,
      'city', company.city,
      'country', company.country,
      'phone', company.phone,
      'email', company.email,
      'website', company.website,
      'tax_number', company.tax_number,
      'vat_id', company.vat_id,
      'iban', company.iban,
      'bic', company.bic
    )
  where id = invoice.id;

  return formatted_number;
end;
$$;

create or replace function public.mark_invoice_paid(p_invoice_id uuid, p_paid_at timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members; invoice public.invoices;
begin
  select * into actor from public.billing_actor();
  if actor.id is null then raise exception 'Billing requires OWNER or OFFICE'; end if;
  select * into invoice from public.invoices where id = p_invoice_id and company_id = actor.company_id for update;
  if invoice.id is null then raise exception 'Invoice not found'; end if;
  if invoice.status <> 'ISSUED' then raise exception 'Only an open invoice can be marked as paid'; end if;
  update public.invoices set status = 'PAID', paid_at = coalesce(p_paid_at, now()) where id = invoice.id;
end;
$$;

/*
 * Cancellation keeps the row and its lines exactly as issued and records who
 * cancelled it, when and why. Nothing is deleted or rewritten.
 */
create or replace function public.cancel_invoice(p_invoice_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members; invoice public.invoices;
begin
  select * into actor from public.billing_actor();
  if actor.id is null then raise exception 'Billing requires OWNER or OFFICE'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'A cancellation reason is required'; end if;
  select * into invoice from public.invoices where id = p_invoice_id and company_id = actor.company_id for update;
  if invoice.id is null then raise exception 'Invoice not found'; end if;
  if invoice.status = 'DRAFT' then raise exception 'A draft is deleted, not cancelled'; end if;
  if invoice.status = 'CANCELLED' then raise exception 'This invoice is already cancelled'; end if;

  update public.invoices set
    status = 'CANCELLED',
    cancelled_at = now(),
    cancelled_by = actor.id,
    cancellation_reason = trim(p_reason)
  where id = invoice.id;
end;
$$;

create or replace function public.delete_draft_invoice(p_invoice_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members; invoice public.invoices;
begin
  select * into actor from public.billing_actor();
  if actor.id is null then raise exception 'Billing requires OWNER or OFFICE'; end if;
  select * into invoice from public.invoices where id = p_invoice_id and company_id = actor.company_id for update;
  if invoice.id is null then raise exception 'Invoice not found'; end if;
  if invoice.status <> 'DRAFT' then raise exception 'Only a draft invoice can be deleted'; end if;
  delete from public.invoices where id = invoice.id;
end;
$$;

/*
 * A correction is a fresh draft that copies the cancelled invoice's lines and
 * points back at it. The original stays in the books untouched.
 */
create or replace function public.create_correction_invoice(p_invoice_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; invoice public.invoices; new_id uuid;
begin
  select * into actor from public.billing_actor();
  if actor.id is null then raise exception 'Billing requires OWNER or OFFICE'; end if;
  select * into invoice from public.invoices where id = p_invoice_id and company_id = actor.company_id;
  if invoice.id is null then raise exception 'Invoice not found'; end if;
  if invoice.status <> 'CANCELLED' then raise exception 'Cancel the invoice before correcting it'; end if;

  insert into public.invoices (company_id, customer_id, service_period_start, service_period_end, payment_terms_days, customer_note, corrects_invoice_id, created_by)
  values (invoice.company_id, invoice.customer_id, invoice.service_period_start, invoice.service_period_end, invoice.payment_terms_days, invoice.customer_note, invoice.id, actor.id)
  returning id into new_id;

  insert into public.invoice_lines (company_id, invoice_id, position, description, quantity, unit, unit_price_cents, vat_rate_basis_points, job_id, service_schedule_id, cleaning_object_id)
  select invoice.company_id, new_id, line.position, line.description, line.quantity, line.unit, line.unit_price_cents, line.vat_rate_basis_points, line.job_id, line.service_schedule_id, line.cleaning_object_id
  from public.invoice_lines line where line.invoice_id = invoice.id order by line.position;

  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Portal access: a customer sees their own issued invoices, never a draft.
-- ---------------------------------------------------------------------------

create or replace function public.list_my_portal_invoices()
returns table (id uuid, invoice_number text, status public.invoice_status, issue_date date, due_date date, service_period_start date, service_period_end date, currency text, gross_total_cents bigint, is_overdue boolean)
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
    invoice.status = 'ISSUED' and invoice.due_date < current_date
  from public.current_customer_contact() contact
  join public.invoices invoice
    on invoice.customer_id = contact.customer_id and invoice.company_id = contact.company_id
  where invoice.status <> 'DRAFT'
  order by invoice.issue_date desc, invoice.invoice_number desc;
$$;

create or replace function public.get_my_portal_invoice(p_invoice_id uuid)
returns table (id uuid, invoice_number text, status public.invoice_status, issue_date date, due_date date, service_period_start date, service_period_end date, currency text, net_total_cents bigint, vat_total_cents bigint, gross_total_cents bigint, customer_note text, customer_snapshot jsonb, company_snapshot jsonb, cancelled_at timestamptz, lines jsonb)
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
    invoice.net_total_cents,
    invoice.vat_total_cents,
    invoice.gross_total_cents,
    invoice.customer_note,
    invoice.customer_snapshot,
    invoice.company_snapshot,
    invoice.cancelled_at,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', line.position,
        'description', line.description,
        'quantity', line.quantity,
        'unit', line.unit,
        'unit_price_cents', line.unit_price_cents,
        'vat_rate_basis_points', line.vat_rate_basis_points,
        'net_amount_cents', line.net_amount_cents,
        'vat_amount_cents', line.vat_amount_cents,
        'gross_amount_cents', line.gross_amount_cents
      ) order by line.position)
      from public.invoice_lines line where line.invoice_id = invoice.id
    ), '[]'::jsonb)
  from public.current_customer_contact() contact
  join public.invoices invoice
    on invoice.id = p_invoice_id and invoice.customer_id = contact.customer_id and invoice.company_id = contact.company_id
  where invoice.status <> 'DRAFT';
$$;

revoke all on function
  public.billing_actor(),
  public.create_draft_invoice(uuid, date, date, smallint, text),
  public.add_invoice_line(uuid, text, numeric, text, bigint, integer, uuid, uuid, uuid),
  public.remove_invoice_line(uuid),
  public.list_billable_jobs(uuid, date, date),
  public.issue_invoice(uuid, date),
  public.mark_invoice_paid(uuid, timestamptz),
  public.cancel_invoice(uuid, text),
  public.delete_draft_invoice(uuid),
  public.create_correction_invoice(uuid),
  public.list_my_portal_invoices(),
  public.get_my_portal_invoice(uuid),
  public.compute_invoice_line_amounts(),
  public.refresh_invoice_totals(),
  public.ensure_invoice_line_integrity(),
  public.sync_invoice_line_status(),
  public.guard_issued_invoice(),
  public.guard_issued_invoice_lines()
from public, anon;

grant execute on function
  public.create_draft_invoice(uuid, date, date, smallint, text),
  public.add_invoice_line(uuid, text, numeric, text, bigint, integer, uuid, uuid, uuid),
  public.remove_invoice_line(uuid),
  public.list_billable_jobs(uuid, date, date),
  public.issue_invoice(uuid, date),
  public.mark_invoice_paid(uuid, timestamptz),
  public.cancel_invoice(uuid, text),
  public.delete_draft_invoice(uuid),
  public.create_correction_invoice(uuid),
  public.list_my_portal_invoices(),
  public.get_my_portal_invoice(uuid)
to authenticated;
