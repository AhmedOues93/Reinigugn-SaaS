-- Wiedererkennung nachgetragener Zeitbuchungen. Run with supabase/test/run.sh.
--
-- Die Warteschlange eines Telefons stellt dieselbe Buchung manchmal zweimal zu
-- und manchmal in anderer Reihenfolge. Beides darf die erfasste Zeit nicht
-- veraendern -- weder nach oben noch nach unten. Diese Suite haelt beide
-- Richtungen fest:
--
--   * Eine zweite Zustellung derselben Buchung bucht nichts doppelt.
--   * Eine *neue* Buchung wird nicht fuer eine zweite Zustellung gehalten und
--     verschwindet.
--
-- Der zweite Punkt war der Fehler: die Wiedererkennung fragte, ob es zu diesem
-- Einsatz ueberhaupt schon einen Eintrag gibt. Eine zweite Schicht am selben
-- Einsatz war damit nicht nachtragbar, und zwar ohne Fehlermeldung.
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
  ('f9000000-0000-4000-8000-000000000001', 'owner@idem.test'),
  ('f9000000-0000-4000-8000-000000000011', 'anna@idem.test'),
  ('f9000000-0000-4000-8000-000000000012', 'bernd@idem.test');

select pg_temp.sign_in('f9000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Doppelschicht GmbH');
select pg_temp.sign_out();

create temporary table ctx as select
  (select id from public.companies where name = 'Doppelschicht GmbH') as company;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select ctx.company, profile.id, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status
from ctx, public.profiles profile
where profile.auth_user_id in ('f9000000-0000-4000-8000-000000000011', 'f9000000-0000-4000-8000-000000000012');

insert into public.customers (company_id, name) select company, 'Hausverwaltung Sued' from ctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company, customer.id, 'Treppenhaus A'
from ctx join public.customers customer on customer.company_id = ctx.company;

insert into public.jobs (company_id, customer_id, cleaning_object_id, title, scheduled_date,
                         planned_start_at, planned_end_at, status)
select ctx.company, customer.id, object.id, title, current_date,
  (current_date + t) at time zone 'Europe/Berlin',
  (current_date + t + interval '2 hours') at time zone 'Europe/Berlin', 'PLANNED'
from ctx
join public.customers customer on customer.company_id = ctx.company
join public.cleaning_objects object on object.company_id = ctx.company
cross join (values ('Treppenhaus frueh', time '06:00'), ('Nebenobjekt', time '15:00')) as v(title, t);

create temporary table ids as select
  (select id from public.jobs where title = 'Treppenhaus frueh') as job,
  (select id from public.jobs where title = 'Nebenobjekt') as other_job,
  (select member.id from public.company_members member
     join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'f9000000-0000-4000-8000-000000000011') as anna,
  (select member.id from public.company_members member
     join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'f9000000-0000-4000-8000-000000000012') as bernd;
grant select on ids to authenticated;

insert into public.job_assignments (company_id, job_id, member_id)
select ctx.company, ids.job, ids.anna from ctx, ids;
-- Bernd ist demselben Einsatz zugewiesen und arbeitet nicht: der Einsatz
-- bleibt deshalb IN_PROGRESS, nachdem Anna Feierabend getippt hat. Genau
-- dieser Fall liess die zweite Schicht verschwinden.
insert into public.job_assignments (company_id, job_id, member_id)
select ctx.company, ids.job, ids.bernd from ctx, ids;
insert into public.job_assignments (company_id, job_id, member_id)
select ctx.company, ids.other_job, ids.anna from ctx, ids;

-- ---------------------------------------------------------------------------
-- Erste Schicht, nachgetragen: 08:00 bis 09:00 vor sechs bzw. fuenf Stunden.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('f9000000-0000-4000-8000-000000000011');

create temporary table shift1 as
select public.start_my_job((select job from ids), now() - interval '6 hours') as entry;

-- Zweite Zustellung derselben Buchung: dieselbe Kennung, kein zweiter Eintrag.
select pg_temp.assert(
  public.start_my_job((select job from ids), now() - interval '6 hours') = (select entry from shift1),
  'Eine zweite Zustellung desselben Starts muss dieselbe Buchung zurueckgeben.');

-- Pause, zweimal zugestellt.
create temporary table break1 as
select public.pause_my_job((select job from ids), now() - interval '5 hours 40 minutes') as id;
select pg_temp.assert(
  public.pause_my_job((select job from ids), now() - interval '5 hours 40 minutes') = (select id from break1),
  'Eine zweite Zustellung derselben Pause darf keine zweite Pause anlegen.');

-- Eine *neue* Pause, waehrend eine laeuft, ist ein Fehler und kein Doppel.
select pg_temp.reject(
  $$select public.pause_my_job((select job from ids), now() - interval '5 hours 20 minutes')$$,
  'Eine zweite Pause waehrend einer laufenden muss abgelehnt werden.');

-- Fortsetzen, zweimal zugestellt.
select pg_temp.assert(
  public.resume_my_job((select job from ids), now() - interval '5 hours 30 minutes') = (select id from break1),
  'Fortsetzen muss die laufende Pause beenden.');
select pg_temp.assert(
  public.resume_my_job((select job from ids), now() - interval '5 hours 30 minutes') = (select id from break1),
  'Eine zweite Zustellung desselben Fortsetzens darf nichts aendern.');

-- Ein Fortsetzen ohne passende Pause ist ein Fehler. Vorher wurde hier die
-- letzte Pause zurueckgemeldet, egal wann sie endete -- eine verlorene
-- Buchung sah damit wie eine erledigte aus.
select pg_temp.reject(
  $$select public.resume_my_job((select job from ids), now() - interval '4 hours')$$,
  'Fortsetzen ohne laufende Pause und ohne passendes Ende muss abgelehnt werden.');

select public.stop_my_job((select job from ids), now() - interval '5 hours');
select pg_temp.assert(
  public.stop_my_job((select job from ids), now() - interval '5 hours') = (select entry from shift1),
  'Eine zweite Zustellung desselben Feierabends muss dieselbe Buchung zurueckgeben.');

-- Ein Feierabend, zu dem kein so beendeter Eintrag gehoert, ist eine fehlende
-- laufende Zeit -- das soll auffallen und nicht als erledigt gelten.
select pg_temp.reject(
  $$select public.stop_my_job((select job from ids), now() - interval '3 hours')$$,
  'Ein Feierabend ohne laufende und ohne passend beendete Buchung muss abgelehnt werden.');

select pg_temp.sign_out();

select pg_temp.assert(
  (select status from public.jobs where id = (select job from ids)) = 'IN_PROGRESS',
  'Solange eine zugewiesene Kraft nicht fertig ist, bleibt der Einsatz IN_PROGRESS.');

-- ---------------------------------------------------------------------------
-- Zweite Schicht am selben Einsatz, nachgetragen. Das ist der Fehler, der
-- Arbeitszeit verschluckte.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('f9000000-0000-4000-8000-000000000011');
create temporary table shift2 as
select public.start_my_job((select job from ids), now() - interval '2 hours') as entry;
select pg_temp.assert(
  (select entry from shift2) <> (select entry from shift1),
  'Eine zweite Schicht am selben Einsatz muss eine eigene Buchung werden.');
select public.stop_my_job((select job from ids), now() - interval '10 minutes');
select pg_temp.sign_out();

select pg_temp.assert(
  (select count(*) from public.job_time_entries
    where job_id = (select job from ids) and member_id = (select anna from ids)) = 2,
  'Nach zwei Schichten muessen zwei Buchungen stehen.');
select pg_temp.assert(
  (select sum(extract(epoch from (finished_at - started_at)) / 60)::int
     from public.job_time_entries
    where job_id = (select job from ids) and member_id = (select anna from ids)) = 170,
  'Die erfasste Zeit muss 60 + 110 Minuten ergeben.');

-- ---------------------------------------------------------------------------
-- Eine nachgetragene Schicht, die in eine bereits erfasste hineinreicht, wird
-- abgelehnt. Sonst zaehlt der Monatsabschluss dieselbe Stunde zweimal.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('f9000000-0000-4000-8000-000000000011');
select pg_temp.reject(
  $$select public.start_my_job((select other_job from ids), now() - interval '90 minutes')$$,
  'Eine nachgetragene Schicht darf sich nicht mit einer erfassten ueberschneiden.');
-- Nach der letzten erfassten Zeit ist sie dagegen zulaessig.
select pg_temp.assert(
  public.start_my_job((select other_job from ids), now() - interval '5 minutes') is not null,
  'Nach dem Ende der letzten Buchung muss ein Nachtrag moeglich sein.');
select pg_temp.sign_out();

select pg_temp.assert(
  (select count(*) from public.job_time_entries where member_id = (select anna from ids)) = 3,
  'Es duerfen genau die drei gebuchten Zeiten stehen.');
select pg_temp.assert(
  not exists (
    select 1
    from public.job_time_entries a
    join public.job_time_entries b on b.member_id = a.member_id and b.id <> a.id
    where a.member_id = (select anna from ids)
      and a.started_at < coalesce(b.finished_at, now())
      and coalesce(a.finished_at, now()) > b.started_at
  ),
  'Keine zwei Buchungen derselben Kraft duerfen sich ueberschneiden.');

rollback;
\o
\echo 'offline time idempotency invariants: all assertions passed'
