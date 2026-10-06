\set ON_ERROR_STOP on
begin;
create function pg_temp.assert(ok boolean,message text) returns void language plpgsql as $$
begin if not coalesce(ok,false) then raise exception 'ASSERTION FAILED: %',message; end if; end $$;

select pg_temp.assert(not exists(
 select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prorettype='trigger'::regtype
 and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))
),'internal trigger routines cannot be invoked through browser RPC');
select pg_temp.assert((select count(*)=6 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('de_hours','easter_sunday','german_public_holidays','working_days_in_month','working_days_between','forbid_audit_change')
 and 'search_path=public'=any(p.proconfig)), 'calendar, formatting and audit paths are fixed');

-- A tenant can still be created after removing EXECUTE on its internal triggers.
insert into auth.users(id,email) values('f7111111-1111-4111-8111-111111111111','trigger-owner@example.test');
select set_config('request.jwt.claim.sub','f7111111-1111-4111-8111-111111111111',true);
set role authenticated;
select public.create_company_for_current_user('Internal Trigger Test');
select pg_temp.assert((select count(*)=1 from public.company_subscriptions),'trial trigger still fires under the owner session');
select pg_temp.assert(public.working_days_in_month('2026-05-01')=18,'calendar behaviour unchanged');
select pg_temp.assert(public.de_hours(90)='1,5','German formatting unchanged');
reset role;
-- Existing numbering, invoice guards and audit immutability are exercised by
-- the full migration suite, so this does not grant browser access just for tests.
rollback;
\echo internal trigger permissions passed
