-- Notify employees when recurring-plan generation puts a new assignment on
-- their field schedule. Idempotent: an existing assignment never gets a second
-- notification when the nightly horizon job runs again.

alter type public.notification_type add value if not exists 'JOB_ASSIGNED';

create or replace function public.generate_schedule_occurrences(p_schedule_id uuid, p_until date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  schedule public.service_schedules;
  generated_count integer := 0;
  start_date date;
  end_date date;
begin
  select * into schedule from public.service_schedules where id = p_schedule_id for update;
  if schedule.id is null then raise exception 'Schedule not found'; end if;
  if not schedule.is_active then return 0; end if;
  start_date := greatest(schedule.valid_from, current_date);
  end_date := least(coalesce(schedule.valid_until, p_until), p_until);
  if end_date < start_date then return 0; end if;

  with occurrences as (
    select rule.id as rule_id, series::date as occurrence_date, rule.planned_start_time, rule.planned_end_time
    from public.schedule_rules rule
    cross join generate_series(start_date, end_date, interval '1 day') series
    where rule.service_schedule_id = schedule.id
      and rule.is_active
      and extract(isodow from series)::smallint = rule.weekday
  ), generated as (
    insert into public.jobs (
      company_id, customer_id, cleaning_object_id, service_schedule_id,
      schedule_rule_id, title, description, scheduled_date, planned_start_at,
      planned_end_at, status, priority, employee_instructions
    )
    select
      schedule.company_id, schedule.customer_id, schedule.cleaning_object_id,
      schedule.id, occurrence.rule_id, schedule.name, schedule.description,
      occurrence.occurrence_date,
      ((occurrence.occurrence_date + occurrence.planned_start_time) at time zone schedule.timezone),
      ((occurrence.occurrence_date + occurrence.planned_end_time) at time zone schedule.timezone),
      'PLANNED', 'NORMAL', schedule.description
    from occurrences occurrence
    on conflict (service_schedule_id, schedule_rule_id, scheduled_date)
    do update set
      title = excluded.title,
      description = excluded.description,
      planned_start_at = excluded.planned_start_at,
      planned_end_at = excluded.planned_end_at,
      employee_instructions = excluded.employee_instructions,
      updated_at = now()
    where public.jobs.status in ('PLANNED', 'CONFIRMED')
      and public.jobs.scheduled_date >= current_date
    returning id
  )
  select count(*) into generated_count from generated;

  update public.jobs
  set status = 'CANCELLED'
  where service_schedule_id = schedule.id
    and schedule_rule_id in (
      select id from public.schedule_rules
      where service_schedule_id = schedule.id and not is_active
    )
    and scheduled_date >= current_date
    and status in ('PLANNED', 'CONFIRMED');

  delete from public.job_assignments assignment
  using public.jobs job
  where assignment.job_id = job.id
    and job.service_schedule_id = schedule.id
    and job.scheduled_date >= current_date
    and job.status in ('PLANNED', 'CONFIRMED');

  with inserted_assignments as (
    insert into public.job_assignments (company_id, job_id, member_id)
    select schedule.company_id, job.id, assignment.member_id
    from public.jobs job
    join public.service_schedule_assignments assignment
      on assignment.service_schedule_id = schedule.id
    where job.service_schedule_id = schedule.id
      and job.scheduled_date between start_date and end_date
      and job.status in ('PLANNED', 'CONFIRMED')
    on conflict (job_id, member_id) do nothing
    returning company_id, job_id, member_id
  )
  insert into public.in_app_notifications (
    company_id, recipient_member_id, type, title, body, job_id
  )
  select
    inserted.company_id,
    inserted.member_id,
    'JOB_ASSIGNED'::public.notification_type,
    'Neuer Einsatz geplant',
    concat(
      coalesce(object_row.name, job.title),
      ' · ',
      to_char(job.planned_start_at at time zone schedule.timezone, 'DD.MM.YYYY HH24:MI'),
      '–',
      to_char(job.planned_end_at at time zone schedule.timezone, 'HH24:MI')
    ),
    job.id
  from inserted_assignments inserted
  join public.jobs job on job.id = inserted.job_id
  left join public.cleaning_objects object_row on object_row.id = job.cleaning_object_id;

  return generated_count;
end;
$$;

revoke all on function public.generate_schedule_occurrences(uuid, date) from public, anon, authenticated;
