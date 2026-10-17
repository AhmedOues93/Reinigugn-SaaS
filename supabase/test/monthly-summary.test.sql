-- Monatsabschluss invariants: the Soll/Ist figures, and who may see them.
--
-- The numbers here end up in front of a Lohnbüro, so every one of them is
-- asserted against a value worked out by hand rather than against whatever the
-- function happens to return. Executed with RLS in force.
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
create or replace function pg_temp.assert_rejected(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if position(lower(p_expected) in lower(sqlerrm)) = 0 then
      raise exception 'WRONG REJECTION for %: expected "%", got "%"', p_sql, p_expected, sqlerrm; end if; return;
  end;
  raise exception 'NOT REJECTED: % (expected "%")', p_sql, p_expected;
end; $$;

-- ---------------------------------------------------------------------------
-- The calendar, checked against dates anyone can verify
-- ---------------------------------------------------------------------------
select pg_temp.assert(public.easter_sunday(2024) = date '2024-03-31', 'Ostern 2024');
select pg_temp.assert(public.easter_sunday(2025) = date '2025-04-20', 'Ostern 2025');
select pg_temp.assert(public.easter_sunday(2026) = date '2026-04-05', 'Ostern 2026');
select pg_temp.assert(public.easter_sunday(2027) = date '2027-03-28', 'Ostern 2027');

select pg_temp.assert(
  (select count(*) from public.german_public_holidays(2026)) = 9,
  'neun bundesweite Feiertage');
select pg_temp.assert(
  (select holiday from public.german_public_holidays(2026) where label = 'Karfreitag') = date '2026-04-03',
  'Karfreitag 2026');
select pg_temp.assert(
  (select holiday from public.german_public_holidays(2026) where label = 'Christi Himmelfahrt') = date '2026-05-14',
  'Christi Himmelfahrt 2026');

-- Mai 2026: 21 Wochentage, davon 1. Mai (Fr), Himmelfahrt (Do), Pfingstmontag.
select pg_temp.assert(public.working_days_in_month(date '2026-05-01') = 18, 'Arbeitstage Mai 2026');
-- Dezember 2026: 23 Wochentage, 25.12. faellt auf Freitag, 26.12. auf Samstag.
select pg_temp.assert(public.working_days_in_month(date '2026-12-01') = 22, 'Arbeitstage Dezember 2026');
-- Februar 2026: 20 Wochentage, kein Feiertag.
select pg_temp.assert(public.working_days_in_month(date '2026-02-01') = 20, 'Arbeitstage Februar 2026');

-- ---------------------------------------------------------------------------
-- A company, an employee with an agreed week, and a month of real work
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('c2000000-0000-4000-8000-000000000001', 'lohn-owner@example.test'),
  ('c2000000-0000-4000-8000-000000000002', 'lohn-emp@example.test'),
  ('c2000000-0000-4000-8000-000000000003', 'lohn-other@example.test'),
  ('c2000000-0000-4000-8000-000000000004', 'lohn-rival@example.test');

select pg_temp.sign_in('c2000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Lohn GmbH');
select pg_temp.sign_in('c2000000-0000-4000-8000-000000000004');
select public.create_company_for_current_user('Fremd GmbH');
select pg_temp.sign_out();

create temporary table lctx as
select (select id from public.companies where name='Lohn GmbH') as company,
       (select id from public.companies where name='Fremd GmbH') as rival_company,
       (select id from public.profiles where auth_user_id='c2000000-0000-4000-8000-000000000002') as emp_profile,
       (select id from public.profiles where auth_user_id='c2000000-0000-4000-8000-000000000003') as other_profile,
       (select id from public.profiles where auth_user_id='c2000000-0000-4000-8000-000000000004') as rival_profile;
grant select on lctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select company, emp_profile, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status from lctx
union all select company, other_profile, 'EMPLOYEE', 'ACTIVE' from lctx;

-- 40 hours a week: eight hours a day, so one working day is 480 minutes.
insert into public.employee_details (company_id, profile_id, employee_number, weekly_hours)
select company, emp_profile, 'MA-001', 40 from lctx;

create temporary table lm as
select (select id from public.company_members where profile_id=(select emp_profile from lctx)) as emp,
       (select id from public.company_members where profile_id=(select other_profile from lctx)) as other;
grant select on lm to authenticated;

insert into public.customers (company_id, name) select company, 'Lohnkunde' from lctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select lctx.company, c.id, 'Lohnobjekt' from lctx join public.customers c on c.company_id = lctx.company;
insert into public.jobs (company_id, customer_id, cleaning_object_id, title, scheduled_date, planned_start_at, planned_end_at, status)
select lctx.company, c.id, o.id, 'Lohneinsatz', date '2026-02-02', timestamptz '2026-02-02 08:00+01', timestamptz '2026-02-02 16:00+01', 'CONFIRMED'
from lctx join public.customers c on c.company_id=lctx.company join public.cleaning_objects o on o.company_id=lctx.company;

create temporary table lj as select id from public.jobs where company_id=(select company from lctx) limit 1;
grant select on lj to authenticated;

-- Three days worked in February 2026: 8h, 8h and 6h = 1320 net minutes.
insert into public.job_time_entries (company_id, job_id, member_id, started_at, finished_at)
select (select company from lctx), (select id from lj), (select emp from lm),
       timestamptz '2026-02-02 08:00+01', timestamptz '2026-02-02 16:00+01'
union all select (select company from lctx), (select id from lj), (select emp from lm),
       timestamptz '2026-02-03 08:00+01', timestamptz '2026-02-03 16:00+01'
union all select (select company from lctx), (select id from lj), (select emp from lm),
       timestamptz '2026-02-04 08:00+01', timestamptz '2026-02-04 14:00+01';

-- A running entry must never count: it has no end yet.
insert into public.job_time_entries (company_id, job_id, member_id, started_at)
select (select company from lctx), (select id from lj), (select emp from lm), timestamptz '2026-02-05 08:00+01';

select pg_temp.sign_in('c2000000-0000-4000-8000-000000000001');

select pg_temp.assert(
  (select worked_minutes from public.member_month_figures((select emp from lm), date '2026-02-01')) = 1320,
  'Ist-Minuten Februar: 8h + 8h + 6h');
select pg_temp.assert(
  (select days_worked from public.member_month_figures((select emp from lm), date '2026-02-01')) = 3,
  'drei gearbeitete Tage, der laufende Eintrag zaehlt nicht');
-- 20 Arbeitstage * 8h = 9600 Minuten.
select pg_temp.assert(
  (select target_minutes from public.member_month_figures((select emp from lm), date '2026-02-01')) = 9600,
  'Soll-Minuten Februar bei 40h-Woche');

-- A different month has no hours at all, and says so with zero rather than null.
select pg_temp.assert(
  (select worked_minutes from public.member_month_figures((select emp from lm), date '2026-03-01')) = 0,
  'Monat ohne Arbeit ist null Minuten, nicht leer');

-- ---------------------------------------------------------------------------
-- Absences reduce the Soll, and only on days that would have been worked
-- ---------------------------------------------------------------------------
-- 16.–20. Februar 2026 ist Mo–Fr: fuenf Urlaubstage.
insert into public.employee_absences (company_id, member_id, absence_type, status, start_date, end_date)
select company, (select emp from lm), 'VACATION', 'APPROVED', date '2026-02-16', date '2026-02-20' from lctx;

select pg_temp.assert(
  (select vacation_days from public.member_month_figures((select emp from lm), date '2026-02-01')) = 5,
  'fuenf Urlaubstage');
select pg_temp.assert(
  (select target_minutes from public.member_month_figures((select emp from lm), date '2026-02-01')) = 7200,
  'Soll sinkt um fuenf Urlaubstage auf 15 * 8h');

-- Ein Wochenende im Urlaub darf das Soll nicht weiter senken.
insert into public.employee_absences (company_id, member_id, absence_type, status, start_date, end_date)
select company, (select emp from lm), 'SICKNESS', 'APPROVED', date '2026-02-07', date '2026-02-08' from lctx;
select pg_temp.assert(
  (select sick_days from public.member_month_figures((select emp from lm), date '2026-02-01')) = 0,
  'ein Wochenende krank aendert das Soll nicht');

-- Ein nicht genehmigter Urlaub zaehlt nicht.
insert into public.employee_absences (company_id, member_id, absence_type, status, start_date, end_date)
select company, (select emp from lm), 'VACATION', 'PENDING', date '2026-02-23', date '2026-02-24' from lctx;
select pg_temp.assert(
  (select vacation_days from public.member_month_figures((select emp from lm), date '2026-02-01')) = 5,
  'beantragter, nicht genehmigter Urlaub zaehlt nicht');

-- ---------------------------------------------------------------------------
-- Das Soll eines laufenden Monats endet heute
-- ---------------------------------------------------------------------------
-- Sonst steht Mitte des Monats das volle Monatssoll gegen die bisher
-- geleisteten Tage, und jede Person erscheint im Minus, ohne etwas versaeumt
-- zu haben.
select pg_temp.assert(
  public.working_days_between(date '2026-02-02', date '2026-02-06') = 5,
  'eine volle Woche Mo-Fr sind fuenf Arbeitstage');
select pg_temp.assert(
  public.working_days_between(date '2026-02-06', date '2026-02-02') = 0,
  'ein rueckwaerts laufender Zeitraum hat keine Arbeitstage');
select pg_temp.assert(
  public.working_days_between(date '2026-05-01', date '2026-05-31') = 18,
  'working_days_between deckt sich mit working_days_in_month');

-- Ein kuenftiger Monat kann kein Soll haben: niemand konnte dort arbeiten.
select pg_temp.assert(
  (select target_minutes from public.member_month_figures(
     (select emp from lm), (date_trunc('month', current_date) + interval '2 months')::date)) = 0,
  'ein Monat in der Zukunft hat kein Soll');
select pg_temp.assert(
  (select worked_minutes from public.member_month_figures(
     (select emp from lm), (date_trunc('month', current_date) + interval '2 months')::date)) = 0,
  'und auch keine Iststunden');

-- ---------------------------------------------------------------------------
-- No agreed week means no Soll — and therefore no claim about overtime
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select target_minutes from public.member_month_figures((select other from lm), date '2026-02-01')) is null,
  'ohne hinterlegte Wochenstunden gibt es kein Soll');
select pg_temp.assert(
  (select worked_minutes from public.member_month_figures((select other from lm), date '2026-02-01')) = 0,
  'die Iststunden werden trotzdem gezaehlt');

-- ---------------------------------------------------------------------------
-- Who may see what
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select count(*) from public.list_monthly_work_summary(date '2026-02-01')) = 2,
  'das Buero sieht beide Mitarbeitenden');
select pg_temp.assert(
  (select count(*) from public.list_monthly_work_days(date '2026-02-01')) = 3,
  'der Tagesnachweis hat eine Zeile je gearbeitetem Tag');

-- The employee sees their own month and nobody else's.
select pg_temp.sign_in('c2000000-0000-4000-8000-000000000002');
select pg_temp.assert(
  (select worked_minutes from public.my_monthly_work_summary(date '2026-02-01')) = 1320,
  'der Mitarbeiter sieht seine eigenen Stunden');
select pg_temp.assert(
  (select count(*) from public.list_monthly_work_summary(date '2026-02-01')) = 0,
  'ein Mitarbeiter sieht die Uebersicht des Betriebs nicht');
select pg_temp.assert(
  (select count(*) from public.list_monthly_work_days(date '2026-02-01')) = 0,
  'ein Mitarbeiter sieht den Tagesnachweis des Betriebs nicht');

-- Another tenant sees nothing at all.
select pg_temp.sign_in('c2000000-0000-4000-8000-000000000004');
select pg_temp.assert(
  (select count(*) from public.list_monthly_work_summary(date '2026-02-01')) = 0,
  'ein fremder Betrieb sieht nichts');
select pg_temp.assert(
  (select count(*) from public.list_monthly_work_days(date '2026-02-01')) = 0,
  'ein fremder Betrieb sieht auch keinen Tagesnachweis');

-- ---------------------------------------------------------------------------
-- duration_minutes is already net: the break is deducted once, by the trigger
-- ---------------------------------------------------------------------------
-- Stated explicitly because two screens used to subtract break_minutes from
-- duration_minutes a second time, which understated every paid hour that had a
-- break in it.
select pg_temp.sign_out();
insert into public.job_time_entries (company_id, job_id, member_id, started_at, finished_at)
select (select company from lctx), (select id from lj), (select other from lm),
       timestamptz '2026-02-10 08:00+01', timestamptz '2026-02-10 16:00+01';

create temporary table paused as
select id from public.job_time_entries where member_id = (select other from lm) limit 1;
grant select on paused to authenticated;

insert into public.job_time_breaks (company_id, time_entry_id, started_at, ended_at)
select (select company from lctx), (select id from paused),
       timestamptz '2026-02-10 12:00+01', timestamptz '2026-02-10 12:30+01';
-- Touch the row so the integrity trigger recomputes both figures.
update public.job_time_entries set updated_at = now() where id = (select id from paused);

select pg_temp.assert(
  (select break_minutes from public.job_time_entries where id = (select id from paused)) = 30,
  'die Pause wird mit 30 Minuten erfasst');
select pg_temp.assert(
  (select duration_minutes from public.job_time_entries where id = (select id from paused)) = 450,
  'acht Stunden minus 30 Minuten Pause sind 450 Nettominuten, nicht 480 und nicht 420');

select pg_temp.sign_in('c2000000-0000-4000-8000-000000000001');
select pg_temp.assert(
  (select worked_minutes from public.member_month_figures((select other from lm), date '2026-02-01')) = 450,
  'der Monatsabschluss uebernimmt die Nettominuten unveraendert');

-- ---------------------------------------------------------------------------
-- Lohngruppe und Stundenlohn
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('c2000000-0000-4000-8000-000000000001');

select public.set_employee_master_data(
  (select emp from lm), 'MA-001', 40, null, null, 'FULL_TIME'::public.employment_type, 'de', '',
  'LG 1', 1425);

select pg_temp.assert(
  (select wage_group from public.employee_details
    where profile_id = (select emp_profile from lctx)) = 'LG 1',
  'die Lohngruppe wird gespeichert');
select pg_temp.assert(
  (select hourly_wage_cents from public.employee_details
    where profile_id = (select emp_profile from lctx)) = 1425,
  'der Stundenlohn liegt in Cent, nicht als Gleitkommazahl');
select pg_temp.assert(
  (select wage_group from public.list_monthly_work_summary(date '2026-02-01')
    where member_id = (select emp from lm)) = 'LG 1',
  'der Monatsabschluss zeigt die Lohngruppe mit');

-- Ein negativer oder unsinnig hoher Satz kommt gar nicht erst hinein.
select pg_temp.assert_rejected(
  format('select public.set_employee_master_data(%L, %L, 40, null, null, %L, %L, %L, %L, -100)',
         (select emp from lm), 'MA-001', 'FULL_TIME', 'de', '', 'LG 1'),
  'Invalid hourly wage');
select pg_temp.assert_rejected(
  format('select public.set_employee_master_data(%L, %L, 40, null, null, %L, %L, %L, %L, 999999)',
         (select emp from lm), 'MA-001', 'FULL_TIME', 'de', '', 'LG 1'),
  'Invalid hourly wage');

-- Ohne Angabe bleibt das Feld leer, statt auf null gesetzt zu raten.
select public.set_employee_master_data(
  (select other from lm), 'MA-002', null, null, null, null, 'de', '');
select pg_temp.assert(
  (select hourly_wage_cents from public.employee_details
    where profile_id = (select other_profile from lctx)) is null,
  'ohne Angabe bleibt der Stundenlohn leer');

-- Genau eine Signatur: eine zweite Ueberladung hat dieses Projekt schon einmal
-- komplett lahmgelegt.
select pg_temp.assert(
  (select count(*) from pg_proc where proname = 'set_employee_master_data') = 1,
  'set_employee_master_data existiert genau einmal');
select pg_temp.assert(
  (select count(*) from pg_proc where proname = 'list_monthly_work_summary') = 1,
  'list_monthly_work_summary existiert genau einmal');

select pg_temp.sign_out();
rollback;
\o
\echo 'Monatsabschluss invariants: all assertions passed'
