-- Phase 13 invariants: avatar ownership, messaging authorisation and the
-- offline checklist sync. Executed with RLS in force — every impersonation
-- switches to the `authenticated` role, because the owning superuser bypasses
-- RLS and would make these assertions pass while proving nothing.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;

create or replace function pg_temp.sign_in(p_user uuid) returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', p_user::text, true); set role authenticated; end; $$;
create or replace function pg_temp.sign_out() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', true); end; $$;
create or replace function pg_temp.assert(c boolean, m text) returns void language plpgsql as $$
begin if not c then raise exception 'ASSERTION FAILED: %', m; end if; end; $$;
create or replace function pg_temp.assert_rejected(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if position(lower(p_expected) in lower(sqlerrm)) = 0 then
      raise exception 'WRONG REJECTION for %: expected "%", got "%"', p_sql, p_expected, sqlerrm; end if; return;
  end;
  raise exception 'NOT REJECTED: % (expected "%")', p_sql, p_expected;
end; $$;

insert into auth.users (id, email) values
  ('b1000000-0000-4000-8000-000000000001', 'field-owner@example.test'),
  ('b1000000-0000-4000-8000-000000000002', 'field-emp-a@example.test'),
  ('b1000000-0000-4000-8000-000000000003', 'field-emp-b@example.test'),
  ('b1000000-0000-4000-8000-000000000004', 'field-customer@example.test'),
  ('b1000000-0000-4000-8000-000000000005', 'rival-owner3@example.test'),
  ('b1000000-0000-4000-8000-000000000006', 'rival-emp@example.test');

select pg_temp.sign_in('b1000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Feld GmbH');
select pg_temp.sign_in('b1000000-0000-4000-8000-000000000005');
select public.create_company_for_current_user('Rivale Drei GmbH');
select pg_temp.sign_out();

create temporary table fctx as
select (select id from public.companies where name='Feld GmbH') as company_a,
       (select id from public.companies where name='Rivale Drei GmbH') as company_b,
       (select id from public.profiles where auth_user_id='b1000000-0000-4000-8000-000000000002') as emp_a_profile,
       (select id from public.profiles where auth_user_id='b1000000-0000-4000-8000-000000000003') as emp_b_profile,
       (select id from public.profiles where auth_user_id='b1000000-0000-4000-8000-000000000004') as cust_profile,
       (select id from public.profiles where auth_user_id='b1000000-0000-4000-8000-000000000006') as rival_emp_profile;
grant select on fctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select company_a, emp_a_profile, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status from fctx
union all select company_a, emp_b_profile, 'EMPLOYEE', 'ACTIVE' from fctx
union all select company_a, cust_profile, 'CUSTOMER', 'ACTIVE' from fctx
union all select company_b, rival_emp_profile, 'EMPLOYEE', 'ACTIVE' from fctx;

create temporary table fm as
select (select id from public.company_members where profile_id=(select emp_a_profile from fctx)) as emp_a,
       (select id from public.company_members where profile_id=(select emp_b_profile from fctx)) as emp_b,
       (select id from public.company_members where profile_id=(select rival_emp_profile from fctx)) as rival_emp;
grant select on fm to authenticated;

-- ---------------------------------------------------------------------------
-- Avatars
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert(public.owns_avatar_path((select emp_a_profile from fctx)::text || '/11111111-1111-4111-8111-111111111111.png'),
                      'an employee owns a path under their own profile id');
select pg_temp.assert(not public.owns_avatar_path((select emp_b_profile from fctx)::text || '/11111111-1111-4111-8111-111111111111.png'),
                      'an employee does not own a colleague''s avatar path');
select pg_temp.assert(public.can_read_avatar_path((select emp_b_profile from fctx)::text || '/11111111-1111-4111-8111-111111111111.png'),
                      'colleagues in the same company may read each other''s avatar');
select pg_temp.assert(not public.can_read_avatar_path((select rival_emp_profile from fctx)::text || '/11111111-1111-4111-8111-111111111111.png'),
                      'another tenant''s avatar is not readable');
select pg_temp.assert(not public.is_allowed_avatar_path('../etc/passwd'), 'a traversal path is rejected by shape');

select public.set_my_avatar((select emp_a_profile from fctx)::text || '/22222222-2222-4222-8222-222222222222.png');
select pg_temp.assert((select avatar_storage_path is not null from public.profiles where id=(select emp_a_profile from fctx)),
                      'an employee can set their own avatar');
select pg_temp.assert_rejected(
  format('select public.set_my_avatar(%L)', (select emp_b_profile from fctx)::text || '/33333333-3333-4333-8333-333333333333.png'),
  'belongs to another profile');
-- The column is not directly writable, so a forged client update cannot bypass the function.
select pg_temp.assert_rejected(
  format('update public.profiles set avatar_storage_path = ''x'' where id = %L', (select emp_a_profile from fctx)),
  'permission denied');
select public.set_my_avatar(null);
select pg_temp.assert((select avatar_storage_path is null from public.profiles where id=(select emp_a_profile from fctx)),
                      'an employee can remove their own avatar');

-- Contact details: own row only.
select public.update_my_contact_details('Anna', 'Berg', '+49 40 1');
select pg_temp.assert((select first_name='Anna' and phone='+49 40 1' from public.profiles where id=(select emp_a_profile from fctx)),
                      'an employee updates their own contact details');
select pg_temp.assert((select first_name is null from public.profiles where id=(select emp_b_profile from fctx)),
                      'updating own details does not touch a colleague');

-- ---------------------------------------------------------------------------
-- Messaging
-- ---------------------------------------------------------------------------
create temporary table th as select public.start_message_thread(null, 'Schlüssel Objekt Nord', 'Der Schlüssel fehlt.') as id;
grant select on th to authenticated;
select pg_temp.assert((select employee_member_id=(select emp_a from fm) from public.message_threads where id=(select id from th)),
                      'an employee opening a thread is its employee participant');
select pg_temp.assert((select count(*)=1 from public.messages where thread_id=(select id from th)), 'the opening message is stored');
-- Checked from the recipient's own session: RLS deliberately hides another
-- member's notifications from the employee who triggered them.
select pg_temp.sign_in('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert(
  (select count(*) from public.in_app_notifications where type='MESSAGE_RECEIVED') = 1,
  'the office is notified through the existing notification system');
select pg_temp.sign_in('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert(
  (select count(*) from public.in_app_notifications where type='MESSAGE_RECEIVED') = 0,
  'the sending employee cannot read the office''s notification row');

-- Employee B must not see or touch A's thread.
select pg_temp.sign_in('b1000000-0000-4000-8000-000000000003');
select pg_temp.assert((select count(*) from public.message_threads)=0, 'an employee cannot enumerate a colleague''s threads');
select pg_temp.assert((select count(*) from public.messages)=0, 'an employee cannot read a colleague''s messages');
select pg_temp.assert((select count(*) from public.list_my_threads())=0, 'the thread list is scoped to the caller');
select pg_temp.assert((select count(*) from public.list_thread_messages((select id from th)))=0, 'a colleague''s thread yields no messages');
select pg_temp.assert_rejected(format('select public.send_message(%L, ''fremd'')', (select id from th)), 'Not a participant');
select pg_temp.assert_rejected(format('select public.mark_thread_read(%L)', (select id from th)), 'Not a participant');

-- A portal customer is outside messaging entirely.
select pg_temp.sign_in('b1000000-0000-4000-8000-000000000004');
select pg_temp.assert((select count(*) from public.message_threads)=0, 'a portal customer reads no thread');
select pg_temp.assert((select count(*) from public.messages)=0, 'a portal customer reads no message');
select pg_temp.assert_rejected(format('select public.send_message(%L, ''hallo'')', (select id from th)), 'Active membership required');

-- Another tenant sees nothing and cannot post.
select pg_temp.sign_in('b1000000-0000-4000-8000-000000000005');
select pg_temp.assert((select count(*) from public.message_threads)=0, 'another tenant reads no thread');
select pg_temp.assert_rejected(format('select public.send_message(%L, ''fremd'')', (select id from th)), 'Thread not found');
select pg_temp.assert_rejected(
  format('select public.start_message_thread(%L, ''X'', ''Y'')', (select emp_a from fm)), 'Employee not found in this company');

-- The office replies, the employee sees it, unread is derived.
select pg_temp.sign_in('b1000000-0000-4000-8000-000000000001');
select pg_temp.assert((select count(*) from public.list_my_threads())=1, 'staff see the company thread');
select pg_temp.assert((select unread_count=1 from public.list_my_threads()), 'the office has one unread message');
select public.mark_thread_read((select id from th));
select pg_temp.assert((select unread_count=0 from public.list_my_threads()), 'marking read clears the office unread count');
select public.send_message((select id from th), 'Ein Ersatzschlüssel liegt im Büro bereit.');
select pg_temp.assert((select unread_count=0 from public.list_my_threads()), 'a sender never has their own message unread');

select pg_temp.sign_in('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert((select unread_count=1 from public.list_my_threads()), 'the employee has the reply unread');
select pg_temp.assert((select count(*)=2 from public.list_thread_messages((select id from th))), 'both sides are in the transcript');
select pg_temp.assert((select bool_or(sender_is_staff) from public.list_thread_messages((select id from th))),
                      'the transcript identifies the office sender');
select public.mark_thread_read((select id from th));
select pg_temp.assert((select unread_count=0 from public.list_my_threads()), 'the employee can clear their unread count');

-- Direct table writes stay revoked; everything goes through the functions.
select pg_temp.assert_rejected(
  format('insert into public.messages (company_id, thread_id, sender_member_id, body) values (%L, %L, %L, ''forged'')',
         (select company_a from fctx), (select id from th), (select emp_a from fm)), 'permission denied');
select pg_temp.assert_rejected(
  format('update public.message_threads set staff_read_at = now() where id = %L', (select id from th)), 'permission denied');

-- ---------------------------------------------------------------------------
-- Offline checklist sync: idempotent, conflict-aware
-- ---------------------------------------------------------------------------
select pg_temp.sign_out();
insert into public.customers (company_id, name) select company_a, 'Feldkunde' from fctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select fctx.company_a, c.id, 'Feldobjekt' from fctx join public.customers c on c.company_id = fctx.company_a;
insert into public.jobs (company_id, customer_id, cleaning_object_id, title, scheduled_date, planned_start_at, planned_end_at, status)
select fctx.company_a, c.id, o.id, 'Feldeinsatz', current_date, current_date + time '08:00', current_date + time '10:00', 'CONFIRMED'
from fctx join public.customers c on c.company_id=fctx.company_a join public.cleaning_objects o on o.company_id=fctx.company_a;
insert into public.job_assignments (company_id, job_id, member_id)
select fctx.company_a, j.id, (select emp_a from fm) from fctx join public.jobs j on j.company_id=fctx.company_a;
insert into public.job_checklists (company_id, job_id) select fctx.company_a, j.id from fctx join public.jobs j on j.company_id=fctx.company_a;
insert into public.job_checklist_items (job_checklist_id, position, title, is_required)
select l.id, 1, 'Böden wischen', true from public.job_checklists l where l.company_id=(select company_a from fctx);

create temporary table ci as select id from public.job_checklist_items limit 1;
grant select on ci to authenticated;

select pg_temp.sign_in('b1000000-0000-4000-8000-000000000002');
select pg_temp.assert(public.sync_my_checklist_item((select id from ci), true, now()) = 'APPLIED',
                      'a queued completion applies when the server has not moved on');
-- Replay after a failed retry must not double-apply.
select pg_temp.assert(public.sync_my_checklist_item((select id from ci), true, now()) = 'ALREADY_APPLIED',
                      'replaying the same queued write is idempotent');
-- A write queued before a newer server change must not overwrite it.
select pg_temp.assert(public.sync_my_checklist_item((select id from ci), false, now() - interval '2 hours') = 'SERVER_NEWER',
                      'a stale queued write loses to newer server state');
select pg_temp.assert((select completed_at is not null from public.job_checklist_items where id=(select id from ci)),
                      'the newer server state survives the stale replay');
select pg_temp.assert_rejected(
  format('select public.sync_my_checklist_item(%L, true, null)', (select id from ci)), 'Invalid client time');

-- Another employee cannot sync an item they are not assigned to.
select pg_temp.sign_in('b1000000-0000-4000-8000-000000000003');
select pg_temp.assert_rejected(
  format('select public.sync_my_checklist_item(%L, false, now())', (select id from ci)), 'not assigned');

select pg_temp.sign_out();
\o
rollback;
\pset tuples_only off
\echo 'employee field-app invariants: all assertions passed'
