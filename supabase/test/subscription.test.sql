\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean, message text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'ASSERTION FAILED: %',message; end if; end $$;
create function pg_temp.reject(sql text) returns void language plpgsql as $$
begin begin execute sql; exception when others then return; end; raise exception 'Expected rejection: %',sql; end $$;

insert into public.companies(id,name,slug) values('d1111111-1111-1111-1111-111111111111','Subscription Test','subscription-test');
select pg_temp.assert((select trial_ends_at-trial_started_at=interval '30 days' from public.company_subscriptions where company_id='d1111111-1111-1111-1111-111111111111'),'trial is created once for 30 days');
select pg_temp.assert(not has_table_privilege('authenticated','public.company_subscriptions','UPDATE'),'browser cannot extend trial or activate payment');
select pg_temp.assert(not has_function_privilege('authenticated','public.reserve_reinplan_checkout(uuid,public.reinplan_subscription_plan)','EXECUTE'),'browser cannot reserve checkout');
select pg_temp.assert(not has_function_privilege('anon','public.record_reinplan_subscription_event(text,text,bigint,uuid,text,text,text,public.reinplan_subscription_plan,public.reinplan_subscription_status,boolean,timestamptz)','EXECUTE'),'anonymous cannot forge payment');
create temp table reservation as select public.reserve_reinplan_checkout('d1111111-1111-1111-1111-111111111111','START') data;
select pg_temp.assert((select data from reservation)=public.reserve_reinplan_checkout('d1111111-1111-1111-1111-111111111111','START'),'concurrent retries reserve the same key and fixed expiry');
select pg_temp.reject($q$select public.reserve_reinplan_checkout('d1111111-1111-1111-1111-111111111111','BETRIEB')$q$);
select public.record_reinplan_subscription_event('evt_active','customer.subscription.updated',100,'d1111111-1111-1111-1111-111111111111','sub_test','cus_test','price_start','START','ACTIVE',false,now()+interval '1 month');
select pg_temp.assert(not public.record_reinplan_subscription_event('evt_active','customer.subscription.updated',100,'d1111111-1111-1111-1111-111111111111','sub_test','cus_test','price_start','START','CANCELED',false,null),'duplicate cannot mutate status');
select pg_temp.assert(not public.record_reinplan_subscription_event('evt_old','customer.subscription.updated',90,'d1111111-1111-1111-1111-111111111111','sub_test','cus_test','price_start','START','CANCELED',false,null),'late old event cannot overwrite active status');
select pg_temp.assert((select status='ACTIVE' from public.company_subscriptions where company_id='d1111111-1111-1111-1111-111111111111'),'status still active');
select pg_temp.reject($q$select public.record_reinplan_subscription_event('evt_wrong','customer.subscription.updated',110,'d1111111-1111-1111-1111-111111111111','sub_other','cus_test','price_start','START','ACTIVE',false,null)$q$);
select pg_temp.assert(not exists(select 1 from public.stripe_webhook_events where event_id='evt_wrong'),'failed write rolls back ledger too');
select public.record_reinplan_subscription_event('evt_cancel','customer.subscription.deleted',120,'d1111111-1111-1111-1111-111111111111','sub_test','cus_test','price_start','START','CANCELED',false,null);
select pg_temp.assert((select status='CANCELED' from public.company_subscriptions where company_id='d1111111-1111-1111-1111-111111111111'),'cancellation saved');
-- The selected plan caps active and invited employees, including reactivation.
do $$ declare user_id uuid; profile_id uuid; begin
 for n in 1..5 loop
  user_id:=gen_random_uuid(); insert into auth.users(id,email) values(user_id,'subscription-'||n||'@example.test');
  select id into profile_id from public.profiles where auth_user_id=user_id;
  insert into public.company_members(company_id,profile_id,role,status) values('d1111111-1111-1111-1111-111111111111',profile_id,'EMPLOYEE','INVITED');
 end loop;
end $$;
insert into auth.users(id,email) values('d2222222-2222-2222-2222-222222222222','sixth@example.test');
select pg_temp.reject($q$insert into public.company_members(company_id,profile_id,role,status) select 'd1111111-1111-1111-1111-111111111111',id,'EMPLOYEE','ACTIVE' from public.profiles where auth_user_id='d2222222-2222-2222-2222-222222222222'$q$);
select set_config('request.jwt.claim.sub','d2222222-2222-2222-2222-222222222222',true);
set role authenticated;
select pg_temp.assert((select count(*)=0 from public.company_subscriptions),'unrelated authenticated user cannot read tenant subscription');
reset role;
rollback;
\echo subscription guards passed
