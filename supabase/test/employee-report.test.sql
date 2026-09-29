-- Der Einsatzbericht der Mitarbeiterin. Run with supabase/test/run.sh.
--
-- service_records.employee_note gab es seit Phase 19, aber nichts hat die
-- Spalte je beschrieben. Diese Suite haelt fest, wer schreiben darf, wann
-- nicht mehr, und dass der Text im Leistungsnachweis ankommt.
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
  ('c4000000-0000-4000-8000-000000000001', 'owner@report.test'),
  ('c4000000-0000-4000-8000-000000000011', 'zugeteilt@report.test'),
  ('c4000000-0000-4000-8000-000000000012', 'fremd@report.test');

select pg_temp.sign_in('c4000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Berichtsreinigung GmbH');
select pg_temp.sign_out();

create temporary table ctx as select
  (select id from public.companies where name = 'Berichtsreinigung GmbH') as company;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select ctx.company, profile.id, 'EMPLOYEE', 'ACTIVE'
from ctx, public.profiles profile
where profile.auth_user_id in ('c4000000-0000-4000-8000-000000000011', 'c4000000-0000-4000-8000-000000000012');

insert into public.customers (company_id, name) select company, 'Kundin Ost' from ctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company, customer.id, 'Buerohaus Ost'
from ctx join public.customers customer on customer.company_id = ctx.company;

insert into public.jobs (company_id, customer_id, cleaning_object_id, title, scheduled_date,
                         planned_start_at, planned_end_at, status)
select ctx.company, customer.id, object.id, 'Unterhaltsreinigung', current_date,
  (current_date + time '07:00') at time zone 'Europe/Berlin',
  (current_date + time '09:00') at time zone 'Europe/Berlin',
  'PLANNED'
from ctx
join public.customers customer on customer.company_id = ctx.company
join public.cleaning_objects object on object.company_id = ctx.company;

create temporary table ids as select
  (select id from public.jobs where title = 'Unterhaltsreinigung') as job,
  (select member.id from public.company_members member
     join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'c4000000-0000-4000-8000-000000000011') as zugeteilt,
  (select member.id from public.company_members member
     join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'c4000000-0000-4000-8000-000000000012') as fremd;
grant select on ids to authenticated;

insert into public.job_assignments (company_id, job_id, member_id)
select ctx.company, ids.job, ids.zugeteilt from ctx, ids;

-- ---------------------------------------------------------------------------
-- Schreiben, aendern, loeschen.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('c4000000-0000-4000-8000-000000000011');
select public.set_my_job_report((select job from ids), '3. Stock war abgeschlossen, beim naechsten Mal nachholen.');
select pg_temp.sign_out();
select pg_temp.assert(
  (select employee_report from public.jobs where id = (select job from ids))
    = '3. Stock war abgeschlossen, beim naechsten Mal nachholen.',
  'die zugeteilte Mitarbeiterin kann ihren Bericht schreiben');

select pg_temp.sign_in('c4000000-0000-4000-8000-000000000011');
select public.set_my_job_report((select job from ids), '   ');
select pg_temp.sign_out();
select pg_temp.assert(
  (select employee_report from public.jobs where id = (select job from ids)) is null,
  'ein geleerter Bericht wird entfernt statt als Leerzeichen gespeichert');

select pg_temp.sign_in('c4000000-0000-4000-8000-000000000011');
select public.set_my_job_report((select job from ids), 'Alles erledigt, Verbrauchsmaterial geht zur Neige.');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Wer nicht eingeteilt ist, schreibt auch nicht -- und das Buero nicht an
-- ihrer Stelle.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('c4000000-0000-4000-8000-000000000012');
do $$
begin
  begin
    perform public.set_my_job_report((select job from ids), 'War gar nicht dort.');
    raise exception 'NOT REJECTED: eine nicht eingeteilte Mitarbeiterin hat berichtet';
  exception when others then
    if position('assigned employee' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

select pg_temp.sign_in('c4000000-0000-4000-8000-000000000001');
do $$
begin
  begin
    perform public.set_my_job_report((select job from ids), 'Buero schreibt mit.');
    raise exception 'NOT REJECTED: das Buero hat im Namen der Mitarbeiterin berichtet';
  exception when others then
    if position('Employee role required' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

select pg_temp.assert(
  (select employee_report from public.jobs where id = (select job from ids))
    = 'Alles erledigt, Verbrauchsmaterial geht zur Neige.',
  'nach den abgelehnten Versuchen steht unveraendert der eigene Bericht da');

-- ---------------------------------------------------------------------------
-- Der Bericht wandert in den Leistungsnachweis.
-- ---------------------------------------------------------------------------
update public.jobs set status = 'COMPLETED' where id = (select job from ids);
select public.build_service_record((select job from ids));

select pg_temp.assert(
  (select employee_note from public.service_records where job_id = (select job from ids))
    = 'Alles erledigt, Verbrauchsmaterial geht zur Neige.',
  'der Bericht steht im Leistungsnachweis, ohne dass ihn jemand abtippt');

-- Solange nicht abgenommen, zieht eine Korrektur den Nachweis mit.
select pg_temp.sign_in('c4000000-0000-4000-8000-000000000011');
select public.set_my_job_report((select job from ids), 'Korrektur: Material wurde nachgefuellt.');
select pg_temp.sign_out();
select pg_temp.assert(
  (select employee_note from public.service_records where job_id = (select job from ids))
    = 'Korrektur: Material wurde nachgefuellt.',
  'eine Korrektur vor der Abnahme zieht den Leistungsnachweis mit');

-- ---------------------------------------------------------------------------
-- Nach der Abnahme ist Schluss: was der Kunde unterschrieben hat, bleibt.
-- ---------------------------------------------------------------------------
update public.service_records
set status = 'ABGENOMMEN', accepted_at = now(), accepted_by_name = 'Sabine Lorenz',
    acceptance_method = 'KEINE'
where job_id = (select job from ids);

select pg_temp.sign_in('c4000000-0000-4000-8000-000000000011');
do $$
begin
  begin
    perform public.set_my_job_report((select job from ids), 'Nachtraegliche Aenderung.');
    raise exception 'NOT REJECTED: der Bericht wurde nach der Abnahme geaendert';
  exception when others then
    if position('abgenommen' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

select pg_temp.assert(
  (select employee_note from public.service_records where job_id = (select job from ids))
    = 'Korrektur: Material wurde nachgefuellt.',
  'der abgenommene Leistungsnachweis traegt unveraendert den Text der Abnahme');
select pg_temp.assert(
  (select employee_report from public.jobs where id = (select job from ids))
    = 'Korrektur: Material wurde nachgefuellt.',
  'auch am Einsatz bleibt der Text stehen, damit beide dasselbe sagen');

rollback;
\o
\echo 'Einsatzbericht der Mitarbeiterin: all assertions passed'
