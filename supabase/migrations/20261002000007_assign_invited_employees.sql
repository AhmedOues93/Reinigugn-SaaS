-- Allow office planning before an invited employee has completed account setup.
-- This does not grant application access: employee-facing functions still require
-- an ACTIVE member linked to an authenticated profile.

create or replace function public.is_assignable_employee_member(
  target_member_id uuid,
  target_company_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_members
    where id = target_member_id
      and company_id = target_company_id
      and role = 'EMPLOYEE'
      and status in ('INVITED', 'ACTIVE')
  );
$$;

revoke all on function public.is_assignable_employee_member(uuid, uuid) from public, anon;
grant execute on function public.is_assignable_employee_member(uuid, uuid) to authenticated;

create or replace function public.ensure_assignment_company_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_assignable_employee_member(new.member_id, new.company_id) then
    raise exception 'Assigned member must be an invited or active employee of the same company';
  end if;
  if tg_table_name = 'job_assignments'
     and not exists (select 1 from public.jobs where id = new.job_id and company_id = new.company_id) then
    raise exception 'Assignment job must belong to the same company';
  end if;
  if tg_table_name = 'service_schedule_assignments'
     and not exists (select 1 from public.service_schedules where id = new.service_schedule_id and company_id = new.company_id) then
    raise exception 'Assignment schedule must belong to the same company';
  end if;
  return new;
end;
$$;

create or replace function public.ensure_job_assignment_company_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_assignable_employee_member(new.member_id, new.company_id) then
    raise exception 'Assigned member must be an invited or active employee of the same company';
  end if;
  if not exists (
    select 1 from public.jobs job
    where job.id = new.job_id and job.company_id = new.company_id
  ) then
    raise exception 'Assignment job must belong to the same company';
  end if;
  return new;
end;
$$;

create or replace function public.ensure_schedule_assignment_company_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_assignable_employee_member(new.member_id, new.company_id) then
    raise exception 'Assigned member must be an invited or active employee of the same company';
  end if;
  if not exists (
    select 1 from public.service_schedules schedule
    where schedule.id = new.service_schedule_id and schedule.company_id = new.company_id
  ) then
    raise exception 'Assignment schedule must belong to the same company';
  end if;
  return new;
end;
$$;

create or replace function public.create_single_job(
  p_customer_id uuid,
  p_cleaning_object_id uuid,
  p_title text,
  p_description text,
  p_scheduled_date date,
  p_start_time time,
  p_end_time time,
  p_status public.job_status,
  p_priority public.job_priority,
  p_internal_notes text,
  p_employee_instructions text,
  p_member_ids uuid[],
  p_checklist_template_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  new_job_id uuid;
  actor_profile_id uuid;
  employee_id uuid;
begin
  select cm.* into actor
  from public.company_members cm
  join public.profiles profile on profile.id = cm.profile_id
  where profile.auth_user_id = auth.uid()
    and cm.status = 'ACTIVE'
    and cm.role in ('OWNER', 'OFFICE')
  limit 1;
  if actor.id is null then raise exception 'Staff role required'; end if;
  if p_end_time <= p_start_time then raise exception 'Planned end must be after start'; end if;
  if p_status not in ('PLANNED', 'CONFIRMED', 'CANCELLED') then
    raise exception 'Job status is not operationally editable';
  end if;

  perform public.ensure_checklist_template_in_company(p_checklist_template_id, actor.company_id);

  foreach employee_id in array coalesce(p_member_ids, array[]::uuid[]) loop
    if not public.is_assignable_employee_member(employee_id, actor.company_id) then
      raise exception 'Assigned member must be an invited or active employee of the same company';
    end if;
  end loop;

  select id into actor_profile_id from public.profiles where auth_user_id = auth.uid();

  insert into public.jobs (
    company_id, customer_id, cleaning_object_id, checklist_template_id, title,
    description, scheduled_date, planned_start_at, planned_end_at, status, priority,
    internal_notes, employee_instructions
  )
  values (
    actor.company_id, p_customer_id, p_cleaning_object_id, p_checklist_template_id,
    trim(p_title), nullif(trim(p_description), ''), p_scheduled_date,
    ((p_scheduled_date + p_start_time) at time zone 'Europe/Berlin'),
    ((p_scheduled_date + p_end_time) at time zone 'Europe/Berlin'),
    p_status, p_priority, nullif(trim(p_internal_notes), ''),
    nullif(trim(p_employee_instructions), '')
  )
  returning id into new_job_id;

  foreach employee_id in array coalesce(p_member_ids, array[]::uuid[]) loop
    insert into public.job_assignments (company_id, job_id, member_id, assigned_by)
    values (actor.company_id, new_job_id, employee_id, actor_profile_id)
    on conflict (job_id, member_id) do nothing;
  end loop;

  return new_job_id;
end;
$$;

create or replace function public.update_job_details(
  p_job_id uuid,
  p_customer_id uuid,
  p_cleaning_object_id uuid,
  p_title text,
  p_description text,
  p_scheduled_date date,
  p_start_time time,
  p_end_time time,
  p_status public.job_status,
  p_priority public.job_priority,
  p_internal_notes text,
  p_employee_instructions text,
  p_member_ids uuid[],
  p_checklist_template_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  target public.jobs;
  actor_profile_id uuid;
  employee_id uuid;
begin
  select cm.* into actor
  from public.company_members cm
  join public.profiles profile on profile.id = cm.profile_id
  where profile.auth_user_id = auth.uid()
    and cm.status = 'ACTIVE'
    and cm.role in ('OWNER', 'OFFICE')
  limit 1;
  if actor.id is null then raise exception 'Staff role required'; end if;

  select * into target
  from public.jobs
  where id = p_job_id and company_id = actor.company_id
  for update;
  if target.id is null then raise exception 'Job not found'; end if;
  if target.status in ('COMPLETED', 'MISSED') then
    raise exception 'Historical jobs cannot be silently changed';
  end if;
  if p_end_time <= p_start_time then raise exception 'Planned end must be after start'; end if;
  if p_status not in ('PLANNED', 'CONFIRMED', 'CANCELLED') then
    raise exception 'Job status is not operationally editable';
  end if;
  if exists (select 1 from public.job_checklists where job_id = target.id)
     and p_checklist_template_id is distinct from target.checklist_template_id then
    raise exception 'Checklist assignment cannot change after snapshot creation';
  end if;

  perform public.ensure_checklist_template_in_company(p_checklist_template_id, actor.company_id);

  foreach employee_id in array coalesce(p_member_ids, array[]::uuid[]) loop
    if not public.is_assignable_employee_member(employee_id, actor.company_id) then
      raise exception 'Assigned member must be an invited or active employee of the same company';
    end if;
  end loop;

  select id into actor_profile_id from public.profiles where auth_user_id = auth.uid();

  update public.jobs
  set customer_id = p_customer_id,
      cleaning_object_id = p_cleaning_object_id,
      checklist_template_id = p_checklist_template_id,
      title = trim(p_title),
      description = nullif(trim(p_description), ''),
      scheduled_date = p_scheduled_date,
      planned_start_at = ((p_scheduled_date + p_start_time) at time zone 'Europe/Berlin'),
      planned_end_at = ((p_scheduled_date + p_end_time) at time zone 'Europe/Berlin'),
      status = p_status,
      priority = p_priority,
      internal_notes = nullif(trim(p_internal_notes), ''),
      employee_instructions = nullif(trim(p_employee_instructions), '')
  where id = target.id;

  if not exists (select 1 from public.job_checklists where job_id = target.id) then
    perform public.create_job_checklist_snapshot(target.id);
  end if;

  delete from public.job_assignments where job_id = target.id;

  foreach employee_id in array coalesce(p_member_ids, array[]::uuid[]) loop
    insert into public.job_assignments (company_id, job_id, member_id, assigned_by)
    values (actor.company_id, target.id, employee_id, actor_profile_id)
    on conflict (job_id, member_id) do nothing;
  end loop;

  return target.id;
end;
$$;

-- Demo-only assignments. The employee can see them only after accepting the invite.
with target_company as (
  select id from public.companies where name ilike 'Ahmed%' limit 1
),
pairs as (
  select
    j.company_id,
    j.id as job_id,
    cm.id as member_id
  from public.jobs j
  join target_company tc on tc.id = j.company_id
  join public.company_members cm on cm.company_id = j.company_id and cm.role = 'EMPLOYEE'
  where j.title like 'DEMO%'
    and (
      (j.title ilike '%Mainblick%' and cm.invited_first_name = 'Murat' and cm.invited_last_name = 'Yilmaz')
      or
      (j.title ilike '%Praxisreinigung%' and cm.invited_first_name = 'Olena' and cm.invited_last_name = 'Koval')
      or
      (j.title ilike '%Treppenhaus%' and cm.invited_first_name = 'Sami' and cm.invited_last_name = 'Ben Ali')
    )
)
insert into public.job_assignments (company_id, job_id, member_id)
select company_id, job_id, member_id from pairs
on conflict (job_id, member_id) do nothing;
