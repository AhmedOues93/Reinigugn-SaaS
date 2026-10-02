-- ReinPlan: account state must reflect a real authenticated profile.
--
-- A member without profile_id cannot sign in. Historical/demo rows that were
-- marked ACTIVE without accepting an invitation are therefore normalised back
-- to INVITED. The invariant below prevents the same fake-active state from
-- being created again.

update public.company_members
set status = 'INVITED',
    joined_at = null,
    disabled_at = null,
    updated_at = now()
where status = 'ACTIVE'
  and profile_id is null;

alter table public.company_members
  drop constraint if exists company_members_active_requires_profile;

alter table public.company_members
  add constraint company_members_active_requires_profile
  check (status <> 'ACTIVE' or profile_id is not null);

create or replace function public.list_member_account_states()
returns table (
  member_id uuid,
  status public.membership_status,
  invitation_state public.invitation_state,
  invitation_expires_at timestamptz,
  invitation_sent_at timestamptz,
  suggested_action text
)
language sql stable security definer set search_path = public as $$
  select
    member.id,
    member.status,
    case
      when member.status = 'ACTIVE' and member.profile_id is not null
        then 'ANGENOMMEN'::public.invitation_state
      when latest.id is null then 'UNBEKANNT'::public.invitation_state
      when latest.accepted_at is not null then 'ANGENOMMEN'::public.invitation_state
      when latest.revoked_at is not null then 'ZURUECKGEZOGEN'::public.invitation_state
      when latest.expires_at <= now() then 'ABGELAUFEN'::public.invitation_state
      else 'GUELTIG'::public.invitation_state
    end,
    latest.expires_at,
    latest.created_at,
    case
      when member.profile_id is null and member.status = 'INVITED' then 'RESEND'
      else 'NONE'
    end
  from public.company_members member
  left join lateral (
    select *
    from public.company_invitations invitation
    where invitation.member_id = member.id
    order by (invitation.revoked_at is null) desc,
             invitation.created_at desc,
             invitation.id desc
    limit 1
  ) latest on true
  where public.is_company_staff(member.company_id);
$$;

revoke all on function public.list_member_account_states() from public, anon;
grant execute on function public.list_member_account_states() to authenticated;

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
