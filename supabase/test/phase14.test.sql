-- Phase 14 invariants: breaks give net working time and stay server-owned;
-- invoice delivery is logged honestly and never claims a delivery that did not
-- happen; tenants and roles stay separated.
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
begin if not coalesce(p_condition, false) then raise exception 'ASSERTION FAILED: %', p_message; end if; end; $$;
create or replace function pg_temp.assert_rejected(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(lower(p_expected) in lower(sqlerrm)) = 0 then
      raise exception 'WRONG REJECTION for %: expected "%", got "%"', p_sql, p_expected, sqlerrm;
    end if;
    return;
  end;
  raise exception 'NOT REJECTED: % (expected "%")', p_sql, p_expected;
end; $$;

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'p14-owner-a@example.test'),
  ('a3333333-3333-3333-3333-333333333333', 'p14-employee-a@example.test'),
  ('a5555555-5555-5555-5555-555555555555', 'p14-owner-b@example.test');

select pg_temp.sign_in('a1111111-1111-1111-1111-111111111111');
select public.create_company_for_current_user('P14 Glanz GmbH');
select pg_temp.sign_in('a5555555-5555-5555-5555-555555555555');
select public.create_company_for_current_user('P14 Rivale GmbH');
select pg_temp.sign_out();

create temporary table ctx as
select
  (select id from public.companies where name = 'P14 Glanz GmbH') as company_a,
  (select id from public.profiles where auth_user_id = 'a3333333-3333-3333-3333-333333333333') as employee_profile;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select company_a, employee_profile, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status from ctx;
insert into public.customers (company_id, name, email) select company_a, 'P14 Kunde', 'buchhaltung@kunde.test' from ctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company_a, customer.id, 'P14 Objekt' from ctx join public.customers customer on customer.company_id = ctx.company_a;
insert into public.jobs (company_id, customer_id, cleaning_object_id, title, scheduled_date, planned_start_at, planned_end_at, status)
select ctx.company_a, c.id, o.id, 'P14 Einsatz', current_date, now(), now() + interval '2 hours', 'PLANNED'::public.job_status
from ctx join public.customers c on c.company_id = ctx.company_a join public.cleaning_objects o on o.company_id = ctx.company_a;
insert into public.job_assignments (company_id, job_id, member_id)
select ctx.company_a, j.id, m.id from ctx
join public.jobs j on j.company_id = ctx.company_a
join public.company_members m on m.profile_id = ctx.employee_profile;

create temporary table job as select id from public.jobs where title = 'P14 Einsatz';
grant select on job to authenticated;

-- ---------------------------------------------------------------------------
-- Breaks
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a3333333-3333-3333-3333-333333333333');
select pg_temp.assert_rejected($$select public.pause_my_job((select id from job))$$, 'No active time entry');
select public.start_my_job((select id from job));
select public.pause_my_job((select id from job));
select pg_temp.assert_rejected($$select public.pause_my_job((select id from job))$$, 'already running');
select pg_temp.assert_rejected($$insert into public.job_time_breaks (company_id, time_entry_id) select company_id, id from public.job_time_entries limit 1$$, 'permission denied');
select pg_temp.assert((select count(*) = 1 from public.job_time_breaks), 'an employee sees their own break');
select public.resume_my_job((select id from job));
select pg_temp.assert_rejected($$select public.resume_my_job((select id from job))$$, 'No break is running');

-- Move the recorded times into the past so the arithmetic is observable:
-- 90 minutes on site, of which a 20-minute break.
select pg_temp.sign_out();
update public.job_time_breaks set started_at = now() - interval '60 minutes', ended_at = now() - interval '40 minutes';
update public.job_time_entries set started_at = now() - interval '90 minutes' where job_id = (select id from job);
select pg_temp.sign_in('a3333333-3333-3333-3333-333333333333');
select public.pause_my_job((select id from job));
select public.stop_my_job((select id from job));   -- stopping ends a running break too

select pg_temp.assert((select count(*) = 0 from public.job_time_breaks where ended_at is null), 'stopping closes an open break');
select pg_temp.assert(
  (select duration_minutes between 69 and 70 and break_minutes between 20 and 21 from public.job_time_entries where job_id = (select id from job)),
  'duration is net of breaks');
select pg_temp.assert((select status = 'COMPLETED' from public.jobs where id = (select id from job)), 'the job completes as before');

select pg_temp.sign_in('a5555555-5555-5555-5555-555555555555');
select pg_temp.assert((select count(*) = 0 from public.job_time_breaks), 'another tenant sees no breaks');

-- ---------------------------------------------------------------------------
-- Invoice delivery
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a1111111-1111-1111-1111-111111111111');
create temporary table inv as
select public.create_draft_invoice((select id from public.customers where name = 'P14 Kunde'), current_date - 30, current_date, 14::smallint, null) as id;
grant select on inv to authenticated;
select public.add_invoice_line((select id from inv), 'Unterhaltsreinigung', 2, 'Std', 3000, 1900, null, null, null);

select pg_temp.assert_rejected(
  $$select public.record_invoice_delivery((select id from inv), 'INVOICE', 'EMAIL', 'x@y.test', 'SENT', null)$$,
  'Only an issued invoice');
select public.issue_invoice((select id from inv));

select public.record_invoice_delivery((select id from inv), 'INVOICE', 'EMAIL', 'buchhaltung@kunde.test', 'NOT_CONFIGURED', 'no provider');
select pg_temp.assert((select sent_at is null from public.invoices where id = (select id from inv)), 'an impossible e-mail does not mark the invoice as sent');
select public.record_invoice_delivery((select id from inv), 'INVOICE', 'EMAIL', 'buchhaltung@kunde.test', 'FAILED', 'smtp 550');
select pg_temp.assert((select sent_at is null from public.invoices where id = (select id from inv)), 'a failed e-mail does not mark the invoice as sent');
select pg_temp.assert_rejected(
  $$select public.record_invoice_delivery((select id from inv), 'INVOICE', 'MANUAL', null, 'SENT', null)$$,
  'status MANUAL');
select public.record_invoice_delivery((select id from inv), 'INVOICE', 'MANUAL', null, 'MANUAL', 'per Post');
select pg_temp.assert((select sent_at is not null from public.invoices where id = (select id from inv)), 'a manual delivery marks the invoice as sent');
select pg_temp.assert((select count(*) = 3 from public.invoice_deliveries where invoice_id = (select id from inv)), 'every attempt is logged');

select pg_temp.assert_rejected(
  $$select public.record_invoice_delivery((select id from inv), 'REMINDER', 'MANUAL', null, 'MANUAL', null)$$,
  'overdue');
select pg_temp.assert_rejected($$update public.invoices set sent_at = null where id = (select id from inv)$$, 'permission denied');

select pg_temp.sign_in('a3333333-3333-3333-3333-333333333333');
select pg_temp.assert_rejected(
  $$select public.record_invoice_delivery((select id from inv), 'INVOICE', 'MANUAL', null, 'MANUAL', null)$$,
  'Billing requires');
select pg_temp.assert((select count(*) = 0 from public.invoice_deliveries), 'an employee reads no delivery log');

select pg_temp.sign_in('a5555555-5555-5555-5555-555555555555');
select pg_temp.assert((select count(*) = 0 from public.invoice_deliveries), 'another tenant reads no delivery log');
select pg_temp.assert_rejected(
  $$select public.record_invoice_delivery((select id from inv), 'INVOICE', 'MANUAL', null, 'MANUAL', null)$$,
  'Invoice not found');

select pg_temp.sign_out();
\o
rollback;
\pset tuples_only off
\echo 'phase 14 invariants: all assertions passed'
