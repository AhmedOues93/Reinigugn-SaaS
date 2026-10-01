-- Wie weit die Einsaetze eines Plans reichen. Run with supabase/test/run.sh.
--
-- Die Planungsseite warnt, wenn einem wiederkehrenden Plan die Einsaetze
-- ausgehen. Gerechnet wurde das bisher in der Anwendung, aus jedem kuenftigen
-- Einsatz des Betriebs -- unbegrenzt geladen und unsortiert, also
-- abschneidbar. Diese Suite haelt fest, was die Datenbank stattdessen liefert.
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
  ('a8000000-0000-4000-8000-000000000001', 'owner@coverage.test'),
  ('a8000000-0000-4000-8000-000000000002', 'nachbar@coverage.test'),
  ('a8000000-0000-4000-8000-000000000011', 'kraft@coverage.test');

select pg_temp.sign_in('a8000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Reichweite GmbH');
select pg_temp.sign_in('a8000000-0000-4000-8000-000000000002');
select public.create_company_for_current_user('Nachbar GmbH');
select pg_temp.sign_out();

create temporary table ctx as select
  (select id from public.companies where name = 'Reichweite GmbH') as company,
  (select id from public.companies where name = 'Nachbar GmbH') as other_company;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select ctx.company, profile.id, 'EMPLOYEE', 'ACTIVE'
from ctx, public.profiles profile where profile.auth_user_id = 'a8000000-0000-4000-8000-000000000011';

insert into public.customers (company_id, name) select company, 'Kundin' from ctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company, customer.id, 'Objekt'
from ctx join public.customers customer on customer.company_id = ctx.company;

create or replace function pg_temp.plan(p_name text, p_active boolean, p_until date default null)
returns uuid language plpgsql as $$
declare new_id uuid;
begin
  insert into public.service_schedules
    (company_id, customer_id, cleaning_object_id, name, valid_from, valid_until, is_active)
  select ctx.company, customer.id, object.id, p_name, current_date, p_until, p_active
  from ctx
  join public.customers customer on customer.company_id = ctx.company
  join public.cleaning_objects object on object.company_id = ctx.company
  returning id into new_id;
  return new_id;
end; $$;

create or replace function pg_temp.visit(p_plan uuid, p_date date, p_status public.job_status default 'PLANNED')
returns void language plpgsql as $$
begin
  insert into public.jobs (company_id, customer_id, cleaning_object_id, service_schedule_id,
                           title, scheduled_date, planned_start_at, planned_end_at, status)
  select ctx.company, customer.id, object.id, p_plan, 'Unterhaltsreinigung', p_date,
    (p_date + time '07:00') at time zone 'Europe/Berlin',
    (p_date + time '09:00') at time zone 'Europe/Berlin', p_status
  from ctx
  join public.customers customer on customer.company_id = ctx.company
  join public.cleaning_objects object on object.company_id = ctx.company;
end; $$;

create temporary table plans as select
  pg_temp.plan('Weit voraus', true) as weit,
  pg_temp.plan('Laeuft aus', true) as knapp,
  pg_temp.plan('Ohne Einsaetze', true) as leer,
  pg_temp.plan('Nur storniert', true) as storniert,
  pg_temp.plan('Stillgelegt', false) as inaktiv;
grant select on plans to authenticated;

select pg_temp.visit(plans.weit, current_date + 5) from plans;
select pg_temp.visit(plans.weit, current_date + 50) from plans;
select pg_temp.visit(plans.knapp, current_date + 3) from plans;
select pg_temp.visit(plans.storniert, current_date + 40, 'CANCELLED') from plans;
-- Ein bereits vergangener Einsatz zaehlt nicht als Reichweite.
select pg_temp.visit(plans.knapp, current_date - 10) from plans;

select pg_temp.sign_in('a8000000-0000-4000-8000-000000000001');
create temporary table coverage as select * from public.list_schedule_coverage();
select pg_temp.sign_out();
grant select on coverage to authenticated;

select pg_temp.assert(
  (select covered_until from coverage where schedule_id = (select weit from plans)) = current_date + 50,
  'die Reichweite ist der spaeteste kuenftige Einsatz, nicht der naechste');
select pg_temp.assert(
  (select covered_until from coverage where schedule_id = (select knapp from plans)) = current_date + 3,
  'ein vergangener Einsatz zaehlt nicht als Reichweite');
select pg_temp.assert(
  (select covered_until from coverage where schedule_id = (select leer from plans)) is null,
  'ein Plan ohne Einsaetze hat keine Reichweite');
select pg_temp.assert(
  (select covered_until from coverage where schedule_id = (select storniert from plans)) is null,
  'ein stornierter Einsatz ist keine Abdeckung');
select pg_temp.assert(
  (select count(*) from coverage where schedule_id = (select inaktiv from plans)) = 0,
  'ein stillgelegter Plan steht nicht im Bericht');
select pg_temp.assert(
  (select count(*) from coverage) = 4,
  'der Bericht enthaelt genau die aktiven Plaene');

-- ---------------------------------------------------------------------------
-- Mandantentrennung und Rollen.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a8000000-0000-4000-8000-000000000002');
select pg_temp.assert(
  (select count(*) from public.list_schedule_coverage()) = 0,
  'der Nachbarbetrieb sieht die Plaene nicht');
select pg_temp.sign_out();

select pg_temp.sign_in('a8000000-0000-4000-8000-000000000011');
do $$
begin
  begin
    perform public.list_schedule_coverage();
    raise exception 'NOT REJECTED: eine Mitarbeiterin hat die Planungsreichweite gelesen';
  exception when others then
    if position('OWNER or OFFICE' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();


-- ---------------------------------------------------------------------------
-- Betroffene Einsaetze samt Vertretung, in einem Aufruf.
--
-- Die Planungsseite hat dafuer je betroffenem Einsatz einen eigenen Aufruf
-- gemacht. Hier wird festgehalten, dass der gebuendelte Aufruf dieselbe Menge
-- liefert -- und die Vorschlaege gleich mit.
-- ---------------------------------------------------------------------------
insert into public.company_members (company_id, profile_id, role, status)
select ctx.company, profile.id, 'EMPLOYEE', 'ACTIVE'
from ctx, public.profiles profile where profile.auth_user_id = 'a8000000-0000-4000-8000-000000000002';

create temporary table staff as select
  (select member.id from public.company_members member
     join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'a8000000-0000-4000-8000-000000000011'
      and member.company_id = (select company from ctx)) as kranke,
  (select member.id from public.company_members member
     join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'a8000000-0000-4000-8000-000000000002'
      and member.company_id = (select company from ctx)) as vertretung;
grant select on staff to authenticated;

-- Ein Einsatz naechste Woche, die eingeteilte Kraft ist krankgemeldet.
select pg_temp.visit((select knapp from plans), current_date + 2) from plans limit 1;
insert into public.job_assignments (company_id, job_id, member_id)
select ctx.company, job.id, staff.kranke
from ctx, staff, public.jobs job
where job.scheduled_date = current_date + 2 and job.company_id = ctx.company;

insert into public.employee_absences (company_id, member_id, absence_type, status, start_date, end_date)
select ctx.company, staff.kranke, 'SICKNESS', 'APPROVED', current_date, current_date + 7 from ctx, staff;

select pg_temp.sign_in('a8000000-0000-4000-8000-000000000001');
create temporary table affected as
select * from public.list_absence_affected_with_candidates(current_date, current_date + 14);
-- Zum Vergleich derselbe Zeitraum ueber den einzelnen Aufruf. Beides muss
-- angemeldet geschehen: ohne Sitzung liefert is_company_staff nichts.
create temporary table affected_single as
select * from public.list_absence_affected_assignments(current_date, current_date + 14);
select pg_temp.sign_out();

select pg_temp.assert(
  (select count(*) from affected) = 1,
  'der betroffene Einsatz wird gemeldet');
select pg_temp.assert(
  (select member_id from affected) = (select kranke from staff)
    and (select absence_type from affected)::text = 'SICKNESS',
  'gemeldet wird, wer ausfaellt und warum');
select pg_temp.assert(
  (select jsonb_array_length(candidates) from affected) = 1,
  'die Vertretung kommt im selben Aufruf mit, nicht in einem zweiten');
select pg_temp.assert(
  (select candidates->0->>'member_id' from affected) = (select vertretung from staff)::text,
  'vorgeschlagen wird die verfuegbare Kollegin');
select pg_temp.assert(
  (select count(*) from affected) = (select count(*) from affected_single)
    and not exists (
      select 1 from affected_single single
      where not exists (select 1 from affected a where a.job_id = single.job_id)),
  'der gebuendelte Aufruf liefert dieselbe Menge wie der einzelne');

rollback;
\o
\echo 'Planungsreichweite: all assertions passed'
