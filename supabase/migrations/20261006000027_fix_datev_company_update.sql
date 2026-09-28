-- The companies table has no updated_at column. DATEV settings are stored
-- through an OWNER-only RPC; do not alter invoice snapshots or other tenants.
create or replace function public.set_company_datev_settings(
  p_beraternummer text,
  p_mandantennummer text,
  p_kontenrahmen text,
  p_revenue_account_19 text,
  p_revenue_account_7 text,
  p_revenue_account_0 text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  result_id uuid;
begin
  select * into actor
  from public.current_company_member()
  where role = 'OWNER' and status = 'ACTIVE';

  if actor.id is null then
    raise exception 'Only OWNER may configure DATEV';
  end if;

  update public.companies
  set
    datev_beraternummer = nullif(trim(coalesce(p_beraternummer, '')), ''),
    datev_mandantennummer = nullif(trim(coalesce(p_mandantennummer, '')), ''),
    datev_kontenrahmen = nullif(trim(coalesce(p_kontenrahmen, '')), ''),
    datev_revenue_account_19 = nullif(trim(coalesce(p_revenue_account_19, '')), ''),
    datev_revenue_account_7 = nullif(trim(coalesce(p_revenue_account_7, '')), ''),
    datev_revenue_account_0 = nullif(trim(coalesce(p_revenue_account_0, '')), '')
  where id = actor.company_id
  returning id into result_id;

  return result_id;
end;
$$;

revoke all on function public.set_company_datev_settings(text,text,text,text,text,text) from public, anon;
grant execute on function public.set_company_datev_settings(text,text,text,text,text,text) to authenticated;
