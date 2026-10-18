-- Internal trigger routines are not Data API endpoints. Existing triggers
-- continue firing; callers need EXECUTE only when creating a trigger.
do $$
declare routine record;
begin
  for routine in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.prorettype='trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated',routine.signature);
  end loop;
end $$;

-- Calendar/format helpers and the audit guard must not inherit caller paths.
alter function public.de_hours(numeric) set search_path=public;
alter function public.easter_sunday(integer) set search_path=public;
alter function public.german_public_holidays(integer) set search_path=public;
alter function public.working_days_in_month(date) set search_path=public;
alter function public.working_days_between(date,date) set search_path=public;
alter function public.forbid_audit_change() set search_path=public;
