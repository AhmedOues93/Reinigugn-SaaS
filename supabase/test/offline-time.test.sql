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

rollback;
\o
\echo 'Zeiterfassung ohne Empfang: all assertions passed'
