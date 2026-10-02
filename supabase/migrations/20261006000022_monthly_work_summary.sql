-- Monatsabschluss: the hours each employee worked in a month, and whether that
-- is above or below what was agreed.
--
-- Deliberately NOT a payroll run. Nothing here computes wages, tax or social
-- contributions: those belong to the Lohnbüro or the Steuerberater, and a
-- cleaning company's operations software has no business guessing at them. What
-- this produces is the input those people ask for every month — hours per
-- employee, and the daily record behind them — so the office stops rebuilding
-- it by hand in a spreadsheet.
--
-- It is also the record §17 MiLoG requires for this industry: start, end and
-- duration of each day's work, kept per employee. list_monthly_work_days
-- returns exactly that.

/**
 * Easter Sunday, by the Gauss/Meeus algorithm. Needed because four of the nine
 * nationwide holidays are defined relative to it, and a Soll figure that
 * ignores Karfreitag or Christi Himmelfahrt reports invented Minusstunden every
 * spring.
 */
create or replace function public.easter_sunday(p_year integer)
returns date language sql immutable as $$
  with g as (
    select
      p_year % 19 as a,
      p_year / 100 as b,
      p_year % 100 as c
  ), h as (
    select a, b, c, b / 4 as d, b % 4 as e, (b + 8) / 25 as f from g
  ), i as (
    select a, b, c, d, e, f, (b - f + 1) / 3 as gg from h
  ), j as (
    select a, c, d, e, gg, (19 * a + b - d - gg + 15) % 30 as hh from i
  ), k as (
    select a, hh, c / 4 as ii, c % 4 as kk, e, d, gg from j
  ), l as (
    select a, hh, ii, kk, (32 + 2 * e + 2 * ii - hh - kk) % 7 as ll from k
  ), m as (
    select hh, ll, (a + 11 * hh + 22 * ll) / 451 as mm from l
  )
  select make_date(p_year, (hh + ll - 7 * mm + 114) / 31, ((hh + ll - 7 * mm + 114) % 31) + 1)
  from m;
$$;

/**
 * The nine holidays that are public holidays in every Bundesland.
 *
 * Bundesland-specific days — Heilige Drei Könige, Fronleichnam, Allerheiligen
 * and the rest — are deliberately not here. Including some states' holidays and
 * not others' would make the Soll wrong in a way nobody could see, whereas
 * leaving them all out is wrong in one direction that the office knows about
 * and the screen says out loud.
 */
create or replace function public.german_public_holidays(p_year integer)
returns table (holiday date, label text) language sql immutable as $$
  select * from (values
    (make_date(p_year, 1, 1), 'Neujahr'),
    (public.easter_sunday(p_year) - 2, 'Karfreitag'),
    (public.easter_sunday(p_year) + 1, 'Ostermontag'),
    (make_date(p_year, 5, 1), 'Tag der Arbeit'),
    (public.easter_sunday(p_year) + 39, 'Christi Himmelfahrt'),
    (public.easter_sunday(p_year) + 50, 'Pfingstmontag'),
    (make_date(p_year, 10, 3), 'Tag der Deutschen Einheit'),
    (make_date(p_year, 12, 25), '1. Weihnachtstag'),
    (make_date(p_year, 12, 26), '2. Weihnachtstag')
  ) as t(holiday, label);
$$;

/** Monday–Friday in the month, minus the nationwide holidays that fall on one. */
create or replace function public.working_days_in_month(p_month date)
returns integer language sql stable as $$
  select count(*)::integer
  from generate_series(date_trunc('month', p_month)::date,
                       (date_trunc('month', p_month) + interval '1 month - 1 day')::date,
                       interval '1 day') as day
  where extract(isodow from day) < 6
    and day::date not in (select holiday from public.german_public_holidays(extract(year from p_month)::integer));
$$;

/**
 * One month for one employee.
 *
 * `target_minutes` is null when no weekly hours are recorded for that employee.
 * It is not zero and it is not guessed: without an agreed week there is no
 * Soll, so there is no overtime to claim either, and the caller is told so
 * rather than being handed a number that looks authoritative.
 */
create or replace function public.member_month_figures(p_member uuid, p_month date)
returns table (
  worked_minutes integer,
  break_minutes integer,
  days_worked integer,
  vacation_days integer,
  sick_days integer,
  target_minutes integer
) language sql stable security definer set search_path = public as $$
  with bounds as (
    select date_trunc('month', p_month)::date as first_day,
           (date_trunc('month', p_month) + interval '1 month - 1 day')::date as last_day
  ),
  entries as (
    select
      coalesce(sum(entry.duration_minutes), 0)::integer as worked,
      coalesce(sum(entry.break_minutes), 0)::integer as breaks,
      count(distinct (entry.started_at at time zone 'Europe/Berlin')::date)::integer as days
    from public.job_time_entries entry, bounds
    where entry.member_id = p_member
      and entry.finished_at is not null
      and (entry.started_at at time zone 'Europe/Berlin')::date between bounds.first_day and bounds.last_day
  ),
  -- Absence days only count when they land on a day that would have been
  -- worked, so a holiday inside a week of leave is not deducted twice.
  absence_days as (
    select
      count(*) filter (where absence.absence_type = 'VACATION')::integer as vacation,
      count(*) filter (where absence.absence_type = 'SICKNESS')::integer as sick
    from public.employee_absences absence
    cross join bounds
    cross join lateral generate_series(
      greatest(absence.start_date, bounds.first_day),
      least(absence.end_date, bounds.last_day),
      interval '1 day'
    ) as day
    where absence.member_id = p_member
      and absence.status = 'APPROVED'
      and extract(isodow from day) < 6
      and day::date not in (select holiday from public.german_public_holidays(extract(year from p_month)::integer))
  ),
  agreed as (
    select detail.weekly_hours
    from public.company_members member
    join public.employee_details detail on detail.profile_id = member.profile_id and detail.company_id = member.company_id
    where member.id = p_member
  )
  select
    entries.worked,
    entries.breaks,
    entries.days,
    absence_days.vacation,
    absence_days.sick,
    case
      when agreed.weekly_hours is null or agreed.weekly_hours = 0 then null
      else round(
        (public.working_days_in_month(p_month) - absence_days.vacation - absence_days.sick)
        * (agreed.weekly_hours / 5.0) * 60
      )::integer
    end
  from entries, absence_days, bounds
  left join agreed on true;
$$;

/** Every active employee's month. Office and owner only. */
create or replace function public.list_monthly_work_summary(p_month date)
returns table (
  member_id uuid,
  employee_name text,
  employee_number text,
  weekly_hours numeric,
  worked_minutes integer,
  break_minutes integer,
  days_worked integer,
  vacation_days integer,
  sick_days integer,
  target_minutes integer
) language sql stable security definer set search_path = public as $$
  select
    member.id,
    trim(coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '')),
    detail.employee_number,
    detail.weekly_hours,
    figures.worked_minutes,
    figures.break_minutes,
    figures.days_worked,
    figures.vacation_days,
    figures.sick_days,
    figures.target_minutes
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  left join public.employee_details detail
    on detail.profile_id = member.profile_id and detail.company_id = member.company_id
  cross join lateral public.member_month_figures(member.id, p_month) figures
  where public.is_company_staff(member.company_id)
    and member.role = 'EMPLOYEE'
    and member.status = 'ACTIVE'
  order by 2;
$$;

/**
 * The employee's own month.
 *
 * Their hours are their own record and they are entitled to see them; nobody
 * else's appear here, and nothing about pay does.
 */
create or replace function public.my_monthly_work_summary(p_month date)
returns table (
  worked_minutes integer,
  break_minutes integer,
  days_worked integer,
  vacation_days integer,
  sick_days integer,
  target_minutes integer
) language sql stable security definer set search_path = public as $$
  select figures.*
  from public.current_employee_member() member
  cross join lateral public.member_month_figures(member.id, p_month) figures;
$$;

/**
 * The daily record behind a month, for one employee or for all of them.
 *
 * This is the shape a Lohnbüro asks for and the shape §17 MiLoG requires:
 * one row per employee per day, with first start, last end and net duration.
 */
create or replace function public.list_monthly_work_days(p_month date, p_member uuid default null)
returns table (
  member_id uuid,
  employee_name text,
  employee_number text,
  work_date date,
  first_start timestamptz,
  last_end timestamptz,
  worked_minutes integer,
  break_minutes integer
) language sql stable security definer set search_path = public as $$
  with bounds as (
    select date_trunc('month', p_month)::date as first_day,
           (date_trunc('month', p_month) + interval '1 month - 1 day')::date as last_day
  )
  select
    member.id,
    trim(coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '')),
    detail.employee_number,
    (entry.started_at at time zone 'Europe/Berlin')::date,
    min(entry.started_at),
    max(entry.finished_at),
    sum(entry.duration_minutes)::integer,
    sum(entry.break_minutes)::integer
  from public.job_time_entries entry
  join public.company_members member on member.id = entry.member_id
  join public.profiles profile on profile.id = member.profile_id
  left join public.employee_details detail
    on detail.profile_id = member.profile_id and detail.company_id = member.company_id
  cross join bounds
  where public.is_company_staff(entry.company_id)
    and entry.finished_at is not null
    and (p_member is null or entry.member_id = p_member)
    and (entry.started_at at time zone 'Europe/Berlin')::date between bounds.first_day and bounds.last_day
  group by 1, 2, 3, 4
  order by 2, 4;
$$;

revoke all on function public.member_month_figures(uuid, date) from public, anon;
revoke all on function public.list_monthly_work_summary(date) from public, anon;
revoke all on function public.my_monthly_work_summary(date) from public, anon;
revoke all on function public.list_monthly_work_days(date, uuid) from public, anon;
grant execute on function public.member_month_figures(uuid, date) to authenticated;
grant execute on function public.list_monthly_work_summary(date) to authenticated;
grant execute on function public.my_monthly_work_summary(date) to authenticated;
grant execute on function public.list_monthly_work_days(date, uuid) to authenticated;
