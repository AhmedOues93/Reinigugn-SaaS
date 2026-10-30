-- Automatic week planning has to say *why* it could not place a visit.
-- Until now the planner returned one employee id or NULL, so the office only
-- ever saw "no safe assignment possible" for the whole week and had nothing to
-- act on. The eligibility rules are unchanged; they move into a diagnostic
-- function that reports, per employee, the first rule that blocks them, and a
-- week planner that reports one row per planned visit (object, date, time) with
-- either the assigned employee or the concrete reasons.

-- The helper three security-definer functions already call, but which no
-- migration ever created: automatic team planning (since 20261006000019) and
-- the DATEV settings writer (since 20261006000016) both failed at runtime with
-- "function public.current_company_member() does not exist", which the app
-- could only show as a blanket error. Defining it is the actual fix behind
-- "Woche automatisch planen".
--
-- A staff membership wins over an employee one, because the callers filter the
-- role after taking a single row.
create or replace function public.current_company_member()
returns public.company_members
language sql
stable
security definer
set search_path = public
as $$
  select member.*
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid()
    and member.status = 'ACTIVE'
  order by
    case member.role when 'OWNER' then 0 when 'OFFICE' then 1 else 2 end,
    member.created_at,
    member.id
  limit 1;
$$;

revoke all on function public.current_company_member() from public, anon;
grant execute on function public.current_company_member() to authenticated;

-- Hours as a German decimal, because these strings go straight into the UI.
create or replace function public.de_hours(p_minutes numeric)
returns text
language sql
immutable
as $$
  select replace(trim(to_char(round(coalesce(p_minutes, 0) / 60.0, 1), 'FM999990.0')), '.', ',');
$$;

comment on function public.de_hours(numeric) is
  'Minutes as German decimal hours ("7,5") for user-facing planning messages.';

/**
 * Why each employee can or cannot take a recurring plan.
 *
 * One row per ACTIVE employee of the plan's company. blocked_by is NULL when
 * the employee may be assigned; otherwise it names the first rule that stops
 * them, in the order the office would check them by hand: missing master data,
 * employment period, approved absence, a clashing visit, a clashing plan,
 * weekly hours. blocked_detail is the sentence the office reads.
 *
 * This is the single source of truth for eligibility --
 * auto_assign_schedule_employee picks from it, so the explanation can never
 * drift away from the decision.
 */
create or replace function public.schedule_candidate_diagnostics(p_schedule_id uuid)
returns table (
  member_id uuid,
  member_name text,
  member_since timestamptz,
  weekly_hours numeric,
  existing_minutes numeric,
  required_minutes numeric,
  blocked_by text,
  blocked_detail text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  target public.service_schedules;
  target_minutes numeric;
  window_from date;
  window_to date;
begin
  select * into actor from public.current_company_member()
  where role in ('OWNER','OFFICE') and status = 'ACTIVE';

  if actor.id is null then
    raise exception 'Planning requires OWNER or OFFICE';
  end if;

  select * into target
  from public.service_schedules
  where id = p_schedule_id and company_id = actor.company_id;

  if target.id is null then raise exception 'Schedule not found'; end if;

  select coalesce(sum(
    extract(epoch from (rule.planned_end_time - rule.planned_start_time)) / 60
  ), 0)
  into target_minutes
  from public.schedule_rules rule
  where rule.service_schedule_id = target.id
    and rule.is_active;

  -- The same windows the hardened planner used: capacity over the coming week,
  -- conflicts over the whole generated horizon.
  window_from := greatest(target.valid_from, current_date);
  window_to := least(coalesce(target.valid_until, current_date + 56), current_date + 56);

  return query
  with candidate as (
    select
      member.id as member_id,
      nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), '') as member_name,
      member.created_at as member_since,
      details.weekly_hours,
      details.employment_start_date,
      details.employment_end_date
    from public.company_members member
    join public.profiles profile on profile.id = member.profile_id
    left join public.employee_details details
      on details.company_id = member.company_id
     and details.profile_id = member.profile_id
     and details.is_active
    where member.company_id = actor.company_id
      and member.role = 'EMPLOYEE'
      and member.status = 'ACTIVE'
  ),
  load as (
    select
      candidate.*,
      coalesce((
        select sum(extract(epoch from (job.planned_end_at - job.planned_start_at)) / 60)
        from public.job_assignments assignment
        join public.jobs job on job.id = assignment.job_id
        where assignment.member_id = candidate.member_id
          and job.company_id = actor.company_id
          and job.status in ('PLANNED','CONFIRMED','IN_PROGRESS')
          and job.scheduled_date >= window_from
          and job.scheduled_date < window_from + 7
          and job.service_schedule_id is distinct from target.id
      ), 0) as existing_minutes
    from candidate
  ),
  absence_hit as (
    select
      load.member_id,
      min(occurrence::date) as first_date,
      (array_agg(absence.absence_type order by occurrence))[1] as kind
    from load
    join public.schedule_rules target_rule
      on target_rule.service_schedule_id = target.id
     and target_rule.is_active
    cross join lateral generate_series(window_from, window_to, interval '1 day') occurrence
    join public.employee_absences absence
      on absence.member_id = load.member_id
     and absence.company_id = actor.company_id
     and absence.start_date <= occurrence::date
     and absence.end_date >= occurrence::date
     and (absence.absence_type = 'SICKNESS' or absence.status = 'APPROVED')
    where extract(isodow from occurrence)::smallint = target_rule.weekday
    group by load.member_id
  ),
  job_hit as (
    select
      load.member_id,
      min(other_job.scheduled_date) as first_date
    from load
    join public.schedule_rules target_rule
      on target_rule.service_schedule_id = target.id
     and target_rule.is_active
    cross join lateral generate_series(window_from, window_to, interval '1 day') occurrence
    join public.job_assignments assignment on assignment.member_id = load.member_id
    join public.jobs other_job
      on other_job.id = assignment.job_id
     and other_job.company_id = actor.company_id
     and other_job.status in ('PLANNED','CONFIRMED','IN_PROGRESS')
     and other_job.scheduled_date = occurrence::date
     and other_job.service_schedule_id is distinct from target.id
    where extract(isodow from occurrence)::smallint = target_rule.weekday
      and ((occurrence::date + target_rule.planned_start_time) at time zone target.timezone) < other_job.planned_end_at
      and ((occurrence::date + target_rule.planned_end_time) at time zone target.timezone) > other_job.planned_start_at
    group by load.member_id
  ),
  plan_hit as (
    select
      load.member_id,
      min(other_schedule.name) as plan_name
    from load
    join public.schedule_rules target_rule
      on target_rule.service_schedule_id = target.id
     and target_rule.is_active
    join public.service_schedule_assignments assignment on assignment.member_id = load.member_id
    join public.service_schedules other_schedule
      on other_schedule.id = assignment.service_schedule_id
     and other_schedule.is_active
     and other_schedule.id <> target.id
    join public.schedule_rules other_rule
      on other_rule.service_schedule_id = other_schedule.id
     and other_rule.is_active
     and other_rule.weekday = target_rule.weekday
    where target_rule.planned_start_time < other_rule.planned_end_time
      and target_rule.planned_end_time > other_rule.planned_start_time
    group by load.member_id
  ),
  verdict as (
    select
      load.member_id,
      coalesce(load.member_name, 'Mitarbeiter ohne Namen') as member_name,
      load.member_since,
      load.weekly_hours,
      load.existing_minutes,
      target_minutes as required_minutes,
      case
        when load.weekly_hours is null or load.weekly_hours <= 0 then 'NO_HOURS'
        when load.employment_start_date is not null
         and load.employment_start_date > target.valid_from then 'EMPLOYMENT'
        when load.employment_end_date is not null
         and load.employment_end_date < coalesce(target.valid_until, target.valid_from) then 'EMPLOYMENT'
        when absence_hit.member_id is not null then 'ABSENCE'
        when job_hit.member_id is not null then 'JOB_CONFLICT'
        when plan_hit.member_id is not null then 'PLAN_CONFLICT'
        when load.existing_minutes + target_minutes > load.weekly_hours * 60 then 'HOURS'
      end as blocked_by,
      absence_hit.first_date as absence_date,
      absence_hit.kind as absence_kind,
      job_hit.first_date as job_date,
      plan_hit.plan_name
    from load
    left join absence_hit on absence_hit.member_id = load.member_id
    left join job_hit on job_hit.member_id = load.member_id
    left join plan_hit on plan_hit.member_id = load.member_id
  )
  select
    verdict.member_id,
    verdict.member_name,
    verdict.member_since,
    verdict.weekly_hours,
    verdict.existing_minutes,
    verdict.required_minutes,
    verdict.blocked_by,
    case verdict.blocked_by
      when 'NO_HOURS' then 'keine Wochen-Sollstunden hinterlegt'
      when 'EMPLOYMENT' then 'Beschäftigungszeitraum deckt den Plan nicht ab'
      when 'ABSENCE' then format(
        '%s am %s',
        case verdict.absence_kind when 'SICKNESS' then 'krankgemeldet' else 'im Urlaub' end,
        to_char(verdict.absence_date, 'DD.MM.YYYY'))
      when 'JOB_CONFLICT' then format(
        'Zeitkonflikt mit einem bestehenden Einsatz am %s',
        to_char(verdict.job_date, 'DD.MM.YYYY'))
      when 'PLAN_CONFLICT' then format(
        'Überschneidung mit dem Plan „%s"', verdict.plan_name)
      when 'HOURS' then format(
        'Wochenstunden reichen nicht (%s h verplant + %s h Plan > %s h Soll)',
        public.de_hours(verdict.existing_minutes),
        public.de_hours(verdict.required_minutes),
        public.de_hours(verdict.weekly_hours * 60))
    end as blocked_detail
  from verdict;
end;
$$;

revoke all on function public.schedule_candidate_diagnostics(uuid) from public, anon;
grant execute on function public.schedule_candidate_diagnostics(uuid) to authenticated;

-- The planner now picks from the diagnostic, so decision and explanation can
-- never disagree. The ordering is the previous one: least relative load first.
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

  if target_minutes <= 0 then return null; end if;

  select candidate.member_id into chosen
  from public.schedule_candidate_diagnostics(p_schedule_id) candidate
  where candidate.blocked_by is null
  order by
    (candidate.existing_minutes + candidate.required_minutes)
      / nullif(candidate.weekly_hours * 60, 0),
    candidate.existing_minutes,
    candidate.member_since,
    candidate.member_id
  limit 1;

  if chosen is not null then
    -- Replace the standing assignment only after a safe candidate exists.
    -- A failed re-plan must never silently unassign the current team.
    delete from public.service_schedule_assignments
    where service_schedule_id = target.id
      and member_id <> chosen;

    insert into public.service_schedule_assignments(company_id, service_schedule_id, member_id)
    values (actor.company_id, target.id, chosen)
    on conflict (service_schedule_id, member_id) do nothing;
  end if;

  return chosen;
end;
$$;

revoke all on function public.auto_assign_schedule_employee(uuid) from public, anon;
grant execute on function public.auto_assign_schedule_employee(uuid) to authenticated;

/**
 * Plan a date window and report the outcome per visit.
 *
 * Returns one row per occurrence of every active AUTO plan that overlaps
 * [p_from, p_to]: object, customer, date, time, and either the assigned
 * employee or the concrete reasons no one could take it. A plan with no active
 * weekday gets a single row with a NULL date, so it cannot disappear silently.
 *
 * Only AUTO plans are touched, and job generation is idempotent, so existing
 * visits are never removed or duplicated.
 */
create or replace function public.plan_window_automatically(p_from date, p_to date)
returns table (
  schedule_id uuid,
  schedule_name text,
  object_name text,
  customer_name text,
  visit_date date,
  planned_start_time time,
  planned_end_time time,
  outcome text,
  member_name text,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  plan record;
  chosen uuid;
  chosen_name text;
  rule_minutes numeric;
  candidate_count integer;
  blocked_reason text;
  emitted integer;
  generation_failed boolean;
begin
  select * into actor from public.current_company_member()
  where role in ('OWNER','OFFICE') and status = 'ACTIVE';

  if actor.id is null then
    raise exception 'Planning requires OWNER or OFFICE';
  end if;

  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'Invalid planning window';
  end if;

  for plan in
    select
      schedule.id,
      schedule.name,
      schedule.valid_from,
      schedule.valid_until,
      object.name as object_name,
      customer.name as customer_name
    from public.service_schedules schedule
    join public.cleaning_objects object on object.id = schedule.cleaning_object_id
    join public.customers customer on customer.id = schedule.customer_id
    where schedule.company_id = actor.company_id
      and schedule.is_active
      and schedule.assignment_mode = 'AUTO'
      and schedule.valid_from <= p_to
      and (schedule.valid_until is null or schedule.valid_until >= p_from)
    order by schedule.name
  loop
    select coalesce(sum(
      extract(epoch from (rule.planned_end_time - rule.planned_start_time)) / 60
    ), 0)
    into rule_minutes
    from public.schedule_rules rule
    where rule.service_schedule_id = plan.id
      and rule.is_active;

    chosen := null;
    chosen_name := null;
    blocked_reason := null;
    generation_failed := false;

    if rule_minutes <= 0 then
      blocked_reason := 'Der Plan hat keinen aktiven Wochentag. Bitte im wiederkehrenden Plan Tage und Zeiten hinterlegen.';
    else
      chosen := public.auto_assign_schedule_employee(plan.id);

      if chosen is null then
        select count(*) into candidate_count
        from public.schedule_candidate_diagnostics(plan.id);

        if candidate_count = 0 then
          blocked_reason := 'Es gibt keinen aktiven Mitarbeiter in diesem Betrieb.';
        else
          select string_agg(format('%s: %s', top.member_name, top.blocked_detail), ' · ')
          into blocked_reason
          from (
            select diagnostic.member_name, diagnostic.blocked_detail
            from public.schedule_candidate_diagnostics(plan.id) diagnostic
            where diagnostic.blocked_by is not null
            order by diagnostic.member_name
            limit 4
          ) top;

          blocked_reason := coalesce(
            blocked_reason,
            'Kein Mitarbeiter konnte zugewiesen werden.');

          if candidate_count > 4 then
            blocked_reason := blocked_reason || format(' · und %s weitere', candidate_count - 4);
          end if;
        end if;
      else
        select nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), '')
        into chosen_name
        from public.company_members member
        join public.profiles profile on profile.id = member.profile_id
        where member.id = chosen;

        begin
          perform public.generate_jobs_for_schedule(plan.id, p_to);
        exception when others then
          generation_failed := true;
          blocked_reason := format('Die Einsätze konnten nicht erzeugt werden (%s).', sqlerrm);
        end;
      end if;
    end if;

    emitted := 0;

    for schedule_id, schedule_name, object_name, customer_name,
        visit_date, planned_start_time, planned_end_time, outcome, member_name, reason in
      select
        plan.id,
        plan.name,
        plan.object_name,
        plan.customer_name,
        occurrence::date,
        rule.planned_start_time,
        rule.planned_end_time,
        case when chosen is null or generation_failed then 'BLOCKED' else 'ASSIGNED' end,
        chosen_name,
        blocked_reason
      from public.schedule_rules rule
      cross join lateral generate_series(
        greatest(p_from, plan.valid_from),
        least(p_to, coalesce(plan.valid_until, p_to)),
        interval '1 day'
      ) occurrence
      where rule.service_schedule_id = plan.id
        and rule.is_active
        and extract(isodow from occurrence)::smallint = rule.weekday
      order by occurrence, rule.planned_start_time
    loop
      emitted := emitted + 1;
      return next;
    end loop;

    -- A plan without an occurrence in the window still has to be visible when
    -- something is wrong with it; otherwise the office sees a silent gap.
    if emitted = 0 and blocked_reason is not null then
      schedule_id := plan.id;
      schedule_name := plan.name;
      object_name := plan.object_name;
      customer_name := plan.customer_name;
      visit_date := null;
      planned_start_time := null;
      planned_end_time := null;
      outcome := 'BLOCKED';
      member_name := null;
      reason := blocked_reason;
      return next;
    end if;
  end loop;

  return;
end;
$$;

revoke all on function public.plan_window_automatically(date, date) from public, anon;
grant execute on function public.plan_window_automatically(date, date) to authenticated;
