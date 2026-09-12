-- Replaces the already-applied function in existing environments with the corrected email expression.
create or replace function public.create_employee_invitation(
  p_email text, p_first_name text, p_last_name text, p_phone text, p_role public.company_role, p_employee_number text,
  p_weekly_hours numeric, p_employment_start_date date, p_notes text, p_token_hash text, p_expires_at timestamptz
)
returns table (invitation_id uuid, member_id uuid, company_id uuid)
language plpgsql security definer set search_path = public as $$
declare actor_member public.company_members; actor_profile_id uuid; new_member_id uuid; new_invitation_id uuid; normalized_email text := lower(trim(p_email));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_role not in ('OFFICE', 'EMPLOYEE') then raise exception 'Only OFFICE or EMPLOYEE can be invited'; end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid invitation email'; end if;
  if char_length(trim(p_first_name)) < 1 or char_length(trim(p_last_name)) < 1 then raise exception 'Name is required'; end if;
  if p_weekly_hours is not null and (p_weekly_hours < 0 or p_weekly_hours > 168) then raise exception 'Invalid weekly hours'; end if;
  if p_expires_at <= now() then raise exception 'Invitation must expire in the future'; end if;
  select member.* into actor_member from public.company_members member join public.profiles profile on profile.id = member.profile_id where profile.auth_user_id = auth.uid() and member.status = 'ACTIVE' limit 1;
  if actor_member.id is null or actor_member.role not in ('OWNER', 'OFFICE') then raise exception 'Staff role required'; end if;
  if actor_member.role = 'OFFICE' and p_role <> 'EMPLOYEE' then raise exception 'Office may only invite employees'; end if;
  select id into actor_profile_id from public.profiles where auth_user_id = auth.uid();
  if exists (select 1 from public.company_members member where member.company_id = actor_member.company_id and lower(member.invited_email) = normalized_email and member.status in ('INVITED', 'ACTIVE')) then raise exception 'A member or invitation already exists for this email'; end if;
  insert into public.company_members (company_id, role, status, invited_email, invited_first_name, invited_last_name, invited_phone, invited_by, invited_at)
  values (actor_member.company_id, p_role, 'INVITED', normalized_email, trim(p_first_name), trim(p_last_name), nullif(trim(p_phone), ''), actor_profile_id, now()) returning id into new_member_id;
  insert into public.company_invitations (company_id, member_id, email, role, token_hash, employee_number, weekly_hours, employment_start_date, notes, expires_at)
  values (actor_member.company_id, new_member_id, normalized_email, p_role, p_token_hash, nullif(trim(p_employee_number), ''), p_weekly_hours, p_employment_start_date, nullif(trim(p_notes), ''), p_expires_at) returning id into new_invitation_id;
  return query select new_invitation_id, new_member_id, actor_member.company_id;
end;
$$;

revoke all on function public.create_employee_invitation(text, text, text, text, public.company_role, text, numeric, date, text, text, timestamptz) from public, anon;
grant execute on function public.create_employee_invitation(text, text, text, text, public.company_role, text, numeric, date, text, text, timestamptz) to authenticated;
