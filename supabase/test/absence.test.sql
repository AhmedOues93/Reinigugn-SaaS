-- Absence approval invariants: who may decide a vacation request, what a
-- decision records, and the line between a request that was granted and an
-- illness that was merely reported.
--
-- Run with supabase/test/run.sh. Every statement is assertive: the script fails
-- loudly if an invariant does not hold.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;

/*
 * Impersonate a signed-in user. Switching to the `authenticated` role matters:
 * as the owning superuser, PostgreSQL bypasses row-level security entirely, so
 * the isolation assertions below would pass without proving anything.
 */
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

-- Asserts that a statement is rejected, and that it is rejected for the right reason.
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

-- ---------------------------------------------------------------------------
-- One tenant with every role, and a second tenant to check isolation against.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'office-a@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'employee-a@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'colleague-a@example.test'),
  ('55555555-5555-5555-5555-555555555555', 'contact-a@example.test'),
  ('66666666-6666-6666-6666-666666666666', 'owner-b@example.test');

select pg_temp.sign_in('11111111-1111-1111-1111-111111111111');
select public.create_company_for_current_user('Glanz GmbH');
select pg_temp.sign_in('66666666-6666-6666-6666-666666666666');
select public.create_company_for_current_user('Rivale GmbH');
select pg_temp.sign_out();

create temporary table ctx as
select
  (select id from public.companies where name = 'Glanz GmbH') as company_a,
  (select id from public.profiles where auth_user_id = '11111111-1111-1111-1111-111111111111') as owner_a_profile,
  (select id from public.profiles where auth_user_id = '22222222-2222-2222-2222-222222222222') as office_a_profile,
  (select id from public.profiles where auth_user_id = '33333333-3333-3333-3333-333333333333') as employee_a_profile,
  (select id from public.profiles where auth_user_id = '44444444-4444-4444-4444-444444444444') as colleague_a_profile,
  (select id from public.profiles where auth_user_id = '55555555-5555-5555-5555-555555555555') as contact_a_profile;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select company_a, office_a_profile, 'OFFICE'::public.company_role, 'ACTIVE'::public.membership_status from ctx
union all select company_a, employee_a_profile, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status from ctx
union all select company_a, colleague_a_profile, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status from ctx
union all select company_a, contact_a_profile, 'CUSTOMER'::public.company_role, 'ACTIVE'::public.membership_status from ctx;

create temporary table members as
select
  (select id from public.company_members where profile_id = (select employee_a_profile from ctx)) as employee_member,
  (select id from public.company_members where profile_id = (select colleague_a_profile from ctx)) as colleague_member;
grant select on members to authenticated;

-- ---------------------------------------------------------------------------
-- An employee submits a vacation request. It is a request, not a fait accompli.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('33333333-3333-3333-3333-333333333333');

create temporary table vacation as
select public.create_my_absence('VACATION'::public.absence_type, current_date + 20, current_date + 24, 'Sommerurlaub') as id;
grant select on vacation to authenticated;

select pg_temp.assert(
  (select status = 'PENDING' and decision = 'PENDING' and reviewed_by is null and reviewed_at is null
   from public.employee_absences where id = (select id from vacation)),
  'a submitted vacation request is pending, undecided and unattributed');

-- The heart of the reported bug: creating a request must not free up the day.
select pg_temp.assert(
  not public.is_absence_unavailable((select employee_member from members), current_date + 22),
  'a pending vacation request does not yet remove the employee from planning');

-- An employee decides nothing, least of all their own holiday.
select pg_temp.assert_rejected(
  format('select public.review_absence(%L, true)', (select id from vacation)),
  'Only OWNER or OFFICE');

-- ---------------------------------------------------------------------------
-- Nor may anyone else without the role, inside the tenant or outside it.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('44444444-4444-4444-4444-444444444444');  -- a colleague
select pg_temp.assert_rejected(
  format('select public.review_absence(%L, true)', (select id from vacation)),
  'Only OWNER or OFFICE');
select pg_temp.assert(
  (select count(*) from public.employee_absences where id = (select id from vacation)) = 0,
  'one employee cannot read another employee''s absence');

select pg_temp.sign_in('55555555-5555-5555-5555-555555555555');  -- a customer contact
select pg_temp.assert_rejected(
  format('select public.review_absence(%L, true)', (select id from vacation)),
  'Only OWNER or OFFICE');

select pg_temp.sign_in('66666666-6666-6666-6666-666666666666');  -- another tenant's owner
select pg_temp.assert(
  (select count(*) from public.employee_absences where id = (select id from vacation)) = 0,
  'another tenant cannot read the request');
select pg_temp.assert_rejected(
  format('select public.review_absence(%L, true)', (select id from vacation)),
  'Absence not found');

-- Approval is reachable only through review_absence: the decision columns are
-- not writable from any session, whatever the policies allow.
select pg_temp.sign_in('33333333-3333-3333-3333-333333333333');
select pg_temp.assert_rejected(
  format('update public.employee_absences set status = ''APPROVED'' where id = %L', (select id from vacation)),
  'permission denied');
select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select pg_temp.assert_rejected(
  format('update public.employee_absences set status = ''APPROVED'' where id = %L', (select id from vacation)),
  'permission denied');

-- ---------------------------------------------------------------------------
-- The office approves, and the decision is recorded with who and when.
-- ---------------------------------------------------------------------------
select public.review_absence((select id from vacation), true);

select pg_temp.sign_out();
select pg_temp.assert(
  (select status = 'APPROVED' and decision = 'APPROVED'
      and reviewed_by = (select office_a_profile from ctx)
      and reviewed_at is not null
   from public.employee_absences where id = (select id from vacation)),
  'approval records the deciding user and the moment of the decision');

select pg_temp.assert(
  public.is_absence_unavailable((select employee_member from members), current_date + 22),
  'an approved vacation removes the employee from planning');

select pg_temp.assert(
  (select count(*) from public.in_app_notifications
   where absence_id = (select id from vacation) and type = 'VACATION_APPROVED'
     and recipient_member_id = (select employee_member from members)) = 1,
  'the employee is notified of the decision');

-- A decision is made once.
select pg_temp.sign_in('11111111-1111-1111-1111-111111111111');
select pg_temp.assert_rejected(
  format('select public.review_absence(%L, false)', (select id from vacation)),
  'already been decided');

-- The employee sees the outcome.
select pg_temp.sign_in('33333333-3333-3333-3333-333333333333');
select pg_temp.assert(
  (select decision = 'APPROVED' from public.employee_absences where id = (select id from vacation)),
  'the employee sees the approved state of their own request');

-- ---------------------------------------------------------------------------
-- Rejection is the same mechanism, with the opposite answer.
-- ---------------------------------------------------------------------------
create temporary table refused as
select public.create_my_absence('VACATION'::public.absence_type, current_date + 40, current_date + 41, null) as id;
grant select on refused to authenticated;

select pg_temp.sign_in('11111111-1111-1111-1111-111111111111');  -- OWNER may also decide
select public.review_absence((select id from refused), false);
select pg_temp.sign_out();
select pg_temp.assert(
  (select status = 'REJECTED' and decision = 'REJECTED'
      and reviewed_by = (select owner_a_profile from ctx) and reviewed_at is not null
   from public.employee_absences where id = (select id from refused)),
  'rejection is recorded the same way, by the owner who made it');
select pg_temp.assert(
  not public.is_absence_unavailable((select employee_member from members), current_date + 40),
  'a rejected request leaves the employee available');

-- ---------------------------------------------------------------------------
-- Sickness is reported, not granted.
--
-- It takes effect at once — the office must see the gap the same day — but it
-- is never described as approved, and nobody can pretend to have decided it.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('33333333-3333-3333-3333-333333333333');
create temporary table sickness as
select public.create_my_absence('SICKNESS'::public.absence_type, current_date, current_date + 2, 'Grippe') as id;
grant select on sickness to authenticated;

select pg_temp.assert(
  (select decision = 'REPORTED' and reviewed_by is null
   from public.employee_absences where id = (select id from sickness)),
  'a reported sickness is never shown as approved and names no decider');

select pg_temp.sign_out();
select pg_temp.assert(
  public.is_absence_unavailable((select employee_member from members), current_date + 1),
  'a reported sickness takes effect immediately, without anyone approving it');

select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select pg_temp.assert_rejected(
  format('select public.review_absence(%L, true)', (select id from sickness)),
  'Only a vacation request');

-- The existing AU workflow is untouched by any of this.
select pg_temp.sign_in('33333333-3333-3333-3333-333333333333');
select public.attach_my_au_document(
  (select id from sickness),
  (select company_a from ctx)::text || '/absence/' || (select id from sickness)::text || '/'
    || gen_random_uuid()::text || '.pdf');
select pg_temp.assert(
  (select au_storage_path is not null from public.employee_absences where id = (select id from sickness)),
  'an employee can still attach their AU document');

select pg_temp.sign_out();
rollback;
\o
\echo 'absence approval invariants: all assertions passed'
