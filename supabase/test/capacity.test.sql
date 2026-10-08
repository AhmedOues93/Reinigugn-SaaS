-- Soll, Ist, Auslastung und die Reichweite der Einrichtung.
-- Run with supabase/test/run.sh.
--
-- Der Fehler, den die Zahlen hier verhindern: Ist-Stunden bis heute gegen das
-- Soll des ganzen Monats zu stellen. Das zeigt am Zwoelften jeden Betrieb bei
-- vierzig Prozent, und jemand wird diese Zahl fuer einen Befund halten.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;

create or replace function pg_temp.sign_in(p_user uuid) returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', p_user::text, true); set role authenticated; end; $$;
create or replace function pg_temp.sign_out() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', true); end; $$;
create or replace function pg_temp.assert(c boolean, m text) returns void language plpgsql as $$
begin if not c then raise exception 'ASSERTION FAILED: %', m; end if; end; $$;

-- ---------------------------------------------------------------------------
-- Arbeitstage in einem Zeitraum, gegen von Hand nachgezaehlte Werte
-- ---------------------------------------------------------------------------
-- 2.–6. Februar 2026 ist Mo–Fr.
select pg_temp.assert(public.working_days_between(date '2026-02-02', date '2026-02-06') = 5, 'eine ganze Woche');
-- Das Wochenende dazu zaehlt nicht mit.
select pg_temp.assert(public.working_days_between(date '2026-02-02', date '2026-02-08') = 5, 'Samstag und Sonntag zaehlen nicht');
-- Karfreitag 2026 ist der 3. April, Ostermontag der 6.: in der Woche 30.03.-03.04. bleiben vier Tage.
select pg_temp.assert(public.working_days_between(date '2026-03-30', date '2026-04-03') = 4, 'Karfreitag faellt heraus');
-- Ein einzelner Arbeitstag, ein einzelner Feiertag, ein verdrehter Zeitraum.
select pg_temp.assert(public.working_days_between(date '2026-02-02', date '2026-02-02') = 1, 'ein Montag');
select pg_temp.assert(public.working_days_between(date '2026-04-03', date '2026-04-03') = 0, 'ein Karfreitag');
select pg_temp.assert(public.working_days_between(date '2026-02-06', date '2026-02-02') = 0, 'ein verdrehter Zeitraum ist null, kein Fehler');
-- Ueber den Jahreswechsel: beide Jahre bringen ihre Feiertage mit.
-- 28.12.2026-01.01.2027 ist Mo-Fr, 1.1. ist Feiertag: vier Tage.
select pg_temp.assert(public.working_days_between(date '2026-12-28', date '2027-01-01') = 4, 'Neujahr faellt heraus');

-- Der Monat bleibt der Sonderfall des Zeitraums: dieselben Werte wie bisher.
select pg_temp.assert(public.working_days_in_month(date '2026-05-01') = 18, 'Arbeitstage Mai 2026 unveraendert');
select pg_temp.assert(public.working_days_in_month(date '2026-12-01') = 22, 'Arbeitstage Dezember 2026 unveraendert');
select pg_temp.assert(public.working_days_in_month(date '2026-02-01') = 20, 'Arbeitstage Februar 2026 unveraendert');

-- ---------------------------------------------------------------------------
-- Ein Betrieb mit einer Vollzeitkraft, erfasster Arbeit und einem Plan
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('e3300000-0000-4000-8000-000000000001', 'inhaberin@kapazitaet.test'),
  ('e3300000-0000-4000-8000-000000000002', 'kraft@kapazitaet.test'),
  ('e3300000-0000-4000-8000-000000000003', 'aushilfe@kapazitaet.test'),
  ('e3300000-0000-4000-8000-000000000004', 'nachbarin@kapazitaet.test');

select pg_temp.sign_in('e3300000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Kapazitaet GmbH');
select pg_temp.sign_in('e3300000-0000-4000-8000-000000000004');
select public.create_company_for_current_user('Nachbar Kapazitaet GmbH');
select pg_temp.sign_out();

create temporary table kctx as select
  (select id from public.companies where name = 'Kapazitaet GmbH') as company,
  (select id from public.companies where name = 'Nachbar Kapazitaet GmbH') as other_company,
  (select id from public.profiles where auth_user_id = 'e3300000-0000-4000-8000-000000000002') as staff_profile,
  (select id from public.profiles where auth_user_id = 'e3300000-0000-4000-8000-000000000003') as helper_profile,
  (date_trunc('month', (now() at time zone 'Europe/Berlin')::date))::date as first_day,
  (now() at time zone 'Europe/Berlin')::date as today;
grant select on kctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select company, staff_profile, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status from kctx
union all select company, helper_profile, 'EMPLOYEE', 'ACTIVE' from kctx;

-- 40 Stunden die Woche: acht Stunden am Tag, ein Arbeitstag sind 480 Minuten.
-- Die Aushilfe hat keine Wochenstunden hinterlegt und bringt also kein Soll mit.
insert into public.employee_details (company_id, profile_id, employee_number, weekly_hours)
select company, staff_profile, 'K-001', 40 from kctx;

create temporary table kmem as select
  (select id from public.company_members where profile_id = (select staff_profile from kctx)) as staff,
  (select id from public.company_members where profile_id = (select helper_profile from kctx)) as helper;
grant select on kmem to authenticated;

insert into public.customers (company_id, name) select company, 'Kapazitaetskunde' from kctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select kctx.company, c.id, 'Kapazitaetsobjekt'
from kctx join public.customers c on c.company_id = kctx.company;

-- Drei Einsaetze im laufenden Monat:
--   A  acht Stunden, zwei Personen zugewiesen  -> 960 geplante Minuten
--   B  vier Stunden, niemand zugewiesen        -> 240 offene Minuten
--   C  acht Stunden, abgesagt                  -> zaehlt nicht
insert into public.jobs (company_id, customer_id, cleaning_object_id, title, scheduled_date, planned_start_at, planned_end_at, status)
select kctx.company, c.id, o.id, 'Einsatz A', kctx.first_day,
       (kctx.first_day + time '08:00') at time zone 'Europe/Berlin',
       (kctx.first_day + time '16:00') at time zone 'Europe/Berlin', 'CONFIRMED'::public.job_status
from kctx join public.customers c on c.company_id = kctx.company join public.cleaning_objects o on o.company_id = kctx.company
union all
select kctx.company, c.id, o.id, 'Einsatz B', kctx.first_day,
       (kctx.first_day + time '08:00') at time zone 'Europe/Berlin',
       (kctx.first_day + time '12:00') at time zone 'Europe/Berlin', 'PLANNED'::public.job_status
from kctx join public.customers c on c.company_id = kctx.company join public.cleaning_objects o on o.company_id = kctx.company
union all
select kctx.company, c.id, o.id, 'Einsatz C', kctx.first_day,
       (kctx.first_day + time '08:00') at time zone 'Europe/Berlin',
       (kctx.first_day + time '16:00') at time zone 'Europe/Berlin', 'CANCELLED'::public.job_status
from kctx join public.customers c on c.company_id = kctx.company join public.cleaning_objects o on o.company_id = kctx.company;

insert into public.job_assignments (company_id, job_id, member_id)
select kctx.company, job.id, kmem.staff from kctx, kmem join public.jobs job on job.title = 'Einsatz A'
union all
select kctx.company, job.id, kmem.helper from kctx, kmem join public.jobs job on job.title = 'Einsatz A';

-- Fuenf Stunden erfasste Arbeit heute, und ein laufender Eintrag, der nicht
-- mitzaehlt, weil er noch kein Ende hat.
insert into public.job_time_entries (company_id, job_id, member_id, started_at, finished_at)
select kctx.company, job.id, kmem.staff,
       (kctx.first_day + time '08:00') at time zone 'Europe/Berlin',
       (kctx.first_day + time '13:00') at time zone 'Europe/Berlin'
from kctx, kmem join public.jobs job on job.title = 'Einsatz A';
insert into public.job_time_entries (company_id, job_id, member_id, started_at)
select kctx.company, job.id, kmem.helper,
       (kctx.today + time '08:00') at time zone 'Europe/Berlin'
from kctx, kmem join public.jobs job on job.title = 'Einsatz A';

select pg_temp.sign_in('e3300000-0000-4000-8000-000000000001');

select pg_temp.assert(
  (select employees from public.company_capacity_snapshot()) = 2,
  'zwei aktive Mitarbeiterinnen');
select pg_temp.assert(
  (select employees_with_target from public.company_capacity_snapshot()) = 1,
  'nur eine davon hat vereinbarte Wochenstunden');
select pg_temp.assert(
  (select as_of from public.company_capacity_snapshot()) = (select today from kctx),
  'der laufende Monat wird bis heute gerechnet');

-- Das ist der Kern: bis heute, nicht der ganze Monat.
select pg_temp.assert(
  (select target_minutes_to_date from public.company_capacity_snapshot())
    = public.working_days_between((select first_day from kctx), (select today from kctx)) * 480,
  'Soll bis heute');
select pg_temp.assert(
  (select target_minutes_month from public.company_capacity_snapshot())
    = public.working_days_in_month((select first_day from kctx)) * 480,
  'Soll fuer den ganzen Monat daneben');
select pg_temp.assert(
  (select target_minutes_to_date from public.company_capacity_snapshot())
    <= (select target_minutes_month from public.company_capacity_snapshot()),
  'das Soll bis heute uebersteigt nie das des Monats');

select pg_temp.assert(
  (select worked_minutes from public.company_capacity_snapshot()) = 300,
  'fuenf erfasste Stunden; der laufende Eintrag zaehlt nicht');
select pg_temp.assert(
  (select planned_minutes from public.company_capacity_snapshot()) = 960,
  'geplant wird pro Zuweisung: acht Stunden mal zwei Personen');
select pg_temp.assert(
  (select unassigned_planned_minutes from public.company_capacity_snapshot()) = 240,
  'der Einsatz ohne Zuweisung steht getrennt daneben');

-- Ein kuenftiger Monat hat noch kein Soll bis heute, aber eines fuer den Monat.
select pg_temp.assert(
  (select target_minutes_to_date
   from public.company_capacity_snapshot(((select first_day from kctx) + interval '2 months')::date)) = 0,
  'ein kuenftiger Monat hat noch kein Soll bis heute');
select pg_temp.assert(
  (select target_minutes_month
   from public.company_capacity_snapshot(((select first_day from kctx) + interval '2 months')::date)) > 0,
  'ein kuenftiger Monat hat ein Soll fuer den Monat');

-- Genehmigter Urlaub senkt das Soll, nicht das Ist.
select pg_temp.sign_out();
insert into public.employee_absences (company_id, member_id, absence_type, status, start_date, end_date)
select company, (select staff from kmem), 'VACATION', 'APPROVED', first_day, first_day + 20 from kctx;
select pg_temp.sign_in('e3300000-0000-4000-8000-000000000001');
select pg_temp.assert(
  (select target_minutes_to_date from public.company_capacity_snapshot()) = 0,
  'wer den ganzen Monat im Urlaub ist, hat kein Soll');
select pg_temp.assert(
  (select worked_minutes from public.company_capacity_snapshot()) = 300,
  'das Ist bleibt davon unberuehrt');
select pg_temp.sign_out();
delete from public.employee_absences where member_id = (select staff from kmem);

-- ---------------------------------------------------------------------------
-- Mandantentrennung und Berechtigung
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('e3300000-0000-4000-8000-000000000004');
select pg_temp.assert(
  (select employees from public.company_capacity_snapshot()) = 0,
  'die Nachbarin sieht ihren eigenen, leeren Betrieb');
select pg_temp.assert(
  (select coalesce(planned_minutes, 0) from public.company_capacity_snapshot()) = 0,
  'und keine fremden geplanten Minuten');
select pg_temp.sign_out();

-- Eine Mitarbeiterin ist kein Buero: sie bekommt gar keine Zeile.
select pg_temp.sign_in('e3300000-0000-4000-8000-000000000002');
select pg_temp.assert(
  (select count(*) from public.company_capacity_snapshot()) = 0,
  'eine Mitarbeiterin sieht die Auslastung des Betriebs nicht');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Die Einrichtung reicht bis zum ersten geplanten Einsatz
-- ---------------------------------------------------------------------------
-- Die Kapazitaetszahlen oben brauchen Einsaetze im laufenden Monat; die
-- Einrichtung fragt nach einem, der noch bevorsteht. Am Monatsersten ist das
-- dasselbe, am Monatsletzten nicht -- darum wird hier ausdruecklich auf heute
-- datiert, statt sich auf das Datum des Monatsanfangs zu verlassen.
select pg_temp.sign_out();
update public.jobs set scheduled_date = (select today from kctx)
where title = 'Einsatz B' and company_id = (select company from kctx);
select pg_temp.sign_in('e3300000-0000-4000-8000-000000000001');
select pg_temp.assert(
  (select has_planned_job from public.get_onboarding_status()),
  'ein Einsatz von heute zaehlt als geplant');
select pg_temp.assert(
  (select has_schedule from public.get_onboarding_status()) = false,
  'ein wiederkehrender Plan existiert noch nicht');

insert into public.service_schedules (company_id, customer_id, cleaning_object_id, name, valid_from, is_active)
select kctx.company, c.id, o.id, 'Wochenplan', kctx.first_day, true
from kctx join public.customers c on c.company_id = kctx.company join public.cleaning_objects o on o.company_id = kctx.company;
select pg_temp.assert(
  (select has_schedule from public.get_onboarding_status()),
  'der wiederkehrende Plan wird erkannt');

-- Ein abgearbeiteter Einsatz von vorletztem Monat beweist nicht, dass der Plan
-- weiterlaeuft -- die Einrichtung soll dann wieder offen sein.
update public.jobs set scheduled_date = (select first_day from kctx) - interval '2 months',
  planned_start_at = planned_start_at - interval '2 months',
  planned_end_at = planned_end_at - interval '2 months'
where company_id = (select company from kctx);
select pg_temp.assert(
  (select has_planned_job from public.get_onboarding_status()) = false,
  'ein Einsatz aus der Vergangenheit zaehlt nicht als geplant');
select pg_temp.sign_out();

rollback;
\o
\echo 'Soll, Ist und Auslastung: all assertions passed'
