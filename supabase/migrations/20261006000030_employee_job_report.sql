-- Der Einsatzbericht, den die Mitarbeiterin schreibt.
--
-- service_records.employee_note gibt es seit Phase 19, aber nichts hat die
-- Spalte je beschrieben: es fehlte schlicht der Weg, "3. Stock war
-- abgeschlossen, beim naechsten Mal nachholen" festzuhalten. Genau diese
-- Zeile braucht das Buero -- und der Kunde auf dem Leistungsnachweis.
--
-- Der Bericht liegt am Einsatz, nicht am Nachweis: so laesst er sich vor und
-- nach dem Feierabend schreiben, und jeder Weg, der einen Leistungsnachweis
-- erzeugt, nimmt ihn mit. Ein abgenommener Nachweis bleibt unberuehrt -- was
-- der Kunde unterschrieben hat, aendert sich nicht mehr.

alter table public.jobs
  add column if not exists employee_report text;

alter table public.jobs
  drop constraint if exists jobs_employee_report_length;
alter table public.jobs
  add constraint jobs_employee_report_length
  check (employee_report is null or char_length(employee_report) <= 2000);

comment on column public.jobs.employee_report is
  'Freitext der eingeteilten Mitarbeiterin zu diesem Einsatz. Wandert beim Anlegen in service_records.employee_note.';

/**
 * Die zugewiesene Mitarbeiterin schreibt oder aendert ihren Bericht.
 *
 * Nur der eigene Einsatz, und nur solange der Leistungsnachweis nicht
 * abgenommen ist: danach ist der Bericht Teil dessen, was der Kunde
 * unterschrieben hat.
 */
create or replace function public.set_my_job_report(p_job_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  job public.jobs;
  note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select * into actor from public.current_employee_member();
  if actor.id is null then raise exception 'Employee role required'; end if;

  if note is not null and char_length(note) > 2000 then
    raise exception 'Der Bericht ist zu lang (hoechstens 2000 Zeichen).';
  end if;

  select * into job
  from public.jobs
  where id = p_job_id and company_id = actor.company_id
  for update;
  if job.id is null then raise exception 'Job not found'; end if;

  if not exists (
    select 1 from public.job_assignments assignment
    where assignment.job_id = job.id and assignment.member_id = actor.id
  ) then
    raise exception 'Only an assigned employee may report on this visit';
  end if;

  if exists (
    select 1 from public.service_records record
    where record.job_id = job.id and record.accepted_at is not null
  ) then
    raise exception 'Der Leistungsnachweis ist bereits abgenommen und kann nicht mehr geaendert werden.';
  end if;

  update public.jobs set employee_report = note, updated_at = now() where id = job.id;

  -- Einen noch nicht abgenommenen Nachweis mitziehen, damit Buero und Kunde
  -- denselben Text sehen wie die Mitarbeiterin.
  update public.service_records
  set employee_note = note
  where job_id = job.id and accepted_at is null;
end;
$$;

revoke all on function public.set_my_job_report(uuid, text) from public, anon;
grant execute on function public.set_my_job_report(uuid, text) to authenticated;

/*
 * Der Bericht wandert beim Anlegen in den Nachweis.
 *
 * Bewusst ein Trigger statt einer Ergaenzung in build_service_record(): diese
 * Funktion wurde schon mehrfach als Ganzes neu geschrieben, und eine Kopie
 * davon waere die naechste Stelle, an der beide auseinanderlaufen. So gilt es
 * ausserdem fuer jeden Weg, der einen Leistungsnachweis anlegt.
 */
create or replace function public.carry_employee_report_into_record()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.employee_note is null then
    select job.employee_report into new.employee_note
    from public.jobs job
    where job.id = new.job_id;
  end if;
  return new;
end;
$$;

drop trigger if exists service_records_carry_employee_report on public.service_records;
create trigger service_records_carry_employee_report
  before insert on public.service_records
  for each row execute procedure public.carry_employee_report_into_record();
