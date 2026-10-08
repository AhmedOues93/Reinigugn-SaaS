\set ON_ERROR_STOP on
\set QUIET on
\o /dev/null
begin;

create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'ASSERTION FAILED: %', message; end if; end;
$$;
create function pg_temp.reject(sql text, expected text) returns void language plpgsql as $$
begin
  begin execute sql;
  exception when others then
    if position(expected in sqlerrm) = 0 then raise exception 'Wrong rejection: %', sqlerrm; end if;
    return;
  end;
  raise exception 'Not rejected: %', sql;
end;
$$;

select pg_temp.assert(not has_function_privilege('anon',
  'public.record_mail_event(text,text,text,text,text,timestamptz,jsonb)', 'execute'), 'anonymous cannot forge mail events');
select pg_temp.assert(not has_function_privilege('authenticated',
  'public.record_mail_event(text,text,text,text,text,timestamptz,jsonb)', 'execute'), 'signed-in users cannot forge mail events');
select pg_temp.assert(has_function_privilege('service_role',
  'public.record_mail_event(text,text,text,text,text,timestamptz,jsonb)', 'execute'), 'webhook service can record events');
set role authenticated;
select pg_temp.reject($q$select public.record_mail_event('resend','forged','message','email.delivered',null,now(),'{}')$q$, 'permission denied');
reset role;
set role service_role;
create temporary table mail_result as select public.record_mail_event('resend','verified-test-event','message','email.delivered',null,now(),'{}') as id;
select pg_temp.assert((select id from mail_result) = public.record_mail_event('resend','verified-test-event','message','email.delivered',null,now(),'{}'), 'replayed webhook returns same event');
reset role;
select pg_temp.assert((select count(*) = 1 from public.mail_events where provider_event_id='verified-test-event'), 'webhook never writes twice');

insert into auth.users (id,email) values ('b1111111-1111-1111-1111-111111111111','guards@example.test');
select set_config('request.jwt.claim.sub','b1111111-1111-1111-1111-111111111111',true);
set role authenticated;
select public.create_company_for_current_user('Guard Test GmbH');
reset role;
insert into public.customers(company_id,name)
select id,'Guard Kunde' from public.companies where name='Guard Test GmbH';
set role authenticated;
create temporary table invoice_guard_context as
select public.create_draft_invoice((select id from public.customers where name='Guard Kunde'),current_date-30,current_date,14::smallint,null) as id;
grant select on invoice_guard_context to authenticated;
select public.add_invoice_line((select id from invoice_guard_context),'Reinigung',1,'Pausch',30000,1900,null,null,null);
select pg_temp.reject($q$select public.issue_invoice((select id from invoice_guard_context))$q$,'Invoice master data incomplete');
select pg_temp.assert((select status='DRAFT' and invoice_number is null from public.invoices where id=(select id from invoice_guard_context)), 'rejected issuance stays draft');
reset role;
select pg_temp.assert(not exists(select 1 from public.invoice_number_counters where company_id=(select id from public.companies where name='Guard Test GmbH')), 'rejected issuance consumes no counter');
update public.companies set street='Testweg 1',postal_code='20095',city='Hamburg',tax_number='  ',vat_id=' '
where name='Guard Test GmbH';
update public.customers set billing_address='Kundenweg 2',postal_code='20095',city='Hamburg' where name='Guard Kunde';
set role authenticated;
select pg_temp.reject($q$select public.issue_invoice((select id from invoice_guard_context))$q$,'Invoice master data incomplete');
reset role;
update public.companies set vat_id='DE123456789' where name='Guard Test GmbH';
update public.customers set billing_address=' ' where name='Guard Kunde';
set role authenticated;
select pg_temp.reject($q$select public.issue_invoice((select id from invoice_guard_context))$q$,'Invoice master data incomplete');
reset role;
update public.customers set billing_address='Kundenweg 2' where name='Guard Kunde';
-- Direct writes cannot bypass the guard either.
select pg_temp.reject($q$update public.invoices set status='ISSUED',company_snapshot='{}' where id=(select id from invoice_guard_context)$q$,'Invoice master data incomplete');
set role authenticated;
select pg_temp.assert(public.issue_invoice((select id from invoice_guard_context)) like 'RE-%-0001', 'VAT id is sufficient and first valid issue has no numbering gap');
reset role;
update public.companies set street=null,vat_id=null where name='Guard Test GmbH';
set role authenticated;
select public.record_invoice_payment((select id from invoice_guard_context),current_date,'BANK_TRANSFER','test',35700,null,null);
select pg_temp.assert((select status='PAID' from public.invoices where id=(select id from invoice_guard_context)), 'old invoice can be paid after master data changes');
reset role;
rollback;
\o
\echo production guards passed
