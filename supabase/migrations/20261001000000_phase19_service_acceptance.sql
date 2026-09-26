-- Phase 19 — Kundenabnahme: the service record becomes a real record.
--
-- Until now "Leistungsnachweis" was a word for a query. Finishing a job closed
-- a time entry, set the job to COMPLETED, and everything a customer or the
-- office later saw was recomputed from the live tables each time it was asked
-- for. That is fine for a dashboard and wrong for evidence: edit the checklist,
-- correct a time entry, rename the object, and last March's "proof of service"
-- silently reads differently than it did when it was shown to the customer.
--
-- So a completed visit now produces one `service_records` row that snapshots
-- what was done, and carries the acceptance state through to billing.
--
-- Three rules shape the design.
--
-- **The contract decides, not the cleaner.** Whether a visit needs a customer
-- acceptance is a commercial arrangement, so it lives on the Vertrag /
-- Leistungsplan. The employee is never asked to choose; they are shown a
-- signature screen or they are not.
--
-- **Acceptance gates billing, it does not cause it.** Nothing here creates or
-- sends an invoice. An accepted service becomes *eligible* for the billing
-- queue the office already uses.
--
-- **Evidence outlives the rows it came from.** The snapshot is what was shown
-- and accepted. Later edits to the job cannot rewrite it, and an accepted
-- record cannot be altered at all without an explicit, logged revocation.

-- ---------------------------------------------------------------------------
-- 1. Vocabulary
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'acceptance_policy') then
    create type public.acceptance_policy as enum (
      -- Regular Unterhaltsreinigung: the visit happened, nobody signs anything.
      'KEINE_ABNAHME_ERFORDERLICH',
      -- Sonderreinigung, Grundreinigung: signed on the employee's device.
      'VOR_ORT_UNTERSCHRIFT',
      -- The customer confirms in the Kundenportal, in their own time.
      'PORTAL_ABNAHME'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'service_record_status') then
    create type public.service_record_status as enum (
      -- Finished, no acceptance required. Billable.
      'ERFASST',
      -- Finished, waiting for the customer. Not billable.
      'ABNAHME_AUSSTEHEND',
      -- Accepted. Billable, and now immutable.
      'ABGENOMMEN',
      -- The customer reported a problem. Not billable until the office resolves it.
      'PROBLEM_GEMELDET'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'acceptance_method') then
    create type public.acceptance_method as enum (
      'KEINE',
      'VOR_ORT_UNTERSCHRIFT',
      'PORTAL_BESTAETIGUNG',
      -- The office released it after clarifying a dispute by phone or mail.
      -- Recorded as its own method precisely so it cannot be mistaken for the
      -- customer having pressed a button.
      'BUERO_FREIGABE'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'service_record_event') then
    create type public.service_record_event as enum (
      'ERSTELLT', 'UNTERSCHRIEBEN', 'BESTAETIGT', 'PROBLEM_GEMELDET',
      'PROBLEM_GEKLAERT', 'FREIGABE_WIDERRUFEN'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'billing_mode') then
    create type public.billing_mode as enum (
      -- One agreed price for the visit, however long it took.
      'PAUSCHALE_PRO_EINSATZ',
      -- The only mode where recorded time may drive the invoice.
      'STUNDENSATZ',
      -- A flat monthly amount; individual visits are not billed on their own.
      'MONATSPAUSCHALE'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Where the policy lives
--
-- The Vertrag / Leistungsplan is the business level that owns it. Two fallbacks
-- exist because not every visit has a plan: a one-off Sonderreinigung is an
-- ad-hoc job, and that is exactly the case most likely to need a signature.
--
--   job.acceptance_policy        -- office, for a one-off job
--   └ service_schedule.acceptance_policy   -- the contract: the normal answer
--     └ cleaning_object.acceptance_policy  -- a site-wide house rule
--       └ KEINE_ABNAHME_ERFORDERLICH       -- the safe default
--
-- All three are writable only by staff: `jobs`, `service_schedules` and
-- `cleaning_objects` all carry staff-only RLS already.
-- ---------------------------------------------------------------------------

alter table public.service_schedules
  add column if not exists acceptance_policy public.acceptance_policy
    not null default 'KEINE_ABNAHME_ERFORDERLICH';

alter table public.cleaning_objects
  add column if not exists acceptance_policy public.acceptance_policy;

alter table public.jobs
  add column if not exists acceptance_policy public.acceptance_policy;

comment on column public.service_schedules.acceptance_policy is
  'Whether a visit under this contract needs a Kundenabnahme. Set by the office on the Leistungsplan; the employee never chooses.';
comment on column public.jobs.acceptance_policy is
  'Overrides the contract for this one visit — for a Sonderreinigung that needs a signature although the plan does not. Null means inherit.';
comment on column public.cleaning_objects.acceptance_policy is
  'Site-wide fallback for jobs with no contract and no override. Null means inherit the default.';

/*
 * The one place the rule is resolved. Everything else calls this, so a future
 * change of precedence happens once.
 */
create or replace function public.resolve_acceptance_policy(p_job_id uuid)
returns public.acceptance_policy language sql stable security definer set search_path = public as $$
  select coalesce(
    job.acceptance_policy,
    schedule.acceptance_policy,
    object.acceptance_policy,
    'KEINE_ABNAHME_ERFORDERLICH'::public.acceptance_policy
  )
  from public.jobs job
  left join public.service_schedules schedule on schedule.id = job.service_schedule_id
  left join public.cleaning_objects object on object.id = job.cleaning_object_id
  where job.id = p_job_id;
$$;

-- ---------------------------------------------------------------------------
-- 3. How the contract is billed
--
-- `addAllBillableJobs` multiplied the plan's price by the hours the cleaners
-- recorded, always. A plan sold at 48 € per visit invoiced 120 € when the visit
-- took two and a half hours. Recorded time is operational and payroll evidence;
-- it may set the invoice quantity only where the contract is explicitly hourly.
--
-- PAUSCHALE_PRO_EINSATZ is the default because it is the safe reading of an
-- existing `billing_unit_price_cents`: a price per visit. Any plan that really
-- is hourly must now say so, which is a deliberate one-time review.
-- ---------------------------------------------------------------------------

alter table public.service_schedules
  add column if not exists billing_mode public.billing_mode
    not null default 'PAUSCHALE_PRO_EINSATZ';

comment on column public.service_schedules.billing_mode is
  'How billing_unit_price_cents is meant. Only STUNDENSATZ lets recorded working time drive the invoiced quantity.';

-- ---------------------------------------------------------------------------
-- 4. The record itself
-- ---------------------------------------------------------------------------

create table if not exists public.service_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  -- One record per visit. This unique constraint is what makes a double Finish
  -- harmless: the second insert has nowhere to go.
  job_id uuid not null unique references public.jobs(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  cleaning_object_id uuid not null references public.cleaning_objects(id) on delete restrict,
  service_schedule_id uuid references public.service_schedules(id) on delete set null,

  status public.service_record_status not null,
  -- The rule as it stood when the work was finished. Changing the contract
  -- later must not retroactively claim a signature was required, or excuse one
  -- that was.
  acceptance_policy public.acceptance_policy not null,

  -- --- what was performed, as it read at the moment of completion ----------
  service_date date not null,
  started_at timestamptz,
  finished_at timestamptz,
  break_minutes integer not null default 0 check (break_minutes >= 0),
  net_minutes integer not null default 0 check (net_minutes >= 0),
  title text not null,
  service_description text,
  employee_note text,
  customer_snapshot jsonb not null,
  object_snapshot jsonb not null,
  -- [{member_id, name, started_at, finished_at, net_minutes}]
  performed_by jsonb not null,
  -- [{position, title, required, completed, completed_at}]
  checklist_snapshot jsonb not null,
  -- [{id, storage_path, category, description}] — paths, so the bucket stays private
  photo_snapshot jsonb not null,

  -- --- the acceptance ------------------------------------------------------
  accepted_at timestamptz,
  accepted_by_name text check (accepted_by_name is null or char_length(trim(accepted_by_name)) between 2 and 160),
  accepted_by_member_id uuid references public.company_members(id) on delete set null,
  acceptance_method public.acceptance_method,
  signature_storage_path text unique,

  -- --- the dispute ---------------------------------------------------------
  disputed_at timestamptz,
  complaint_id uuid references public.complaints(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- An accepted record names who accepted it and how. Without this the status
  -- could say ABGENOMMEN with nothing behind it.
  constraint service_records_acceptance_complete check (
    (status = 'ABGENOMMEN') = (accepted_at is not null)
    and (accepted_at is null or (acceptance_method is not null and accepted_by_name is not null))
  ),
  -- A signature belongs to an on-site acceptance and nothing else.
  constraint service_records_signature_method check (
    signature_storage_path is null or acceptance_method = 'VOR_ORT_UNTERSCHRIFT'
  )
);

create index if not exists service_records_company_status_idx
  on public.service_records (company_id, status, service_date desc);
create index if not exists service_records_customer_idx
  on public.service_records (customer_id, service_date desc);

/*
 * Who did what to this record, and when. The status column says where a record
 * stands; this says how it got there.
 */
create table if not exists public.service_record_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  service_record_id uuid not null references public.service_records(id) on delete cascade,
  event public.service_record_event not null,
  -- Denormalised, because the point of an audit line is to still read correctly
  -- when the membership behind it is gone.
  actor_name text,
  actor_member_id uuid references public.company_members(id) on delete set null,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists service_record_events_record_idx
  on public.service_record_events (service_record_id, created_at);

create trigger service_records_set_updated_at
  before update on public.service_records
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Immutability
--
-- Once the customer has accepted, the evidence is fixed. Not "the UI does not
-- offer it" — the database refuses, so no action, migration typo or future
-- feature can quietly produce a record that says the customer approved
-- something they never saw.
-- ---------------------------------------------------------------------------

create or replace function public.guard_service_record_immutability()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.status <> 'ABGENOMMEN' then return new; end if;

  -- Revocation is the one legitimate way out, and it is logged.
  if new.status = 'ABNAHME_AUSSTEHEND' and new.accepted_at is null then return new; end if;

  if new.status is distinct from old.status
     or new.service_date is distinct from old.service_date
     or new.started_at is distinct from old.started_at
     or new.finished_at is distinct from old.finished_at
     or new.net_minutes is distinct from old.net_minutes
     or new.break_minutes is distinct from old.break_minutes
     or new.title is distinct from old.title
     or new.service_description is distinct from old.service_description
     or new.employee_note is distinct from old.employee_note
     or new.checklist_snapshot is distinct from old.checklist_snapshot
     or new.photo_snapshot is distinct from old.photo_snapshot
     or new.performed_by is distinct from old.performed_by
     or new.customer_snapshot is distinct from old.customer_snapshot
     or new.object_snapshot is distinct from old.object_snapshot
     or new.accepted_at is distinct from old.accepted_at
     or new.accepted_by_name is distinct from old.accepted_by_name
     or new.acceptance_method is distinct from old.acceptance_method
     or new.signature_storage_path is distinct from old.signature_storage_path
  then
    raise exception 'An accepted Leistungsnachweis cannot be changed. Revoke the acceptance first, which is recorded.';
  end if;
  return new;
end;
$$;

drop trigger if exists service_records_immutable on public.service_records;
create trigger service_records_immutable
  before update on public.service_records
  for each row execute procedure public.guard_service_record_immutability();

-- ---------------------------------------------------------------------------
-- 6. Row-level security
--
-- Reads are scoped three ways: staff see their company, the employee who did
-- the work sees their own visit, and the customer's portal contact sees their
-- own customer's records. Nobody writes from a session at all — every write
-- below goes through a security-definer function that checks the role and the
-- state first.
-- ---------------------------------------------------------------------------

alter table public.service_records enable row level security;
alter table public.service_record_events enable row level security;

drop policy if exists "staff read company service records" on public.service_records;
create policy "staff read company service records" on public.service_records
for select to authenticated using (public.is_company_staff(company_id));

drop policy if exists "assignee reads own service record" on public.service_records;
create policy "assignee reads own service record" on public.service_records
for select to authenticated using (public.is_current_job_assignee(job_id));

drop policy if exists "portal customer reads own service records" on public.service_records;
create policy "portal customer reads own service records" on public.service_records
for select to authenticated using (public.is_portal_customer_of(company_id, customer_id));

drop policy if exists "staff read service record events" on public.service_record_events;
create policy "staff read service record events" on public.service_record_events
for select to authenticated using (public.is_company_staff(company_id));

revoke all on public.service_records, public.service_record_events from public, anon;
grant select on public.service_records, public.service_record_events to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Signatures
--
-- A private bucket, like every other bucket in this system. A signature is
-- personal data about a named individual and is reached only through a
-- short-lived signed URL.
--
-- The path shape is checked on the way in, so a caller cannot point a record at
-- a file belonging to another company or another visit:
--
--     <company_id>/service/<job_id>/<uuid>.png
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-signatures', 'service-signatures', false, 1048576, array['image/png'])
on conflict (id) do nothing;

create or replace function public.can_read_signature_path(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.service_records record
    where record.signature_storage_path = p_name
      and (
        public.is_company_staff(record.company_id)
        or public.is_current_job_assignee(record.job_id)
        or public.is_portal_customer_of(record.company_id, record.customer_id)
      )
  );
$$;

/*
 * Upload is allowed to a path this caller could legitimately be signing: their
 * own company, a job they are assigned to or a job of their own customer, and
 * only while that record is still waiting for acceptance.
 */
create or replace function public.can_write_signature_path(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.service_records record
    where record.status = 'ABNAHME_AUSSTEHEND'
      and p_name = record.company_id::text || '/service/' || record.job_id::text || '/'
                   || substring(p_name from '[0-9a-f-]{36}\.png$')
      and substring(p_name from '[0-9a-f-]{36}\.png$') is not null
      and (
        public.is_current_job_assignee(record.job_id)
        or public.is_portal_customer_of(record.company_id, record.customer_id)
      )
  );
$$;

drop policy if exists "signature read" on storage.objects;
create policy "signature read" on storage.objects
for select to authenticated
using (bucket_id = 'service-signatures' and public.can_read_signature_path(name));

drop policy if exists "signature upload" on storage.objects;
create policy "signature upload" on storage.objects
for insert to authenticated
with check (bucket_id = 'service-signatures' and public.can_write_signature_path(name));

-- ---------------------------------------------------------------------------
-- 8. Creating the record when the work is finished
-- ---------------------------------------------------------------------------

/*
 * Snapshots one completed job. Idempotent by the unique job_id: calling it a
 * second time — a double-tapped Finish, a retried action, a repaired job —
 * returns the record that already exists and changes nothing.
 *
 * Invoked from stop_my_job, so the employee never does anything but finish.
 */
create or replace function public.build_service_record(p_job_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  job public.jobs;
  target_customer public.customers;
  object_row public.cleaning_objects;
  policy public.acceptance_policy;
  record_id uuid;
  initial public.service_record_status;
begin
  select id into record_id from public.service_records where job_id = p_job_id;
  if record_id is not null then return record_id; end if;

  select * into job from public.jobs where id = p_job_id for update;
  if job.id is null then raise exception 'Job not found'; end if;
  if job.status <> 'COMPLETED' then
    raise exception 'A Leistungsnachweis is only created for a completed visit';
  end if;

  select * into target_customer from public.customers where id = job.customer_id;
  select * into object_row from public.cleaning_objects where id = job.cleaning_object_id;
  policy := public.resolve_acceptance_policy(job.id);
  initial := case
    when policy = 'KEINE_ABNAHME_ERFORDERLICH' then 'ERFASST'::public.service_record_status
    else 'ABNAHME_AUSSTEHEND'::public.service_record_status
  end;

  insert into public.service_records (
    company_id, job_id, customer_id, cleaning_object_id, service_schedule_id,
    status, acceptance_policy, service_date, started_at, finished_at,
    break_minutes, net_minutes, title, service_description,
    customer_snapshot, object_snapshot, performed_by, checklist_snapshot, photo_snapshot,
    acceptance_method
  )
  select
    job.company_id, job.id, job.customer_id, job.cleaning_object_id, job.service_schedule_id,
    initial, policy, job.scheduled_date,
    (select min(entry.started_at) from public.job_time_entries entry where entry.job_id = job.id),
    (select max(entry.finished_at) from public.job_time_entries entry where entry.job_id = job.id),
    coalesce((select sum(entry.break_minutes)::integer from public.job_time_entries entry
              where entry.job_id = job.id and entry.finished_at is not null), 0),
    -- duration_minutes is already net of breaks (phase 14).
    coalesce((select sum(entry.duration_minutes)::integer from public.job_time_entries entry
              where entry.job_id = job.id and entry.finished_at is not null), 0),
    job.title,
    coalesce(job.description, schedule.billing_description, schedule.description),
    jsonb_build_object(
      'name', target_customer.name,
      'customer_number', target_customer.customer_number
    ),
    jsonb_build_object(
      'name', object_row.name,
      'street', object_row.street,
      'postal_code', object_row.postal_code,
      'city', object_row.city
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', entry.member_id,
               'name', coalesce(nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''), 'Mitarbeiter'),
               'started_at', entry.started_at,
               'finished_at', entry.finished_at,
               'net_minutes', entry.duration_minutes
             ) order by entry.started_at)
      from public.job_time_entries entry
      left join public.company_members member on member.id = entry.member_id
      left join public.profiles profile on profile.id = member.profile_id
      where entry.job_id = job.id and entry.finished_at is not null
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'position', item.position,
               'title', item.title,
               'required', item.is_required,
               'completed', item.completed_at is not null,
               'completed_at', item.completed_at
             ) order by item.position)
      from public.job_checklists list
      join public.job_checklist_items item on item.job_checklist_id = list.id
      where list.job_id = job.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', photo.id,
               'storage_path', photo.storage_path,
               'category', photo.category,
               'description', photo.description
             ) order by photo.created_at)
      from public.job_photos photo where photo.job_id = job.id
    ), '[]'::jsonb),
    case when policy = 'KEINE_ABNAHME_ERFORDERLICH' then 'KEINE'::public.acceptance_method else null end
  from public.jobs j
  left join public.service_schedules schedule on schedule.id = job.service_schedule_id
  where j.id = job.id
  on conflict (job_id) do nothing
  returning id into record_id;

  -- Lost the race with a concurrent Finish; the other one's record is the record.
  if record_id is null then
    select id into record_id from public.service_records where job_id = p_job_id;
    return record_id;
  end if;

  insert into public.service_record_events (company_id, service_record_id, event, note)
  values (job.company_id, record_id, 'ERSTELLT',
          case policy
            when 'KEINE_ABNAHME_ERFORDERLICH' then 'Keine Abnahme erforderlich'
            when 'VOR_ORT_UNTERSCHRIFT' then 'Unterschrift vor Ort erforderlich'
            else 'Abnahme im Kundenportal erforderlich'
          end);

  return record_id;
end;
$$;

/*
 * Finishing now also snapshots the visit. The time-tracking behaviour is
 * unchanged — this only adds the record once the last assignee is done, which
 * is exactly when the job reaches COMPLETED.
 */
create or replace function public.stop_my_job(p_job_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare actor public.company_members; entry public.job_time_entries;
begin
  select * into actor from public.current_employee_member();
  if actor.id is null then raise exception 'Employee role required'; end if;

  select * into entry from public.job_time_entries
  where job_id = p_job_id and member_id = actor.id and finished_at is null for update;
  if entry.id is null then raise exception 'No active time entry found'; end if;

  update public.job_time_breaks set ended_at = now() where time_entry_id = entry.id and ended_at is null;
  update public.job_time_entries set finished_at = now(), end_source = 'APP' where id = entry.id;

  -- Complete the job only when nobody assigned to it is still working.
  if not exists (
    select 1 from public.job_assignments assignment
    where assignment.job_id = p_job_id
      and not exists (
        select 1 from public.job_time_entries time_entry
        where time_entry.job_id = p_job_id and time_entry.member_id = assignment.member_id
          and time_entry.finished_at is not null
      )
  ) then
    update public.jobs set status = 'COMPLETED' where id = p_job_id;
    perform public.build_service_record(p_job_id);
  end if;

  return entry.id;
end;
$$;

/*
 * …and so does every other route to COMPLETED.
 *
 * Hooking only `stop_my_job` would mean a visit completed any other way — an
 * office correction, a repair script, a feature added next year — produces no
 * Leistungsnachweis, and since billing now requires one, that work would
 * silently stop being invoiceable. The trigger makes the record a property of
 * the job reaching COMPLETED rather than of the button that got it there.
 */
create or replace function public.build_service_record_on_completion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'COMPLETED' and (tg_op = 'INSERT' or old.status is distinct from 'COMPLETED') then
    perform public.build_service_record(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists jobs_build_service_record on public.jobs;
create trigger jobs_build_service_record
  after insert or update of status on public.jobs
  for each row execute procedure public.build_service_record_on_completion();

revoke all on function public.build_service_record(uuid) from public, anon;
revoke all on function public.resolve_acceptance_policy(uuid) from public, anon;
grant execute on function public.resolve_acceptance_policy(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Accepting: on site
-- ---------------------------------------------------------------------------

/*
 * An authorised customer contact signs on the employee's device. The employee
 * is the one holding the phone, so the employee's session makes the call — but
 * the name recorded is the signer's, not theirs, and the record says the
 * signature came from on site.
 *
 * This is business evidence and audit documentation. It is not a claim about
 * legal signature equivalence, which depends on facts this system does not know.
 */
create or replace function public.sign_service_record_on_site(
  p_job_id uuid,
  p_signer_name text,
  p_signature_path text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare record_row public.service_records; signer text;
begin
  if not public.is_current_job_assignee(p_job_id) then
    raise exception 'Only an employee assigned to this visit can take an on-site signature';
  end if;

  signer := nullif(trim(coalesce(p_signer_name, '')), '');
  if signer is null or char_length(signer) < 2 or char_length(signer) > 160 then
    raise exception 'The name of the person accepting the work is required';
  end if;

  select * into record_row from public.service_records where job_id = p_job_id for update;
  if record_row.id is null then raise exception 'Leistungsnachweis not found'; end if;
  if record_row.acceptance_policy <> 'VOR_ORT_UNTERSCHRIFT' then
    raise exception 'This visit is not set up for an on-site signature';
  end if;
  if record_row.status = 'ABGENOMMEN' then raise exception 'This Leistungsnachweis has already been accepted'; end if;
  if record_row.status = 'PROBLEM_GEMELDET' then raise exception 'A reported problem has to be resolved first'; end if;

  if p_signature_path is not null and p_signature_path !~
     ('^' || record_row.company_id::text || '/service/' || record_row.job_id::text || '/[0-9a-f-]{36}\.png$') then
    raise exception 'The signature file does not belong to this visit';
  end if;

  update public.service_records set
    status = 'ABGENOMMEN',
    accepted_at = now(),
    accepted_by_name = signer,
    acceptance_method = 'VOR_ORT_UNTERSCHRIFT',
    signature_storage_path = p_signature_path
  where id = record_row.id;

  insert into public.service_record_events (company_id, service_record_id, event, actor_name, note)
  values (record_row.company_id, record_row.id, 'UNTERSCHRIEBEN', signer,
          case when p_signature_path is null then 'Abnahme vor Ort ohne Unterschriftsbild'
               else 'Unterschrift vor Ort erfasst' end);

  return record_row.id;
end;
$$;

revoke all on function public.sign_service_record_on_site(uuid, text, text) from public, anon;
grant execute on function public.sign_service_record_on_site(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Accepting: in the portal
--
-- Every one of these resolves the caller's own contact row first and matches
-- the record against it. A customer passing somebody else's record id gets
-- "not found", because the lookup never leaves their own customer relationship.
-- ---------------------------------------------------------------------------

create or replace function public.confirm_my_portal_service(p_job_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare contact public.customer_contacts; record_row public.service_records; signer text;
begin
  select * into contact from public.current_customer_contact();
  if contact.id is null then raise exception 'Portal access required'; end if;

  select record.* into record_row from public.service_records record
  where record.job_id = p_job_id
    and record.customer_id = contact.customer_id
    and record.company_id = contact.company_id
  for update;
  if record_row.id is null then raise exception 'Leistungsnachweis not found'; end if;

  if record_row.acceptance_policy <> 'PORTAL_ABNAHME' then
    raise exception 'This service is not up for acceptance in the portal';
  end if;
  if record_row.status = 'ABGENOMMEN' then raise exception 'This service has already been accepted'; end if;
  if record_row.status = 'PROBLEM_GEMELDET' then
    raise exception 'You reported a problem with this service; the office is looking into it';
  end if;

  select coalesce(nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''), 'Kundenkontakt')
  into signer
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where member.id = contact.member_id;

  update public.service_records set
    status = 'ABGENOMMEN',
    accepted_at = now(),
    accepted_by_name = signer,
    accepted_by_member_id = contact.member_id,
    acceptance_method = 'PORTAL_BESTAETIGUNG'
  where id = record_row.id;

  insert into public.service_record_events (company_id, service_record_id, event, actor_name, actor_member_id, note)
  values (record_row.company_id, record_row.id, 'BESTAETIGT', signer, contact.member_id,
          'Im Kundenportal bestätigt');

  insert into public.in_app_notifications (company_id, recipient_member_id, type, title, body)
  select record_row.company_id, member.id, 'COMPLAINT_CREATED', 'Leistung im Kundenportal bestätigt', record_row.title
  from public.company_members member
  where member.company_id = record_row.company_id and member.role in ('OWNER', 'OFFICE') and member.status = 'ACTIVE';

  return record_row.id;
end;
$$;

/*
 * Reporting a problem instead of accepting.
 *
 * The customer does not get to rewrite the record — the snapshot is untouched.
 * What they get is a Reklamation, which is the complaint model this application
 * already has, linked to the same job, plus a status that keeps the service out
 * of the billing queue until the office has dealt with it.
 */
create or replace function public.dispute_my_portal_service(
  p_job_id uuid,
  p_title text,
  p_description text
) returns uuid language plpgsql security definer set search_path = public as $$
declare contact public.customer_contacts; record_row public.service_records; complaint uuid; reporter text;
begin
  select * into contact from public.current_customer_contact();
  if contact.id is null then raise exception 'Portal access required'; end if;

  select record.* into record_row from public.service_records record
  where record.job_id = p_job_id
    and record.customer_id = contact.customer_id
    and record.company_id = contact.company_id
  for update;
  if record_row.id is null then raise exception 'Leistungsnachweis not found'; end if;

  if record_row.acceptance_policy <> 'PORTAL_ABNAHME' then
    raise exception 'This service is not up for acceptance in the portal';
  end if;
  if record_row.status = 'ABGENOMMEN' then
    raise exception 'This service has already been accepted; please report a Reklamation instead';
  end if;
  if record_row.status = 'PROBLEM_GEMELDET' then raise exception 'A problem has already been reported'; end if;

  -- Reuses the existing complaint model rather than inventing a second one.
  complaint := public.create_my_portal_complaint(
    record_row.cleaning_object_id, p_title, p_description, record_row.job_id);

  select coalesce(nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''), 'Kundenkontakt')
  into reporter
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where member.id = contact.member_id;

  update public.service_records set
    status = 'PROBLEM_GEMELDET',
    disputed_at = now(),
    complaint_id = complaint
  where id = record_row.id;

  insert into public.service_record_events (company_id, service_record_id, event, actor_name, actor_member_id, note)
  values (record_row.company_id, record_row.id, 'PROBLEM_GEMELDET', reporter, contact.member_id, trim(p_title));

  return complaint;
end;
$$;

revoke all on function public.confirm_my_portal_service(uuid) from public, anon;
revoke all on function public.dispute_my_portal_service(uuid, text, text) from public, anon;
grant execute on function public.confirm_my_portal_service(uuid) to authenticated;
grant execute on function public.dispute_my_portal_service(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. The office side of a dispute, and corrections
-- ---------------------------------------------------------------------------

/*
 * Resolving a reported problem. Two honest outcomes:
 *
 *   ZURUECK_ZUR_ABNAHME — the office fixed something; the ball is back with
 *                         the customer, who still has to accept.
 *   BUERO_FREIGABE      — the office settled it directly (a phone call, a
 *                         credit) and releases the service for billing. This is
 *                         recorded as its own acceptance method so nobody can
 *                         later read it as the customer having confirmed.
 */
create or replace function public.resolve_service_dispute(p_job_id uuid, p_outcome text, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; record_row public.service_records; actor_name text;
begin
  select * into actor from public.billing_actor();
  if actor.id is null then raise exception 'Only OWNER or OFFICE may resolve a reported problem'; end if;
  if p_outcome not in ('ZURUECK_ZUR_ABNAHME', 'BUERO_FREIGABE') then
    raise exception 'Unknown resolution';
  end if;

  select * into record_row from public.service_records
  where job_id = p_job_id and company_id = actor.company_id for update;
  if record_row.id is null then raise exception 'Leistungsnachweis not found'; end if;
  if record_row.status <> 'PROBLEM_GEMELDET' then raise exception 'No problem is open on this Leistungsnachweis'; end if;

  select coalesce(nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''), 'Büro') into actor_name
  from public.profiles profile where profile.id = actor.profile_id;

  if p_outcome = 'BUERO_FREIGABE' then
    update public.service_records set
      status = 'ABGENOMMEN',
      accepted_at = now(),
      accepted_by_name = actor_name,
      accepted_by_member_id = actor.id,
      acceptance_method = 'BUERO_FREIGABE',
      disputed_at = null
    where id = record_row.id;
  else
    update public.service_records set status = 'ABNAHME_AUSSTEHEND', disputed_at = null
    where id = record_row.id;
  end if;

  insert into public.service_record_events (company_id, service_record_id, event, actor_name, actor_member_id, note)
  values (record_row.company_id, record_row.id, 'PROBLEM_GEKLAERT', actor_name, actor.id,
          left(coalesce(nullif(trim(p_note), ''),
               case when p_outcome = 'BUERO_FREIGABE' then 'Vom Büro freigegeben'
                    else 'Zur erneuten Abnahme an den Kunden' end), 1000));

  return record_row.id;
end;
$$;

/*
 * Revoking an acceptance. The only way to touch an accepted record, reserved to
 * the OWNER, requiring a reason, and leaving both the old acceptance and the
 * revocation in the audit trail. A service already on a live invoice is not
 * revocable here: correct the invoice first, which the billing side already
 * knows how to do.
 */
create or replace function public.revoke_service_acceptance(p_job_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; record_row public.service_records; actor_name text;
begin
  select member.* into actor from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid() and member.role = 'OWNER' and member.status = 'ACTIVE'
  limit 1;
  if actor.id is null then raise exception 'Only the OWNER may revoke an acceptance'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'A reason is required'; end if;

  select * into record_row from public.service_records
  where job_id = p_job_id and company_id = actor.company_id for update;
  if record_row.id is null then raise exception 'Leistungsnachweis not found'; end if;
  if record_row.status <> 'ABGENOMMEN' then raise exception 'This Leistungsnachweis is not accepted'; end if;

  if exists (
    select 1 from public.invoice_lines line
    where line.job_id = record_row.job_id and line.invoice_status <> 'CANCELLED'
  ) then
    raise exception 'This service is already invoiced. Cancel or correct the invoice first.';
  end if;

  select coalesce(nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''), 'Inhaber') into actor_name
  from public.profiles profile where profile.id = actor.profile_id;

  insert into public.service_record_events (company_id, service_record_id, event, actor_name, actor_member_id, note)
  values (record_row.company_id, record_row.id, 'FREIGABE_WIDERRUFEN', actor_name, actor.id,
          left(format('Widerruf der Abnahme vom %s durch %s (%s): %s',
                 to_char(record_row.accepted_at, 'DD.MM.YYYY HH24:MI'),
                 record_row.accepted_by_name, record_row.acceptance_method, trim(p_reason)), 1000));

  -- The trigger permits exactly this transition and nothing else.
  update public.service_records set
    status = 'ABNAHME_AUSSTEHEND',
    accepted_at = null,
    accepted_by_name = null,
    accepted_by_member_id = null,
    acceptance_method = null,
    signature_storage_path = null
  where id = record_row.id;

  return record_row.id;
end;
$$;

revoke all on function public.resolve_service_dispute(uuid, text, text) from public, anon;
revoke all on function public.revoke_service_acceptance(uuid, text) from public, anon;
grant execute on function public.resolve_service_dispute(uuid, text, text) to authenticated;
grant execute on function public.revoke_service_acceptance(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Backfill
--
-- Every visit already completed gets a record, so nothing that was billable
-- yesterday stops being billable today. They are marked ERFASST with policy
-- KEINE_ABNAHME_ERFORDERLICH, because that is the truth: no acceptance was
-- required of them, and pretending otherwise would strand real work behind an
-- approval nobody was ever asked for.
--
-- The snapshots come from the live tables, which for historical rows is the
-- best evidence available. From here on a snapshot is taken at the moment of
-- completion, which is the point.
-- ---------------------------------------------------------------------------

do $$
declare completed_job uuid;
begin
  for completed_job in
    select job.id from public.jobs job
    where job.status = 'COMPLETED'
      and not exists (select 1 from public.service_records record where record.job_id = job.id)
    order by job.scheduled_date
  loop
    -- Per-job, so one unbuildable historical job cannot block the migration.
    begin
      perform public.build_service_record(completed_job);
    exception when others then
      raise notice 'Skipped Leistungsnachweis for job % — %', completed_job, sqlerrm;
    end;
  end loop;
end $$;
