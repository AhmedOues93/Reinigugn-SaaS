-- Zwei offene Punkte aus dem Audit, die beide dieselbe Frage betreffen: ist
-- der Betrieb arbeitsfaehig, und wie voll ist er?
--
-- 1. Soll und Ist samt Auslastung fuer das Dashboard.
-- 2. Die Einrichtung endete beim ersten Angebot. Ein Angebot ist aber kein
--    Einsatz; arbeitsfaehig ist ein Betrieb erst, wenn im Plan etwas steht.

-- ---------------------------------------------------------------------------
-- 1. Arbeitstage in einem beliebigen Zeitraum
-- ---------------------------------------------------------------------------
--
-- Bisher gab es nur `working_days_in_month`. Fuer das Dashboard braucht es den
-- angebrochenen Monat: Ist-Stunden bis heute gegen das Soll des ganzen Monats
-- zu stellen heisst, jeden Betrieb am Zwoelften bei vierzig Prozent zu zeigen.
-- Das waere eine Zahl, die aussieht wie ein Befund und keiner ist.

create or replace function public.working_days_between(p_from date, p_to date)
returns integer language sql stable as $$
  select case when p_to < p_from then 0 else (
    select count(*)::integer
    from generate_series(p_from, p_to, interval '1 day') as day
    where extract(isodow from day) < 6
      and day::date not in (
        select holiday
        from generate_series(
               extract(year from p_from)::integer,
               extract(year from p_to)::integer
             ) as year,
             lateral public.german_public_holidays(year::integer)
      )
  ) end;
$$;

-- Der Monat ist jetzt der Sonderfall des Zeitraums und keine zweite Rechnung.
-- Gleiche Signatur, gleiches Ergebnis; die Suiten halten das fest.
create or replace function public.working_days_in_month(p_month date)
returns integer language sql stable as $$
  select public.working_days_between(
    date_trunc('month', p_month)::date,
    (date_trunc('month', p_month) + interval '1 month - 1 day')::date
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Soll, Ist und Auslastung fuer den laufenden Monat
-- ---------------------------------------------------------------------------
--
-- Drei Zahlen, drei verschiedene Fragen, und sie werden hier bewusst getrennt
-- gehalten:
--
--   target_minutes_to_date -- was bis heute vereinbart war
--   worked_minutes         -- was bis heute erfasst wurde
--   planned_minutes        -- was fuer den ganzen Monat im Plan steht
--
-- Geplant wird pro Zuweisung gezaehlt: ein Einsatz mit zwei Personen kostet
-- zwei Mal die Dauer. Ein Einsatz ohne Zuweisung kostet niemanden -- er steht
-- getrennt daneben, weil genau das die Luecke ist, die jemand schliessen muss.
--
-- `target_minutes_to_date` ist null, wenn fuer keine aktive Mitarbeiterin
-- Wochenstunden hinterlegt sind. Dann gibt es kein Soll, und eine Auslastung
-- waere ausgedacht.

create or replace function public.company_capacity_snapshot(p_month date default current_date)
returns table (
  as_of date,
  employees integer,
  employees_with_target integer,
  target_minutes_to_date bigint,
  target_minutes_month bigint,
  worked_minutes bigint,
  planned_minutes bigint,
  unassigned_planned_minutes bigint
)
language sql stable security definer set search_path = public as $$
  with actor as (
    select member.company_id
    from public.company_members member
    join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = auth.uid()
      and member.status = 'ACTIVE'
      and member.role in ('OWNER', 'OFFICE')
    limit 1
  ),
  bounds as (
    select
      actor.company_id,
      date_trunc('month', p_month)::date as first_day,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as last_day,
      -- Im laufenden Monat bis heute, in einem vergangenen bis zum Monatsende,
      -- in einem kuenftigen gar nicht.
      least(
        (date_trunc('month', p_month) + interval '1 month - 1 day')::date,
        (now() at time zone 'Europe/Berlin')::date
      ) as as_of
    from actor
  ),
  staff as (
    select member.id as member_id, detail.weekly_hours
    from bounds
    join public.company_members member on member.company_id = bounds.company_id
    left join public.employee_details detail
      on detail.profile_id = member.profile_id and detail.company_id = member.company_id
    where member.role = 'EMPLOYEE' and member.status = 'ACTIVE'
  ),
  -- Genehmigte Abwesenheit senkt das Soll, aber nur an Tagen, die ohnehin
  -- Arbeitstage waren. Dieselbe Regel wie im Monatsabschluss.
  absence as (
    select
      staff.member_id,
      count(*) filter (where day::date <= bounds.as_of)::integer as days_to_date,
      count(*)::integer as days_month
    from staff
    cross join bounds
    join public.employee_absences entry on entry.member_id = staff.member_id and entry.status = 'APPROVED'
    cross join lateral generate_series(
      greatest(entry.start_date, bounds.first_day),
      least(entry.end_date, bounds.last_day),
      interval '1 day'
    ) as day
    where extract(isodow from day) < 6
      and day::date not in (
        select holiday from public.german_public_holidays(extract(year from bounds.first_day)::integer)
      )
    group by staff.member_id
  ),
  target as (
    select
      count(*)::integer as employees,
      count(*) filter (where coalesce(staff.weekly_hours, 0) > 0)::integer as with_target,
      sum(
        case when coalesce(staff.weekly_hours, 0) = 0 then null
        else round(
          greatest(
            0,
            public.working_days_between(bounds.first_day, bounds.as_of) - coalesce(absence.days_to_date, 0)
          ) * (staff.weekly_hours / 5.0) * 60
        ) end
      )::bigint as to_date,
      sum(
        case when coalesce(staff.weekly_hours, 0) = 0 then null
        else round(
          greatest(
            0,
            public.working_days_between(bounds.first_day, bounds.last_day) - coalesce(absence.days_month, 0)
          ) * (staff.weekly_hours / 5.0) * 60
        ) end
      )::bigint as month
    from staff
    cross join bounds
    left join absence on absence.member_id = staff.member_id
  ),
  worked as (
    select coalesce(sum(entry.duration_minutes), 0)::bigint as minutes
    from bounds
    join public.job_time_entries entry on entry.company_id = bounds.company_id
    where entry.finished_at is not null
      and (entry.started_at at time zone 'Europe/Berlin')::date between bounds.first_day and bounds.as_of
  ),
  planned as (
    select
      coalesce(sum(
        case when assigned.count > 0 then assigned.count else 0 end
        * (extract(epoch from (job.planned_end_at - job.planned_start_at)) / 60)
      ), 0)::bigint as assigned_minutes,
      coalesce(sum(
        case when assigned.count = 0
          then extract(epoch from (job.planned_end_at - job.planned_start_at)) / 60
          else 0 end
      ), 0)::bigint as open_minutes
    from bounds
    join public.jobs job on job.company_id = bounds.company_id
    cross join lateral (
      select count(*)::integer as count
      from public.job_assignments assignment
      where assignment.job_id = job.id
    ) assigned
    where job.status not in ('CANCELLED', 'MISSED')
      and job.scheduled_date between bounds.first_day and bounds.last_day
  )
  select
    bounds.as_of,
    target.employees,
    target.with_target,
    target.to_date,
    target.month,
    worked.minutes,
    planned.assigned_minutes,
    planned.open_minutes
  from bounds, target, worked, planned;
$$;

revoke all on function public.company_capacity_snapshot(date) from public, anon;
grant execute on function public.company_capacity_snapshot(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Die Einrichtung reicht bis zum ersten geplanten Einsatz
-- ---------------------------------------------------------------------------
--
-- Bisher endete die Liste beim ersten Angebot. Ein versandtes Angebot ist aber
-- noch keine geleistete Arbeit: dazwischen liegen der wiederkehrende Plan und
-- der Einsatz, der daraus entsteht. Wer nach der Einrichtung in ein leeres
-- Planungsfenster schaut, haelt das Produkt fuer kaputt.
--
-- Zwei Spalten mehr, also ein DROP vorweg -- `create or replace` lehnt eine
-- geaenderte Rueckgabeliste ab.

drop function if exists public.get_onboarding_status();

create or replace function public.get_onboarding_status()
returns table (
  onboarding_completed_at timestamptz,
  steps text[],
  service_focus text[],
  has_company_address boolean,
  has_tax_details boolean,
  has_calculation_defaults boolean,
  has_catalog boolean,
  has_customer boolean,
  has_object boolean,
  has_employee boolean,
  has_survey boolean,
  has_calculation boolean,
  has_quote boolean,
  has_schedule boolean,
  has_planned_job boolean
)
language sql stable security definer set search_path = public as $$
  select
    company.onboarding_completed_at,
    company.onboarding_steps,
    company.service_focus,
    company.street is not null and company.city is not null,
    company.tax_number is not null or company.vat_id is not null,
    coalesce(defaults.wage_cents_per_hour, 0) > 0,
    exists (select 1 from public.service_catalog_items item
            where item.company_id = company.id and item.is_active),
    exists (select 1 from public.customers c where c.company_id = company.id),
    exists (select 1 from public.cleaning_objects o where o.company_id = company.id),
    exists (select 1 from public.company_members m
            where m.company_id = company.id and m.role in ('OFFICE', 'EMPLOYEE')),
    exists (select 1 from public.site_surveys s where s.company_id = company.id),
    exists (select 1 from public.calculations c where c.company_id = company.id),
    exists (select 1 from public.quotes q where q.company_id = company.id),
    exists (select 1 from public.service_schedules sch
            where sch.company_id = company.id and sch.is_active),
    -- Ein Einsatz, der noch bevorsteht. Ein abgearbeiteter von letztem Monat
    -- beweist nicht, dass der Plan weiterlaeuft.
    exists (select 1 from public.jobs job
            where job.company_id = company.id
              and job.status not in ('CANCELLED', 'MISSED')
              and job.scheduled_date >= (now() at time zone 'Europe/Berlin')::date)
  from public.sales_actor() actor
  join public.companies company on company.id = actor.company_id
  left join public.company_calculation_defaults defaults on defaults.company_id = company.id;
$$;

revoke all on function public.get_onboarding_status() from public, anon;
grant execute on function public.get_onboarding_status() to authenticated;
