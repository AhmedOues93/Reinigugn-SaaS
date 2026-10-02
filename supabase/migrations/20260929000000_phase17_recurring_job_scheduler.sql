-- Phase 17 — recurring plans keep producing work without anyone touching them.
--
-- Visits were generated up to a horizon, and only when a person saved a plan,
-- reactivated one, or accepted a quote. A standing contract nobody edited went
-- quiet about eight weeks later: the planning board emptied, and the first
-- anyone knew was a customer asking why the cleaner had not come.
--
-- Why in the database rather than an HTTP endpoint the host calls on a timer:
--
--   * The generation logic is already here, and it is already idempotent.
--   * No credential has to leave the database. An endpoint would need a shared
--     secret or a service-role key held by whatever calls it, which is a
--     second privileged path to protect for no gain.
--   * Free and low-cost hosting tiers idle the web process. A schedule that
--     depends on the app being awake is a schedule that silently stops.
--
-- The trade-off: pg_cron lives in the database, so it is configured per
-- project rather than in this repository. The function below is the unit of
-- work and is useful on its own — the schedule at the bottom is applied only
-- where the extension exists, and the procedure for enabling it is in
-- docs/deployment.md.

-- ---------------------------------------------------------------------------
-- 1. The generation itself, with no opinion about who is asking.
--
-- Lifted unchanged out of `generate_jobs_for_schedule` so the interactive path
-- and the unattended one cannot drift apart. Not callable by anyone: the two
-- wrappers below decide who may ask.
-- ---------------------------------------------------------------------------
create or replace function public.generate_schedule_occurrences(p_schedule_id uuid, p_until date)
returns integer language plpgsql security definer set search_path = public as $$
declare schedule public.service_schedules; generated_count integer := 0; start_date date; end_date date;
begin
  select * into schedule from public.service_schedules where id = p_schedule_id for update;
  if schedule.id is null then raise exception 'Schedule not found'; end if;
  if not schedule.is_active then return 0; end if;
  start_date := greatest(schedule.valid_from, current_date);
  end_date := least(coalesce(schedule.valid_until, p_until), p_until);
  if end_date < start_date then return 0; end if;

  with occurrences as (
    select rule.id as rule_id, series::date as occurrence_date, rule.planned_start_time, rule.planned_end_time
    from public.schedule_rules rule cross join generate_series(start_date, end_date, interval '1 day') series
    where rule.service_schedule_id = schedule.id and rule.is_active and extract(isodow from series)::smallint = rule.weekday
  ), generated as (
    insert into public.jobs (company_id, customer_id, cleaning_object_id, service_schedule_id, schedule_rule_id, title, description, scheduled_date, planned_start_at, planned_end_at, status, priority, employee_instructions)
    select schedule.company_id, schedule.customer_id, schedule.cleaning_object_id, schedule.id, occurrence.rule_id, schedule.name, schedule.description, occurrence.occurrence_date,
      ((occurrence.occurrence_date + occurrence.planned_start_time) at time zone schedule.timezone), ((occurrence.occurrence_date + occurrence.planned_end_time) at time zone schedule.timezone), 'PLANNED', 'NORMAL', schedule.description from occurrences occurrence
    -- The conflict target is what makes a re-run harmless: one job per rule per
    -- day, whatever else happens.
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

revoke all on function public.generate_schedule_occurrences(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The interactive path, unchanged from the caller's point of view.
-- ---------------------------------------------------------------------------
create or replace function public.generate_jobs_for_schedule(p_schedule_id uuid, p_until date)
returns integer language plpgsql security definer set search_path = public as $$
declare company uuid;
begin
  select company_id into company from public.service_schedules where id = p_schedule_id;
  if company is null then raise exception 'Schedule not found'; end if;
  if not public.is_company_staff(company) then raise exception 'Staff role required'; end if;
  return public.generate_schedule_occurrences(p_schedule_id, p_until);
end;
$$;

revoke all on function public.generate_jobs_for_schedule(uuid, date) from public, anon;
grant execute on function public.generate_jobs_for_schedule(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The unattended sweep.
--
-- Deliberately crosses tenants: this is system work, not a user acting. It
-- cannot leak between them, because every row it writes derives its company_id
-- from the plan being processed — there is no path by which plan A's run
-- touches tenant B.
--
-- Each plan is committed in its own subtransaction. One tenant with a broken
-- plan — a deleted object, a constraint violation — is recorded and skipped,
-- and everyone else is still scheduled. A single exception escaping here would
-- roll back the whole sweep and leave every company without work.
-- ---------------------------------------------------------------------------
create or replace function public.generate_due_jobs(p_horizon_days integer default 56)
returns table (schedules_processed integer, jobs_generated integer, failures integer)
language plpgsql security definer set search_path = public as $$
declare
  plan record;
  horizon date;
  produced integer;
begin
  if p_horizon_days is null or p_horizon_days < 1 or p_horizon_days > 365 then
    raise exception 'Horizon must be between 1 and 365 days';
  end if;
  horizon := current_date + p_horizon_days;
  schedules_processed := 0;
  jobs_generated := 0;
  failures := 0;

  for plan in
    select id from public.service_schedules
    where is_active and (valid_until is null or valid_until >= current_date)
    order by id
  loop
    begin
      produced := public.generate_schedule_occurrences(plan.id, horizon);
      schedules_processed := schedules_processed + 1;
      jobs_generated := jobs_generated + coalesce(produced, 0);
    exception when others then
      failures := failures + 1;
      raise warning 'generate_due_jobs: plan % skipped: %', plan.id, sqlerrm;
    end;
  end loop;

  return next;
end;
$$;

-- No user session may sweep every tenant. Only the scheduler, which runs as the
-- database owner, and an operator connecting directly.
revoke all on function public.generate_due_jobs(integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The schedule, where the extension is available.
--
-- Applied conditionally so this migration stays valid on a plain PostgreSQL
-- server — which is what CI and `supabase/test/run.sh` use, and where pg_cron
-- is neither present nor wanted.
--
-- 04:00 Europe/Berlin is before the first shift and after the day has rolled
-- over, so a plan is topped up before anyone looks at the board. Daily rather
-- than weekly: the work is idempotent and cheap, and a missed run then costs
-- nothing.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;

    -- Replacing an existing entry keeps this migration re-runnable.
    perform cron.unschedule(jobid) from cron.job where jobname = 'sauberwerk-generate-due-jobs';
    perform cron.schedule(
      'sauberwerk-generate-due-jobs',
      '0 3 * * *',  -- 03:00 UTC ≈ 04:00/05:00 Berlin depending on daylight saving
      $cron$select public.generate_due_jobs(56)$cron$
    );
    raise notice 'pg_cron: nightly job generation scheduled';
  else
    raise notice 'pg_cron not available — schedule public.generate_due_jobs(56) by other means (see docs/deployment.md)';
  end if;
exception when insufficient_privilege or undefined_function or undefined_table then
  -- A managed instance may expose the extension without letting a migration
  -- schedule into it. Say so rather than failing the deployment.
  raise notice 'pg_cron present but not schedulable here — schedule public.generate_due_jobs(56) manually';
end $$;
