-- Zeiterfassung ohne Empfang.
--
-- Die Checkliste liess sich im Keller abhaken, die Uhr nicht: ohne Verbindung
-- waren Start, Pause, Fortsetzen und Feierabend schlicht deaktiviert. Genau
-- die Funktion, von der die Bezahlung abhaengt, war die einzige, die eine
-- Verbindung brauchte. Wer in einer Tiefgarage anfaengt, hat entweder keine
-- Zeit erfasst oder erfasst sie zu spaet -- beides falsch.
--
-- Die vier Funktionen nehmen jetzt einen Zeitpunkt entgegen. Ohne Angabe
-- bleibt alles wie bisher (now()); mit Angabe stammt er aus der Warteschlange
-- des Telefons.
--
-- Ein vom Geraet gelieferter Zeitpunkt ist eine Behauptung, keine Messung,
-- deshalb wird er eng gefuehrt:
--   * nicht in der Zukunft (zwei Minuten Toleranz fuer ungenaue Uhren),
--   * nicht aelter als 48 Stunden,
--   * und er wird als OFFLINE vermerkt, damit im Monatsabschluss sichtbar
--     bleibt, welcher Eintrag nachgetragen wurde.

alter type public.time_entry_source add value if not exists 'OFFLINE';

/**
 * Der wirksame Zeitpunkt einer Zeitbuchung.
 *
 * Gibt zurueck, was eingetragen werden darf, oder bricht mit einer Begruendung
 * ab, die bis in die App durchgereicht wird.
 */
create or replace function public.effective_entry_time(p_at timestamptz)
returns timestamptz
language plpgsql
immutable
set search_path = public
as $$
begin
  if p_at is null then return now(); end if;
  -- Die Uhr eines Telefons geht gern ein paar Sekunden vor. Zwei Minuten
  -- Vorlauf werden auf jetzt zurueckgesetzt statt abgelehnt; alles darueber
  -- ist kein Gangfehler mehr.
  if p_at > now() + interval '2 minutes' then
    raise exception 'Der uebermittelte Zeitpunkt liegt in der Zukunft.';
  end if;
  if p_at < now() - interval '48 hours' then
    raise exception 'Der uebermittelte Zeitpunkt ist aelter als 48 Stunden und wird nicht mehr nachgetragen.';
  end if;
  return least(p_at, now());
end;
$$;

comment on function public.effective_entry_time(timestamptz) is
  'Prueft einen vom Geraet gelieferten Zeitpunkt fuer eine nachgetragene Zeitbuchung.';

-- Ein Parameter mit Vorgabewert laesst sich nicht per create or replace
-- ergaenzen -- das erzeugt eine zweite Ueberladung. Also ersetzen.
drop function if exists public.start_my_job(uuid);
drop function if exists public.stop_my_job(uuid);
drop function if exists public.pause_my_job(uuid);
drop function if exists public.resume_my_job(uuid);

create or replace function public.start_my_job(p_job_id uuid, p_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  job public.jobs;
  entry_id uuid;
  at_time timestamptz := public.effective_entry_time(p_at);
  source public.time_entry_source := case when p_at is null then 'APP' else 'OFFLINE' end;
begin
  select * into actor from public.current_employee_member();
  if actor.id is null then raise exception 'Employee role required'; end if;

  select * into job from public.jobs where id = p_job_id for update;
  if job.id is null or not exists (
    select 1 from public.job_assignments assignment
    where assignment.job_id = job.id and assignment.member_id = actor.id
  ) then
    raise exception 'Job is not assigned to current employee';
  end if;

  -- Zuerst: wurde diese Buchung schon einmal zugestellt? Eine Warteschlange
  -- kann denselben Start ein zweites Mal liefern, etwa wenn die Verbindung
  -- mitten in der Antwort abreisst. Dann ist der Einsatz laengst gestartet --
  -- oder sogar schon abgeschlossen -- und die richtige Antwort ist die
  -- vorhandene Buchung, keine Fehlermeldung.
  if p_at is not null then
    select id into entry_id from public.job_time_entries
    where job_id = job.id and member_id = actor.id
    order by started_at limit 1;
    if entry_id is not null then return entry_id; end if;
  end if;

  if job.status not in ('PLANNED', 'CONFIRMED', 'IN_PROGRESS') then
    raise exception 'Job cannot be started';
  end if;

  if exists (
    select 1
    from public.service_records record
    where record.job_id = job.id
      and record.acceptance_policy = 'VOR_ORT_UNTERSCHRIFT'
      and record.status = 'ABNAHME_AUSSTEHEND'
  ) then
    raise exception 'On-site customer acceptance is pending';
  end if;

  if exists (
    select 1 from public.job_time_entries entry
    where entry.member_id = actor.id and entry.finished_at is null
  ) then
    raise exception 'Another active job must be ended first';
  end if;

  insert into public.job_time_entries (company_id, job_id, member_id, started_at, start_source)
  values (job.company_id, job.id, actor.id, at_time, source)
  returning id into entry_id;

  update public.jobs
  set status = 'IN_PROGRESS'
  where id = job.id and status in ('PLANNED', 'CONFIRMED');

  return entry_id;
end;
$$;

create or replace function public.stop_my_job(p_job_id uuid, p_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  entry public.job_time_entries;
  policy public.acceptance_policy;
  at_time timestamptz := public.effective_entry_time(p_at);
  source public.time_entry_source := case when p_at is null then 'APP' else 'OFFLINE' end;
begin
  select * into actor from public.current_employee_member();
  if actor.id is null then raise exception 'Employee role required'; end if;

  select * into entry
  from public.job_time_entries
  where job_id = p_job_id
    and member_id = actor.id
    and finished_at is null
  for update;

  -- Eine bereits beendete Buchung ist kein Fehler, sondern eine zweite
  -- Zustellung derselben Warteschlange.
  if entry.id is null then
    if p_at is not null then
      select id into entry.id from public.job_time_entries
      where job_id = p_job_id and member_id = actor.id
      order by started_at desc limit 1;
      if entry.id is not null then return entry.id; end if;
    end if;
    raise exception 'No active time entry found';
  end if;

  -- Die Checkliste zuerst: das ist die Regel, wegen der ein Feierabend
  -- abgelehnt wird, und sie gehoert in die Meldung, nicht eine Zeitfrage.
  if exists (
    select 1
    from public.job_checklists list
    join public.job_checklist_items item on item.job_checklist_id = list.id
    where list.job_id = p_job_id
      and item.is_required
      and item.completed_at is null
  ) then
    raise exception 'Required checklist items are incomplete';
  end if;

  -- Nur fuer einen nachgetragenen Zeitpunkt. Im Live-Betrieb liegen Start und
  -- Feierabend in zwei Anfragen und damit ohnehin auseinander; dort wacht die
  -- Tabellenbedingung finished_at > started_at.
  if p_at is not null and at_time <= entry.started_at then
    raise exception 'Der Feierabend liegt vor dem Arbeitsbeginn.';
  end if;

  update public.job_time_breaks
  set ended_at = least(at_time, now())
  where time_entry_id = entry.id and ended_at is null;

  update public.job_time_entries
  set finished_at = at_time, end_source = source
  where id = entry.id;

  if not exists (
    select 1
    from public.job_assignments assignment
    where assignment.job_id = p_job_id
      and not exists (
        select 1
        from public.job_time_entries time_entry
        where time_entry.job_id = p_job_id
          and time_entry.member_id = assignment.member_id
          and time_entry.finished_at is not null
      )
  ) then
    policy := public.resolve_acceptance_policy(p_job_id);

    if policy = 'VOR_ORT_UNTERSCHRIFT' then
      -- Die Arbeitszeit ist zu Ende, der Einsatz aber erst mit der
      -- Unterschrift der Kundin.
      perform public.build_service_record(p_job_id);
    else
      update public.jobs set status = 'COMPLETED' where id = p_job_id;
      perform public.build_service_record(p_job_id);
    end if;
  end if;

  return entry.id;
end;
$$;

create or replace function public.pause_my_job(p_job_id uuid, p_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  entry public.job_time_entries;
  break_id uuid;
  at_time timestamptz := public.effective_entry_time(p_at);
begin
  select * into actor from public.current_employee_member();
  if actor.id is null then raise exception 'Employee role required'; end if;

  select * into entry from public.job_time_entries
  where job_id = p_job_id and member_id = actor.id and finished_at is null for update;
  if entry.id is null then raise exception 'No active time entry found'; end if;

  if exists (select 1 from public.job_time_breaks where time_entry_id = entry.id and ended_at is null) then
    -- Schon pausiert: eine erneut zugestellte Buchung meldet die laufende Pause
    -- zurueck, statt eine zweite anzulegen.
    if p_at is not null then
      select id into break_id from public.job_time_breaks
      where time_entry_id = entry.id and ended_at is null limit 1;
      return break_id;
    end if;
    raise exception 'A break is already running';
  end if;

  if at_time < entry.started_at then
    raise exception 'Die Pause liegt vor dem Arbeitsbeginn.';
  end if;

  insert into public.job_time_breaks (company_id, time_entry_id, started_at)
  values (entry.company_id, entry.id, at_time)
  returning id into break_id;
  return break_id;
end;
$$;

create or replace function public.resume_my_job(p_job_id uuid, p_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  entry public.job_time_entries;
  break_row public.job_time_breaks;
  break_id uuid;
  at_time timestamptz := public.effective_entry_time(p_at);
begin
  select * into actor from public.current_employee_member();
  if actor.id is null then raise exception 'Employee role required'; end if;

  select * into entry from public.job_time_entries
  where job_id = p_job_id and member_id = actor.id and finished_at is null for update;
  if entry.id is null then raise exception 'No active time entry found'; end if;

  select * into break_row from public.job_time_breaks
  where time_entry_id = entry.id and ended_at is null limit 1;

  if break_row.id is null then
    -- Keine laufende Pause: erneut zugestellt, nichts zu tun.
    if p_at is not null then
      select id into break_id from public.job_time_breaks
      where time_entry_id = entry.id order by started_at desc limit 1;
      if break_id is not null then return break_id; end if;
    end if;
    raise exception 'No break is running';
  end if;

  -- Die Tabelle erlaubt ended_at >= started_at, also auch eine Pause von null
  -- Minuten: zweimal kurz hintereinander getippt ist kein Fehler, sondern eine
  -- Pause, die keine war. Abgelehnt wird nur, was wirklich davor liegt.
  if at_time < break_row.started_at then
    raise exception 'Das Ende der Pause liegt vor ihrem Beginn.';
  end if;

  update public.job_time_breaks set ended_at = at_time where id = break_row.id
  returning id into break_id;

  -- Den Eintrag anfassen, damit der Trigger break_minutes neu rechnet.
  update public.job_time_entries set break_minutes = break_minutes where id = entry.id;
  return break_id;
end;
$$;

revoke all on function
  public.start_my_job(uuid, timestamptz),
  public.stop_my_job(uuid, timestamptz),
  public.pause_my_job(uuid, timestamptz),
  public.resume_my_job(uuid, timestamptz),
  public.effective_entry_time(timestamptz)
from public, anon;

grant execute on function
  public.start_my_job(uuid, timestamptz),
  public.stop_my_job(uuid, timestamptz),
  public.pause_my_job(uuid, timestamptz),
  public.resume_my_job(uuid, timestamptz)
to authenticated;
