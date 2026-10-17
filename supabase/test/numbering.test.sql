-- Numbering and invitation-lifecycle invariants.
--
-- The numbering half exists because of a live bug. Customer, object and
-- personnel numbers were allocated as `count(*) + 1`, and each column carries a
-- per-company unique index. With K-0001, K-0002 and K-0003 on file, deleting
-- K-0002 leaves two rows, so the next customer is offered K-0003 — which is
-- taken. Deleting one customer therefore stopped the company creating any
-- further customers, permanently.
--
-- Run with supabase/test/run.sh.
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
  ('11111111-1111-1111-1111-111111111111', 'owner-a@example.test'),
  ('55555555-5555-5555-5555-555555555555', 'owner-b@example.test');

select pg_temp.sign_in('11111111-1111-1111-1111-111111111111');
select public.create_company_for_current_user('Glanz GmbH');
select pg_temp.sign_in('55555555-5555-5555-5555-555555555555');
select public.create_company_for_current_user('Rivale GmbH');
select pg_temp.sign_out();

create temporary table ctx as select
  (select id from public.companies where name = 'Glanz GmbH') as company_a,
  (select id from public.companies where name = 'Rivale GmbH') as company_b;
grant select on ctx to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Numbers are never reused, and a deletion does not block the next record
-- ---------------------------------------------------------------------------
insert into public.customers (company_id, name) select company_a, 'Kunde Alpha' from ctx;
insert into public.customers (company_id, name) select company_a, 'Kunde Beta' from ctx;
insert into public.customers (company_id, name) select company_a, 'Kunde Gamma' from ctx;

select pg_temp.assert(
  (select array_agg(customer_number order by customer_number) = array['K-0001','K-0002','K-0003']
   from public.customers where company_id = (select company_a from ctx)),
  'customers are numbered in sequence');

delete from public.customers where name = 'Kunde Beta';
-- This is the statement that used to fail outright.
insert into public.customers (company_id, name) select company_a, 'Kunde Delta' from ctx;

select pg_temp.assert(
  (select customer_number = 'K-0004' from public.customers where name = 'Kunde Delta'),
  'after a deletion the next customer gets a fresh number, not the retired one');
select pg_temp.assert(
  (select count(*) = 0 from public.customers
   where company_id = (select company_a from ctx) and customer_number = 'K-0002'),
  'and the deleted number is never handed out again');

-- The same for objects and for personnel numbers.
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company_a, c.id, 'Objekt A' from ctx join public.customers c on c.name = 'Kunde Alpha';
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company_a, c.id, 'Objekt B' from ctx join public.customers c on c.name = 'Kunde Alpha';
delete from public.cleaning_objects where name = 'Objekt B';
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company_a, c.id, 'Objekt C' from ctx join public.customers c on c.name = 'Kunde Alpha';
select pg_temp.assert(
  (select object_number = 'O-0003' from public.cleaning_objects where name = 'Objekt C'),
  'object numbers are monotonic across deletions');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'm1@example.test'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'm2@example.test'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'm3@example.test');
-- Profiles are created by a trigger on auth.users; they are read, not inserted.

insert into public.employee_details (company_id, profile_id)
select ctx.company_a, p.id from ctx join public.profiles p on p.auth_user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
insert into public.employee_details (company_id, profile_id)
select ctx.company_a, p.id from ctx join public.profiles p on p.auth_user_id = 'aaaaaaaa-0000-4000-8000-000000000002';
delete from public.employee_details
where profile_id = (select id from public.profiles where auth_user_id = 'aaaaaaaa-0000-4000-8000-000000000002');
insert into public.employee_details (company_id, profile_id)
select ctx.company_a, p.id from ctx join public.profiles p on p.auth_user_id = 'aaaaaaaa-0000-4000-8000-000000000003';

select pg_temp.assert(
  (select employee_number = 'M-0003' from public.employee_details
   where profile_id = (select id from public.profiles where auth_user_id = 'aaaaaaaa-0000-4000-8000-000000000003')),
  'a personnel number that has been issued is never reused, even after the record is gone');

-- A number supplied by hand is respected; the office keeps its own scheme.
insert into public.customers (company_id, name, customer_number)
select company_a, 'Kunde mit eigener Nummer', 'KD-99' from ctx;
select pg_temp.assert(
  (select customer_number = 'KD-99' from public.customers where name = 'Kunde mit eigener Nummer'),
  'a manually assigned number is kept');
-- And still cannot be duplicated.
select pg_temp.assert_rejected(
  format('insert into public.customers (company_id, name, customer_number) values (%L, ''Doppelt'', ''KD-99'')',
    (select company_a from ctx)),
  'duplicate key');

-- Counters are per company: one tenant's numbering does not advance another's.
insert into public.customers (company_id, name) select company_b, 'Fremdkunde' from ctx;
select pg_temp.assert(
  (select customer_number = 'K-0001' from public.customers where name = 'Fremdkunde'),
  'each company numbers from one, independently');

-- Allocation is atomic: two calls in the same transaction never collide.
select pg_temp.assert(
  public.next_company_number((select company_a from ctx), 'CUSTOMER') <>
  public.next_company_number((select company_a from ctx), 'CUSTOMER'),
  'consecutive allocations return different numbers');

-- The counter is internal; no session reads it.
select pg_temp.sign_in('11111111-1111-1111-1111-111111111111');
select pg_temp.assert_rejected(
  'select count(*) from public.company_number_counters', 'permission denied');
select pg_temp.assert_rejected(
  format('select public.next_company_number(%L, ''CUSTOMER'')', (select company_a from ctx)),
  'permission denied');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- 2. Invitation lifecycle
--
-- The office could not tell a live invitation from one that quietly expired,
-- and the employee opening an already-used link was told it was "invalid,
-- expired or already used" — three different situations, one message, and the
-- most common of them is not a failure at all.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('11111111-1111-1111-1111-111111111111');

create temporary table invited as
select member_id from public.create_employee_invitation(
  p_email := 'neu@example.test',
  p_first_name := 'Neue',
  p_last_name := 'Kraft',
  p_phone := null,
  p_role := 'EMPLOYEE'::public.company_role,
  p_employee_number := '',
  p_weekly_hours := null,
  p_employment_start_date := null,
  p_notes := '',
  p_token_hash := encode(extensions.digest(convert_to('token-fresh-0000000000000000000000000000', 'UTF8'), 'sha256'::text), 'hex'),
  p_expires_at := now() + interval '7 days');
grant select on invited to authenticated;

select pg_temp.assert(
  public.get_invitation_state('token-fresh-0000000000000000000000000000') = 'GUELTIG',
  'a fresh invitation is valid');
select pg_temp.assert(
  public.get_invitation_state('token-that-was-never-issued-000000000000') = 'UNBEKANNT',
  'an unknown token is reported as unknown, not as expired');

select pg_temp.assert(
  (select invitation_state = 'GUELTIG' and suggested_action = 'RESEND'
   from public.list_member_account_states() where member_id = (select member_id from invited)),
  'the office sees an open invitation and that it can be resent');

-- Resending invalidates the previous token. That already worked; this pins it.
select public.resend_company_invitation(
  (select member_id from invited),
  encode(extensions.digest(convert_to('token-second-000000000000000000000000', 'UTF8'), 'sha256'::text), 'hex'),
  now() + interval '7 days');

select pg_temp.assert(
  public.get_invitation_state('token-fresh-0000000000000000000000000000') = 'ZURUECKGEZOGEN',
  'the previous link is withdrawn, and says so rather than claiming to be invalid');
select pg_temp.assert(
  public.get_invitation_state('token-second-000000000000000000000000') = 'GUELTIG',
  'the new link is the live one');

-- An expired invitation is its own state, and the office is told.
select pg_temp.sign_out();
update public.company_invitations set expires_at = now() - interval '1 day'
where token_hash = encode(extensions.digest(convert_to('token-second-000000000000000000000000', 'UTF8'), 'sha256'::text), 'hex');

select pg_temp.assert(
  public.get_invitation_state('token-second-000000000000000000000000') = 'ABGELAUFEN',
  'an expired invitation is reported as expired');
select pg_temp.sign_in('11111111-1111-1111-1111-111111111111');
select pg_temp.assert(
  (select invitation_state = 'ABGELAUFEN' and suggested_action = 'RESEND'
   from public.list_member_account_states() where member_id = (select member_id from invited)),
  'and the office sees it as expired rather than merely invited');

-- An expired token cannot be completed. Signed in as the invited person, so
-- the refusal is about the invitation and not about being anonymous.
select pg_temp.sign_out();
insert into auth.users (id, email) values ('bbbbbbbb-0000-4000-8000-000000000001', 'neu@example.test');
select pg_temp.sign_in('bbbbbbbb-0000-4000-8000-000000000001');
select pg_temp.assert_rejected(
  'select public.complete_company_invitation(''token-second-000000000000000000000000'')',
  'invalid, expired or already used');

-- --- acceptance, and the replay of an accepted token ------------------------
select pg_temp.sign_out();
update public.company_invitations set expires_at = now() + interval '7 days'
where token_hash = encode(extensions.digest(convert_to('token-second-000000000000000000000000', 'UTF8'), 'sha256'::text), 'hex');

-- The wrong signed-in user cannot complete somebody else's invitation.
select pg_temp.sign_in('11111111-1111-1111-1111-111111111111');
select pg_temp.assert_rejected(
  'select public.complete_company_invitation(''token-second-000000000000000000000000'')',
  'does not match the signed-in user');

select pg_temp.sign_in('bbbbbbbb-0000-4000-8000-000000000001');
select public.complete_company_invitation('token-second-000000000000000000000000');
select pg_temp.sign_out();

select pg_temp.assert(
  (select status = 'ACTIVE' and profile_id is not null and joined_at is not null
   from public.company_members where id = (select member_id from invited)),
  'accepting the invitation activates the membership and links the profile');

-- The state that drove this change: the same link, opened again.
select pg_temp.assert(
  public.get_invitation_state('token-second-000000000000000000000000') = 'ANGENOMMEN',
  'a used link reports that it was accepted, so the page can offer a sign-in');
-- Replaying it as the very person who used it is still refused.
select pg_temp.sign_in('bbbbbbbb-0000-4000-8000-000000000001');
select pg_temp.assert_rejected(
  'select public.complete_company_invitation(''token-second-000000000000000000000000'')',
  'invalid, expired or already used');

-- An ACTIVE employee is never treated as pending.
select pg_temp.sign_in('11111111-1111-1111-1111-111111111111');
select pg_temp.assert(
  (select status = 'ACTIVE' and invitation_state = 'ANGENOMMEN' and suggested_action = 'NONE'
   from public.list_member_account_states() where member_id = (select member_id from invited)),
  'an active employee is never offered another invitation');
select pg_temp.assert_rejected(
  format('select public.resend_company_invitation(%L, ''deadbeef'', now() + interval ''7 days'')',
    (select member_id from invited)),
  'not awaiting an invitation');

-- Tenant isolation of the account-state view.
select pg_temp.sign_in('55555555-5555-5555-5555-555555555555');
select pg_temp.assert(
  (select count(*) from public.list_member_account_states()
   where member_id = (select member_id from invited)) = 0,
  'another tenant sees nothing of this company''s members');

select pg_temp.sign_out();
rollback;
\o
\echo 'numbering and invitation invariants: all assertions passed'
