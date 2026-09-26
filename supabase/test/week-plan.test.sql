-- Automatic week planning must name the reason per visit. Run with
-- supabase/test/run.sh.
--
-- The property under test is not "an employee was found" but "when none was
-- found, the office is told which object, which date and which rule stopped
-- it". A blanket error is the failure this suite exists to catch.
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

-- One company per scenario: the planner works on every plan of the signed-in
-- company at once, so mixing scenarios would make the assertions ambiguous.
insert into auth.users (id, email) values
  ('d1000000-0000-4000-8000-000000000001', 'owner-ok@weekplan.test'),
  ('d1000000-0000-4000-8000-000000000002', 'owner-nohours@weekplan.test'),
  ('d1000000-0000-4000-8000-000000000003', 'owner-vacation@weekplan.test'),
  ('d1000000-0000-4000-8000-000000000004', 'owner-hours@weekplan.test'),
  ('d1000000-0000-4000-8000-000000000005', 'owner-noweekday@weekplan.test'),
  ('d1000000-0000-4000-8000-000000000006', 'owner-manual@weekplan.test'),
  ('d1000000-0000-4000-8000-000000000011', 'cleaner-ok@weekplan.test'),
  ('d1000000-0000-4000-8000-000000000012', 'cleaner-nohours@weekplan.test'),
  ('d1000000-0000-4000-8000-000000000013', 'cleaner-vacation@weekplan.test'),
  ('d1000000-0000-4000-8000-000000000014', 'cleaner-hours@weekplan.test'),
  ('d1000000-0000-4000-8000-000000000016', 'cleaner-manual@weekplan.test');

select pg_temp.sign_in('d1000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Planbar GmbH');
select pg_temp.sign_in('d1000000-0000-4000-8000-000000000002');
select public.create_company_for_current_user('Ohnestunden GmbH');
select pg_temp.sign_in('d1000000-0000-4000-8000-000000000003');
select public.create_company_for_current_user('Urlaubszeit GmbH');
select pg_temp.sign_in('d1000000-0000-4000-8000-000000000004');
select public.create_company_for_current_user('Vollbelegt GmbH');
select pg_temp.sign_in('d1000000-0000-4000-8000-000000000005');
select public.create_company_for_current_user('Ohnetag GmbH');
select pg_temp.sign_in('d1000000-0000-4000-8000-000000000006');
select public.create_company_for_current_user('Handplan GmbH');
select pg_temp.sign_out();

-- Names, because the reason text has to be readable by the office.
update public.profiles set first_name = 'Olena', last_name = 'Koval'
where auth_user_id = 'd1000000-0000-4000-8000-000000000011';
update public.profiles set first_name = 'Mert', last_name = 'Yilmaz'
where auth_user_id = 'd1000000-0000-4000-8000-000000000012';
update public.profiles set first_name = 'Sara', last_name = 'Nowak'
where auth_user_id = 'd1000000-0000-4000-8000-000000000013';
update public.profiles set first_name = 'Tomasz', last_name = 'Lis'
where auth_user_id = 'd1000000-0000-4000-8000-000000000014';
update public.profiles set first_name = 'Ivan', last_name = 'Petrov'
where auth_user_id = 'd1000000-0000-4000-8000-000000000016';

create or replace function pg_temp.setup(
  p_company text,
  p_cleaner uuid,
  p_weekly_hours numeric,
  p_weekdays int[],
  p_mode text default 'AUTO'
) returns uuid language plpgsql as $$
declare
  company_id uuid;
  profile_id uuid;
  member_id uuid;
  customer_id uuid;
  object_id uuid;
  schedule_id uuid;
  weekday int;
begin
  select id into company_id from public.companies where name = p_company;
  select id into profile_id from public.profiles where auth_user_id = p_cleaner;

  if profile_id is not null then
    insert into public.company_members (company_id, profile_id, role, status)
    values (company_id, profile_id, 'EMPLOYEE', 'ACTIVE')
    returning id into member_id;

    if p_weekly_hours is not null then
      insert into public.employee_details (company_id, profile_id, weekly_hours, is_active)
      values (company_id, profile_id, p_weekly_hours, true);
    end if;
  end if;

  insert into public.customers (company_id, name)
  values (company_id, p_company || ' Kunde') returning id into customer_id;
  insert into public.cleaning_objects (company_id, customer_id, name)
  values (company_id, customer_id, p_company || ' Objekt') returning id into object_id;

  insert into public.service_schedules
    (company_id, customer_id, cleaning_object_id, name, valid_from, is_active, assignment_mode)
  values
    (company_id, customer_id, object_id, p_company || ' Plan', current_date, true, p_mode)
  returning id into schedule_id;

  foreach weekday in array p_weekdays loop
    insert into public.schedule_rules
      (service_schedule_id, weekday, planned_start_time, planned_end_time, is_active)
    values (schedule_id, weekday, '07:00', '08:00', true);
  end loop;

  return schedule_id;
end; $$;

create temporary table fixtures as select
  pg_temp.setup('Planbar GmbH', 'd1000000-0000-4000-8000-000000000011', 40, array[1,2,3,4,5,6,7]) as plan_ok,
  pg_temp.setup('Ohnestunden GmbH', 'd1000000-0000-4000-8000-000000000012', null, array[1,2,3,4,5,6,7]) as plan_nohours,
  pg_temp.setup('Urlaubszeit GmbH', 'd1000000-0000-4000-8000-000000000013', 40, array[1,2,3,4,5,6,7]) as plan_vacation,
  pg_temp.setup('Vollbelegt GmbH', 'd1000000-0000-4000-8000-000000000014', 1, array[1,2,3,4,5,6,7]) as plan_hours,
  pg_temp.setup('Ohnetag GmbH', null, null, array[]::int[]) as plan_noweekday,
  pg_temp.setup('Handplan GmbH', 'd1000000-0000-4000-8000-000000000016', 40, array[1,2,3,4,5,6,7], 'MANUAL') as plan_manual;
grant select on fixtures to authenticated;

-- Approved holiday across the whole planning window.
insert into public.employee_absences (company_id, member_id, absence_type, status, start_date, end_date)
select member.company_id, member.id, 'VACATION', 'APPROVED', current_date, current_date + 30
from public.company_members member
join public.profiles profile on profile.id = member.profile_id
where profile.auth_user_id = 'd1000000-0000-4000-8000-000000000013';

-- ---------------------------------------------------------------------------
-- The helper the planner is built on. It was missing, so every automatic
-- assignment raised "function does not exist" and the office only ever saw a
-- blanket error. Without this function the whole suite below fails.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('d1000000-0000-4000-8000-000000000001');
select pg_temp.assert(
  (select role from public.current_company_member()) = 'OWNER',
  'the signed-in owner is resolved as the acting staff member');
select pg_temp.sign_out();
select pg_temp.assert(
  (select id from public.current_company_member()) is null,
  'without a session there is no acting member');

-- ---------------------------------------------------------------------------
-- The happy path: every visit of the window is reported, with the employee.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('d1000000-0000-4000-8000-000000000001');
create temporary table report_ok as
  select * from public.plan_window_automatically(current_date, current_date + 6);
select pg_temp.sign_out();

select pg_temp.assert(
  (select count(*) from report_ok) = 7,
  'a plan running every weekday reports one row per day of the seven-day window');
select pg_temp.assert(
  (select count(*) from report_ok where outcome = 'ASSIGNED' and member_name = 'Olena Koval') = 7,
  'every planned visit names the employee who was assigned');
select pg_temp.assert(
  (select count(distinct visit_date) from report_ok) = 7,
  'the report carries the concrete date of each visit');
select pg_temp.assert(
  (select bool_and(object_name = 'Planbar GmbH Objekt' and customer_name = 'Planbar GmbH Kunde')
     from report_ok),
  'the report names the object and the customer of each visit');
select pg_temp.assert(
  (select bool_and(planned_start_time = '07:00' and planned_end_time = '08:00') from report_ok),
  'the report carries the planned time of each visit');
select pg_temp.assert(
  (select count(*) from public.jobs
    where service_schedule_id = (select plan_ok from fixtures)
      and scheduled_date between current_date and current_date + 6) = 7,
  'planning actually generates the visits it reports');

-- ---------------------------------------------------------------------------
-- Every blocking rule names itself, per visit. This is the regression that
-- matters: before this change all five produced the same blanket sentence.
-- ---------------------------------------------------------------------------
create or replace function pg_temp.reasons(p_owner uuid) returns text language plpgsql as $$
declare result text;
begin
  perform pg_temp.sign_in(p_owner);
  select string_agg(distinct reason, ' | ') into result
  from public.plan_window_automatically(current_date, current_date + 6)
  where outcome = 'BLOCKED';
  perform pg_temp.sign_out();
  return coalesce(result, '');
end; $$;

select pg_temp.assert(
  pg_temp.reasons('d1000000-0000-4000-8000-000000000002') like '%Mert Yilmaz: keine Wochen-Sollstunden hinterlegt%',
  'missing master data is reported as missing master data, with the name');
select pg_temp.assert(
  pg_temp.reasons('d1000000-0000-4000-8000-000000000003')
    like '%Sara Nowak: im Urlaub am ' || to_char(current_date, 'DD.MM.YYYY') || '%',
  'approved holiday is reported as holiday, with the date it starts blocking');
select pg_temp.assert(
  pg_temp.reasons('d1000000-0000-4000-8000-000000000004') like '%Tomasz Lis: Wochenstunden reichen nicht (0,0 h verplant + 7,0 h Plan > 1,0 h Soll)%',
  'a weekly-hours overrun is reported with the actual hours, not as a generic refusal');
select pg_temp.assert(
  pg_temp.reasons('d1000000-0000-4000-8000-000000000005') like '%keinen aktiven Wochentag%',
  'a plan without weekdays says so instead of blaming the employees');

-- A blocked plan still lists its visits, so the office can act on each one.
select pg_temp.sign_in('d1000000-0000-4000-8000-000000000004');
create temporary table report_hours as
  select * from public.plan_window_automatically(current_date, current_date + 6);
select pg_temp.sign_out();
select pg_temp.assert(
  (select count(*) from report_hours) = 7
    and (select bool_and(outcome = 'BLOCKED' and visit_date is not null) from report_hours),
  'a blocked plan reports every affected visit with its date, not one summary line');
select pg_temp.assert(
  (select count(*) from public.jobs where service_schedule_id = (select plan_hours from fixtures)) = 0,
  'a visit that could not be staffed is not generated with nobody on it');

-- A plan with no weekday has no visit to attach to, so it gets one row rather
-- than vanishing from the report.
select pg_temp.sign_in('d1000000-0000-4000-8000-000000000005');
select pg_temp.assert(
  (select count(*) from public.plan_window_automatically(current_date, current_date + 6)
     where visit_date is null) = 1,
  'a plan the planner cannot even place is still listed once');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Manual plans stay manual.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('d1000000-0000-4000-8000-000000000006');
select pg_temp.assert(
  (select count(*) from public.plan_window_automatically(current_date, current_date + 6)) = 0,
  'automatic planning never touches a plan the office assigns by hand');
select pg_temp.sign_out();
select pg_temp.assert(
  (select count(*) from public.service_schedule_assignments
    where service_schedule_id = (select plan_manual from fixtures)) = 0,
  'a manual plan keeps its own team, the planner does not write one');

-- ---------------------------------------------------------------------------
-- Tenant isolation: the planner only ever sees the signed-in company.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('d1000000-0000-4000-8000-000000000001');
select pg_temp.assert(
  (select count(*) from public.plan_window_automatically(current_date, current_date + 6)
     where schedule_id <> (select plan_ok from fixtures)) = 0,
  'planning one company never reports or plans another company plan');
select pg_temp.assert(
  (select count(*) from public.schedule_candidate_diagnostics((select plan_ok from fixtures))) = 1,
  'the diagnostic only considers the employees of the plan own company');
select pg_temp.sign_out();

-- An employee may not plan, and may not read who was rejected and why.
select pg_temp.sign_in('d1000000-0000-4000-8000-000000000011');
do $$
begin
  begin
    perform public.plan_window_automatically(current_date, current_date + 6);
    raise exception 'NOT REJECTED: an employee could run automatic planning';
  exception when others then
    if position('OWNER or OFFICE' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

-- Idempotency: planning the same window twice must not duplicate visits.
select pg_temp.sign_in('d1000000-0000-4000-8000-000000000001');
select count(*) from public.plan_window_automatically(current_date, current_date + 6);
select pg_temp.sign_out();
select pg_temp.assert(
  (select count(*) from public.jobs
    where service_schedule_id = (select plan_ok from fixtures)
      and scheduled_date between current_date and current_date + 6) = 7,
  'planning the same window twice does not duplicate a visit');

rollback;
\o
\echo 'automatic week planning invariants: all assertions passed'
