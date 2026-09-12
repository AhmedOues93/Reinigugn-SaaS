-- Initial tenant and identity foundation. Application data must always reference companies.id.
create extension if not exists pgcrypto;

create type public.company_role as enum ('OWNER', 'OFFICE', 'EMPLOYEE', 'CUSTOMER');
create type public.membership_status as enum ('ACTIVE', 'INVITED', 'DISABLED');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.company_role not null,
  status public.membership_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  unique (company_id, profile_id)
);

create index company_members_company_id_idx on public.company_members(company_id);
create index company_members_profile_id_idx on public.company_members(profile_id);

-- A profile is created independently of application code whenever Supabase Auth creates a user.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (auth_user_id, first_name, last_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

-- Security-definer helpers avoid RLS recursion while keeping policy expressions small and auditable.
create or replace function public.is_company_member(target_company_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.company_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.company_id = target_company_id
      and p.auth_user_id = auth.uid()
      and cm.status = 'ACTIVE'
  );
$$;

create or replace function public.is_company_owner(target_company_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.company_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.company_id = target_company_id
      and p.auth_user_id = auth.uid()
      and cm.role = 'OWNER'
      and cm.status = 'ACTIVE'
  );
$$;

-- The only phase-1 company creation path. It creates the company and owner membership atomically.
create or replace function public.create_company_for_current_user(company_name text)
returns public.companies
language plpgsql
security definer set search_path = public
as $$
declare
  current_profile_id uuid;
  new_company public.companies;
  company_slug text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(company_name)) not between 2 and 120 then raise exception 'Invalid company name'; end if;

  select id into current_profile_id from public.profiles where auth_user_id = auth.uid();
  if current_profile_id is null then raise exception 'Profile missing'; end if;
  if exists (select 1 from public.company_members where profile_id = current_profile_id and status = 'ACTIVE') then
    raise exception 'An active company membership already exists';
  end if;

  company_slug := lower(regexp_replace(trim(company_name), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(gen_random_uuid()::text, 1, 8);
  insert into public.companies (name, slug) values (trim(company_name), company_slug) returning * into new_company;
  insert into public.company_members (company_id, profile_id, role, status)
  values (new_company.id, current_profile_id, 'OWNER', 'ACTIVE');
  return new_company;
end;
$$;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_members enable row level security;

create policy "members can view their company" on public.companies
  for select to authenticated using (public.is_company_member(id));
create policy "owners can update their company" on public.companies
  for update to authenticated using (public.is_company_owner(id)) with check (public.is_company_owner(id));

create policy "users can view their own profile" on public.profiles
  for select to authenticated using (auth_user_id = auth.uid());
create policy "users can update their own profile" on public.profiles
  for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid());

create policy "members can view own membership" on public.company_members
  for select to authenticated
  using (profile_id = (select id from public.profiles where auth_user_id = auth.uid()));
create policy "owners can view company memberships" on public.company_members
  for select to authenticated using (public.is_company_owner(company_id));

-- Keep sensitive profile and membership columns out of normal browser mutations.
revoke all on public.companies, public.profiles, public.company_members from anon;
revoke insert, delete on public.companies, public.profiles, public.company_members from authenticated;
revoke update on public.company_members from authenticated;
revoke update on public.profiles from authenticated;
grant select on public.companies, public.profiles, public.company_members to authenticated;
grant update (name, slug) on public.companies to authenticated;
grant update (first_name, last_name, phone) on public.profiles to authenticated;
grant execute on function public.create_company_for_current_user(text) to authenticated;
revoke all on function public.create_company_for_current_user(text) from anon;
