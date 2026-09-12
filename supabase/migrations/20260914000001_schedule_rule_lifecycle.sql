-- Keeps schedule-rule identity stable when templates change after jobs were generated.
alter table public.schedule_rules add column if not exists is_active boolean not null default true;

create or replace function public.generate_jobs_for_schedule(p_schedule_id uuid, p_until date)
returns integer language plpgsql security definer set search_path = public as $$
declare schedule public.service_schedules; generated_count integer := 0; start_date date; end_date date;
begin
  select * into schedule from public.service_schedules where id = p_schedule_id for update;
  if schedule.id is null then raise exception 'Schedule not found'; end if;
  if not public.is_company_staff(schedule.company_id) then raise exception 'Staff role required'; end if;
  if not schedule.is_active then return 0; end if;
  start_date := greatest(schedule.valid_from, current_date); end_date := least(coalesce(schedule.valid_until, p_until), p_until);
  if end_date < start_date then return 0; end if;
  with occurrences as (
    select rule.id as rule_id, series::date as occurrence_date, rule.planned_start_time, rule.planned_end_time
    from public.schedule_rules rule cross join generate_series(start_date, end_date, interval '1 day') series
    where rule.service_schedule_id = schedule.id and rule.is_active and extract(isodow from series)::smallint = rule.weekday
  ), generated as (
    insert into public.jobs (company_id, customer_id, cleaning_object_id, service_schedule_id, schedule_rule_id, title, description, scheduled_date, planned_start_at, planned_end_at, status, priority, employee_instructions)
    select schedule.company_id, schedule.customer_id, schedule.cleaning_object_id, schedule.id, occurrence.rule_id, schedule.name, schedule.description, occurrence.occurrence_date,
      ((occurrence.occurrence_date + occurrence.planned_start_time) at time zone schedule.timezone), ((occurrence.occurrence_date + occurrence.planned_end_time) at time zone schedule.timezone), 'PLANNED', 'NORMAL', schedule.description from occurrences occurrence
    on conflict (service_schedule_id, schedule_rule_id, scheduled_date) do update set title = excluded.title, description = excluded.description, planned_start_at = excluded.planned_start_at, planned_end_at = excluded.planned_end_at, employee_instructions = excluded.employee_instructions, updated_at = now()
    where public.jobs.status in ('PLANNED', 'CONFIRMED') and public.jobs.scheduled_date >= current_date returning id
  ) select count(*) into generated_count from generated;
  update public.jobs set status = 'CANCELLED' where service_schedule_id = schedule.id and schedule_rule_id in (select id from public.schedule_rules where service_schedule_id = schedule.id and not is_active) and scheduled_date >= current_date and status in ('PLANNED', 'CONFIRMED');
  delete from public.job_assignments assignment using public.jobs job where assignment.job_id = job.id and job.service_schedule_id = schedule.id and job.scheduled_date >= current_date and job.status in ('PLANNED', 'CONFIRMED');
  insert into public.job_assignments (company_id, job_id, member_id)
  select schedule.company_id, job.id, assignment.member_id from public.jobs job join public.service_schedule_assignments assignment on assignment.service_schedule_id = schedule.id
  where job.service_schedule_id = schedule.id and job.scheduled_date between start_date and end_date and job.status in ('PLANNED', 'CONFIRMED') on conflict (job_id, member_id) do nothing;
  return generated_count;
end;
$$;

revoke all on function public.generate_jobs_for_schedule(uuid, date) from public, anon;
grant execute on function public.generate_jobs_for_schedule(uuid, date) to authenticated;
