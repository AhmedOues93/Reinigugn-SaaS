-- Payment invariants: who may declare an invoice paid, what that records, and
-- every way of getting it wrong that the database has to refuse.
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
-- Two tenants, every role, and a customer contact so the portal can be checked.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner-a@example.test'),
  ('22222222-2222-2222-2222-222222222222', 'office-a@example.test'),
  ('33333333-3333-3333-3333-333333333333', 'employee-a@example.test'),
  ('44444444-4444-4444-4444-444444444444', 'contact-a@example.test'),
  ('55555555-5555-5555-5555-555555555555', 'owner-b@example.test');

select pg_temp.sign_in('11111111-1111-1111-1111-111111111111');
select public.create_company_for_current_user('Glanz GmbH');
select pg_temp.sign_in('55555555-5555-5555-5555-555555555555');
select public.create_company_for_current_user('Rivale GmbH');
select pg_temp.sign_out();

create temporary table ctx as
select
  (select id from public.companies where name = 'Glanz GmbH') as company_a,
  (select id from public.companies where name = 'Rivale GmbH') as company_b,
  (select id from public.profiles where auth_user_id = '22222222-2222-2222-2222-222222222222') as office_a_profile,
  (select id from public.profiles where auth_user_id = '33333333-3333-3333-3333-333333333333') as employee_a_profile,
  (select id from public.profiles where auth_user_id = '44444444-4444-4444-4444-444444444444') as contact_a_profile;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select company_a, office_a_profile, 'OFFICE'::public.company_role, 'ACTIVE'::public.membership_status from ctx
union all select company_a, employee_a_profile, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status from ctx
union all select company_a, contact_a_profile, 'CUSTOMER'::public.company_role, 'ACTIVE'::public.membership_status from ctx;

insert into public.customers (company_id, name, billing_address, postal_code, city)
select company_a, 'Hausverwaltung Nord', 'Musterweg 1', '20095', 'Hamburg' from ctx;

insert into public.customer_contacts (company_id, customer_id, member_id)
select ctx.company_a, customer.id, member.id
from ctx
join public.customers customer on customer.company_id = ctx.company_a
join public.company_members member on member.profile_id = ctx.contact_a_profile;

create temporary table office_member as
select id from public.company_members where profile_id = (select office_a_profile from ctx);
grant select on office_member to authenticated;

/*
 * An issued invoice for 11900 cents gross: one line of 10000 net at 19 %.
 * `p_backdate` days ago, so payment dates on either side of the issue date can
 * be exercised.
 */
create or replace function pg_temp.issued_invoice(p_backdate integer, p_cents bigint default 10000) returns uuid
language plpgsql as $$
declare invoice_id uuid;
begin
  invoice_id := public.create_draft_invoice(
    (select id from public.customers where company_id = (select company_a from ctx)),
    current_date - 60, current_date, 14::smallint, null);
  perform public.add_invoice_line(invoice_id, 'Unterhaltsreinigung', 1, 'Pausch', p_cents, 1900, null, null, null);
  perform public.issue_invoice(invoice_id, current_date - p_backdate);
  return invoice_id;
end; $$;

-- ---------------------------------------------------------------------------
-- Only the office side of the business may declare money received.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
create temporary table first_invoice as select pg_temp.issued_invoice(10) as id;
grant select on first_invoice to authenticated;

select pg_temp.assert(
  (select gross_total_cents = 11900 from public.invoices where id = (select id from first_invoice)),
  'the fixture invoice is 11900 cents gross');

select pg_temp.sign_in('44444444-4444-4444-4444-444444444444');  -- the customer
select pg_temp.assert_rejected(
  format('select public.record_invoice_payment(%L)', (select id from first_invoice)),
  'OWNER or OFFICE');

select pg_temp.sign_in('33333333-3333-3333-3333-333333333333');  -- an employee
select pg_temp.assert_rejected(
  format('select public.record_invoice_payment(%L)', (select id from first_invoice)),
  'OWNER or OFFICE');
select pg_temp.assert_rejected(
  format('select public.mark_invoice_paid(%L)', (select id from first_invoice)),
  'OWNER or OFFICE');

select pg_temp.sign_in('55555555-5555-5555-5555-555555555555');  -- another tenant's owner
select pg_temp.assert_rejected(
  format('select public.record_invoice_payment(%L)', (select id from first_invoice)),
  'Invoice not found');

-- Nobody writes a payment row directly, not even the office: the table carries
-- no write privilege, so the function is the only way in.
select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select pg_temp.assert_rejected(
  format('insert into public.invoice_payments (company_id, invoice_id, amount_cents, paid_on, recorded_by) values (%L, %L, 11900, current_date, %L)',
    (select company_a from ctx), (select id from first_invoice), (select id from office_member)),
  'permission denied');

-- ---------------------------------------------------------------------------
-- Dates and amounts that cannot be true.
-- ---------------------------------------------------------------------------
select pg_temp.assert_rejected(
  format('select public.record_invoice_payment(%L, current_date + 1)', (select id from first_invoice)),
  'dated in the future');
select pg_temp.assert_rejected(
  format('select public.record_invoice_payment(%L, current_date - 30)', (select id from first_invoice)),
  'cannot predate the invoice');
select pg_temp.assert_rejected(
  format('select public.record_invoice_payment(%L, current_date, ''BANK_TRANSFER'', null, 0)', (select id from first_invoice)),
  'greater than zero');
select pg_temp.assert_rejected(
  format('select public.record_invoice_payment(%L, current_date, ''BANK_TRANSFER'', null, 11901)', (select id from first_invoice)),
  'more than the 11900 remaining');

-- A draft has not been sent to anyone, so nobody can have paid it.
create temporary table draft as
select public.create_draft_invoice(
  (select id from public.customers where company_id = (select company_a from ctx)),
  current_date - 60, current_date, 14::smallint, null) as id;
grant select on draft to authenticated;
select pg_temp.assert_rejected(
  format('select public.record_invoice_payment(%L)', (select id from draft)),
  'draft invoice');

-- ---------------------------------------------------------------------------
-- The ordinary case: one transfer, confirmed once.
-- ---------------------------------------------------------------------------
create temporary table first_payment as
select public.record_invoice_payment(
  (select id from first_invoice), current_date - 2, 'BANK_TRANSFER', 'Verwendungszweck RE-Nr.',
  null, 'Kontoauszug 47', 'confirm-token-1') as id;
grant select on first_payment to authenticated;

select pg_temp.assert(
  (select status = 'PAID' and paid_at is not null from public.invoices where id = (select id from first_invoice)),
  'confirming the full amount settles the invoice');

select pg_temp.assert(
  (select amount_cents = 11900 and paid_on = current_date - 2 and method = 'BANK_TRANSFER'
      and reference = 'Verwendungszweck RE-Nr.' and note = 'Kontoauszug 47'
      and source = 'MANUAL' and recorded_by = (select id from office_member)
   from public.invoice_payments where id = (select id from first_payment)),
  'the payment records the amount, the date, how it arrived, its reference and who booked it');

select pg_temp.assert(
  (select date(paid_at) = current_date - 2 from public.invoices where id = (select id from first_invoice)),
  'the invoice is stamped with the date the money arrived, not the date it was typed in');

-- A double-tapped confirmation is not a second payment.
select pg_temp.assert(
  public.record_invoice_payment((select id from first_invoice), current_date - 2, 'BANK_TRANSFER',
    'Verwendungszweck RE-Nr.', null, 'Kontoauszug 47', 'confirm-token-1') = (select id from first_payment),
  'replaying a confirmation returns the original payment instead of booking another');
select pg_temp.assert(
  (select count(*) = 1 from public.invoice_payments where invoice_id = (select id from first_invoice)),
  'and leaves exactly one payment on the invoice');

-- A fresh attempt on a settled invoice is refused outright.
select pg_temp.assert_rejected(
  format('select public.record_invoice_payment(%L)', (select id from first_invoice)),
  'already settled');
select pg_temp.assert_rejected(
  format('select public.mark_invoice_paid(%L)', (select id from first_invoice)),
  'already settled');

-- The audit trail is readable, and names the person.
select pg_temp.assert(
  (select count(*) = 1 from public.list_invoice_payments((select id from first_invoice))),
  'the office can read the payment history');
select pg_temp.assert(
  (select recorded_by_name is not null and recorded_by_name <> ''
   from public.list_invoice_payments((select id from first_invoice))),
  'the payment history names who recorded it');

-- ---------------------------------------------------------------------------
-- The customer sees the result, and nothing else changes for them.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('44444444-4444-4444-4444-444444444444');
select pg_temp.assert(
  (select status = 'PAID' and paid_at is not null and not is_overdue
   from public.list_my_portal_invoices() where id = (select id from first_invoice)),
  'the customer portal shows the invoice as paid');
-- The customer has no business seeing the bookkeeping behind it.
select pg_temp.assert(
  (select count(*) from public.invoice_payments where invoice_id = (select id from first_invoice)) = 0,
  'a customer cannot read the payment rows');

select pg_temp.sign_in('55555555-5555-5555-5555-555555555555');
select pg_temp.assert(
  (select count(*) from public.invoice_payments where invoice_id = (select id from first_invoice)) = 0,
  'another tenant cannot read the payment rows');
select pg_temp.assert(
  (select count(*) from public.list_invoice_payments((select id from first_invoice))) = 0,
  'another tenant gets nothing from the payment history');

-- ---------------------------------------------------------------------------
-- Part payment: the invoice stays open until the money is all there.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
create temporary table part_paid as select pg_temp.issued_invoice(5) as id;
grant select on part_paid to authenticated;

select public.record_invoice_payment((select id from part_paid), current_date - 1, 'BANK_TRANSFER', 'Teilzahlung 1', 5000);
select pg_temp.assert(
  (select status = 'ISSUED' and paid_at is null from public.invoices where id = (select id from part_paid)),
  'a part payment leaves the invoice open, which is what the office needs to see');

select pg_temp.assert_rejected(
  format('select public.record_invoice_payment(%L, current_date, ''BANK_TRANSFER'', null, 6901)', (select id from part_paid)),
  'more than the 6900 remaining');

-- Confirming without an amount settles whatever is still outstanding.
select public.record_invoice_payment((select id from part_paid), current_date, 'CASH', 'Restbetrag bar');
select pg_temp.assert(
  (select status = 'PAID' from public.invoices where id = (select id from part_paid)),
  'the remainder settles the invoice');
select pg_temp.assert(
  (select count(*) = 2 and sum(amount_cents) = 11900 from public.invoice_payments where invoice_id = (select id from part_paid)),
  'both payments are kept, and they add up to the invoice');

-- ---------------------------------------------------------------------------
-- A cancelled invoice is not owed and cannot be paid.
-- ---------------------------------------------------------------------------
create temporary table cancelled as select pg_temp.issued_invoice(3) as id;
grant select on cancelled to authenticated;
select public.cancel_invoice((select id from cancelled), 'Falscher Leistungszeitraum');
select pg_temp.assert_rejected(
  format('select public.record_invoice_payment(%L)', (select id from cancelled)),
  'cancelled invoice');

-- ---------------------------------------------------------------------------
-- A forward-dated invoice must still be payable when the money arrives.
--
-- `issue_invoice` accepts any date, so the date sanity check cannot be allowed
-- to strand an invoice that carries one.
-- ---------------------------------------------------------------------------
create temporary table forward_dated as select pg_temp.issued_invoice(-30) as id;
grant select on forward_dated to authenticated;
select public.record_invoice_payment((select id from forward_dated), current_date, 'BANK_TRANSFER', 'Vorauszahlung');
select pg_temp.assert(
  (select status = 'PAID' from public.invoices where id = (select id from forward_dated)),
  'an invoice dated in the future can still be settled today');

select pg_temp.sign_out();
rollback;
\o
\echo 'invoice payment invariants: all assertions passed'
