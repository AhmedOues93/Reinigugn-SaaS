-- Das Soll eines laufenden Monats endet heute, nicht am Monatsletzten.
--
-- member_month_figures rechnete das Soll ueber alle Arbeitstage des Monats,
-- auch ueber die, die noch bevorstehen. Am 25. eines Monats mit 22 Arbeitstagen
-- standen damit 22 Tage Soll gegen 18 gearbeitete Tage, und jede Person im
-- Betrieb erschien mit Minusstunden, ohne etwas versaeumt zu haben. Ein
-- kuenftiger Monat meldete sogar das volle Soll bei null Iststunden.
--
-- Abgeschlossene Monate rechnen unveraendert ueber den ganzen Monat; nur der
-- laufende endet am heutigen Tag. Genehmigte Abwesenheiten werden auf dasselbe
-- Fenster begrenzt, sonst senkte ein fuer naechste Woche bewilligter Urlaub das
-- Soll von Tagen, die noch gar nicht zaehlen.

/** Mo–Fr im Zeitraum, ohne die bundesweiten Feiertage. */
create or replace function public.working_days_between(p_from date, p_to date)
returns integer language sql stable as $$
  select case when p_to < p_from then 0 else (
    select count(*)::integer
    from generate_series(p_from, p_to, interval '1 day') as day
    where extract(isodow from day) < 6
      and day::date not in (
        select holiday from public.german_public_holidays(extract(year from day)::integer))
  ) end;
$$;

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
    select
      date_trunc('month', p_month)::date as first_day,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as last_day,
      -- Der laufende Monat endet heute; ein vergangener am Monatsletzten.
      least(
        (date_trunc('month', p_month) + interval '1 month - 1 day')::date,
        (now() at time zone 'Europe/Berlin')::date
      ) as counted_until
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
  absence_days as (
    select
      count(*) filter (where absence.absence_type = 'VACATION')::integer as vacation,
      count(*) filter (where absence.absence_type = 'SICKNESS')::integer as sick
    from public.employee_absences absence
    cross join bounds
    cross join lateral generate_series(
      greatest(absence.start_date, bounds.first_day),
      least(absence.end_date, bounds.counted_until),
      interval '1 day'
    ) as day
    where absence.member_id = p_member
      and absence.status = 'APPROVED'
      and extract(isodow from day) < 6
      and day::date not in (
        select holiday from public.german_public_holidays(extract(year from p_month)::integer))
  ),
  agreed as (
    select detail.weekly_hours
    from public.company_members member
    join public.employee_details detail
      on detail.profile_id = member.profile_id and detail.company_id = member.company_id
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
        (public.working_days_between(bounds.first_day, bounds.counted_until)
         - absence_days.vacation - absence_days.sick)
        * (agreed.weekly_hours / 5.0) * 60
      )::integer
    end
  from entries, absence_days, bounds
  left join agreed on true;
$$;

revoke all on function public.working_days_between(date, date) from public, anon;
grant execute on function public.working_days_between(date, date) to authenticated;
