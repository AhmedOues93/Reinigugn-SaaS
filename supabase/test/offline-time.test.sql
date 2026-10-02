-- Zeiterfassung ohne Empfang. Run with supabase/test/run.sh.
--
-- Die Checkliste liess sich im Keller abhaken, die Uhr nicht. Jetzt nehmen die
-- vier Zeitfunktionen einen nachgetragenen Zeitpunkt entgegen. Ein vom Geraet
-- gelieferter Zeitpunkt ist eine Behauptung, keine Messung -- diese Suite
-- haelt fest, wie eng er gefuehrt wird, und dass eine zweimal zugestellte
-- Warteschlange nichts doppelt bucht.
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

insert into auth.users (id, email) values
  ('f7000000-0000-4000-8000-000000000001', 'owner@offline.test'),
  ('f7000000-0000-4000-8000-000000000011', 'kraft@offline.test');

select pg_temp.sign_in('f7000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Kellerreinigung GmbH');
select pg_temp.sign_out();

create temporary table ctx as select
  (select id from public.companies where name = 'Kellerreinigung GmbH') as company;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select ctx.company, profile.id, 'EMPLOYEE', 'ACTIVE'
from ctx, public.profiles profile where profile.auth_user_id = 'f7000000-0000-4000-8000-000000000011';

insert into public.customers (company_id, name) select company, 'Tiefgarage Nord GmbH' from ctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company, customer.id, 'Tiefgarage Ebene 3'
from ctx join public.customers customer on customer.company_id = ctx.company;

insert into public.jobs (company_id, customer_id, cleaning_object_id, title, scheduled_date,
                         planned_start_at, planned_end_at, status)
select ctx.company, customer.id, object.id, title, current_date,
  (current_date + t) at time zone 'Europe/Berlin',
  (current_date + t + interval '2 hours') at time zone 'Europe/Berlin', 'PLANNED'
from ctx
join public.customers customer on customer.company_id = ctx.company
join public.cleaning_objects object on object.company_id = ctx.company
cross join (values ('Keller morgens', time '06:00'), ('Keller nachmittags', time '14:00')) as v(title, t);

create temporary table ids as select
  (select id from public.jobs where title = 'Keller morgens') as job_a,
  (select id from public.jobs where title = 'Keller nachmittags') as job_b,
  (select member.id from public.company_members member
     join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'f7000000-0000-4000-8000-000000000011') as kraft;
grant select on ids to authenticated;

insert into public.job_assignments (company_id, job_id, member_id)
select ctx.company, ids.job_a, ids.kraft from ctx, ids;
insert into public.job_assignments (company_id, job_id, member_id)
select ctx.company, ids.job_b, ids.kraft from ctx, ids;

-- ---------------------------------------------------------------------------
-- Nachgetragen: Start vor drei Stunden, Pause dazwischen, Feierabend vor einer.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('f7000000-0000-4000-8000-000000000011');
select public.start_my_job((select job_a from ids), now() - interval '3 hours');
select public.pause_my_job((select job_a from ids), now() - interval '2 hours');
select public.resume_my_job((select job_a from ids), now() - interval '90 minutes');
select public.stop_my_job((select job_a from ids), now() - interval '1 hour');
select pg_temp.sign_out();

select pg_temp.assert(
  (select duration_minutes from public.job_time_entries where job_id = (select job_a from ids)) = 90,
  'drei Stunden abzueglich 30 Minuten Pause ergeben 90 Minuten netto');
select pg_temp.assert(
  (select break_minutes from public.job_time_entries where job_id = (select job_a from ids)) = 30,
  'die nachgetragene Pause wird als Pause gefuehrt');
select pg_temp.assert(
  (select status from public.jobs where id = (select job_a from ids)) = 'COMPLETED',
  'der nachgetragene Feierabend schliesst den Einsatz ab');
select pg_temp.assert(
  (select count(*) from public.service_records where job_id = (select job_a from ids)) = 1,
  'auch aus einer nachgetragenen Schicht entsteht ein Leistungsnachweis');

-- Woher der Eintrag stammt, bleibt sichtbar: sonst sieht eine nachgetragene
-- Schicht im Monatsabschluss aus wie eine gestempelte.
select pg_temp.assert(
  (select start_source from public.job_time_entries where job_id = (select job_a from ids))::text = 'OFFLINE'
    and (select end_source from public.job_time_entries where job_id = (select job_a from ids))::text = 'OFFLINE',
  'eine nachgetragene Buchung ist als OFFLINE gekennzeichnet');

-- ---------------------------------------------------------------------------
-- Dieselbe Warteschlange ein zweites Mal: nichts doppelt.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('f7000000-0000-4000-8000-000000000011');
select public.start_my_job((select job_a from ids), now() - interval '3 hours');
select public.stop_my_job((select job_a from ids), now() - interval '1 hour');
select pg_temp.sign_out();
select pg_temp.assert(
  (select count(*) from public.job_time_entries where job_id = (select job_a from ids)) = 1,
  'eine erneut zugestellte Warteschlange legt keine zweite Buchung an');
select pg_temp.assert(
  (select duration_minutes from public.job_time_entries where job_id = (select job_a from ids)) = 90,
  'und sie veraendert die erfasste Zeit nicht');

-- ---------------------------------------------------------------------------
-- Was nicht nachgetragen wird.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('f7000000-0000-4000-8000-000000000011');
do $$
begin
  begin
    perform public.start_my_job((select job_b from ids), now() + interval '2 hours');
    raise exception 'NOT REJECTED: ein Zeitpunkt in der Zukunft wurde gebucht';
  exception when others then
    if position('Zukunft' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    perform public.start_my_job((select job_b from ids), now() - interval '5 days');
    raise exception 'NOT REJECTED: eine fuenf Tage alte Buchung wurde nachgetragen';
  exception when others then
    if position('48 Stunden' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();
select pg_temp.assert(
  (select count(*) from public.job_time_entries where job_id = (select job_b from ids)) = 0,
  'nach den abgelehnten Versuchen steht keine Buchung am zweiten Einsatz');

-- Eine leicht vorgehende Telefonuhr wird auf jetzt zurueckgeholt statt
-- abgelehnt -- sonst scheitert die halbe Belegschaft an ihrer Geraeteuhr.
select pg_temp.sign_in('f7000000-0000-4000-8000-000000000011');
select public.start_my_job((select job_b from ids), now() + interval '30 seconds');
select pg_temp.sign_out();
select pg_temp.assert(
  (select started_at from public.job_time_entries where job_id = (select job_b from ids)) <= now(),
  'eine um Sekunden vorgehende Uhr wird auf jetzt begrenzt, nicht abgelehnt');

-- Der Feierabend darf nicht vor dem Arbeitsbeginn liegen.
select pg_temp.sign_in('f7000000-0000-4000-8000-000000000011');
do $$
begin
  begin
    perform public.stop_my_job((select job_b from ids), now() - interval '4 hours');
    raise exception 'NOT REJECTED: Feierabend vor Arbeitsbeginn';
  exception when others then
    if position('vor dem Arbeitsbeginn' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();
select pg_temp.assert(
  (select finished_at from public.job_time_entries where job_id = (select job_b from ids)) is null,
  'der abgelehnte Feierabend laesst die Uhr weiterlaufen');

-- ---------------------------------------------------------------------------
-- Live-Betrieb unveraendert: ohne Zeitpunkt bleibt alles, wie es war.
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select start_source from public.job_time_entries where job_id = (select job_b from ids))::text = 'OFFLINE',
  'der nachgetragene Start am zweiten Einsatz ist weiterhin als OFFLINE gefuehrt');


-- ---------------------------------------------------------------------------
-- Der vergessene Feierabend.
--
-- Wer abends nicht auf Feierabend tippt, hat am naechsten Morgen eine laufende
-- Uhr -- und start_my_job verweigert jeden neuen Einsatz, solange sie laeuft.
-- Der alte Einsatz muss also auffindbar bleiben, sonst ist die Mitarbeiterin
-- blockiert: weder beenden noch beginnen. Die Startseite der App sucht ihn
-- ueber genau diese Bedingung (eine Zeitbuchung ohne finished_at), unabhaengig
-- vom Datum des Einsatzes.
-- ---------------------------------------------------------------------------
-- Die Uhr aus dem vorigen Abschnitt zuerst schliessen: es darf immer nur eine
-- laufen, und genau darum geht es hier.
-- In dieser Suite laeuft alles in einer Transaktion, now() ist also ueberall
-- derselbe Zeitpunkt. Der Start wird zurueckdatiert, damit ein Feierabend
-- ueberhaupt danach liegen kann.
update public.job_time_entries
set started_at = now() - interval '2 hours'
where job_id = (select job_b from ids);

select pg_temp.sign_in('f7000000-0000-4000-8000-000000000011');
select public.stop_my_job((select job_b from ids), now() - interval '30 minutes');
select pg_temp.sign_out();

-- create_single_job verlangt eine Buero-Rolle.
select pg_temp.sign_in('f7000000-0000-4000-8000-000000000001');
create temporary table gestern as
select public.create_single_job(
  (select id from public.customers where company_id = (select company from ctx)),
  (select id from public.cleaning_objects where company_id = (select company from ctx)),
  'Keller gestern', '', current_date - 1, '18:00'::time, '20:00'::time,
  'PLANNED'::public.job_status, 'NORMAL'::public.job_priority, '', '',
  array[(select kraft from ids)]::uuid[], null::uuid) as id;
-- Ein frischer Einsatz von heute, an dem sich zeigen laesst, dass neben einer
-- laufenden Uhr nichts Neues beginnen kann.
create temporary table heute as
select public.create_single_job(
  (select id from public.customers where company_id = (select company from ctx)),
  (select id from public.cleaning_objects where company_id = (select company from ctx)),
  'Keller heute', '', current_date, '09:00'::time, '11:00'::time,
  'PLANNED'::public.job_status, 'NORMAL'::public.job_priority, '', '',
  array[(select kraft from ids)]::uuid[], null::uuid) as id;
select pg_temp.sign_out();
grant select on gestern to authenticated;
grant select on heute to authenticated;

-- Gestern gestartet, Feierabend vergessen.
select pg_temp.sign_in('f7000000-0000-4000-8000-000000000011');
select public.start_my_job((select id from gestern), now() - interval '20 hours');
select pg_temp.sign_out();

select pg_temp.assert(
  (select count(*) from public.job_time_entries
    where job_id = (select id from gestern) and finished_at is null) = 1,
  'die Uhr von gestern laeuft noch');

-- Genau das, was die Startseite sucht: offene Uhren, egal von wann.
select pg_temp.assert(
  (select count(*) from public.jobs job
    where exists (
      select 1 from public.job_time_entries entry
      where entry.job_id = job.id
        and entry.member_id = (select kraft from ids)
        and entry.finished_at is null)) = 1,
  'der Einsatz von gestern ist ueber seine offene Uhr auffindbar');
select pg_temp.assert(
  (select scheduled_date from public.jobs where id = (select id from gestern)) < current_date,
  'und er liegt vor heute, faellt also aus jeder Liste, die bei heute beginnt');

-- Solange sie laeuft, geht nichts Neues -- deshalb muss er erreichbar sein.
select pg_temp.sign_in('f7000000-0000-4000-8000-000000000011');
do $$
begin
  begin
    perform public.start_my_job((select id from heute));
    raise exception 'NOT REJECTED: ein zweiter Einsatz wurde neben der laufenden Uhr gestartet';
  exception when others then
    if position('must be ended first' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- Und er laesst sich nachtraeglich schliessen.
select public.stop_my_job((select id from gestern), now() - interval '18 hours');
select pg_temp.sign_out();
select pg_temp.assert(
  (select duration_minutes from public.job_time_entries where job_id = (select id from gestern)) = 120,
  'der nachgetragene Feierabend schliesst die Schicht von gestern mit zwei Stunden');

rollback;
\o
\echo 'Zeiterfassung ohne Empfang: all assertions passed'
