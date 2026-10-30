-- Manual planning guards. Run with supabase/test/run.sh.
--
-- The office may always override — standing in for a sick colleague is normal
-- work — but it must never happen silently. Overlaps were already reported;
-- weekly hours were not, so a job could push someone past their contract and
-- nobody noticed until the month closed.
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
  ('e1000000-0000-4000-8000-000000000001', 'owner@manualplan.test'),
  ('e1000000-0000-4000-8000-000000000002', 'owner-other@manualplan.test'),
  ('e1000000-0000-4000-8000-000000000011', 'teilzeit@manualplan.test'),
  ('e1000000-0000-4000-8000-000000000012', 'vollzeit@manualplan.test'),
  ('e1000000-0000-4000-8000-000000000013', 'ohnestunden@manualplan.test');

select pg_temp.sign_in('e1000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Handplanung GmbH');
select pg_temp.sign_in('e1000000-0000-4000-8000-000000000002');
select public.create_company_for_current_user('Fremdbetrieb GmbH');
select pg_temp.sign_out();

update public.profiles set first_name = 'Nadia', last_name = 'Haddad'
where auth_user_id = 'e1000000-0000-4000-8000-000000000011';

create temporary table ctx as select
  (select id from public.companies where name = 'Handplanung GmbH') as company,
  (select id from public.companies where name = 'Fremdbetrieb GmbH') as other_company,
  -- Monday of the current ISO week: the week the capacity check reasons about.
  date_trunc('week', current_date::timestamp)::date as monday;
grant select on ctx to authenticated;

-- Two hours a week contracted, forty, and one without master data.
insert into public.company_members (company_id, profile_id, role, status)
select ctx.company, profile.id, 'EMPLOYEE', 'ACTIVE'
from ctx, public.profiles profile
where profile.auth_user_id in (
  'e1000000-0000-4000-8000-000000000011',
  'e1000000-0000-4000-8000-000000000012',
  'e1000000-0000-4000-8000-000000000013');

insert into public.employee_details (company_id, profile_id, weekly_hours, is_active)
select ctx.company, profile.id, 2, true
from ctx, public.profiles profile where profile.auth_user_id = 'e1000000-0000-4000-8000-000000000011';
insert into public.employee_details (company_id, profile_id, weekly_hours, is_active)
select ctx.company, profile.id, 40, true
from ctx, public.profiles profile where profile.auth_user_id = 'e1000000-0000-4000-8000-000000000012';
insert into public.employee_details (company_id, profile_id, weekly_hours, is_active)
select ctx.company, profile.id, null, true
from ctx, public.profiles profile where profile.auth_user_id = 'e1000000-0000-4000-8000-000000000013';

create temporary table members as select
  (select member.id from public.company_members member join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'e1000000-0000-4000-8000-000000000011') as teilzeit,
  (select member.id from public.company_members member join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'e1000000-0000-4000-8000-000000000012') as vollzeit,
  (select member.id from public.company_members member join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'e1000000-0000-4000-8000-000000000013') as ohnestunden;
grant select on members to authenticated;

insert into public.customers (company_id, name) select company, 'Hausverwaltung Süd' from ctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company, customer.id, 'Treppenhaus Süd'
from ctx join public.customers customer on customer.company_id = ctx.company;

-- The work already on the roster: Monday 08:00-10:00, the full two hours.
insert into public.jobs
  (company_id, customer_id, cleaning_object_id, title, scheduled_date, planned_start_at, planned_end_at, status)
select ctx.company, customer.id, object.id, 'Treppenhaus Montag', ctx.monday,
  ((ctx.monday + time '08:00') at time zone 'Europe/Berlin'),
  ((ctx.monday + time '10:00') at time zone 'Europe/Berlin'),
  'PLANNED'
from ctx
join public.customers customer on customer.company_id = ctx.company
join public.cleaning_objects object on object.company_id = ctx.company;

-- A second week, to prove the check stays inside the job's own ISO week.
insert into public.jobs
  (company_id, customer_id, cleaning_object_id, title, scheduled_date, planned_start_at, planned_end_at, status)
select ctx.company, customer.id, object.id, 'Treppenhaus naechste Woche', ctx.monday + 7,
  ((ctx.monday + 7 + time '08:00') at time zone 'Europe/Berlin'),
  ((ctx.monday + 7 + time '10:00') at time zone 'Europe/Berlin'),
  'PLANNED'
from ctx
join public.customers customer on customer.company_id = ctx.company
join public.cleaning_objects object on object.company_id = ctx.company;

create temporary table jobs_ctx as select
  (select id from public.jobs where title = 'Treppenhaus Montag') as monday_job,
  (select id from public.jobs where title = 'Treppenhaus naechste Woche') as next_week_job;
grant select on jobs_ctx to authenticated;

insert into public.job_assignments (company_id, job_id, member_id)
select ctx.company, jobs_ctx.monday_job, members.teilzeit from ctx, jobs_ctx, members;
insert into public.job_assignments (company_id, job_id, member_id)
select ctx.company, jobs_ctx.next_week_job, members.teilzeit from ctx, jobs_ctx, members;

-- ---------------------------------------------------------------------------
-- The guard that was missing.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('e1000000-0000-4000-8000-000000000001');

create temporary table over_hours as
select * from public.find_job_capacity_warnings(
  (select company from ctx),
  (select monday from ctx),
  ((select monday from ctx) + time '11:00') at time zone 'Europe/Berlin',
  ((select monday from ctx) + time '12:00') at time zone 'Europe/Berlin',
  array[(select teilzeit from members)],
  null);

select pg_temp.assert(
  (select count(*) from over_hours) = 1,
  'a job beyond the contracted weekly hours is reported');
select pg_temp.assert(
  (select member_name from over_hours) = 'Nadia Haddad',
  'the warning names the employee, so the office can act on it');
select pg_temp.assert(
  (select planned_minutes from over_hours) = 120
    and (select added_minutes from over_hours) = 60
    and (select weekly_hours from over_hours) = 2,
  'the warning carries the hours it is based on, not just a verdict');

-- Moving the existing job must not warn about that job itself.
select pg_temp.assert(
  (select count(*) from public.find_job_capacity_warnings(
    (select company from ctx), (select monday from ctx),
    ((select monday from ctx) + time '13:00') at time zone 'Europe/Berlin',
    ((select monday from ctx) + time '15:00') at time zone 'Europe/Berlin',
    array[(select teilzeit from members)],
    (select monday_job from jobs_ctx))) = 0,
  'rescheduling a job does not count that same job against the week');

-- The next week is a different week.
select pg_temp.assert(
  (select planned_minutes from public.find_job_capacity_warnings(
    (select company from ctx), (select monday from ctx) + 7,
    ((select monday from ctx) + 7 + time '11:00') at time zone 'Europe/Berlin',
    ((select monday from ctx) + 7 + time '12:00') at time zone 'Europe/Berlin',
    array[(select teilzeit from members)],
    null)) = 120,
  'the check sums the ISO week of the job, not every job of the employee');

-- Within contract, and without master data, there is nothing to warn about.
select pg_temp.assert(
  (select count(*) from public.find_job_capacity_warnings(
    (select company from ctx), (select monday from ctx),
    ((select monday from ctx) + time '11:00') at time zone 'Europe/Berlin',
    ((select monday from ctx) + time '12:00') at time zone 'Europe/Berlin',
    array[(select vollzeit from members)],
    null)) = 0,
  'an employee with room in the week is not flagged');
select pg_temp.assert(
  (select count(*) from public.find_job_capacity_warnings(
    (select company from ctx), (select monday from ctx),
    ((select monday from ctx) + time '11:00') at time zone 'Europe/Berlin',
    ((select monday from ctx) + time '23:00') at time zone 'Europe/Berlin',
    array[(select ohnestunden from members)],
    null)) = 0,
  'without contracted hours there is no hour to exceed, so nothing is invented');

-- A cancelled job frees the hours it held.
update public.jobs set status = 'CANCELLED' where id = (select monday_job from jobs_ctx);
select pg_temp.assert(
  (select count(*) from public.find_job_capacity_warnings(
    (select company from ctx), (select monday from ctx),
    ((select monday from ctx) + time '11:00') at time zone 'Europe/Berlin',
    ((select monday from ctx) + time '12:00') at time zone 'Europe/Berlin',
    array[(select teilzeit from members)],
    null)) = 0,
  'a cancelled job no longer blocks the week');
update public.jobs set status = 'PLANNED' where id = (select monday_job from jobs_ctx);

-- The overlap guard still reports what it always did, now with the job it clashes with.
create temporary table overlap as
select * from public.find_job_assignment_conflicts(
  (select company from ctx),
  ((select monday from ctx) + time '09:00') at time zone 'Europe/Berlin',
  ((select monday from ctx) + time '11:00') at time zone 'Europe/Berlin',
  array[(select teilzeit from members)]);
select pg_temp.assert(
  (select count(*) from overlap) = 1 and (select title from overlap) = 'Treppenhaus Montag',
  'an overlapping job is reported by name, so the warning can say which one');

select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Tenant isolation.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('e1000000-0000-4000-8000-000000000002');
select pg_temp.assert(
  (select count(*) from public.find_job_capacity_warnings(
    (select company from ctx), (select monday from ctx),
    ((select monday from ctx) + time '11:00') at time zone 'Europe/Berlin',
    ((select monday from ctx) + time '12:00') at time zone 'Europe/Berlin',
    array[(select teilzeit from members)],
    null)) = 0,
  'another company staff learns nothing about these employees');
select pg_temp.sign_out();

select pg_temp.sign_in('e1000000-0000-4000-8000-000000000011');
select pg_temp.assert(
  (select count(*) from public.find_job_capacity_warnings(
    (select company from ctx), (select monday from ctx),
    ((select monday from ctx) + time '11:00') at time zone 'Europe/Berlin',
    ((select monday from ctx) + time '12:00') at time zone 'Europe/Berlin',
    array[(select teilzeit from members)],
    null)) = 0,
  'an employee cannot read the planning capacity of the team');
select pg_temp.sign_out();

rollback;
\o
\echo 'manual assignment guard invariants: all assertions passed'
