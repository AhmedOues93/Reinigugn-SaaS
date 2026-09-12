-- Narrow OWNER-only path for sensitive company master data.
alter table public.company_invitations add column if not exists preferred_language text not null default 'de', add column if not exists employment_end_date date, add column if not exists employment_type public.employment_type;
alter table public.company_invitations add constraint company_invitations_language_check check (preferred_language in ('de', 'en', 'fr', 'ar', 'tr', 'ro', 'pl'));

create or replace function public.update_my_company_master_data(p_name text, p_legal_form text, p_street text, p_postal_code text, p_city text, p_country text, p_phone text, p_email text, p_website text, p_tax_number text, p_vat_id text, p_billing_email text, p_iban text, p_bic text, p_payment_terms smallint, p_timezone text, p_language text)
returns uuid language plpgsql security definer set search_path = public as $$
declare company_id uuid;
begin
  select member.company_id into company_id from public.company_members member join public.profiles profile on profile.id = member.profile_id where profile.auth_user_id = auth.uid() and member.role = 'OWNER' and member.status = 'ACTIVE' limit 1;
  if company_id is null then raise exception 'Owner role required'; end if;
  if char_length(trim(p_name)) not between 2 and 120 then raise exception 'Invalid company name'; end if;
  if p_payment_terms is not null and (p_payment_terms < 0 or p_payment_terms > 365) then raise exception 'Invalid payment terms'; end if;
  if p_language not in ('de', 'en', 'fr', 'ar', 'tr', 'ro', 'pl') then raise exception 'Invalid language'; end if;
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
  if p_preferred_language not in ('de', 'en', 'fr', 'ar', 'tr', 'ro', 'pl') then raise exception 'Invalid language'; end if;
  select * into target from public.company_members where id = p_member_id for update;
  if target.id is null then raise exception 'Member not found'; end if;
  if target.profile_id is null then update public.company_invitations set employee_number = nullif(trim(p_employee_number), ''), weekly_hours = p_weekly_hours, employment_start_date = p_employment_start_date, employment_end_date = p_employment_end_date, employment_type = p_employment_type, preferred_language = p_preferred_language, notes = nullif(trim(p_notes), '') where member_id = target.id and accepted_at is null and revoked_at is null;
  else insert into public.employee_details (company_id, profile_id, employee_number, weekly_hours, employment_start_date, employment_end_date, employment_type, preferred_language, notes, is_active) values (target.company_id, target.profile_id, nullif(trim(p_employee_number), ''), p_weekly_hours, p_employment_start_date, p_employment_end_date, p_employment_type, p_preferred_language, nullif(trim(p_notes), ''), target.status = 'ACTIVE') on conflict (company_id, profile_id) do update set employee_number = excluded.employee_number, weekly_hours = excluded.weekly_hours, employment_start_date = excluded.employment_start_date, employment_end_date = excluded.employment_end_date, employment_type = excluded.employment_type, preferred_language = excluded.preferred_language, notes = excluded.notes; end if;
  return target.id;
end;
$$;
revoke all on function public.update_my_company_master_data(text, text, text, text, text, text, text, text, text, text, text, text, text, text, smallint, text, text), public.set_employee_master_data(uuid, text, numeric, date, date, public.employment_type, text, text) from public, anon;
grant execute on function public.update_my_company_master_data(text, text, text, text, text, text, text, text, text, text, text, text, text, text, smallint, text, text), public.set_employee_master_data(uuid, text, numeric, date, date, public.employment_type, text, text) to authenticated;
