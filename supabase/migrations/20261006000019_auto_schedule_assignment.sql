-- Automatic recurring-plan assignment based on weekly target hours and
-- recurring schedule conflicts. Manual assignment remains available.
alter table public.service_schedules
  add column if not exists assignment_mode text not null default 'AUTO';

alter table public.service_schedules
  drop constraint if exists service_schedules_assignment_mode_check;
alter table public.service_schedules
  add constraint service_schedules_assignment_mode_check
  check (assignment_mode in ('AUTO', 'MANUAL'));

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
      coalesce(sum(
        case
          when existing_schedule.id is not null and existing_rule.id is not null
          then extract(epoch from (existing_rule.planned_end_time - existing_rule.planned_start_time)) / 60
          else 0
        end
      ), 0) as existing_minutes,
      member.created_at
    from public.company_members member
    join public.employee_details details
      on details.company_id = member.company_id
     and details.profile_id = member.profile_id
     and details.is_active
    left join public.service_schedule_assignments existing_assignment
      on existing_assignment.member_id = member.id
    left join public.service_schedules existing_schedule
      on existing_schedule.id = existing_assignment.service_schedule_id
     and existing_schedule.company_id = member.company_id
     and existing_schedule.is_active
     and existing_schedule.id <> target.id
    left join public.schedule_rules existing_rule
      on existing_rule.service_schedule_id = existing_schedule.id
     and existing_rule.is_active
    where member.company_id = actor.company_id
      and member.role = 'EMPLOYEE'
      and member.status = 'ACTIVE'
      and details.weekly_hours is not null
      and details.weekly_hours > 0
      and (details.employment_start_date is null or details.employment_start_date <= target.valid_from)
      and (details.employment_end_date is null or details.employment_end_date >= target.valid_from)
    group by member.id, details.weekly_hours, member.created_at
  ),
  eligible as (
    select capacity.*
    from employee_capacity capacity
    where capacity.existing_minutes + target_minutes <= capacity.weekly_hours * 60
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