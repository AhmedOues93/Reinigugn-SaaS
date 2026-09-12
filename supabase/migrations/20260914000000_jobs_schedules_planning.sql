-- Phase 4: operational jobs, recurring schedules and employee assignments.
create type public.job_status as enum ('PLANNED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'MISSED');
create type public.job_priority as enum ('LOW', 'NORMAL', 'HIGH', 'URGENT');
create type public.schedule_recurrence_type as enum ('WEEKLY');

create table public.service_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  cleaning_object_id uuid not null references public.cleaning_objects(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text,
  recurrence_type public.schedule_recurrence_type not null default 'WEEKLY',
  valid_from date not null,
  valid_until date,
  timezone text not null default 'Europe/Berlin',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until >= valid_from)
);

create table public.schedule_rules (
  id uuid primary key default gen_random_uuid(),
  service_schedule_id uuid not null references public.service_schedules(id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  planned_start_time time not null,
  planned_end_time time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (planned_end_time > planned_start_time),
  unique (service_schedule_id, weekday, planned_start_time, planned_end_time)
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  cleaning_object_id uuid not null references public.cleaning_objects(id) on delete restrict,
  service_schedule_id uuid references public.service_schedules(id) on delete set null,
  schedule_rule_id uuid references public.schedule_rules(id) on delete set null,
  title text not null check (char_length(trim(title)) between 2 and 160),
  description text,
  scheduled_date date not null,
  planned_start_at timestamptz not null,
  planned_end_at timestamptz not null,
  status public.job_status not null default 'PLANNED',
  priority public.job_priority not null default 'NORMAL',
  internal_notes text,
  employee_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (planned_end_at > planned_start_at),
  unique (service_schedule_id, schedule_rule_id, scheduled_date)
);

create table public.service_schedule_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  service_schedule_id uuid not null references public.service_schedules(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (service_schedule_id, member_id)
);

create table public.job_assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  job_id uuid not null references public.jobs(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (job_id, member_id)
);

create index service_schedules_company_active_idx on public.service_schedules(company_id, is_active);
create index service_schedules_object_idx on public.service_schedules(cleaning_object_id);
create index schedule_rules_schedule_idx on public.schedule_rules(service_schedule_id);
create index jobs_company_date_idx on public.jobs(company_id, scheduled_date);
create index jobs_company_status_date_idx on public.jobs(company_id, status, scheduled_date);
create index jobs_customer_idx on public.jobs(customer_id);
create index jobs_object_idx on public.jobs(cleaning_object_id);
create index jobs_schedule_idx on public.jobs(service_schedule_id, scheduled_date);
create index job_assignments_member_idx on public.job_assignments(member_id);
create index job_assignments_job_idx on public.job_assignments(job_id);
create index schedule_assignments_member_idx on public.service_schedule_assignments(member_id);

create trigger service_schedules_set_updated_at before update on public.service_schedules for each row execute procedure public.set_updated_at();
create trigger schedule_rules_set_updated_at before update on public.schedule_rules for each row execute procedure public.set_updated_at();
create trigger jobs_set_updated_at before update on public.jobs for each row execute procedure public.set_updated_at();

create or replace function public.ensure_schedule_company_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.customers where id = new.customer_id and company_id = new.company_id) then raise exception 'Schedule customer must belong to the same company'; end if;
  if not exists (select 1 from public.cleaning_objects where id = new.cleaning_object_id and company_id = new.company_id and customer_id = new.customer_id) then raise exception 'Schedule object must belong to the selected customer and company'; end if;
  return new;
end;
$$;

create or replace function public.ensure_job_company_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.customers where id = new.customer_id and company_id = new.company_id) then raise exception 'Job customer must belong to the same company'; end if;
  if not exists (select 1 from public.cleaning_objects where id = new.cleaning_object_id and company_id = new.company_id and customer_id = new.customer_id) then raise exception 'Job object must belong to the selected customer and company'; end if;
  if new.service_schedule_id is not null and not exists (select 1 from public.service_schedules where id = new.service_schedule_id and company_id = new.company_id and customer_id = new.customer_id and cleaning_object_id = new.cleaning_object_id) then raise exception 'Job schedule must belong to the same company and object'; end if;
  return new;
end;
$$;

create or replace function public.is_active_employee_member(target_member_id uuid, target_company_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.company_members where id = target_member_id and company_id = target_company_id and role = 'EMPLOYEE' and status = 'ACTIVE' and profile_id is not null);
$$;

create or replace function public.ensure_assignment_company_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_employee_member(new.member_id, new.company_id) then raise exception 'Assigned member must be an active employee of the same company'; end if;
  if tg_table_name = 'job_assignments' and not exists (select 1 from public.jobs where id = new.job_id and company_id = new.company_id) then raise exception 'Assignment job must belong to the same company'; end if;
  if tg_table_name = 'service_schedule_assignments' and not exists (select 1 from public.service_schedules where id = new.service_schedule_id and company_id = new.company_id) then raise exception 'Assignment schedule must belong to the same company'; end if;
  return new;
end;
$$;

create trigger service_schedules_validate_company before insert or update of company_id, customer_id, cleaning_object_id on public.service_schedules for each row execute procedure public.ensure_schedule_company_integrity();
create trigger jobs_validate_company before insert or update of company_id, customer_id, cleaning_object_id, service_schedule_id on public.jobs for each row execute procedure public.ensure_job_company_integrity();
create trigger job_assignments_validate_company before insert or update of company_id, job_id, member_id on public.job_assignments for each row execute procedure public.ensure_assignment_company_integrity();
create trigger schedule_assignments_validate_company before insert or update of company_id, service_schedule_id, member_id on public.service_schedule_assignments for each row execute procedure public.ensure_assignment_company_integrity();

create or replace function public.is_current_job_assignee(target_job_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.job_assignments assignment
    join public.company_members member on member.id = assignment.member_id
    join public.profiles profile on profile.id = member.profile_id
    where assignment.job_id = target_job_id and profile.auth_user_id = auth.uid() and member.status = 'ACTIVE'
  );
$$;

alter table public.service_schedules enable row level security;
alter table public.schedule_rules enable row level security;
alter table public.service_schedule_assignments enable row level security;
alter table public.jobs enable row level security;
alter table public.job_assignments enable row level security;

create policy "staff can manage schedules" on public.service_schedules for all to authenticated using (public.is_company_staff(company_id)) with check (public.is_company_staff(company_id));
create policy "staff can manage schedule rules" on public.schedule_rules for all to authenticated using (exists (select 1 from public.service_schedules schedule where schedule.id = service_schedule_id and public.is_company_staff(schedule.company_id))) with check (exists (select 1 from public.service_schedules schedule where schedule.id = service_schedule_id and public.is_company_staff(schedule.company_id)));
create policy "staff can manage schedule assignments" on public.service_schedule_assignments for all to authenticated using (public.is_company_staff(company_id)) with check (public.is_company_staff(company_id));
create policy "staff can manage jobs" on public.jobs for all to authenticated using (public.is_company_staff(company_id)) with check (public.is_company_staff(company_id));
create policy "employees can view assigned jobs" on public.jobs for select to authenticated using (public.is_current_job_assignee(id));
create policy "employees can view assigned job customers" on public.customers for select to authenticated using (exists (select 1 from public.jobs job where job.customer_id = customers.id and public.is_current_job_assignee(job.id)));
create policy "employees can view assigned job objects" on public.cleaning_objects for select to authenticated using (exists (select 1 from public.jobs job where job.cleaning_object_id = cleaning_objects.id and public.is_current_job_assignee(job.id)));
create policy "staff can manage job assignments" on public.job_assignments for all to authenticated using (public.is_company_staff(company_id)) with check (public.is_company_staff(company_id));
create policy "employees can view own assignments" on public.job_assignments for select to authenticated using (public.is_current_job_assignee(job_id));

revoke all on public.service_schedules, public.schedule_rules, public.service_schedule_assignments, public.jobs, public.job_assignments from anon;
revoke delete on public.service_schedules, public.schedule_rules, public.jobs, public.job_assignments from authenticated;
grant select, insert, update on public.service_schedules, public.schedule_rules, public.jobs, public.job_assignments to authenticated;
grant select, insert, update, delete on public.service_schedule_assignments to authenticated;

create or replace function public.generate_jobs_for_schedule(p_schedule_id uuid, p_until date)
returns integer language plpgsql security definer set search_path = public as $$
declare schedule public.service_schedules; generated_count integer := 0; start_date date; end_date date;
begin
  select * into schedule from public.service_schedules where id = p_schedule_id for update;
  if schedule.id is null then raise exception 'Schedule not found'; end if;
  if not public.is_company_staff(schedule.company_id) then raise exception 'Staff role required'; end if;
  if not schedule.is_active then return 0; end if;
  start_date := greatest(schedule.valid_from, current_date);
  end_date := least(coalesce(schedule.valid_until, p_until), p_until);
  if end_date < start_date then return 0; end if;
  with occurrences as (
    select rule.id as rule_id, series::date as occurrence_date, rule.planned_start_time, rule.planned_end_time
    from public.schedule_rules rule
    cross join generate_series(start_date, end_date, interval '1 day') series
    where rule.service_schedule_id = schedule.id and rule.is_active and extract(isodow from series)::smallint = rule.weekday
  ), generated as (
    insert into public.jobs (company_id, customer_id, cleaning_object_id, service_schedule_id, schedule_rule_id, title, description, scheduled_date, planned_start_at, planned_end_at, status, priority, employee_instructions)
    select schedule.company_id, schedule.customer_id, schedule.cleaning_object_id, schedule.id, occurrence.rule_id, schedule.name, schedule.description, occurrence.occurrence_date,
      ((occurrence.occurrence_date + occurrence.planned_start_time) at time zone schedule.timezone),
      ((occurrence.occurrence_date + occurrence.planned_end_time) at time zone schedule.timezone),
      'PLANNED', 'NORMAL', schedule.description
    from occurrences occurrence
    on conflict (service_schedule_id, schedule_rule_id, scheduled_date) do update set
      title = excluded.title, description = excluded.description, planned_start_at = excluded.planned_start_at, planned_end_at = excluded.planned_end_at, employee_instructions = excluded.employee_instructions, updated_at = now()
    where public.jobs.status in ('PLANNED', 'CONFIRMED') and public.jobs.scheduled_date >= current_date
    returning id
  ) select count(*) into generated_count from generated;
  update public.jobs set status = 'CANCELLED'
  where service_schedule_id = schedule.id and schedule_rule_id in (select id from public.schedule_rules where service_schedule_id = schedule.id and not is_active)
    and scheduled_date >= current_date and status in ('PLANNED', 'CONFIRMED');
  delete from public.job_assignments assignment using public.jobs job
  where assignment.job_id = job.id and job.service_schedule_id = schedule.id and job.scheduled_date >= current_date and job.status in ('PLANNED', 'CONFIRMED');
  insert into public.job_assignments (company_id, job_id, member_id)
  select schedule.company_id, job.id, assignment.member_id
  from public.jobs job join public.service_schedule_assignments assignment on assignment.service_schedule_id = schedule.id
  where job.service_schedule_id = schedule.id and job.scheduled_date between start_date and end_date and job.status in ('PLANNED', 'CONFIRMED')
  on conflict (job_id, member_id) do nothing;
  return generated_count;
end;
$$;

create or replace function public.find_job_assignment_conflicts(p_company_id uuid, p_start timestamptz, p_end timestamptz, p_member_ids uuid[])
returns table (member_id uuid, first_name text, last_name text, job_id uuid, title text, planned_start_at timestamptz, planned_end_at timestamptz)
language sql stable security definer set search_path = public as $$
  select member.id, profile.first_name, profile.last_name, job.id, job.title, job.planned_start_at, job.planned_end_at
  from public.job_assignments assignment
  join public.jobs job on job.id = assignment.job_id
  join public.company_members member on member.id = assignment.member_id
  join public.profiles profile on profile.id = member.profile_id
  where job.company_id = p_company_id and public.is_company_staff(p_company_id)
    and assignment.member_id = any(p_member_ids)
    and job.status not in ('CANCELLED', 'COMPLETED', 'MISSED')
    and job.planned_start_at < p_end and job.planned_end_at > p_start;
$$;

create or replace function public.create_single_job(
  p_customer_id uuid, p_cleaning_object_id uuid, p_title text, p_description text, p_scheduled_date date, p_start_time time, p_end_time time,
  p_status public.job_status, p_priority public.job_priority, p_internal_notes text, p_employee_instructions text, p_member_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; new_job_id uuid; actor_profile_id uuid; employee_id uuid;
begin
  select cm.* into actor from public.company_members cm join public.profiles profile on profile.id = cm.profile_id where profile.auth_user_id = auth.uid() and cm.status = 'ACTIVE' and cm.role in ('OWNER', 'OFFICE') limit 1;
  if actor.id is null then raise exception 'Staff role required'; end if;
  if p_end_time <= p_start_time then raise exception 'Planned end must be after start'; end if;
  if p_status not in ('PLANNED', 'CONFIRMED', 'CANCELLED') then raise exception 'Job status is not operationally editable'; end if;
  select id into actor_profile_id from public.profiles where auth_user_id = auth.uid();
  insert into public.jobs (company_id, customer_id, cleaning_object_id, title, description, scheduled_date, planned_start_at, planned_end_at, status, priority, internal_notes, employee_instructions)
  values (actor.company_id, p_customer_id, p_cleaning_object_id, trim(p_title), nullif(trim(p_description), ''), p_scheduled_date,
    ((p_scheduled_date + p_start_time) at time zone 'Europe/Berlin'), ((p_scheduled_date + p_end_time) at time zone 'Europe/Berlin'), p_status, p_priority, nullif(trim(p_internal_notes), ''), nullif(trim(p_employee_instructions), ''))
  returning id into new_job_id;
  foreach employee_id in array coalesce(p_member_ids, array[]::uuid[]) loop
    insert into public.job_assignments (company_id, job_id, member_id, assigned_by) values (actor.company_id, new_job_id, employee_id, actor_profile_id) on conflict (job_id, member_id) do nothing;
  end loop;
  return new_job_id;
end;
$$;

create or replace function public.update_job_details(
  p_job_id uuid, p_customer_id uuid, p_cleaning_object_id uuid, p_title text, p_description text, p_scheduled_date date, p_start_time time, p_end_time time,
  p_status public.job_status, p_priority public.job_priority, p_internal_notes text, p_employee_instructions text, p_member_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; target public.jobs; actor_profile_id uuid; employee_id uuid;
begin
  select cm.* into actor from public.company_members cm join public.profiles profile on profile.id = cm.profile_id where profile.auth_user_id = auth.uid() and cm.status = 'ACTIVE' and cm.role in ('OWNER', 'OFFICE') limit 1;
  if actor.id is null then raise exception 'Staff role required'; end if;
  select * into target from public.jobs where id = p_job_id and company_id = actor.company_id for update;
  if target.id is null then raise exception 'Job not found'; end if;
  if target.status in ('COMPLETED', 'MISSED') then raise exception 'Historical jobs cannot be silently changed'; end if;
  if p_end_time <= p_start_time then raise exception 'Planned end must be after start'; end if;
  if p_status not in ('PLANNED', 'CONFIRMED', 'CANCELLED') then raise exception 'Job status is not operationally editable'; end if;
  select id into actor_profile_id from public.profiles where auth_user_id = auth.uid();
  update public.jobs set customer_id = p_customer_id, cleaning_object_id = p_cleaning_object_id, title = trim(p_title), description = nullif(trim(p_description), ''), scheduled_date = p_scheduled_date,
    planned_start_at = ((p_scheduled_date + p_start_time) at time zone 'Europe/Berlin'), planned_end_at = ((p_scheduled_date + p_end_time) at time zone 'Europe/Berlin'), status = p_status, priority = p_priority,
    internal_notes = nullif(trim(p_internal_notes), ''), employee_instructions = nullif(trim(p_employee_instructions), '') where id = target.id;
  delete from public.job_assignments where job_id = target.id;
  foreach employee_id in array coalesce(p_member_ids, array[]::uuid[]) loop
    insert into public.job_assignments (company_id, job_id, member_id, assigned_by) values (actor.company_id, target.id, employee_id, actor_profile_id) on conflict (job_id, member_id) do nothing;
  end loop;
  return target.id;
end;
$$;

revoke all on function public.generate_jobs_for_schedule(uuid, date) from public, anon;
revoke all on function public.find_job_assignment_conflicts(uuid, timestamptz, timestamptz, uuid[]) from public, anon;
revoke all on function public.create_single_job(uuid, uuid, text, text, date, time, time, public.job_status, public.job_priority, text, text, uuid[]) from public, anon;
revoke all on function public.update_job_details(uuid, uuid, uuid, text, text, date, time, time, public.job_status, public.job_priority, text, text, uuid[]) from public, anon;
grant execute on function public.generate_jobs_for_schedule(uuid, date) to authenticated;
grant execute on function public.find_job_assignment_conflicts(uuid, timestamptz, timestamptz, uuid[]) to authenticated;
grant execute on function public.create_single_job(uuid, uuid, text, text, date, time, time, public.job_status, public.job_priority, text, text, uuid[]) to authenticated;
grant execute on function public.update_job_details(uuid, uuid, uuid, text, text, date, time, time, public.job_status, public.job_priority, text, text, uuid[]) to authenticated;
