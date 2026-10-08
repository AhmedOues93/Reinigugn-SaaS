-- Supabase hosted Storage forbids direct writes/deletes against storage.objects.
-- Branding metadata stays in public.companies; object cleanup is performed by
-- the application through the Storage API under the owner's existing RLS policy.

create or replace function public.set_company_branding(
  p_storage_path text,
  p_brand_color text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  owned_company uuid;
begin
  select member.company_id into owned_company
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid()
    and member.role = 'OWNER'
    and member.status = 'ACTIVE'
  limit 1;

  if owned_company is null then raise exception 'Owner role required'; end if;
  if p_brand_color is not null and p_brand_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'Invalid brand colour';
  end if;

  if p_storage_path is not null then
    if not public.is_allowed_branding_path(p_storage_path) then
      raise exception 'Invalid branding path';
    end if;
    if split_part(p_storage_path, '/', 1)::uuid <> owned_company then
      raise exception 'Branding path outside company';
    end if;
  end if;

  update public.companies
  set
    logo_storage_path = coalesce(p_storage_path, logo_storage_path),
    logo_updated_at = case when p_storage_path is null then logo_updated_at else now() end,
    brand_color = p_brand_color
  where id = owned_company;

  return owned_company;
end;
$$;

create or replace function public.clear_company_logo()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  owned_company uuid;
  previous_path text;
begin
  select member.company_id into owned_company
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid()
    and member.role = 'OWNER'
    and member.status = 'ACTIVE'
  limit 1;

  if owned_company is null then raise exception 'Owner role required'; end if;

  select logo_storage_path into previous_path
  from public.companies
  where id = owned_company
  for update;

  update public.companies
  set logo_storage_path = null,
      logo_updated_at = now()
  where id = owned_company;

  return previous_path;
end;
$$;

revoke all on function public.set_company_branding(text, text), public.clear_company_logo()
from public, anon;
grant execute on function public.set_company_branding(text, text), public.clear_company_logo()
to authenticated;
