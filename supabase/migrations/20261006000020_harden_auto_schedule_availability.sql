-- Harden automatic recurring-plan assignment: the selected employee must
-- actually be available for every occurrence, stay within weekly target hours,
-- and have no overlapping planned work. The database remains the final safety
-- gate even when an AI planner proposes the assignment.

create or replace function public.auto_assign_schedule_employee(p_schedule_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  target public.service_schedules;
  target_minutes numeric;
  chosen uuid;
begin
  select * into actor from public.current_company_member()
  where role in ('OWNER','OFFICE') and status = 'ACTIVE';

  if actor.id is null then
    raise exception 'Planning requires OWNER or OFFICE';
  end if;

  select * into target
  from public.service_schedules
  where id = p_schedule_id and company_id = actor.company_id
  for update;

  if target.id is null then raise exception 'Schedule not found'; end if;

  select coalesce(sum(
    extract(epoch from (rule.planned_end_time - rule.planned_start_time)) / 60
  ), 0)
  into target_minutes
  from public.schedule_rules rule
  where rule.service_schedule_id = target.id
    and rule.is_active;

  delete from public.service_schedule_assignments
  where service_schedule_id = target.id;

  if target_minutes <= 0 then return null; end if;

  with employee_capacity as (
    select
      member.id as member_id,
      details.weekly_hours,
      coalesce((
        select sum(extract(epoch from (job.planned_end_at - job.planned_start_at)) / 60)
        from public.job_assignments assignment
        join public.jobs job on job.id = assignment.job_id
        where assignment.member_id = member.id
          and job.company_id = actor.company_id
          and job.status in ('PLANNED','CONFIRMED','IN_PROGRESS')
          and job.scheduled_date >= greatest(target.valid_from, current_date)
          and job.scheduled_date < greatest(target.valid_from, current_date) + 7
          and job.service_schedule_id is distinct from target.id
      ), 0) as existing_minutes,
      member.created_at
    from public.company_members member
    join public.employee_details details
      on details.company_id = member.company_id
     and details.profile_id = member.profile_id
     and details.is_active
    where member.company_id = actor.company_id
      and member.role = 'EMPLOYEE'
      and member.status = 'ACTIVE'
      and details.weekly_hours is not null
      and details.weekly_hours > 0
      and (details.employment_start_date is null or details.employment_start_date <= target.valid_from)
      and (details.employment_end_date is null or details.employment_end_date >= coalesce(target.valid_until, target.valid_from))
  ),
  eligible as (
    select capacity.*
    from employee_capacity capacity
    where capacity.existing_minutes + target_minutes <= capacity.weekly_hours * 60
      -- Approved holiday and reported sickness make an employee unavailable.
      -- Check the actual recurring dates, not just the weekday template.
      and not exists (
        select 1
        from public.schedule_rules target_rule
        cross join lateral generate_series(
          greatest(target.valid_from, current_date),
          least(coalesce(target.valid_until, current_date + 56), current_date + 56),
          interval '1 day'
        ) occurrence
        join public.employee_absences absence
          on absence.member_id = capacity.member_id
         and absence.company_id = actor.company_id
         and absence.start_date <= occurrence::date
         and absence.end_date >= occurrence::date
         and (absence.absence_type = 'SICKNESS' or absence.status = 'APPROVED')
        where target_rule.service_schedule_id = target.id
          and target_rule.is_active
          and extract(isodow from occurrence)::smallint = target_rule.weekday
      )
      -- Recurring-plan overlap guard.
      and not exists (
        select 1
        from public.schedule_rules target_rule
        join public.service_schedule_assignments assignment
          on assignment.member_id = capacity.member_id
        join public.service_schedules other_schedule
          on other_schedule.id = assignment.service_schedule_id
         and other_schedule.is_active
         and other_schedule.id <> target.id
        join public.schedule_rules other_rule
          on other_rule.service_schedule_id = other_schedule.id
         and other_rule.is_active
         and other_rule.weekday = target_rule.weekday
        where target_rule.service_schedule_id = target.id
          and target_rule.is_active
          and target_rule.planned_start_time < other_rule.planned_end_time
          and target_rule.planned_end_time > other_rule.planned_start_time
      )
      -- Also respect one-off and already generated jobs.
      and not exists (
        select 1
        from public.schedule_rules target_rule
        cross join lateral generate_series(
          greatest(target.valid_from, current_date),
          least(coalesce(target.valid_until, current_date + 56), current_date + 56),
          interval '1 day'
        ) occurrence
        join public.job_assignments assignment
          on assignment.member_id = capacity.member_id
        join public.jobs other_job
          on other_job.id = assignment.job_id
         and other_job.company_id = actor.company_id
         and other_job.status in ('PLANNED','CONFIRMED','IN_PROGRESS')
         and other_job.scheduled_date = occurrence::date
         and other_job.service_schedule_id is distinct from target.id
        where target_rule.service_schedule_id = target.id
          and target_rule.is_active
          and extract(isodow from occurrence)::smallint = target_rule.weekday
          and ((occurrence::date + target_rule.planned_start_time) at time zone target.timezone) < other_job.planned_end_at
          and ((occurrence::date + target_rule.planned_end_time) at time zone target.timezone) > other_job.planned_start_at
      )
  )
  select member_id into chosen
  from eligible
  order by
    (existing_minutes + target_minutes) / nullif(weekly_hours * 60, 0),
    existing_minutes,
    created_at,
    member_id
  limit 1;

  if chosen is not null then
    insert into public.service_schedule_assignments(company_id, service_schedule_id, member_id)
    values (actor.company_id, target.id, chosen)
    on conflict (service_schedule_id, member_id) do nothing;
  end if;

  return chosen;
end;
$$;

revoke all on function public.auto_assign_schedule_employee(uuid) from public, anon;
grant execute on function public.auto_assign_schedule_employee(uuid) to authenticated;
