-- Pausen, die sich nicht ueberlappen duerfen. Run with supabase/test/run.sh.
--
-- Der Defekt, den diese Suite festhaelt: `pause_my_job` prueft den
-- nachgetragenen Zeitpunkt gegen den Arbeitsbeginn, aber nicht gegen die
-- zuletzt beendete Pause. Zwei Pausen konnten sich darum ueberlappen, und
-- `ensure_time_entry_integrity` summiert sie -- es klammert jede einzelne auf
-- das Arbeitsfenster, erkennt aber keine Ueberlappung.
--
-- Gemessen vor dem Fix: 60 Minuten echte Pause ergaben 75 gezaehlte, und
-- `duration_minutes` lag 15 Minuten zu niedrig. Lautlos, ohne Fehlermeldung,
-- und im Monatsabschluss steht die zu niedrige Zahl.
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

insert into auth.users (id, email) values
  ('f1100000-0000-4000-8000-000000000001', 'inhaberin@pause.test'),
  ('f1100000-0000-4000-8000-000000000002', 'kraft@pause.test');

select pg_temp.sign_in('f1100000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Pausen GmbH');
select pg_temp.sign_out();

insert into public.company_members (company_id, profile_id, role, status)
select (select id from public.companies where name = 'Pausen GmbH'), profile.id,
       'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status
from public.profiles profile where profile.auth_user_id = 'f1100000-0000-4000-8000-000000000002';

insert into public.customers (company_id, name)
values ((select id from public.companies where name = 'Pausen GmbH'), 'Pausenkunde');
insert into public.cleaning_objects (company_id, customer_id, name)
select customer.company_id, customer.id, 'Pausenobjekt' from public.customers customer;
insert into public.jobs
  (company_id, customer_id, cleaning_object_id, title, scheduled_date, planned_start_at, planned_end_at, status)
select customer.company_id, customer.id, object.id, 'Pauseneinsatz', current_date,
  (current_date + time '08:00') at time zone 'Europe/Berlin',
  (current_date + time '18:00') at time zone 'Europe/Berlin', 'PLANNED'::public.job_status
from public.customers customer join public.cleaning_objects object on object.customer_id = customer.id;
insert into public.job_assignments (company_id, job_id, member_id)
select job.company_id, job.id, member.id
from public.jobs job join public.company_members member
  on member.company_id = job.company_id and member.role = 'EMPLOYEE';

create temporary table pj as select id from public.jobs limit 1;
grant select on pj to authenticated;

-- ---------------------------------------------------------------------------
-- Der Normalfall: zwei Pausen hintereinander zaehlen genau ihre Minuten
-- ---------------------------------------------------------------------------
-- Alle Zeitpunkte liegen in der Vergangenheit: `effective_entry_time` weist
-- Zukunft ab, und in einer einzigen Transaktion geht `now()` nicht weiter.
-- Die Zeitpunkte liegen bewusst weit zurueck (40 bis 30 Stunden) und nicht
-- knapp vor jetzt: weiter unten tragt dieselbe Kraft einen zweiten Einsatz
-- nach, und zwei Arbeitszeiten derselben Kraft duerfen sich nicht
-- ueberschneiden. Die Abstaende innerhalb der Schicht sind unveraendert, die
-- Zusicherungen rechnen ohnehin nur mit ihnen.
select pg_temp.sign_in('f1100000-0000-4000-8000-000000000002');
select public.start_my_job((select id from pj), now() - interval '40 hours');
select public.pause_my_job((select id from pj), now() - interval '39 hours');
select public.resume_my_job((select id from pj), now() - interval '38 hours 30 minutes');
select public.pause_my_job((select id from pj), now() - interval '37 hours');
select public.resume_my_job((select id from pj), now() - interval '36 hours 45 minutes');

select pg_temp.assert(
  (select count(*) from public.job_time_breaks) = 2,
  'zwei Pausen sind angelegt');
select pg_temp.assert(
  (select break_minutes from public.job_time_entries) = 45,
  'dreissig plus fuenfzehn Minuten ergeben fuenfundvierzig');

-- ---------------------------------------------------------------------------
-- Der Defekt: eine Pause mitten in der vorigen
-- ---------------------------------------------------------------------------
select pg_temp.assert_rejected(
  'select public.pause_my_job((select id from pj), now() - interval ''38 hours 45 minutes'')',
  'beginnt vor dem Ende der vorigen Pause');
select pg_temp.assert(
  (select count(*) from public.job_time_breaks) = 2
  and (select break_minutes from public.job_time_entries) = 45,
  'und sie hat nichts hinterlassen');

-- Auch nicht mit exakt demselben Beginn wie die vorige Pause.
select pg_temp.assert_rejected(
  'select public.pause_my_job((select id from pj), now() - interval ''39 hours'')',
  'beginnt vor dem Ende der vorigen Pause');

-- Direkt am Ende der vorigen Pause ist dagegen erlaubt: zweimal kurz
-- hintereinander getippt ist eine Pause von null Minuten und kein Fehler.
select public.pause_my_job((select id from pj), now() - interval '36 hours 45 minutes');
select public.resume_my_job((select id from pj), now() - interval '36 hours 45 minutes');
select pg_temp.assert(
  (select count(*) from public.job_time_breaks) = 3
  and (select break_minutes from public.job_time_entries) = 45,
  'eine Pause von null Minuten ist erlaubt und aendert die Summe nicht');

-- ---------------------------------------------------------------------------
-- Die bestehenden Riegel gelten weiter
-- ---------------------------------------------------------------------------
select pg_temp.assert_rejected(
  'select public.pause_my_job((select id from pj), now() - interval ''41 hours'')',
  'liegt vor dem Arbeitsbeginn');
select pg_temp.assert_rejected(
  'select public.pause_my_job((select id from pj), now() + interval ''10 minutes'')',
  'Zukunft');

-- Eine zweite laufende Pause gibt es nicht -- weder ueber die Funktion noch
-- ueber den Index.
select public.pause_my_job((select id from pj), now() - interval '35 hours');
select pg_temp.assert_rejected(
  'select public.pause_my_job((select id from pj), null)',
  'already running');
select pg_temp.assert(
  (select count(*) from public.job_time_breaks where ended_at is null) = 1,
  'genau eine laufende Pause');

-- Das Pausenende darf nicht vor ihrem Beginn liegen.
select pg_temp.assert_rejected(
  'select public.resume_my_job((select id from pj), now() - interval ''36 hours'')',
  'Ende der Pause liegt vor ihrem Beginn');
select public.resume_my_job((select id from pj), now() - interval '34 hours');

-- ---------------------------------------------------------------------------
-- Netto bleibt nachvollziehbar und nie negativ
-- ---------------------------------------------------------------------------
-- 10 Stunden Anwesenheit, 30 + 15 + 0 + 60 Minuten Pause = 105 Minuten.
select pg_temp.assert(
  (select break_minutes from public.job_time_entries) = 105,
  'die Pausensumme stimmt mit den vier Pausen ueberein');
select public.stop_my_job((select id from pj), now() - interval '30 hours');
select pg_temp.assert(
  (select duration_minutes from public.job_time_entries) between 0 and 600
  and (select duration_minutes from public.job_time_entries)
      = floor(extract(epoch from (
          (select finished_at from public.job_time_entries)
          - (select started_at from public.job_time_entries))) / 60)::integer - 105,
  'die Nettozeit ist Anwesenheit minus Pausensumme');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Ein Feierabend vor dem Ende einer Pause rechnet richtig
-- ---------------------------------------------------------------------------
-- Festgehalten, weil es falsch *aussieht*: die Klammerung in
-- `ensure_time_entry_integrity` schneidet jede Pause auf das Arbeitsfenster,
-- also bleibt die Nettozeit korrekt und nie negativ. Dafuer braucht es keinen
-- weiteren Riegel -- und das soll niemand aus Vorsicht nachtraeglich einbauen.
insert into public.jobs
  (company_id, customer_id, cleaning_object_id, title, scheduled_date, planned_start_at, planned_end_at, status)
select customer.company_id, customer.id, object.id, 'Zweiter Pauseneinsatz', current_date,
  (current_date + time '08:00') at time zone 'Europe/Berlin',
  (current_date + time '18:00') at time zone 'Europe/Berlin', 'PLANNED'::public.job_status
from public.customers customer join public.cleaning_objects object on object.customer_id = customer.id;
insert into public.job_assignments (company_id, job_id, member_id)
select job.company_id, job.id, member.id
from public.jobs job join public.company_members member
  on member.company_id = job.company_id and member.role = 'EMPLOYEE'
where job.title = 'Zweiter Pauseneinsatz';

create temporary table pj2 as select id from public.jobs where title = 'Zweiter Pauseneinsatz';
grant select on pj2 to authenticated;

select pg_temp.sign_in('f1100000-0000-4000-8000-000000000002');
select public.start_my_job((select id from pj2), now() - interval '10 hours');
select public.pause_my_job((select id from pj2), now() - interval '9 hours 30 minutes');
select public.resume_my_job((select id from pj2), now() - interval '8 hours');
-- Feierabend mitten in der eben beendeten Pause.
select public.stop_my_job((select id from pj2), now() - interval '9 hours');
select pg_temp.assert(
  (select break_minutes from public.job_time_entries where job_id = (select id from pj2)) = 30,
  'die Pause wird auf das Arbeitsfenster geklammert: dreissig statt neunzig Minuten');
select pg_temp.assert(
  (select duration_minutes from public.job_time_entries where job_id = (select id from pj2)) = 30,
  'und die Nettozeit ist dreissig Minuten, nicht negativ');
select pg_temp.sign_out();

rollback;
\o
\echo 'Pausen ohne Ueberlappung: all assertions passed'
