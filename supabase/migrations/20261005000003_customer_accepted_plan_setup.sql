-- Phase 26: public/portal offer acceptance creates an operational plan draft,
-- not a misleading active plan without confirmed rhythm/team.
create or replace function public.mark_customer_accepted_schedule_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ACCEPTED'
     and old.status is distinct from 'ACCEPTED'
     and new.created_schedule_id is not null
     and new.accepted_via in ('PUBLIC_LINK', 'PORTAL') then
    update public.service_schedules
    set is_active = false,
        updated_at = now()
    where id = new.created_schedule_id;
  end if;
  return new;
end;
$$;

drop trigger if exists quote_customer_acceptance_schedule_pending on public.quotes;
create trigger quote_customer_acceptance_schedule_pending
after update of status, accepted_via, created_schedule_id on public.quotes
for each row
execute function public.mark_customer_accepted_schedule_pending();

revoke all on function public.mark_customer_accepted_schedule_pending() from public, anon, authenticated;
