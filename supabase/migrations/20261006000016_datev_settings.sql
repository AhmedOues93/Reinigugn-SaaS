-- DATEV export configuration belongs to the tenant and must never be guessed.
alter table public.companies
  add column if not exists datev_beraternummer text,
  add column if not exists datev_mandantennummer text,
  add column if not exists datev_kontenrahmen text,
  add column if not exists datev_revenue_account_19 text,
  add column if not exists datev_revenue_account_7 text,
  add column if not exists datev_revenue_account_0 text;

alter table public.customers
  add column if not exists datev_debtor_account text;

alter table public.companies
  drop constraint if exists companies_datev_beraternummer_check,
  drop constraint if exists companies_datev_mandantennummer_check,
  drop constraint if exists companies_datev_kontenrahmen_check,
  drop constraint if exists companies_datev_revenue_account_19_check,
  drop constraint if exists companies_datev_revenue_account_7_check,
  drop constraint if exists companies_datev_revenue_account_0_check;

alter table public.companies
  add constraint companies_datev_beraternummer_check
    check (datev_beraternummer is null or datev_beraternummer ~ '^[0-9]{1,7}$'),
  add constraint companies_datev_mandantennummer_check
    check (datev_mandantennummer is null or datev_mandantennummer ~ '^[0-9]{1,5}$'),
  add constraint companies_datev_kontenrahmen_check
    check (datev_kontenrahmen is null or datev_kontenrahmen in ('SKR03','SKR04','INDIVIDUELL')),
  add constraint companies_datev_revenue_account_19_check
    check (datev_revenue_account_19 is null or datev_revenue_account_19 ~ '^[0-9]{4,11}$'),
  add constraint companies_datev_revenue_account_7_check
    check (datev_revenue_account_7 is null or datev_revenue_account_7 ~ '^[0-9]{4,11}$'),
  add constraint companies_datev_revenue_account_0_check
    check (datev_revenue_account_0 is null or datev_revenue_account_0 ~ '^[0-9]{4,11}$');

alter table public.customers
  drop constraint if exists customers_datev_debtor_account_check;
alter table public.customers
  add constraint customers_datev_debtor_account_check
    check (datev_debtor_account is null or datev_debtor_account ~ '^[0-9]{4,11}$');

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
    datev_revenue_account_0 = nullif(trim(coalesce(p_revenue_account_0, '')), ''),
    updated_at = now()
  where id = actor.company_id
  returning id into result_id;

  return result_id;
end;
$$;

revoke all on function public.set_company_datev_settings(text,text,text,text,text,text) from public, anon;
grant execute on function public.set_company_datev_settings(text,text,text,text,text,text) to authenticated;