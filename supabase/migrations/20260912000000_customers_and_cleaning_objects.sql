-- Phase 2: customer and cleaning-object data. Both records always belong to one tenant.
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 160),
  customer_number text,
  contact_person text,
  email text,
  phone text,
  billing_address text,
  city text,
  postal_code text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cleaning_objects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 160),
  street text,
  postal_code text,
  city text,
  contact_person text,
  contact_phone text,
  access_instructions text,
  cleaning_instructions text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customers_company_id_idx on public.customers(company_id);
create index customers_company_active_idx on public.customers(company_id, is_active);
create index customers_company_name_idx on public.customers(company_id, lower(name));
create index customers_company_city_idx on public.customers(company_id, lower(city));
create index cleaning_objects_company_id_idx on public.cleaning_objects(company_id);
create index cleaning_objects_company_active_idx on public.cleaning_objects(company_id, is_active);
create index cleaning_objects_customer_id_idx on public.cleaning_objects(customer_id);
create index cleaning_objects_company_name_idx on public.cleaning_objects(company_id, lower(name));
create index cleaning_objects_company_city_idx on public.cleaning_objects(company_id, lower(city));

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute procedure public.set_updated_at();

create trigger cleaning_objects_set_updated_at
  before update on public.cleaning_objects
  for each row execute procedure public.set_updated_at();

-- This trigger is a second, database-level guard against cross-tenant object assignment.
create or replace function public.ensure_object_customer_company_match()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.customers
    where id = new.customer_id and company_id = new.company_id
  ) then
    raise exception 'Cleaning object customer must belong to the same company';
  end if;
  return new;
end;
$$;

create trigger cleaning_objects_validate_customer_company
  before insert or update of company_id, customer_id on public.cleaning_objects
  for each row execute procedure public.ensure_object_customer_company_match();

create or replace function public.customer_belongs_to_company(target_customer_id uuid, target_company_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.customers
    where id = target_customer_id and company_id = target_company_id
  );
$$;

alter table public.customers enable row level security;
alter table public.cleaning_objects enable row level security;

create policy "owners can manage own customers" on public.customers
  for all to authenticated
  using (public.is_company_owner(company_id))
  with check (public.is_company_owner(company_id));

create policy "owners can manage own cleaning objects" on public.cleaning_objects
  for all to authenticated
  using (public.is_company_owner(company_id))
  with check (
    public.is_company_owner(company_id)
    and public.customer_belongs_to_company(customer_id, company_id)
  );

revoke all on public.customers, public.cleaning_objects from anon;
revoke delete on public.customers, public.cleaning_objects from authenticated;
grant select, insert, update on public.customers, public.cleaning_objects to authenticated;
