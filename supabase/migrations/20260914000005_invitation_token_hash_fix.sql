-- pgcrypto exposes digest(bytea, text) in the local deployment; convert tokens explicitly.
create or replace function public.get_invitation_preview(p_token text)
returns table (email text, first_name text, last_name text, role public.company_role, company_name text, expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  return query select invitation.email, member.invited_first_name, member.invited_last_name, invitation.role, company.name, invitation.expires_at
  from public.company_invitations invitation
  join public.company_members member on member.id = invitation.member_id
  join public.companies company on company.id = invitation.company_id
  where invitation.token_hash = encode(digest(convert_to(p_token, 'UTF8'), 'sha256'::text), 'hex')
    and invitation.expires_at > now() and invitation.accepted_at is null and invitation.revoked_at is null and member.status = 'INVITED';
end;
$$;

create or replace function public.complete_company_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare invitation public.company_invitations; member public.company_members; current_profile_id uuid; auth_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into invitation from public.company_invitations
  where token_hash = encode(digest(convert_to(p_token, 'UTF8'), 'sha256'::text), 'hex') for update;
  if invitation.id is null or invitation.accepted_at is not null or invitation.revoked_at is not null or invitation.expires_at <= now() then raise exception 'Invitation is invalid, expired or already used'; end if;
  select lower(email) into auth_email from auth.users where id = auth.uid();
  if auth_email is null or auth_email <> lower(invitation.email) then raise exception 'Invitation email does not match the signed-in user'; end if;
  select * into member from public.company_members where id = invitation.member_id for update;
  if member.status <> 'INVITED' or member.company_id <> invitation.company_id then raise exception 'Invitation membership is invalid'; end if;
  select id into current_profile_id from public.profiles where auth_user_id = auth.uid();
  if current_profile_id is null then raise exception 'Profile missing'; end if;
  if exists (select 1 from public.company_members where company_id = invitation.company_id and profile_id = current_profile_id) then raise exception 'User already belongs to this company'; end if;
  update public.profiles set first_name = coalesce(member.invited_first_name, first_name), last_name = coalesce(member.invited_last_name, last_name), phone = coalesce(member.invited_phone, phone) where id = current_profile_id;
  update public.company_members set profile_id = current_profile_id, status = 'ACTIVE', joined_at = now(), disabled_at = null, invited_email = invitation.email where id = member.id;
  insert into public.employee_details (company_id, profile_id, employee_number, weekly_hours, employment_start_date, notes)
  values (invitation.company_id, current_profile_id, invitation.employee_number, invitation.weekly_hours, invitation.employment_start_date, invitation.notes)
  on conflict (company_id, profile_id) do nothing;
  update public.company_invitations set accepted_at = now() where id = invitation.id;
  return member.id;
end;
$$;

revoke all on function public.complete_company_invitation(text) from public, anon;
revoke all on function public.get_invitation_preview(text) from public;
grant execute on function public.complete_company_invitation(text) to authenticated;
grant execute on function public.get_invitation_preview(text) to anon, authenticated;
