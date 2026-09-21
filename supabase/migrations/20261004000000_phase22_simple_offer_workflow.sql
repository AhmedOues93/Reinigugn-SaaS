-- Phase 22 — simple offer workflow.
-- Keep sales provenance normalized while the UI presents one short flow:
-- customer/object -> services -> calculation -> quote -> order.

alter table public.leads
  add column if not exists customer_id uuid references public.customers(id) on delete set null,
  add column if not exists cleaning_object_id uuid references public.cleaning_objects(id) on delete set null,
  add column if not exists cleaning_type text,
  add column if not exists desired_start date,
  add column if not exists frequency text,
  add column if not exists preferred_time text;

create index if not exists leads_customer_idx on public.leads(company_id, customer_id)
  where customer_id is not null;
create index if not exists leads_object_idx on public.leads(company_id, cleaning_object_id)
  where cleaning_object_id is not null;

create or replace function public.create_lead_v2(
  p_organisation text,
  p_contact_person text default null,
  p_email text default null,
  p_phone text default null,
  p_street text default null,
  p_postal_code text default null,
  p_city text default null,
  p_source text default null,
  p_notes text default null,
  p_customer_id uuid default null,
  p_cleaning_object_id uuid default null,
  p_cleaning_type text default null,
  p_desired_start date default null,
  p_frequency text default null,
  p_preferred_time text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  actor record;
  new_id uuid;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;

  if p_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.company_id = actor.company_id and c.is_active
  ) then
    raise exception 'Customer is not available';
  end if;

  if p_cleaning_object_id is not null and not exists (
    select 1 from public.cleaning_objects o
    where o.id = p_cleaning_object_id and o.company_id = actor.company_id
      and (p_customer_id is null or o.customer_id = p_customer_id)
  ) then
    raise exception 'Cleaning object is not available for this customer';
  end if;

  insert into public.leads (
    company_id, organisation, contact_person, email, phone, street, postal_code, city,
    source, notes, customer_id, cleaning_object_id, cleaning_type, desired_start,
    frequency, preferred_time, created_by
  ) values (
    actor.company_id, trim(p_organisation), nullif(trim(p_contact_person), ''),
    nullif(trim(p_email), ''), nullif(trim(p_phone), ''), nullif(trim(p_street), ''),
    nullif(trim(p_postal_code), ''), nullif(trim(p_city), ''), nullif(trim(p_source), ''),
    nullif(trim(p_notes), ''), p_customer_id, p_cleaning_object_id,
    nullif(trim(p_cleaning_type), ''), p_desired_start, nullif(trim(p_frequency), ''),
    nullif(trim(p_preferred_time), ''), actor.id
  ) returning id into new_id;

  return new_id;
end;
$$;

revoke all on function public.create_lead_v2(text,text,text,text,text,text,text,text,text,uuid,uuid,text,date,text,text) from public;
grant execute on function public.create_lead_v2(text,text,text,text,text,text,text,text,text,uuid,uuid,text,date,text,text) to authenticated;

comment on function public.create_lead_v2(text,text,text,text,text,text,text,text,text,uuid,uuid,text,date,text,text)
is 'Creates a normalized sales lead/prospect. Existing customer/object links and cleaning requirements stay queryable instead of being packed into notes.';
