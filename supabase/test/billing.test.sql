-- Billing invariants, executed against a database with the full migration set
-- applied. Run with supabase/test/run.sh, which uses harness.sql to stand in for
-- the Supabase-managed schemas. Every statement is assertive: the script fails
-- loudly if an invariant does not hold.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;

/*
 * Impersonate a signed-in user. Switching to the `authenticated` role matters:
 * as the owning superuser, PostgreSQL bypasses row-level security entirely, so
 * the RLS assertions below would pass without proving anything.
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
-- Two tenants, so isolation can be checked rather than assumed.
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
  (select id from public.profiles where auth_user_id = '11111111-1111-1111-1111-111111111111') as owner_a_profile,
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
insert into public.customers (company_id, name) select company_b, 'Fremdkunde' from ctx;

insert into public.cleaning_objects (company_id, customer_id, name, street, postal_code, city)
select ctx.company_a, customer.id, 'Bürohaus Alster', 'Musterweg 1', '20095', 'Hamburg'
from ctx join public.customers customer on customer.company_id = ctx.company_a;

insert into public.customer_contacts (company_id, customer_id, member_id)
select ctx.company_a, customer.id, member.id
from ctx
join public.customers customer on customer.company_id = ctx.company_a
join public.company_members member on member.profile_id = ctx.contact_a_profile;

insert into public.jobs (company_id, customer_id, cleaning_object_id, title, scheduled_date, planned_start_at, planned_end_at, status)
select ctx.company_a, customer.id, object.id, 'Unterhaltsreinigung ' || day, current_date - day,
       (current_date - day) + time '07:00', (current_date - day) + time '10:00', 'COMPLETED'::public.job_status
from ctx
join public.customers customer on customer.company_id = ctx.company_a
join public.cleaning_objects object on object.company_id = ctx.company_a
cross join generate_series(1, 3) as day;

-- ---------------------------------------------------------------------------
-- Draft creation, deterministic amounts, numbering
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');  -- OFFICE may bill

create temporary table draft as
select public.create_draft_invoice(
  (select id from public.customers where company_id = (select company_a from ctx)),
  current_date - 30, current_date, null, 'Vielen Dank für Ihren Auftrag.'
) as id;
grant select on draft to authenticated;

select pg_temp.assert(
  (select count(*) from public.list_billable_jobs(
    (select id from public.customers where company_id = (select company_a from ctx)),
    current_date - 30, current_date)) = 3,
  'all three completed visits are billable before anything is invoiced');

select public.add_invoice_line((select id from draft), 'Unterhaltsreinigung Januar', 12.5, 'Std', 4200, 1900,
  (select id from public.jobs order by scheduled_date limit 1), null, null);
select public.add_invoice_line((select id from draft), 'Grundreinigung Treppenhaus', 1, 'Pausch', 35000, 1900, null, null, null);

-- 12.5 * 4200 = 52500 net, 19% = 9975; 35000 net, 19% = 6650.
select pg_temp.assert(
  (select net_total_cents = 87500 and vat_total_cents = 16625 and gross_total_cents = 104125 from public.invoices where id = (select id from draft)),
  'invoice totals are recomputed from the lines by the database');

select pg_temp.assert(
  (select count(*) from public.list_billable_jobs(
    (select id from public.customers where company_id = (select company_a from ctx)),
    current_date - 30, current_date)) = 2,
  'a job on a live invoice is no longer offered for billing');

select pg_temp.assert_rejected(
  format('select public.add_invoice_line(%L, ''Doppelt'', 1, ''Stk'', 100, 1900, %L, null, null)',
         (select id from draft), (select id from public.jobs order by scheduled_date limit 1)),
  'already been billed');

-- A draft holds no number and no dates.
select pg_temp.assert(
  (select invoice_number is null and issue_date is null and due_date is null and status = 'DRAFT' from public.invoices where id = (select id from draft)),
  'a draft consumes no invoice number');

create temporary table issued as select public.issue_invoice((select id from draft), date '2027-03-01') as number;
grant select on issued to authenticated;

select pg_temp.assert((select number from issued) = 'RE-2027-0001', 'the first invoice of a company and year is numbered 0001');
select pg_temp.assert(
  (select due_date = date '2027-03-15' and issue_date = date '2027-03-01' and status = 'ISSUED' from public.invoices where id = (select id from draft)),
  'the due date is derived from the issue date and the payment terms');
select pg_temp.assert(
  (select customer_snapshot ->> 'name' = 'Hausverwaltung Nord' and company_snapshot ->> 'name' = 'Glanz GmbH' from public.invoices where id = (select id from draft)),
  'both parties are snapshotted at issue time');

-- The snapshot must survive a later master-data change.
select pg_temp.sign_out();
update public.customers set name = 'Hausverwaltung Nord KG' where company_id = (select company_a from ctx);
select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select pg_temp.assert(
  (select customer_snapshot ->> 'name' = 'Hausverwaltung Nord' from public.invoices where id = (select id from draft)),
  'renaming the customer does not rewrite an issued invoice');

-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------
select pg_temp.sign_out();  -- the triggers must hold even for the table owner
select pg_temp.assert_rejected(
  format('update public.invoices set gross_total_cents = 1 where id = %L', (select id from draft)), 'immutable');
select pg_temp.assert_rejected(
  format('update public.invoices set invoice_number = ''RE-2027-9999'' where id = %L', (select id from draft)), 'immutable');
select pg_temp.assert_rejected(
  format('update public.invoices set due_date = current_date + 400 where id = %L', (select id from draft)), 'immutable');
select pg_temp.assert_rejected(
  format('delete from public.invoices where id = %L', (select id from draft)), 'cannot be deleted');
select pg_temp.assert_rejected(
  format('update public.invoice_lines set unit_price_cents = 1 where invoice_id = %L', (select id from draft)), 'cannot be changed');
select pg_temp.assert_rejected(
  format('delete from public.invoice_lines where invoice_id = %L', (select id from draft)), 'cannot be changed');
select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');
select pg_temp.assert_rejected(
  format('select public.add_invoice_line(%L, ''Nachtrag'', 1, ''Stk'', 100, 1900, null, null, null)', (select id from draft)),
  'Only a draft');
select pg_temp.assert_rejected(
  format('select public.delete_draft_invoice(%L)', (select id from draft)), 'Only a draft invoice can be deleted');

-- ---------------------------------------------------------------------------
-- Numbering continues, payment, cancellation and correction
-- ---------------------------------------------------------------------------
create temporary table second_invoice as
select public.create_draft_invoice((select id from public.customers where company_id = (select company_a from ctx)), current_date - 30, current_date, 30::smallint, null) as id;
grant select on second_invoice to authenticated;
select public.add_invoice_line((select id from second_invoice), 'Fensterreinigung', 2, 'Stk', 9000, 700, null, null, null);
select pg_temp.assert(public.issue_invoice((select id from second_invoice), date '2027-03-05') = 'RE-2027-0002', 'numbering continues without gaps');
select pg_temp.assert(
  (select net_total_cents = 18000 and vat_total_cents = 1260 from public.invoices where id = (select id from second_invoice)),
  'a reduced VAT rate is applied per line');

select public.mark_invoice_paid((select id from second_invoice));
select pg_temp.assert((select status = 'PAID' and paid_at is not null from public.invoices where id = (select id from second_invoice)), 'an open invoice can be marked paid');
select pg_temp.assert_rejected(format('select public.mark_invoice_paid(%L)', (select id from second_invoice)), 'Only an open invoice');

select pg_temp.assert_rejected(format('select public.cancel_invoice(%L, ''x'')', (select id from draft)), 'cancellation reason is required');
select public.cancel_invoice((select id from draft), 'Falscher Leistungszeitraum');
select pg_temp.assert(
  (select status = 'CANCELLED' and cancellation_reason = 'Falscher Leistungszeitraum' and cancelled_by is not null and cancelled_at is not null
   from public.invoices where id = (select id from draft)),
  'cancellation is recorded with who, when and why');
select pg_temp.assert(
  (select count(*) = 2 from public.invoice_lines where invoice_id = (select id from draft)),
  'cancelling preserves the historical lines');
select pg_temp.sign_out();
select pg_temp.assert_rejected(
  format('update public.invoices set status = ''ISSUED'' where id = %L', (select id from draft)), 'cannot be reopened');
select pg_temp.sign_in('22222222-2222-2222-2222-222222222222');

-- Cancelling releases the billed job again, so a correction can re-bill it.
select pg_temp.assert(
  (select count(*) from public.list_billable_jobs(
    (select id from public.customers where company_id = (select company_a from ctx)), current_date - 30, current_date)) = 3,
  'a cancelled invoice releases its jobs for re-billing');

create temporary table correction as select public.create_correction_invoice((select id from draft)) as id;
grant select on correction to authenticated;
select pg_temp.assert(
  (select corrects_invoice_id = (select id from draft) and status = 'DRAFT' from public.invoices where id = (select id from correction)),
  'a correction is a new draft that points back at the cancelled invoice');
select pg_temp.assert(
  (select net_total_cents = 87500 from public.invoices where id = (select id from correction)),
  'the correction copies the cancelled lines');

-- ---------------------------------------------------------------------------
-- Authorisation
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('33333333-3333-3333-3333-333333333333');  -- EMPLOYEE

-- No policy on invoices grants the EMPLOYEE role anything, so an employee cannot
-- read a single invoice row, let alone a price.
select pg_temp.assert((select count(*) from public.invoices) = 0, 'an employee reads no invoice row');
select pg_temp.assert((select count(*) from public.invoice_lines) = 0, 'an employee reads no invoice line, so no price');
select pg_temp.assert((select count(*) from public.list_billable_jobs(
  (select id from public.customers where company_id = (select company_a from ctx)), current_date - 30, current_date)) = 0,
  'an employee gets no billable-job list');
select pg_temp.assert_rejected(
  format('select public.create_draft_invoice(%L, current_date, current_date, null, null)',
         (select id from public.customers where company_id = (select company_a from ctx))),
  'OWNER or OFFICE');
select pg_temp.assert_rejected(format('select public.issue_invoice(%L)', (select id from correction)), 'OWNER or OFFICE');
select pg_temp.assert_rejected(format('select public.cancel_invoice(%L, ''weil'')', (select id from second_invoice)), 'OWNER or OFFICE');
select pg_temp.assert_rejected(
  format('insert into public.invoices (company_id, customer_id, service_period_start, service_period_end, created_by) values (%L, %L, current_date, current_date, %L)',
         (select company_a from ctx), (select id from public.customers where company_id = (select company_a from ctx)),
         (select id from public.company_members where profile_id = (select employee_a_profile from ctx))),
  'permission denied');

select pg_temp.sign_in('55555555-5555-5555-5555-555555555555');  -- owner of the other tenant
select pg_temp.assert((select count(*) from public.invoices) = 0, 'an owner reads no invoice of another tenant');
select pg_temp.assert_rejected(format('select public.issue_invoice(%L)', (select id from correction)), 'Invoice not found');
select pg_temp.assert_rejected(format('select public.cancel_invoice(%L, ''fremd'')', (select id from second_invoice)), 'Invoice not found');
select pg_temp.assert_rejected(
  format('select public.create_draft_invoice(%L, current_date, current_date, null, null)',
         (select id from public.customers where company_id = (select company_a from ctx))),
  'Customer not found in this company');

-- ---------------------------------------------------------------------------
-- Portal access
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('44444444-4444-4444-4444-444444444444');  -- portal contact of customer A
select pg_temp.assert((select count(*) from public.list_my_portal_invoices()) = 2, 'the portal lists the issued and the cancelled invoice');
select pg_temp.assert(
  (select count(*) = 0 from public.list_my_portal_invoices() where invoice_number is null),
  'the portal never exposes a draft');
select pg_temp.assert(
  (select gross_total_cents = 19260 from public.list_my_portal_invoices() where status = 'PAID'),
  'the portal shows the stored total');
select pg_temp.assert(
  (select jsonb_array_length(lines) = 1 from public.get_my_portal_invoice((select id from second_invoice))),
  'the portal can open its own invoice with its lines');
select pg_temp.assert(
  (select count(*) = 0 from public.get_my_portal_invoice((select id from correction))),
  'the portal cannot open a draft by id');

select pg_temp.sign_out();
insert into public.customers (company_id, name) select company_b, 'Zweitkunde B' from ctx;
select pg_temp.sign_in('44444444-4444-4444-4444-444444444444');
select pg_temp.assert((select count(*) from public.invoices) = 0, 'a portal customer reads no invoice table row directly');
select pg_temp.assert(
  (select count(*) = 0 from public.list_my_portal_objects() where name = 'Zweitkunde B'),
  'a portal contact never sees another tenant''s records');

select pg_temp.sign_out();
\o
rollback;
\pset tuples_only off
\echo 'billing invariants: all assertions passed'
