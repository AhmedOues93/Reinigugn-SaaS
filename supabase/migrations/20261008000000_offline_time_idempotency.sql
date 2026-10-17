-- Die Wiedererkennung einer nachgetragenen Zeitbuchung war zu grob.
--
-- Nachgemessen an einem Einsatz mit zwei zugewiesenen Kraeften, auf einer
-- vollstaendig migrierten Datenbank:
--
--   Kraft A arbeitet die Frueh­schicht, 60 Minuten, und tippt Feierabend.
--   Der Einsatz bleibt IN_PROGRESS, weil Kraft B noch nicht fertig ist.
--   Kraft A kommt nachmittags wieder, ohne Empfang: Start und Feierabend
--   gehen in die Warteschlange und werden spaeter zugestellt.
--
--   Ergebnis vorher: ein Eintrag, 60 Minuten. Beide Buchungen des Nachmittags
--   gaben die Kennung des Vormittags zurueck -- ohne Fehler, ohne Hinweis.
--   Zwei Stunden Arbeit waren weg, und zwar unbemerkt auf beiden Seiten.
--
-- Dieselbe zweite Schicht *mit* Empfang legte dagegen einen zweiten Eintrag
-- an. Der Unterschied lag allein in der Wiedererkennung: sie fragte, ob es zu
-- diesem Einsatz *ueberhaupt schon* einen Eintrag gibt, und nicht, ob genau
-- diese Buchung schon einmal zugestellt wurde.
--
-- Hier wird sie an den uebermittelten Zeitpunkt gebunden. Eine zweite
-- Zustellung traegt denselben Zeitpunkt wie die erste und wird weiterhin
-- erkannt; eine neue Buchung traegt einen anderen und wird gebucht.
--
-- Die zwei Minuten Spielraum sind nicht gewuerfelt, sondern genau die
-- Uhrtoleranz aus effective_entry_time(): dort wird ein bis zu zwei Minuten
-- vorausgehender Zeitpunkt auf jetzt zurueckgesetzt. Die erste Zustellung
-- kann deshalb einen bis zu zwei Minuten kleineren Wert eintragen als die
-- zweite berechnet. Ein engerer Vergleich wuerde eine echte zweite Zustellung
-- fuer eine neue Buchung halten und doppelt buchen.

-- Ueberlappende Arbeitszeiten derselben Kraft.
--
-- Im Live-Betrieb kann es sie nicht geben: `start_my_job` verlangt, dass eine
-- laufende Buchung zuerst beendet wird. Entstehen koennen sie nur dort, wo ein
-- Zeitpunkt nachgetragen wird -- aus der Warteschlange eines Telefons oder
-- durch eine Korrektur im Buero. Genau an diesen drei Stellen wird deshalb
-- geprueft. Zwei sich ueberlappende Buchungen zaehlen dieselbe Stunde zweimal,
-- und zwar in der Lohnabrechnung.
--
-- Eine noch offene Buchung gilt als bis jetzt laufend.
create or replace function public.member_time_overlaps(
  p_member_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_exclude uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.job_time_entries entry
    where entry.member_id = p_member_id
      and (p_exclude is null or entry.id <> p_exclude)
      and entry.started_at < p_to
      and coalesce(entry.finished_at, now()) > p_from
  );
$$;

comment on function public.member_time_overlaps(uuid, timestamptz, timestamptz, uuid) is
  'Liegt fuer diese Kraft im Zeitraum schon eine Arbeitszeit? Nur fuer nachgetragene Zeiten und Korrekturen.';

revoke all on function public.member_time_overlaps(uuid, timestamptz, timestamptz, uuid)
  from public, anon, authenticated;


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

  -- Zuerst: wurde *genau diese* Buchung schon einmal zugestellt? Eine
  -- Warteschlange kann denselben Start ein zweites Mal liefern, etwa wenn die
  -- Verbindung mitten in der Antwort abreisst. Dann ist die richtige Antwort
  -- die vorhandene Buchung, keine Fehlermeldung -- aber nur, wenn sie zum
  -- uebermittelten Zeitpunkt gehoert.
  if p_at is not null then
    select id into entry_id from public.job_time_entries
    where job_id = job.id
      and member_id = actor.id
      and started_at between at_time - interval '2 minutes' and at_time + interval '2 minutes'
    order by started_at desc, id limit 1;
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

  -- Ein nachgetragener Arbeitsbeginn darf nicht in eine bereits erfasste
  -- Arbeitszeit fallen. Nur das wird hier geprueft, nicht "irgendwann nach
  -- der letzten Buchung": eine Warteschlange stellt gerade dann spaet zu,
  -- wenn vorher kein Empfang war, und eine vergessene Fruehschicht muss am
  -- Abend noch nachtragbar sein, obwohl die Spaetschicht schon steht. Ob die
  -- fertige Buchung wirklich ueberlappt, entscheidet der Feierabend.
  if p_at is not null and exists (
    select 1 from public.job_time_entries entry
    where entry.member_id = actor.id
      and entry.started_at <= at_time
      and coalesce(entry.finished_at, now()) > at_time
  ) then
    raise exception 'Fuer diesen Zeitpunkt ist bereits eine Arbeitszeit erfasst.';
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
  -- Zustellung derselben Warteschlange -- erkennbar daran, dass sie zum
  -- uebermittelten Zeitpunkt beendet wurde. Ein Eintrag, der irgendwann
  -- anders beendet wurde, ist nicht diese Buchung: dann fehlt die laufende
  -- Zeit wirklich, und das soll auffallen.
  if entry.id is null then
    if p_at is not null then
      select id into entry.id from public.job_time_entries
      where job_id = p_job_id
        and member_id = actor.id
        and finished_at between at_time - interval '2 minutes' and at_time + interval '2 minutes'
      order by finished_at desc, id limit 1;
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

  -- Und die fertige Buchung darf keine andere Arbeitszeit derselben Kraft
  -- schneiden. Abgelehnt statt stillschweigend gekuerzt: zwei Buchungen
  -- uebereinander zaehlen dieselbe Stunde zweimal, und welche der beiden
  -- richtig ist, kann hier niemand wissen. Das Buero korrigiert so etwas mit
  -- correct_time_entry(), und dort bleibt es im Protokoll stehen.
  if p_at is not null and public.member_time_overlaps(actor.id, entry.started_at, at_time, entry.id) then
    raise exception 'Diese Arbeitszeit ueberschneidet eine bereits erfasste Zeit.';
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
  last_break_end timestamptz;
  at_time timestamptz := public.effective_entry_time(p_at);
begin
  select * into actor from public.current_employee_member();
  if actor.id is null then raise exception 'Employee role required'; end if;

  select * into entry from public.job_time_entries
  where job_id = p_job_id and member_id = actor.id and finished_at is null for update;
  if entry.id is null then raise exception 'No active time entry found'; end if;

  if exists (select 1 from public.job_time_breaks where time_entry_id = entry.id and ended_at is null) then
    -- Schon pausiert. Nur wenn die laufende Pause zum uebermittelten
    -- Zeitpunkt begann, ist das dieselbe Buchung ein zweites Mal; sonst wird
    -- eine zweite Pause begonnen, waehrend die erste laeuft, und das ist ein
    -- Fehler, kein Doppel.
    if p_at is not null then
      select id into break_id from public.job_time_breaks
      where time_entry_id = entry.id
        and ended_at is null
        and started_at between at_time - interval '2 minutes' and at_time + interval '2 minutes'
      order by started_at desc, id limit 1;
      if break_id is not null then return break_id; end if;
    end if;
    raise exception 'A break is already running';
  end if;

  if at_time < entry.started_at then
    raise exception 'Die Pause liegt vor dem Arbeitsbeginn.';
  end if;

  -- Eine Pause darf nicht vor dem Ende der vorigen beginnen: sonst zaehlt der
  -- Trigger die Ueberlappung zweimal, und die Arbeitszeit sinkt.
  select max(ended_at) into last_break_end
  from public.job_time_breaks
  where time_entry_id = entry.id and ended_at is not null;
  if last_break_end is not null and at_time < last_break_end then
    raise exception 'Die Pause beginnt vor dem Ende der vorigen Pause.';
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
  where time_entry_id = entry.id and ended_at is null
  order by started_at desc, id limit 1;

  if break_row.id is null then
    -- Keine laufende Pause. Nur eine Pause, die zum uebermittelten Zeitpunkt
    -- beendet wurde, ist dieselbe Buchung ein zweites Mal.
    if p_at is not null then
      select id into break_id from public.job_time_breaks
      where time_entry_id = entry.id
        and ended_at between at_time - interval '2 minutes' and at_time + interval '2 minutes'
      order by ended_at desc, id limit 1;
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

-- Dieselbe Regel fuer die Korrektur im Buero. Ohne sie liess sich eine Buchung
-- auf eine andere schieben, und die Lohnabrechnung zaehlte die Stunde zweimal
-- -- mit Protokolleintrag, aber eben doch.
create or replace function public.correct_time_entry(p_time_entry_id uuid, p_started_at timestamptz, p_finished_at timestamptz, p_reason text) returns uuid language plpgsql security definer set search_path = public as $$
declare entry public.job_time_entries; actor_profile_id uuid;
begin
  select * into entry from public.job_time_entries where id = p_time_entry_id for update;
  if entry.id is null or not public.is_company_staff(entry.company_id) then raise exception 'Staff role required'; end if;
  if p_finished_at <= p_started_at then raise exception 'End must be after start'; end if;
  if char_length(trim(p_reason)) not between 3 and 1000 then raise exception 'Correction reason is required'; end if;
  if public.member_time_overlaps(entry.member_id, p_started_at, p_finished_at, entry.id) then
    raise exception 'Die korrigierte Zeit ueberschneidet eine andere Arbeitszeit dieser Kraft.';
  end if;
  select id into actor_profile_id from public.profiles where auth_user_id = auth.uid();
  insert into public.time_entry_audit_logs (time_entry_id, company_id, changed_by, previous_started_at, previous_finished_at, new_started_at, new_finished_at, reason) values (entry.id, entry.company_id, actor_profile_id, entry.started_at, entry.finished_at, p_started_at, p_finished_at, trim(p_reason));
  update public.job_time_entries set started_at = p_started_at, finished_at = p_finished_at, start_source = 'MANUAL', end_source = 'MANUAL' where id = entry.id;
  return entry.id;
end;
$$;
