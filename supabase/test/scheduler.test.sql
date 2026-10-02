-- The unattended job generator. Run with supabase/test/run.sh.
--
-- Three properties decide whether this is safe to run nightly against every
-- tenant: it must not duplicate, it must extend the horizon as days pass, and
-- one broken plan must not cost everyone else their schedule.
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
create or replace function pg_temp.assert_rejected(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then
    if position(lower(p_expected) in lower(sqlerrm)) = 0 then
      raise exception 'WRONG REJECTION for %: expected "%", got "%"', p_sql, p_expected, sqlerrm;
    end if;
    return;
  end;
  raise exception 'NOT REJECTED: % (expected "%")', p_sql, p_expected;
end; $$;

insert into auth.users (id, email) values
  ('c1000000-0000-4000-8000-000000000001', 'owner-a@scheduler.test'),
  ('c1000000-0000-4000-8000-000000000002', 'owner-b@scheduler.test'),
  ('c1000000-0000-4000-8000-000000000003', 'employee-a@scheduler.test');

select pg_temp.sign_in('c1000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Putzblitz GmbH');
select pg_temp.sign_in('c1000000-0000-4000-8000-000000000002');
select public.create_company_for_current_user('Wischwelt GmbH');
select pg_temp.sign_out();

create temporary table ctx as select
  (select id from public.companies where name = 'Putzblitz GmbH') as company_a,
  (select id from public.companies where name = 'Wischwelt GmbH') as company_b,
  (select id from public.profiles where auth_user_id = 'c1000000-0000-4000-8000-000000000003') as employee_a;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select company_a, employee_a, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status from ctx;

-- One tenant each, so cross-tenant behaviour is observable.
insert into public.customers (company_id, name) select company_a, 'Kunde A' from ctx;
insert into public.customers (company_id, name) select company_b, 'Kunde B' from ctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select company_a, (select id from public.customers where name = 'Kunde A'), 'Objekt A' from ctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select company_b, (select id from public.customers where name = 'Kunde B'), 'Objekt B' from ctx;

insert into public.service_schedules (company_id, customer_id, cleaning_object_id, name, valid_from, is_active)
select company_a, (select id from public.customers where name = 'Kunde A'),
       (select id from public.cleaning_objects where name = 'Objekt A'), 'Plan A', current_date, true from ctx;
insert into public.service_schedules (company_id, customer_id, cleaning_object_id, name, valid_from, is_active)
select company_b, (select id from public.customers where name = 'Kunde B'),
       (select id from public.cleaning_objects where name = 'Objekt B'), 'Plan B', current_date, true from ctx;

create temporary table plans as select
  (select id from public.service_schedules where name = 'Plan A') as plan_a,
  (select id from public.service_schedules where name = 'Plan B') as plan_b;
grant select on plans to authenticated;

-- Every weekday, so the count is predictable whatever day the suite runs on.
insert into public.schedule_rules (service_schedule_id, weekday, planned_start_time, planned_end_time, is_active)
select plan_a, weekday, '07:00', '09:00', true from plans, generate_series(1, 5) as weekday;
insert into public.schedule_rules (service_schedule_id, weekday, planned_start_time, planned_end_time, is_active)
select plan_b, weekday, '07:00', '09:00', true from plans, generate_series(1, 5) as weekday;

-- ---------------------------------------------------------------------------
-- Idempotency: the whole point of running this nightly.
-- ---------------------------------------------------------------------------
select public.generate_due_jobs(28);
create temporary table first_run as
  select count(*) as total from public.jobs where service_schedule_id = (select plan_a from plans);

select pg_temp.assert((select total from first_run) > 0, 'the sweep generates visits for an active plan');

select public.generate_due_jobs(28);
select public.generate_due_jobs(28);
select pg_temp.assert(
  (select count(*) from public.jobs where service_schedule_id = (select plan_a from plans)) = (select total from first_run),
  'running the sweep again generates nothing new');

select pg_temp.assert(
  (select count(*) from (
     select scheduled_date, schedule_rule_id, count(*) from public.jobs
      where service_schedule_id = (select plan_a from plans)
      group by scheduled_date, schedule_rule_id having count(*) > 1) duplicates) = 0,
  'no plan ever has two visits for the same rule on the same day');

-- ---------------------------------------------------------------------------
-- Horizon top-up: the failure this was built to fix.
-- ---------------------------------------------------------------------------
create temporary table horizon_28 as
  select max(scheduled_date) as reach from public.jobs where service_schedule_id = (select plan_a from plans);

select public.generate_due_jobs(56);
select pg_temp.assert(
  (select max(scheduled_date) from public.jobs where service_schedule_id = (select plan_a from plans))
    > (select reach from horizon_28),
  'a later sweep extends the horizon rather than stopping at the old one');
select pg_temp.assert(
  (select count(*) from public.jobs where service_schedule_id = (select plan_a from plans))
    > (select total from first_run),
  'extending the horizon adds the visits in between');

-- ---------------------------------------------------------------------------
-- Every tenant is swept, and each plan only ever writes into its own company.
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select count(*) from public.jobs where service_schedule_id = (select plan_b from plans)) > 0,
  'the sweep reaches every tenant, not just the first');
select pg_temp.assert(
  (select count(*) from public.jobs job join plans on true
    where job.service_schedule_id = plans.plan_a and job.company_id <> (select company_a from ctx)) = 0,
  'a plan never writes a job into another tenant');

-- ---------------------------------------------------------------------------
-- An inactive or expired plan is left alone.
-- ---------------------------------------------------------------------------
update public.service_schedules set is_active = false where id = (select plan_b from plans);
create temporary table b_before as
  select count(*) as total from public.jobs where service_schedule_id = (select plan_b from plans);
select public.generate_due_jobs(56);
select pg_temp.assert(
  (select count(*) from public.jobs where service_schedule_id = (select plan_b from plans) and status <> 'CANCELLED')
    <= (select total from b_before),
  'an archived plan gains no new visits');

-- ---------------------------------------------------------------------------
-- Reach. The sweep is system work and must not be callable from a session,
-- and the internal generator must not be reachable at all.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('c1000000-0000-4000-8000-000000000001');
select pg_temp.assert_rejected('select public.generate_due_jobs(56)', 'permission denied');
select pg_temp.assert_rejected(
  format('select public.generate_schedule_occurrences(%L, current_date + 7)', (select plan_a from plans)),
  'permission denied');

-- The interactive path still works for staff, and still refuses everyone else.
select pg_temp.assert(
  public.generate_jobs_for_schedule((select plan_a from plans), current_date + 56) >= 0,
  'an owner can still generate their own plan');
select pg_temp.assert_rejected(
  format('select public.generate_jobs_for_schedule(%L, current_date + 7)', (select plan_b from plans)),
  'Staff role required');

select pg_temp.sign_in('c1000000-0000-4000-8000-000000000003');
select pg_temp.assert_rejected(
  format('select public.generate_jobs_for_schedule(%L, current_date + 7)', (select plan_a from plans)),
  'Staff role required');
select pg_temp.assert_rejected('select public.generate_due_jobs(56)', 'permission denied');

select pg_temp.sign_out();

-- A nonsensical horizon is refused rather than quietly clamped.
select pg_temp.assert_rejected('select public.generate_due_jobs(0)', 'between 1 and 365');
select pg_temp.assert_rejected('select public.generate_due_jobs(4000)', 'between 1 and 365');

\o
rollback;
\pset tuples_only off
\echo 'recurring job scheduler invariants: all assertions passed'
