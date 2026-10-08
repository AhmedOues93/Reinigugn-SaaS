-- Pause und Fortsetzen erkannten eine zweite Zustellung nur, solange die
-- Buchung noch offen war.
--
-- 20261008000000 hat die Wiedererkennung an den uebermittelten Zeitpunkt
-- gebunden, aber nur fuer Start und Feierabend vollstaendig: beide finden ihre
-- Buchung auch dann noch, wenn sie bereits beendet ist. Pause und Fortsetzen
-- verlangten weiterhin eine *offene* Buchung und lehnten sonst mit 'No active
-- time entry found' ab -- und das fuer immer, denn ein beendeter Eintrag wird
-- nie wieder offen.
--
-- Nachgemessen in einem echten Chromium, zwei Laschen derselben App auf einem
-- Telefon, die sich eine Warteschlange teilen:
--
--   Lasche A sendet die Pause. Der Server bucht sie. Die Antwort geht beim
--   Wechsel von Mobilfunk auf WLAN verloren; Lasche A wartet noch auf ihren
--   Zeitablauf. Lasche B raeumt dieselbe Warteschlange weiter auf -- die Pause
--   wird als zweite Zustellung erkannt, Fortsetzen und Feierabend gehen durch,
--   alle drei verlassen die Warteschlange. Erst danach laeuft Lasche A in ihren
--   Zeitablauf und vermerkt den Fehlversuch, und legt die laengst zugestellte
--   Pause damit wieder an.
--
--     vorher:  'No active time entry found', bei jedem Versuch, dauerhaft.
--     nachher: die vorhandene Pause kommt zurueck, die Warteschlange wird leer.
--
-- Das Wiederanlegen selbst ist die andere Haelfte des Fehlers und in
-- lib/offline/store.ts behoben. Behoben wird hier trotzdem beides, denn die
-- Wiedererkennung darf nicht davon abhaengen, in welcher Reihenfolge zwei
-- Laschen zum Zuge kommen -- das ist keine Eigenschaft, die ein Server
-- voraussetzen kann.
--
-- Warum das nicht nur ein Schoenheitsfehler war: runSync haelt nach einem
-- Fehlschlag jede weitere Buchung *desselben Einsatzes* zurueck, damit eine
-- Zeitfolge nicht mit einem Loch in der Mitte beim Server ankommt. Eine
-- Buchung, die nie gelingt, haelt damit auch jede spaetere Schicht an diesem
-- Einsatz auf. Die Zeit bleibt auf dem Geraet liegen, ohne Meldung an die
-- Kraft -- genau die Art Verlust, die 20261008000000 beseitigen sollte.
--
-- Die zwei Minuten sind dieselbe Uhrtoleranz wie dort: effective_entry_time()
-- setzt einen bis zu zwei Minuten vorausgehenden Zeitpunkt auf jetzt zurueck,
-- also kann die erste Zustellung einen kleineren Wert eingetragen haben als
-- die zweite berechnet.
--
-- Abgelehnt bleibt, was keinen passenden Zeitpunkt hat: eine wirklich
-- fehlende laufende Zeit soll auffallen und nicht als erledigt gelten. Und
-- ohne uebermittelten Zeitpunkt gibt es weiterhin keine Wiedererkennung --
-- das ist eine Buchung mit Empfang, kein Nachtrag.

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

  if entry.id is null then
    -- Keine laufende Zeit. Eine zweite Zustellung ist trotzdem erkennbar,
    -- naemlich an einer Pause, die zu genau diesem Zeitpunkt begann -- auch
    -- wenn der Feierabend die Buchung inzwischen geschlossen hat.
    if p_at is not null then
      select brk.id into break_id
      from public.job_time_breaks brk
      join public.job_time_entries owner_entry on owner_entry.id = brk.time_entry_id
      where owner_entry.job_id = p_job_id
        and owner_entry.member_id = actor.id
        and brk.started_at between at_time - interval '2 minutes' and at_time + interval '2 minutes'
      order by brk.started_at desc, brk.id
      limit 1;
      if break_id is not null then return break_id; end if;
    end if;
    raise exception 'No active time entry found';
  end if;

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

  /*
    Eine bereits *beendete* Pause zum selben Zeitpunkt wird hier bewusst
    nicht als zweite Zustellung behandelt, solange die Buchung noch offen
    ist. Dort ist der Fall nicht entscheidbar: derselbe Beginn kann eine
    zweite Zustellung sein oder eine neue Pause, die in die vorige
    hineinreicht. supabase/test/break-overlap.test.sql haelt dafuer die
    engere Lesart fest -- abgelehnt, weil zwei ineinander liegende Pausen die
    Arbeitszeit senken -- und dabei bleibt es.

    Fuer eine *beendete* Buchung oben stellt sich die Frage nicht: dort gibt
    es keine neue Pause zu beginnen, die Ablehnung war die einzige Antwort,
    und sie war die falsche.
  */
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

  if entry.id is null then
    -- Wie bei der Pause: eine Pause, die zu genau diesem Zeitpunkt beendet
    -- wurde, ist dieselbe Buchung ein zweites Mal -- auch nach dem
    -- Feierabend.
    if p_at is not null then
      select brk.id into break_id
      from public.job_time_breaks brk
      join public.job_time_entries owner_entry on owner_entry.id = brk.time_entry_id
      where owner_entry.job_id = p_job_id
        and owner_entry.member_id = actor.id
        and brk.ended_at between at_time - interval '2 minutes' and at_time + interval '2 minutes'
      order by brk.ended_at desc, brk.id
      limit 1;
      if break_id is not null then return break_id; end if;
    end if;
    raise exception 'No active time entry found';
  end if;

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
