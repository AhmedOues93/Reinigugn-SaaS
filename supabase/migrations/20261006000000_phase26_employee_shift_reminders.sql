-- Employee shift reminders for the mobile field app.
-- Production-safe: notifications are deduplicated per employee/job/type.

alter type public.notification_type add value if not exists 'JOB_START_SOON';
alter type public.notification_type add value if not exists 'JOB_START_OVERDUE';

create or replace function public.enqueue_job_start_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.in_app_notifications (
    company_id, recipient_member_id, type, title, body, job_id
  )
  select
    job.company_id,
    assignment.member_id,
    'JOB_START_SOON'::public.notification_type,
    'Einsatz beginnt bald',
    concat(
      coalesce(object_row.name, job.title),
      ' · geplanter Start ',
      to_char(job.planned_start_at at time zone 'Europe/Berlin', 'HH24:MI')
    ),
    job.id
  from public.jobs job
  join public.job_assignments assignment on assignment.job_id = job.id
  join public.company_members member on member.id = assignment.member_id
  left join public.cleaning_objects object_row on object_row.id = job.cleaning_object_id
  where job.status in ('PLANNED','CONFIRMED')
    and job.planned_start_at between now() + interval '5 minutes' and now() + interval '20 minutes'
    and member.role = 'EMPLOYEE'
    and member.status = 'ACTIVE'
    and not exists (
      select 1 from public.job_time_entries entry
      where entry.job_id = job.id and entry.member_id = assignment.member_id
    )
    and not exists (
      select 1 from public.in_app_notifications n
      where n.recipient_member_id = assignment.member_id
        and n.job_id = job.id
        and n.type = 'JOB_START_SOON'
    );

  insert into public.in_app_notifications (
    company_id, recipient_member_id, type, title, body, job_id
  )
  select
    job.company_id,
    assignment.member_id,
    'JOB_START_OVERDUE'::public.notification_type,
    'Einsatz noch nicht gestartet',
    concat(
      coalesce(object_row.name, job.title),
      ' · geplant seit ',
      to_char(job.planned_start_at at time zone 'Europe/Berlin', 'HH24:MI'),
      '. Bitte Einsatz öffnen und starten.'
    ),
    job.id
  from public.jobs job
  join public.job_assignments assignment on assignment.job_id = job.id
  join public.company_members member on member.id = assignment.member_id
  left join public.cleaning_objects object_row on object_row.id = job.cleaning_object_id
  where job.status in ('PLANNED','CONFIRMED')
    and job.planned_start_at between now() - interval '60 minutes' and now() - interval '5 minutes'
    and member.role = 'EMPLOYEE'
    and member.status = 'ACTIVE'
    and not exists (
      select 1 from public.job_time_entries entry
      where entry.job_id = job.id and entry.member_id = assignment.member_id
    )
    and not exists (
      select 1 from public.in_app_notifications n
      where n.recipient_member_id = assignment.member_id
        and n.job_id = job.id
        and n.type = 'JOB_START_OVERDUE'
    );
end;
$$;

revoke all on function public.enqueue_job_start_reminders() from public, anon, authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'reinplan-employee-shift-reminders';

select cron.schedule(
  'reinplan-employee-shift-reminders',
  '*/5 * * * *',
  $$select public.enqueue_job_start_reminders();$$
);
