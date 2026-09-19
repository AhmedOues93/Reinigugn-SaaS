-- Phase 9: align the stored language set with the five product locales and add
-- private, tenant-scoped company branding that every surface can reuse.

-- The product ships de/en/ar/tr/uk. The previous constraint allowed fr/ro/pl and
-- rejected uk, so the database and the application disagreed in both directions.
-- Rows in a language the product no longer ships fall back to the German default.
update public.companies set default_language = 'de' where default_language not in ('de', 'en', 'ar', 'tr', 'uk');
update public.employee_details set preferred_language = 'de' where preferred_language not in ('de', 'en', 'ar', 'tr', 'uk');
update public.company_invitations set preferred_language = 'de' where preferred_language not in ('de', 'en', 'ar', 'tr', 'uk');

alter table public.companies drop constraint if exists companies_language_check;
alter table public.companies add constraint companies_language_check check (default_language in ('de', 'en', 'ar', 'tr', 'uk'));
alter table public.employee_details drop constraint if exists employee_details_language_check;
alter table public.employee_details add constraint employee_details_language_check check (preferred_language in ('de', 'en', 'ar', 'tr', 'uk'));
alter table public.company_invitations drop constraint if exists company_invitations_language_check;
alter table public.company_invitations add constraint company_invitations_language_check check (preferred_language in ('de', 'en', 'ar', 'tr', 'uk'));

create or replace function public.is_supported_locale(p_locale text)
returns boolean language sql immutable as $$
  select p_locale in ('de', 'en', 'ar', 'tr', 'uk');
$$;

create or replace function public.update_my_company_master_data(p_name text, p_legal_form text, p_street text, p_postal_code text, p_city text, p_country text, p_phone text, p_email text, p_website text, p_tax_number text, p_vat_id text, p_billing_email text, p_iban text, p_bic text, p_payment_terms smallint, p_timezone text, p_language text)
returns uuid language plpgsql security definer set search_path = public as $$
declare company_id uuid;
begin
  select member.company_id into company_id from public.company_members member join public.profiles profile on profile.id = member.profile_id where profile.auth_user_id = auth.uid() and member.role = 'OWNER' and member.status = 'ACTIVE' limit 1;
  if company_id is null then raise exception 'Owner role required'; end if;
  if char_length(trim(p_name)) not between 2 and 120 then raise exception 'Invalid company name'; end if;
  if p_payment_terms is not null and (p_payment_terms < 0 or p_payment_terms > 365) then raise exception 'Invalid payment terms'; end if;
  if not public.is_supported_locale(p_language) then raise exception 'Invalid language'; end if;
  update public.companies set name = trim(p_name), legal_form = nullif(trim(p_legal_form), ''), street = nullif(trim(p_street), ''), postal_code = nullif(trim(p_postal_code), ''), city = nullif(trim(p_city), ''), country = coalesce(nullif(trim(p_country), ''), 'Deutschland'), phone = nullif(trim(p_phone), ''), email = nullif(trim(p_email), ''), website = nullif(trim(p_website), ''), tax_number = nullif(trim(p_tax_number), ''), vat_id = nullif(trim(p_vat_id), ''), billing_email = nullif(trim(p_billing_email), ''), iban = nullif(trim(p_iban), ''), bic = nullif(trim(p_bic), ''), default_payment_terms_days = p_payment_terms, timezone = coalesce(nullif(trim(p_timezone), ''), 'Europe/Berlin'), default_language = p_language where id = company_id;
  return company_id;
end;
$$;

create or replace function public.set_employee_master_data(p_member_id uuid, p_employee_number text, p_weekly_hours numeric, p_employment_start_date date, p_employment_end_date date, p_employment_type public.employment_type, p_preferred_language text, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare target public.company_members;
begin
  if not public.can_manage_company_member(p_member_id) then raise exception 'Not permitted to edit this member'; end if;
  if p_weekly_hours is not null and (p_weekly_hours < 0 or p_weekly_hours > 168) then raise exception 'Invalid weekly hours'; end if;
  if p_employment_end_date is not null and p_employment_start_date is not null and p_employment_end_date < p_employment_start_date then raise exception 'Employment end precedes start'; end if;
  if not public.is_supported_locale(p_preferred_language) then raise exception 'Invalid language'; end if;
  select * into target from public.company_members where id = p_member_id for update;
  if target.id is null then raise exception 'Member not found'; end if;
  if target.profile_id is null then
    update public.company_invitations set employee_number = nullif(trim(p_employee_number), ''), weekly_hours = p_weekly_hours, employment_start_date = p_employment_start_date, employment_end_date = p_employment_end_date, employment_type = p_employment_type, preferred_language = p_preferred_language, notes = nullif(trim(p_notes), '') where member_id = target.id and accepted_at is null and revoked_at is null;
  else
    insert into public.employee_details (company_id, profile_id, employee_number, weekly_hours, employment_start_date, employment_end_date, employment_type, preferred_language, notes, is_active)
    values (target.company_id, target.profile_id, nullif(trim(p_employee_number), ''), p_weekly_hours, p_employment_start_date, p_employment_end_date, p_employment_type, p_preferred_language, nullif(trim(p_notes), ''), target.status = 'ACTIVE')
    on conflict (company_id, profile_id) do update set employee_number = excluded.employee_number, weekly_hours = excluded.weekly_hours, employment_start_date = excluded.employment_start_date, employment_end_date = excluded.employment_end_date, employment_type = excluded.employment_type, preferred_language = excluded.preferred_language, notes = excluded.notes;
  end if;
  return target.id;
end;
$$;

-- Employees choose their own app language without any other master-data rights.
create or replace function public.set_my_preferred_language(p_locale text)
returns text language plpgsql security definer set search_path = public as $$
declare actor public.company_members;
begin
  if not public.is_supported_locale(p_locale) then raise exception 'Invalid language'; end if;
  select member.* into actor from public.company_members member join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid() and member.status = 'ACTIVE' limit 1;
  if actor.id is null or actor.profile_id is null then raise exception 'Active membership required'; end if;
  update public.employee_details set preferred_language = p_locale where company_id = actor.company_id and profile_id = actor.profile_id;
  return p_locale;
end;
$$;

-- Branding: a private logo object plus an accent colour, reused by every surface.
alter table public.companies
  add column if not exists logo_storage_path text,
  add column if not exists logo_updated_at timestamptz,
  add column if not exists brand_color text;
alter table public.companies drop constraint if exists companies_brand_color_check;
alter table public.companies add constraint companies_brand_color_check check (brand_color is null or brand_color ~ '^#[0-9a-fA-F]{6}$');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-branding', 'company-branding', false, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set public = false, file_size_limit = 2097152, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

create or replace function public.is_allowed_branding_path(p_name text)
returns boolean language sql immutable as $$
  select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/logo/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|svg)$';
$$;

-- Every active member of the tenant may read the logo: staff, employees and portal
-- customers all render it. Only owners may write it.
create or replace function public.can_read_branding_path(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_allowed_branding_path(p_name)
    and public.is_company_member(split_part(p_name, '/', 1)::uuid);
$$;

create or replace function public.can_write_branding_path(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_allowed_branding_path(p_name)
    and public.is_company_owner(split_part(p_name, '/', 1)::uuid);
$$;

drop policy if exists "members read company branding" on storage.objects;
create policy "members read company branding" on storage.objects
for select to authenticated using (bucket_id = 'company-branding' and public.can_read_branding_path(name));

drop policy if exists "owners upload company branding" on storage.objects;
create policy "owners upload company branding" on storage.objects
for insert to authenticated with check (
  bucket_id = 'company-branding'
  and public.can_write_branding_path(name)
  and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 2097152
);

drop policy if exists "owners delete company branding" on storage.objects;
create policy "owners delete company branding" on storage.objects
for delete to authenticated using (bucket_id = 'company-branding' and public.can_write_branding_path(name));

create or replace function public.set_company_branding(p_storage_path text, p_brand_color text)
returns uuid language plpgsql security definer set search_path = public as $$
declare owned_company uuid; previous_path text;
begin
  select member.company_id into owned_company from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid() and member.role = 'OWNER' and member.status = 'ACTIVE' limit 1;
  if owned_company is null then raise exception 'Owner role required'; end if;
  if p_brand_color is not null and p_brand_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'Invalid brand colour'; end if;
  if p_storage_path is not null then
    if not public.is_allowed_branding_path(p_storage_path) then raise exception 'Invalid branding path'; end if;
    -- The tenant segment is taken from the caller's own membership, never from the client.
    if split_part(p_storage_path, '/', 1)::uuid <> owned_company then raise exception 'Branding path outside company'; end if;
  end if;

  select logo_storage_path into previous_path from public.companies where id = owned_company for update;
  update public.companies set
    logo_storage_path = coalesce(p_storage_path, logo_storage_path),
    logo_updated_at = case when p_storage_path is null then logo_updated_at else now() end,
    brand_color = p_brand_color
  where id = owned_company;

  if p_storage_path is not null and previous_path is not null and previous_path <> p_storage_path then
    delete from storage.objects where bucket_id = 'company-branding' and name = previous_path;
  end if;
  return owned_company;
end;
$$;

create or replace function public.clear_company_logo()
returns text language plpgsql security definer set search_path = public as $$
declare owned_company uuid; previous_path text;
begin
  select member.company_id into owned_company from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid() and member.role = 'OWNER' and member.status = 'ACTIVE' limit 1;
  if owned_company is null then raise exception 'Owner role required'; end if;
  select logo_storage_path into previous_path from public.companies where id = owned_company for update;
  update public.companies set logo_storage_path = null, logo_updated_at = now() where id = owned_company;
  if previous_path is not null then
    delete from storage.objects where bucket_id = 'company-branding' and name = previous_path;
  end if;
  return previous_path;
end;
$$;

revoke all on function public.set_company_branding(text, text), public.clear_company_logo(), public.set_my_preferred_language(text) from public, anon;
grant execute on function public.set_company_branding(text, text), public.clear_company_logo(), public.set_my_preferred_language(text) to authenticated;
grant execute on function public.is_supported_locale(text), public.is_allowed_branding_path(text), public.can_read_branding_path(text), public.can_write_branding_path(text) to authenticated;
