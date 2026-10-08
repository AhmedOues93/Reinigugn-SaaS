-- Eine zweite Zustellung von Pause und Fortsetzen, nachdem der Feierabend
-- schon gebucht ist. Run with supabase/test/run.sh.
--
-- Start und Feierabend erkennen eine zweite Zustellung auch dann noch, wenn
-- die Buchung bereits beendet ist: sie suchen nach einem Eintrag mit passendem
-- started_at bzw. finished_at. Pause und Fortsetzen taten das nicht. Beide
-- verlangten eine noch *offene* Buchung und lehnten sonst mit 'No active time
-- entry found' ab -- und zwar fuer immer, denn ein beendeter Eintrag wird nie
-- wieder offen.
--
-- Erreichbar ist dieser Zustand auf einem Telefon mit zwei offenen Laschen
-- derselben App, die sich eine Warteschlange teilen. Nachgemessen in einem
-- echten Chromium:
--
--   Lasche A sendet die Pause. Der Server bucht sie. Die Antwort geht beim
--   Wechsel von Mobilfunk auf WLAN verloren, Lasche A wartet noch auf ihren
--   Zeitablauf. Lasche B raeumt dieselbe Warteschlange weiter auf: die Pause
--   wird als zweite Zustellung erkannt, Fortsetzen und Feierabend gehen
--   durch, und alle drei verlassen die Warteschlange. Erst danach laeuft
--   Lasche A in ihren Zeitablauf und vermerkt den Fehlversuch -- und legt die
--   laengst zugestellte Pause damit wieder an.
--
-- Von da an war die Warteschlange nicht mehr leer zu bekommen. Und weil
-- runSync nach einem Fehlschlag jede weitere Buchung *desselben Einsatzes*
-- zurueckhaelt, kam auch die naechste Schicht an diesem Einsatz nie mehr
-- durch: Arbeitszeit, die auf dem Geraet liegen bleibt, ohne Meldung.
--
-- Die Gegenseite des Fehlers steht unten mit: eine Pause oder ein Fortsetzen
-- *ohne* passenden Zeitpunkt bleibt abgelehnt. Eine wirklich fehlende
-- laufende Zeit soll auffallen und nicht als erledigt gelten.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;

create or replace function pg_temp.sign_in(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set role authenticated;
end; $$;
create or replace function pg_temp.sign_out() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', true); end; $$;
create or replace function pg_temp.assert(p_condition boolean, p_message text) returns void language plpgsql as $$
begin if not p_condition then raise exception 'ASSERTION FAILED: %', p_message; end if; end; $$;
/** Fuehrt eine Anweisung aus und erwartet, dass sie abgelehnt wird. */
create or replace function pg_temp.reject(p_sql text, p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ASSERTION FAILED: % (wurde nicht abgelehnt)', p_message;
exception
  when sqlstate 'P0001' then
    if position('ASSERTION FAILED' in sqlerrm) > 0 then raise; end if;
  when others then null;
end; $$;

insert into auth.users (id, email) values
  ('f9100000-0000-4000-8000-000000000001', 'owner@redelivery.test'),
  ('f9100000-0000-4000-8000-000000000011', 'anna@redelivery.test'),
  ('f9100000-0000-4000-8000-000000000012', 'bernd@redelivery.test');

select pg_temp.sign_in('f9100000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Zwei Laschen GmbH');
select pg_temp.sign_out();

create temporary table ctx as select
  (select id from public.companies where name = 'Zwei Laschen GmbH') as company;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select ctx.company, profile.id, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status
from ctx, public.profiles profile
where profile.auth_user_id in ('f9100000-0000-4000-8000-000000000011', 'f9100000-0000-4000-8000-000000000012');

insert into public.customers (company_id, name) select company, 'Hausverwaltung Nord' from ctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company, customer.id, 'Treppenhaus B'
from ctx join public.customers customer on customer.company_id = ctx.company;

insert into public.jobs (company_id, customer_id, cleaning_object_id, title, scheduled_date,
                         planned_start_at, planned_end_at, status)
select ctx.company, customer.id, object.id, 'Treppenhaus Vormittag', current_date,
  (current_date + time '06:00') at time zone 'Europe/Berlin',
  (current_date + time '08:00') at time zone 'Europe/Berlin', 'PLANNED'
from ctx
join public.customers customer on customer.company_id = ctx.company
join public.cleaning_objects object on object.company_id = ctx.company;

create temporary table ids as select
  (select id from public.jobs where title = 'Treppenhaus Vormittag') as job,
  (select member.id from public.company_members member
     join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'f9100000-0000-4000-8000-000000000011') as anna,
  (select member.id from public.company_members member
     join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'f9100000-0000-4000-8000-000000000012') as bernd;
grant select on ids to authenticated;

insert into public.job_assignments (company_id, job_id, member_id)
select ctx.company, ids.job, ids.anna from ctx, ids;
-- Bernd haelt den Einsatz auf IN_PROGRESS, damit der Fall dem gemessenen
-- entspricht und nicht am Einsatzstatus haengt.
insert into public.job_assignments (company_id, job_id, member_id)
select ctx.company, ids.job, ids.bernd from ctx, ids;

-- ---------------------------------------------------------------------------
-- Eine vollstaendige Schicht, nachgetragen: Start, Pause, Fortsetzen,
-- Feierabend. Danach ist die Buchung beendet.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('f9100000-0000-4000-8000-000000000011');

create temporary table shift as
select public.start_my_job((select job from ids), now() - interval '4 hours') as entry;
create temporary table brk as
select public.pause_my_job((select job from ids), now() - interval '3 hours') as id;
select public.resume_my_job((select job from ids), now() - interval '2 hours 30 minutes');
select public.stop_my_job((select job from ids), now() - interval '1 hour');

select pg_temp.assert(
  (select finished_at is not null from public.job_time_entries where id = (select entry from shift)),
  'Die Buchung muss nach dem Feierabend beendet sein.');

-- ---------------------------------------------------------------------------
-- Und nun die zweite Zustellung, die auf dem Geraet wieder aufgetaucht ist.
-- Sie traegt denselben Zeitpunkt wie die erste, also ist sie dieselbe Buchung
-- und muss deren Kennung zurueckgeben -- nicht abgelehnt werden.
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  public.pause_my_job((select job from ids), now() - interval '3 hours') = (select id from brk),
  'Eine zweite Zustellung derselben Pause muss auch nach dem Feierabend die vorhandene Pause zurueckgeben.');

select pg_temp.assert(
  public.resume_my_job((select job from ids), now() - interval '2 hours 30 minutes') = (select id from brk),
  'Eine zweite Zustellung desselben Fortsetzens muss auch nach dem Feierabend die vorhandene Pause zurueckgeben.');

-- Die Gegenrichtung: ohne passenden Zeitpunkt bleibt es abgelehnt.
select pg_temp.reject(
  $$select public.pause_my_job((select job from ids), now() - interval '20 minutes')$$,
  'Eine Pause ohne laufende Buchung und ohne passenden Beginn muss abgelehnt werden.');
select pg_temp.reject(
  $$select public.resume_my_job((select job from ids), now() - interval '20 minutes')$$,
  'Ein Fortsetzen ohne laufende Buchung und ohne passendes Ende muss abgelehnt werden.');

-- Eine Buchung ohne uebermittelten Zeitpunkt ist kein Nachtrag und hat keine
-- Wiedererkennung: sie braucht eine laufende Zeit.
select pg_temp.reject(
  $$select public.pause_my_job((select job from ids))$$,
  'Eine Pause ohne Zeitpunkt muss ohne laufende Buchung abgelehnt werden.');
select pg_temp.reject(
  $$select public.resume_my_job((select job from ids))$$,
  'Ein Fortsetzen ohne Zeitpunkt muss ohne laufende Buchung abgelehnt werden.');

select pg_temp.sign_out();

-- Nichts davon darf die erfasste Zeit veraendert haben: eine Buchung, eine
-- Pause, 180 Minuten brutto minus 30 Minuten Pause.
select pg_temp.assert(
  (select count(*) from public.job_time_entries
    where job_id = (select job from ids) and member_id = (select anna from ids)) = 1,
  'Die zweiten Zustellungen duerfen keine zweite Buchung angelegt haben.');
select pg_temp.assert(
  (select count(*) from public.job_time_breaks where time_entry_id = (select entry from shift)) = 1,
  'Die zweiten Zustellungen duerfen keine zweite Pause angelegt haben.');
select pg_temp.assert(
  (select extract(epoch from (finished_at - started_at)) / 60
     from public.job_time_entries where id = (select entry from shift))::int = 180,
  'Die Bruttozeit muss 180 Minuten bleiben.');
select pg_temp.assert(
  (select break_minutes from public.job_time_entries where id = (select entry from shift)) = 30,
  'Die Pause muss 30 Minuten bleiben.');

-- ---------------------------------------------------------------------------
-- Eine neue Schicht am selben Einsatz bleibt nachtragbar: die Wiedererkennung
-- darf nicht so weit greifen, dass sie eine echte zweite Pause verschluckt.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('f9100000-0000-4000-8000-000000000011');
create temporary table shift2 as
select public.start_my_job((select job from ids), now() - interval '45 minutes') as entry;
select pg_temp.assert(
  (select entry from shift2) <> (select entry from shift),
  'Eine zweite Schicht muss eine eigene Buchung werden.');
create temporary table brk2 as
select public.pause_my_job((select job from ids), now() - interval '30 minutes') as id;
select pg_temp.assert(
  (select id from brk2) <> (select id from brk),
  'Eine Pause der zweiten Schicht darf nicht die Pause der ersten zurueckgeben.');
select public.resume_my_job((select job from ids), now() - interval '25 minutes');
select public.stop_my_job((select job from ids), now() - interval '5 minutes');
select pg_temp.sign_out();

select pg_temp.assert(
  (select count(*) from public.job_time_breaks brk
     join public.job_time_entries entry on entry.id = brk.time_entry_id
    where entry.member_id = (select anna from ids)) = 2,
  'Nach zwei Schichten mit je einer Pause muessen zwei Pausen stehen.');

rollback;
\o
\echo 'offline redelivery after stop invariants: all assertions passed'
