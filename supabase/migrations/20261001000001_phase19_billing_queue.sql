-- Phase 19b — billing reads the acceptance state, and stops inventing quantities.
--
-- Two changes, both about the same thing: the invoice should say what was
-- agreed, and only for work that is actually ready to invoice.
--
-- 1. `list_billable_jobs` now requires a Leistungsnachweis that is either
--    ERFASST (no acceptance was needed) or ABGENOMMEN (the customer accepted).
--    A visit waiting for acceptance, or one the customer has complained about,
--    is not offered for invoicing — which is the whole point of asking for an
--    acceptance in the first place.
--
-- 2. It returns the contract's billing mode and the quantity that follows from
--    it. Before this, the office's "alle übernehmen" multiplied the plan's
--    price by the hours the cleaners recorded, unconditionally: a plan sold at
--    48 € per visit invoiced 120 € when the visit ran two and a half hours.
--    Recorded time is operational and payroll evidence. It may set the invoiced
--    quantity only where the contract is explicitly STUNDENSATZ.
--
-- The duplicate-billing guard, the invoice numbering, the snapshots, the
-- immutability and the correction mechanism are all untouched.

-- ---------------------------------------------------------------------------
-- 1. What is ready to invoice
-- ---------------------------------------------------------------------------

drop function if exists public.list_billable_jobs(uuid, date, date);
create or replace function public.list_billable_jobs(p_customer_id uuid, p_from date, p_to date)
returns table (
  job_id uuid,
  scheduled_date date,
  title text,
  object_id uuid,
  object_name text,
  duration_minutes integer,
  service_schedule_id uuid,
  suggested_unit_price_cents bigint,
  suggested_vat_rate_basis_points integer,
  billing_mode public.billing_mode,
  -- What to put on the invoice line, decided here rather than in the browser.
  suggested_quantity numeric,
  suggested_unit text
)
language sql stable security definer set search_path = public as $$
  select
    job.id,
    job.scheduled_date,
    job.title,
    object.id,
    object.name,
    record.net_minutes,
    job.service_schedule_id,
    schedule.billing_unit_price_cents,
    schedule.billing_vat_rate_basis_points,
    coalesce(schedule.billing_mode, 'PAUSCHALE_PRO_EINSATZ'::public.billing_mode),
    case
      -- The only mode in which time becomes money automatically.
      when schedule.billing_mode = 'STUNDENSATZ' and record.net_minutes > 0
        then round(record.net_minutes::numeric / 60, 3)
      when schedule.billing_mode = 'STUNDENSATZ' then 1
      else 1
    end,
    case when schedule.billing_mode = 'STUNDENSATZ' and record.net_minutes > 0 then 'Std' else 'Einsatz' end
  from public.billing_actor() actor
  join public.jobs job on job.company_id = actor.company_id and job.customer_id = p_customer_id
  join public.cleaning_objects object on object.id = job.cleaning_object_id
  -- The Leistungsnachweis is now the gate. No record, no invoice line.
  join public.service_records record on record.job_id = job.id
  left join public.service_schedules schedule on schedule.id = job.service_schedule_id
  where job.status = 'COMPLETED'
    and job.scheduled_date between p_from and p_to
    and record.status in ('ERFASST', 'ABGENOMMEN')
    -- A flat monthly contract is not billed visit by visit. Its visits are
    -- evidence that the month was served, not invoice lines.
    and coalesce(schedule.billing_mode, 'PAUSCHALE_PRO_EINSATZ') <> 'MONATSPAUSCHALE'
    and not exists (
      select 1 from public.invoice_lines line
      where line.job_id = job.id and line.invoice_status <> 'CANCELLED'
    )
  order by job.scheduled_date, object.name;
$$;

revoke all on function public.list_billable_jobs(uuid, date, date) from public, anon;
grant execute on function public.list_billable_jobs(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The office queue
--
-- One list, four states, so the office stops hunting through jobs:
--
--   BEREIT              ready to invoice
--   ABNAHME_AUSSTEHEND  waiting for the customer
--   PROBLEM_GEMELDET    the customer reported a problem
--   ABGERECHNET         already on a live invoice
--
-- Billed-ness is not a column on the record — it is the invoice line's
-- existence, which is where it has always lived. Deriving it here keeps one
-- source of truth instead of a second status that can drift out of step.
-- ---------------------------------------------------------------------------

create or replace function public.list_service_records(
  p_from date default null,
  p_to date default null,
  p_queue text default null
)
returns table (
  job_id uuid,
  service_record_id uuid,
  service_date date,
  title text,
  customer_id uuid,
  customer_name text,
  object_name text,
  net_minutes integer,
  status public.service_record_status,
  acceptance_policy public.acceptance_policy,
  acceptance_method public.acceptance_method,
  accepted_at timestamptz,
  accepted_by_name text,
  billing_mode public.billing_mode,
  invoice_id uuid,
  invoice_number text,
  queue text,
  -- True when the contract asks the customer to accept in the portal but no
  -- portal contact exists to do it. Surfaced rather than silently stalling.
  portal_contact_missing boolean
)
language sql stable security definer set search_path = public as $$
  with rows as (
    select
      record.job_id,
      record.id as service_record_id,
      record.service_date,
      record.title,
      record.customer_id,
      target_customer.name as customer_name,
      coalesce(record.object_snapshot ->> 'name', object.name) as object_name,
      record.net_minutes,
      record.status,
      record.acceptance_policy,
      record.acceptance_method,
      record.accepted_at,
      record.accepted_by_name,
      coalesce(schedule.billing_mode, 'PAUSCHALE_PRO_EINSATZ'::public.billing_mode) as billing_mode,
      live_line.invoice_id,
      invoice.invoice_number,
      record.acceptance_policy = 'PORTAL_ABNAHME'
        and not exists (
          select 1 from public.customer_contacts contact
          join public.company_members member on member.id = contact.member_id
          where contact.customer_id = record.customer_id
            and contact.company_id = record.company_id
            and member.status = 'ACTIVE'
        ) as portal_contact_missing
    from public.billing_actor() actor
    join public.service_records record on record.company_id = actor.company_id
    join public.customers target_customer on target_customer.id = record.customer_id
    left join public.cleaning_objects object on object.id = record.cleaning_object_id
    left join public.service_schedules schedule on schedule.id = record.service_schedule_id
    left join lateral (
      select line.invoice_id from public.invoice_lines line
      where line.job_id = record.job_id and line.invoice_status <> 'CANCELLED'
      limit 1
    ) live_line on true
    left join public.invoices invoice on invoice.id = live_line.invoice_id
    where (p_from is null or record.service_date >= p_from)
      and (p_to is null or record.service_date <= p_to)
  ),
  classified as (
    select rows.*, case
      when invoice_id is not null then 'ABGERECHNET'
      when status = 'PROBLEM_GEMELDET' then 'PROBLEM_GEMELDET'
      when status = 'ABNAHME_AUSSTEHEND' then 'ABNAHME_AUSSTEHEND'
      when billing_mode = 'MONATSPAUSCHALE' then 'MONATSPAUSCHALE'
      else 'BEREIT'
    end as queue
    from rows
  )
  select
    job_id, service_record_id, service_date, title, customer_id, customer_name,
    object_name, net_minutes, status, acceptance_policy, acceptance_method,
    accepted_at, accepted_by_name, billing_mode, invoice_id, invoice_number,
    queue, portal_contact_missing
  from classified
  where p_queue is null or queue = p_queue
  order by service_date desc, customer_name;
$$;

revoke all on function public.list_service_records(date, date, text) from public, anon;
grant execute on function public.list_service_records(date, date, text) to authenticated;

/* One Leistungsnachweis in full, for the office detail screen. */
create or replace function public.get_service_record(p_job_id uuid)
returns public.service_records language sql stable security definer set search_path = public as $$
  select record.* from public.service_records record
  where record.job_id = p_job_id and public.is_company_staff(record.company_id);
$$;

create or replace function public.list_service_record_events(p_job_id uuid)
returns table (event public.service_record_event, actor_name text, note text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select happening.event, happening.actor_name, happening.note, happening.created_at
  from public.service_record_events happening
  join public.service_records record on record.id = happening.service_record_id
  where record.job_id = p_job_id and public.is_company_staff(record.company_id)
  order by happening.created_at;
$$;

revoke all on function public.get_service_record(uuid), public.list_service_record_events(uuid) from public, anon;
grant execute on function public.get_service_record(uuid), public.list_service_record_events(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The portal's side
--
-- The customer sees both what is waiting for them and what they have already
-- accepted. The employee who did the work is still not named: that is HR data,
-- and the existing portal functions deliberately withhold it.
-- ---------------------------------------------------------------------------

create or replace function public.list_my_portal_acceptances()
returns table (
  job_id uuid,
  service_date date,
  title text,
  object_name text,
  status public.service_record_status,
  acceptance_policy public.acceptance_policy,
  acceptance_method public.acceptance_method,
  accepted_at timestamptz,
  accepted_by_name text,
  needs_my_action boolean
)
language sql stable security definer set search_path = public as $$
  select
    record.job_id,
    record.service_date,
    record.title,
    coalesce(record.object_snapshot ->> 'name', 'Objekt'),
    record.status,
    record.acceptance_policy,
    record.acceptance_method,
    record.accepted_at,
    record.accepted_by_name,
    record.acceptance_policy = 'PORTAL_ABNAHME' and record.status = 'ABNAHME_AUSSTEHEND'
  from public.current_customer_contact() contact
  join public.service_records record
    on record.customer_id = contact.customer_id and record.company_id = contact.company_id
  order by
    (record.acceptance_policy = 'PORTAL_ABNAHME' and record.status = 'ABNAHME_AUSSTEHEND') desc,
    record.service_date desc;
$$;

revoke all on function public.list_my_portal_acceptances() from public, anon;
grant execute on function public.list_my_portal_acceptances() to authenticated;

/*
 * The service record behind one visit, as the customer may see it: what was
 * agreed, what was done, how long it took, and the checklist. The snapshot is
 * returned rather than the live tables, so what the customer accepts is what
 * they were shown.
 */
create or replace function public.get_my_portal_acceptance(p_job_id uuid)
returns table (
  job_id uuid,
  service_date date,
  title text,
  service_description text,
  object_name text,
  net_minutes integer,
  status public.service_record_status,
  acceptance_policy public.acceptance_policy,
  acceptance_method public.acceptance_method,
  accepted_at timestamptz,
  accepted_by_name text,
  checklist jsonb,
  signature_storage_path text
)
language sql stable security definer set search_path = public as $$
  select
    record.job_id,
    record.service_date,
    record.title,
    record.service_description,
    coalesce(record.object_snapshot ->> 'name', 'Objekt'),
    record.net_minutes,
    record.status,
    record.acceptance_policy,
    record.acceptance_method,
    record.accepted_at,
    record.accepted_by_name,
    record.checklist_snapshot,
    record.signature_storage_path
  from public.current_customer_contact() contact
  join public.service_records record
    on record.job_id = p_job_id
   and record.customer_id = contact.customer_id
   and record.company_id = contact.company_id;
$$;

revoke all on function public.get_my_portal_acceptance(uuid) from public, anon;
grant execute on function public.get_my_portal_acceptance(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The field app's side
--
-- After Finish, the employee needs exactly one answer: is somebody supposed to
-- sign this, and has anyone already? Everything else is the contract's business.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_job_acceptance(p_job_id uuid)
returns table (
  service_record_id uuid,
  company_id uuid,
  status public.service_record_status,
  acceptance_policy public.acceptance_policy,
  accepted_at timestamptz,
  accepted_by_name text,
  signature_required boolean
)
language sql stable security definer set search_path = public as $$
  select
    record.id,
    record.company_id,
    record.status,
    record.acceptance_policy,
    record.accepted_at,
    record.accepted_by_name,
    record.acceptance_policy = 'VOR_ORT_UNTERSCHRIFT' and record.status = 'ABNAHME_AUSSTEHEND'
  from public.service_records record
  where record.job_id = p_job_id and public.is_current_job_assignee(record.job_id);
$$;

revoke all on function public.get_my_job_acceptance(uuid) from public, anon;
grant execute on function public.get_my_job_acceptance(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Contracts that ask for something nobody can deliver
--
-- A Leistungsplan set to PORTAL_ABNAHME for a customer with no portal contact
-- creates visits that can never be accepted and therefore never billed. The
-- office is told, on the plan and in the queue, instead of finding out weeks
-- later that nothing was invoiced.
-- ---------------------------------------------------------------------------

create or replace function public.list_acceptance_config_warnings()
returns table (
  service_schedule_id uuid,
  schedule_name text,
  customer_id uuid,
  customer_name text,
  acceptance_policy public.acceptance_policy,
  pending_count integer
)
language sql stable security definer set search_path = public as $$
  select
    schedule.id,
    schedule.name,
    schedule.customer_id,
    target_customer.name,
    schedule.acceptance_policy,
    coalesce((
      select count(*)::integer from public.service_records record
      where record.service_schedule_id = schedule.id and record.status = 'ABNAHME_AUSSTEHEND'
    ), 0)
  from public.billing_actor() actor
  join public.service_schedules schedule on schedule.company_id = actor.company_id
  join public.customers target_customer on target_customer.id = schedule.customer_id
  where schedule.is_active
    and schedule.acceptance_policy = 'PORTAL_ABNAHME'
    and not exists (
      select 1 from public.customer_contacts contact
      join public.company_members member on member.id = contact.member_id
      where contact.customer_id = schedule.customer_id
        and contact.company_id = schedule.company_id
        and member.status = 'ACTIVE'
    )
  order by target_customer.name, schedule.name;
$$;

revoke all on function public.list_acceptance_config_warnings() from public, anon;
grant execute on function public.list_acceptance_config_warnings() to authenticated;
