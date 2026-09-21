-- Phase 23: throttle invitation resends to avoid accidental mail bursts.
create or replace function public.resend_company_invitation(
  p_member_id uuid,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table (invitation_id uuid, email text)
language plpgsql security definer set search_path = public as $$
declare
  member public.company_members;
  previous public.company_invitations;
  next_invitation_id uuid;
begin
  if not public.can_manage_company_member(p_member_id) then
    raise exception 'Not permitted to resend this invitation';
  end if;
  if p_expires_at <= now() then
    raise exception 'Invitation must expire in the future';
  end if;

  select * into member
  from public.company_members
  where id = p_member_id
  for update;

  if member.profile_id is not null or member.status <> 'INVITED' then
    raise exception 'Member is not awaiting an invitation';
  end if;

  select * into previous
  from public.company_invitations
  where member_id = p_member_id
    and accepted_at is null
    and revoked_at is null
  order by created_at desc, id desc
  limit 1
  for update;

  if previous.id is null then
    raise exception 'Invitation missing';
  end if;

  if previous.created_at > now() - interval '60 seconds' then
    raise exception 'Invitation resend cooldown active';
  end if;

  update public.company_invitations
  set revoked_at = now(), updated_at = now()
  where id = previous.id;

  insert into public.company_invitations (
    company_id, member_id, email, role, token_hash,
    employee_number, weekly_hours, employment_start_date,
    employment_end_date, employment_type, preferred_language,
    notes, expires_at, customer_id
  )
  values (
    previous.company_id, member.id, previous.email, previous.role, p_token_hash,
    previous.employee_number, previous.weekly_hours, previous.employment_start_date,
    previous.employment_end_date, previous.employment_type, previous.preferred_language,
    previous.notes, p_expires_at, previous.customer_id
  )
  returning id into next_invitation_id;

  update public.company_members
  set invited_at = now(), updated_at = now()
  where id = member.id;

  return query select next_invitation_id, previous.email;
end;
$$;

revoke all on function public.resend_company_invitation(uuid, text, timestamptz) from public, anon;
grant execute on function public.resend_company_invitation(uuid, text, timestamptz) to authenticated;
