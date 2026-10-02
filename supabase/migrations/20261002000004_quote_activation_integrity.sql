-- Accepted offers activate the commercial master data they resolve to.
-- Existing objects remain active; draft objects created during a direct offer
-- become active only after the customer has accepted the offer.

create or replace function public.activate_quote_master_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'ACCEPTED' and old.status is distinct from 'ACCEPTED' then
    if new.created_customer_id is not null then
      update public.customers
      set is_active = true, updated_at = now()
      where id = new.created_customer_id
        and company_id = new.company_id;
    end if;

    if new.created_object_id is not null then
      update public.cleaning_objects
      set is_active = true, updated_at = now()
      where id = new.created_object_id
        and company_id = new.company_id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.activate_quote_master_data() from public, anon, authenticated;

drop trigger if exists quotes_activate_master_data on public.quotes;
create trigger quotes_activate_master_data
after update of status, created_customer_id, created_object_id on public.quotes
for each row execute function public.activate_quote_master_data();
