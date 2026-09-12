create type public.employment_type as enum ('FULL_TIME', 'PART_TIME', 'MINIJOB', 'OTHER');
create type public.time_entry_source as enum ('APP', 'MANUAL');

alter table public.companies add column if not exists legal_form text, add column if not exists street text, add column if not exists postal_code text, add column if not exists city text, add column if not exists country text not null default 'Deutschland', add column if not exists phone text, add column if not exists email text, add column if not exists website text, add column if not exists tax_number text, add column if not exists vat_id text, add column if not exists billing_email text, add column if not exists iban text, add column if not exists bic text, add column if not exists default_payment_terms_days smallint, add column if not exists timezone text not null default 'Europe/Berlin', add column if not exists default_language text not null default 'de';
alter table public.companies add constraint companies_payment_terms_check check (default_payment_terms_days is null or default_payment_terms_days between 0 and 365), add constraint companies_language_check check (default_language in ('de', 'en', 'fr', 'ar', 'tr', 'ro', 'pl'));

alter table public.customers add column if not exists contact_first_name text, add column if not exists contact_last_name text, add column if not exists billing_country text not null default 'Deutschland', add column if not exists billing_email text, add column if not exists billing_recipient_name text, add column if not exists billing_recipient_address text, add column if not exists payment_terms_days smallint, add column if not exists vat_id text;
alter table public.customers add constraint customers_payment_terms_check check (payment_terms_days is null or payment_terms_days between 0 and 365);
create unique index if not exists customers_company_number_unique_idx on public.customers(company_id, customer_number) where customer_number is not null;

alter table public.cleaning_objects add column if not exists object_number text, add column if not exists country text not null default 'Deutschland', add column if not exists contact_first_name text, add column if not exists contact_last_name text, add column if not exists contact_email text, add column if not exists area_sqm numeric(10,2), add column if not exists areas_description text;
alter table public.cleaning_objects add constraint cleaning_objects_area_check check (area_sqm is null or area_sqm > 0);
create unique index if not exists cleaning_objects_company_number_unique_idx on public.cleaning_objects(company_id, object_number) where object_number is not null;

alter table public.employee_details add column if not exists preferred_language text not null default 'de', add column if not exists employment_end_date date, add column if not exists employment_type public.employment_type;
alter table public.employee_details add constraint employee_details_language_check check (preferred_language in ('de', 'en', 'fr', 'ar', 'tr', 'ro', 'pl')), add constraint employee_details_dates_check check (employment_end_date is null or employment_start_date is null or employment_end_date >= employment_start_date);
create unique index if not exists employee_details_company_number_unique_idx on public.employee_details(company_id, employee_number) where employee_number is not null;

create or replace function public.assign_customer_number() returns trigger language plpgsql security definer set search_path = public as $$
declare next_number integer;
begin
  if new.customer_number is null or trim(new.customer_number) = '' then perform pg_advisory_xact_lock(hashtext(new.company_id::text || 'K-')); select count(*) + 1 into next_number from public.customers where company_id = new.company_id; new.customer_number := 'K-' || lpad(next_number::text, 4, '0'); end if;
  return new;
end;
$$;
create or replace function public.assign_object_number() returns trigger language plpgsql security definer set search_path = public as $$
declare next_number integer;
begin
  if new.object_number is null or trim(new.object_number) = '' then perform pg_advisory_xact_lock(hashtext(new.company_id::text || 'O-')); select count(*) + 1 into next_number from public.cleaning_objects where company_id = new.company_id; new.object_number := 'O-' || lpad(next_number::text, 4, '0'); end if;
  return new;
end;
$$;
create or replace function public.assign_employee_number() returns trigger language plpgsql security definer set search_path = public as $$
declare next_number integer;
begin
  if new.employee_number is null or trim(new.employee_number) = '' then perform pg_advisory_xact_lock(hashtext(new.company_id::text || 'M-')); select count(*) + 1 into next_number from public.employee_details where company_id = new.company_id; new.employee_number := 'M-' || lpad(next_number::text, 4, '0'); end if;
  return new;
end;
$$;
create trigger customers_assign_number before insert on public.customers for each row execute procedure public.assign_customer_number();
create trigger cleaning_objects_assign_number before insert on public.cleaning_objects for each row execute procedure public.assign_object_number();
create trigger employee_details_assign_number before insert on public.employee_details for each row execute procedure public.assign_employee_number();

create table public.job_time_entries (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete restrict, member_id uuid not null references public.company_members(id) on delete restrict,
  started_at timestamptz not null, finished_at timestamptz, duration_minutes integer, start_source public.time_entry_source not null default 'APP', end_source public.time_entry_source,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (finished_at is null or finished_at > started_at), check (duration_minutes is null or duration_minutes >= 0)
);
create unique index job_time_entries_one_active_member_idx on public.job_time_entries(member_id) where finished_at is null;
create index job_time_entries_company_started_idx on public.job_time_entries(company_id, started_at);
create index job_time_entries_job_idx on public.job_time_entries(job_id);
create index job_time_entries_member_idx on public.job_time_entries(member_id, started_at);
create trigger job_time_entries_set_updated_at before update on public.job_time_entries for each row execute procedure public.set_updated_at();

create table public.time_entry_audit_logs (
  id uuid primary key default gen_random_uuid(), time_entry_id uuid not null references public.job_time_entries(id) on delete restrict,
  company_id uuid not null references public.companies(id) on delete restrict, changed_by uuid not null references public.profiles(id) on delete restrict,
  previous_started_at timestamptz not null, previous_finished_at timestamptz, new_started_at timestamptz not null, new_finished_at timestamptz, reason text not null check (char_length(trim(reason)) between 3 and 1000), changed_at timestamptz not null default now()
);
create index time_entry_audit_logs_entry_idx on public.time_entry_audit_logs(time_entry_id, changed_at desc);

create or replace function public.ensure_time_entry_integrity() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.jobs job where job.id = new.job_id and job.company_id = new.company_id) then raise exception 'Time entry job must belong to the same company'; end if;
  if not public.is_active_employee_member(new.member_id, new.company_id) then raise exception 'Time entry member must be an active employee of the same company'; end if;
  if new.finished_at is null then new.duration_minutes := null; else new.duration_minutes := floor(extract(epoch from (new.finished_at - new.started_at)) / 60)::integer; end if;
  return new;
end;
$$;
create trigger job_time_entries_integrity before insert or update on public.job_time_entries for each row execute procedure public.ensure_time_entry_integrity();

create or replace function public.start_my_job(p_job_id uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; job public.jobs; entry_id uuid;
begin
  select member.* into actor from public.company_members member join public.profiles profile on profile.id = member.profile_id where profile.auth_user_id = auth.uid() and member.status = 'ACTIVE' and member.role = 'EMPLOYEE' limit 1;
  if actor.id is null then raise exception 'Employee role required'; end if;
  select * into job from public.jobs where id = p_job_id for update;
  if job.id is null or not exists (select 1 from public.job_assignments assignment where assignment.job_id = job.id and assignment.member_id = actor.id) then raise exception 'Job is not assigned to current employee'; end if;
  if job.status not in ('PLANNED', 'CONFIRMED', 'IN_PROGRESS') then raise exception 'Job cannot be started'; end if;
  if exists (select 1 from public.job_time_entries entry where entry.member_id = actor.id and entry.finished_at is null) then raise exception 'Another active job must be ended first'; end if;
  insert into public.job_time_entries (company_id, job_id, member_id, started_at, start_source) values (job.company_id, job.id, actor.id, now(), 'APP') returning id into entry_id;
  update public.jobs set status = 'IN_PROGRESS' where id = job.id and status in ('PLANNED', 'CONFIRMED');
  return entry_id;
end;
$$;

create or replace function public.stop_my_job(p_job_id uuid) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; entry public.job_time_entries;
begin
  select member.* into actor from public.company_members member join public.profiles profile on profile.id = member.profile_id where profile.auth_user_id = auth.uid() and member.status = 'ACTIVE' and member.role = 'EMPLOYEE' limit 1;
  if actor.id is null then raise exception 'Employee role required'; end if;
  select * into entry from public.job_time_entries where job_id = p_job_id and member_id = actor.id and finished_at is null for update;
  if entry.id is null then raise exception 'No active time entry found'; end if;
  update public.job_time_entries set finished_at = now(), end_source = 'APP' where id = entry.id;
  if not exists (select 1 from public.job_assignments assignment where assignment.job_id = p_job_id and not exists (select 1 from public.job_time_entries time_entry where time_entry.job_id = p_job_id and time_entry.member_id = assignment.member_id and time_entry.finished_at is not null)) then update public.jobs set status = 'COMPLETED' where id = p_job_id; end if;
  return entry.id;
end;
$$;

create or replace function public.correct_time_entry(p_time_entry_id uuid, p_started_at timestamptz, p_finished_at timestamptz, p_reason text) returns uuid language plpgsql security definer set search_path = public as $$
declare entry public.job_time_entries; actor_profile_id uuid;
begin
  select * into entry from public.job_time_entries where id = p_time_entry_id for update;
  if entry.id is null or not public.is_company_staff(entry.company_id) then raise exception 'Staff role required'; end if;
  if p_finished_at <= p_started_at then raise exception 'End must be after start'; end if;
  if char_length(trim(p_reason)) not between 3 and 1000 then raise exception 'Correction reason is required'; end if;
  select id into actor_profile_id from public.profiles where auth_user_id = auth.uid();
  insert into public.time_entry_audit_logs (time_entry_id, company_id, changed_by, previous_started_at, previous_finished_at, new_started_at, new_finished_at, reason) values (entry.id, entry.company_id, actor_profile_id, entry.started_at, entry.finished_at, p_started_at, p_finished_at, trim(p_reason));
  update public.job_time_entries set started_at = p_started_at, finished_at = p_finished_at, start_source = 'MANUAL', end_source = 'MANUAL' where id = entry.id;
  return entry.id;
end;
$$;

alter table public.job_time_entries enable row level security;
alter table public.time_entry_audit_logs enable row level security;
create policy "staff can manage time entries" on public.job_time_entries for all to authenticated using (public.is_company_staff(company_id)) with check (public.is_company_staff(company_id));
create policy "employees can view own time entries" on public.job_time_entries for select to authenticated using (exists (select 1 from public.company_members member join public.profiles profile on profile.id = member.profile_id where member.id = job_time_entries.member_id and profile.auth_user_id = auth.uid()));
create policy "staff can view time entry audit logs" on public.time_entry_audit_logs for select to authenticated using (public.is_company_staff(company_id));
revoke all on public.job_time_entries, public.time_entry_audit_logs from anon, authenticated;
grant select on public.job_time_entries, public.time_entry_audit_logs to authenticated;
revoke all on function public.start_my_job(uuid), public.stop_my_job(uuid), public.correct_time_entry(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.start_my_job(uuid), public.stop_my_job(uuid), public.correct_time_entry(uuid, timestamptz, timestamptz, text) to authenticated;
