-- Wie weit die Einsaetze eines Plans reichen -- in der Datenbank gerechnet.
--
-- Die Planungsseite hat dafuer bisher jeden kuenftigen Einsatz des Betriebs
-- geladen und das Maximum je Plan in der Anwendung gebildet. Das waechst mit
-- dem Betrieb: bei vierzig Objekten sind das schnell mehrere tausend Zeilen bei
-- jedem Seitenaufruf. PostgREST deckelt eine Antwort, und die Abfrage hatte
-- weder Limit noch Sortierung -- es war also unbestimmt, welche Zeilen fehlen.
--
-- Fehlen die spaeten Einsaetze eines Plans, sieht er aus, als liefe er aus, und
-- die Seite warnt vor etwas, das nicht stimmt. Eine falsche Warnung ist
-- schlimmer als keine: wer ihr zweimal umsonst nachgeht, glaubt ihr beim
-- dritten Mal nicht mehr.
--
-- Nebenbei richtiggestellt: ein stornierter Einsatz ist keine Abdeckung. Bisher
-- zaehlte er mit, ein Plan mit lauter stornierten Terminen am Ende sah also
-- versorgt aus.

create or replace function public.list_schedule_coverage()
returns table (
  schedule_id uuid,
  name text,
  valid_until date,
  covered_until date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor public.company_members;
begin
  select * into actor from public.current_company_member()
  where role in ('OWNER','OFFICE') and status = 'ACTIVE';

  if actor.id is null then
    raise exception 'Planning requires OWNER or OFFICE';
  end if;

  return query
  select
    schedule.id,
    schedule.name,
    schedule.valid_until,
    (
      select max(job.scheduled_date)
      from public.jobs job
      where job.service_schedule_id = schedule.id
        and job.company_id = actor.company_id
        and job.scheduled_date >= current_date
        and job.status <> 'CANCELLED'
    )
  from public.service_schedules schedule
  where schedule.company_id = actor.company_id
    and schedule.is_active;
end;
$$;

revoke all on function public.list_schedule_coverage() from public, anon;
grant execute on function public.list_schedule_coverage() to authenticated;

-- Betroffene Einsaetze samt Vertretungsvorschlaegen in einem Aufruf.
--
-- Die Anwendung hat bisher erst die betroffenen Einsaetze geholt und dann je
-- Einsatz einen weiteren Aufruf fuer die Vorschlaege gemacht. In einer
-- Grippewoche sind das dutzende Rundreisen bei jedem Aufruf der Planungsseite,
-- und die Seite wartet auf die langsamste davon.
--
-- Dieselben Regeln wie list_replacement_candidates -- die Funktion bleibt
-- bestehen und wird weiter einzeln verwendet, etwa nachdem eine Vertretung
-- gesetzt wurde.
create or replace function public.list_absence_affected_with_candidates(
  p_from date default current_date,
  p_to date default null
)
returns table (
  job_id uuid,
  job_title text,
  scheduled_date date,
  member_id uuid,
  first_name text,
  last_name text,
  absence_type public.absence_type,
  candidates jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    affected.job_id,
    affected.job_title,
    affected.scheduled_date,
    affected.member_id,
    affected.first_name,
    affected.last_name,
    affected.absence_type,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id', candidate.member_id,
        'first_name', candidate.first_name,
        'last_name', candidate.last_name
      ) order by candidate.last_name, candidate.first_name)
      from public.list_replacement_candidates(affected.job_id) candidate
    ), '[]'::jsonb)
  from public.list_absence_affected_assignments(p_from, p_to) affected;
$$;

revoke all on function public.list_absence_affected_with_candidates(date, date) from public, anon;
grant execute on function public.list_absence_affected_with_candidates(date, date) to authenticated;
