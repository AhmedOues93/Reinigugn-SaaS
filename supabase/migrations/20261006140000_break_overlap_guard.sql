-- Nachgetragene Pausen durften sich ueberlappen, und das kostet Lohn.
--
-- `pause_my_job` prueft den nachgetragenen Zeitpunkt nur gegen den
-- Arbeitsbeginn. Gegen die zuletzt beendete Pause prueft sie nicht. Aus der
-- Offline-Warteschlange ist diese Folge darum moeglich:
--
--   start   10:00
--   pause   10:30
--   fortsetzen 11:00
--   pause   10:35   <- liegt mitten in der eben beendeten Pause
--   fortsetzen 10:50
--
-- Danach stehen zwei Pausen in der Tabelle, 10:30-11:00 und 10:35-10:50.
-- `ensure_time_entry_integrity` summiert beide -- es klammert jede einzelne
-- auf das Arbeitsfenster, erkennt aber keine Ueberlappung. Aus 30 Minuten
-- echter Pause werden 45 gezaehlte, und `duration_minutes` ist um 15 Minuten
-- zu niedrig. Nachgemessen: 60 Minuten Pause ergaben 75 gezaehlte.
--
-- Die Mitarbeiterin verliert dabei bezahlte Zeit, und zwar lautlos: keine
-- Fehlermeldung, kein Hinweis, und im Monatsabschluss steht die zu niedrige
-- Zahl. Wer nicht die Pausenliste danebenlegt, findet es nicht.
--
-- Auftreten kann die Folge ohne jede Absicht: die Zeitpunkte kommen aus der
-- Uhr des Geraets, und `effective_entry_time` laesst bis 48 Stunden
-- Rueckdatierung zu. Eine falsch gestellte Uhr oder eine
-- Warteschlange, die zwei Tastendruecke in anderer Reihenfolge zustellt,
-- genuegt.
--
-- Die Bedingung in der Tabelle (`ended_at >= started_at`) kann das nicht
-- abfangen: sie sieht nur eine Zeile. Die Reihenfolge *zwischen* den Pausen
-- gehoert in die Funktion, die sie anlegt.
--
-- Was hier ausdruecklich NICHT geaendert wird: `stop_my_job`. Ein Feierabend
-- vor dem Ende einer Pause sieht falsch aus, rechnet aber richtig -- die
-- Klammerung in `ensure_time_entry_integrity` schneidet die Pause auf das
-- Arbeitsfenster, und `duration_minutes` kommt korrekt heraus. Nachgemessen,
-- bevor ein Guard gebaut wurde, den es nicht braucht.

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

  -- Neu: eine Pause beginnt nach dem Ende der vorigen. Gleichzeitig ist
  -- erlaubt -- zweimal kurz hintereinander getippt ergibt eine Pause von null
  -- Minuten, und die ist kein Fehler. Abgelehnt wird nur, was in eine
  -- bestehende Pause hineinreicht.
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

revoke all on function public.pause_my_job(uuid, timestamptz) from public, anon;
grant execute on function public.pause_my_job(uuid, timestamptz) to authenticated;
