-- Phase 3: employee memberships, secure invitations and role-aware access.
alter table public.profiles
  add column avatar_url text,
  add column updated_at timestamptz not null default now();

alter table public.company_members
  alter column profile_id drop not null,
  add column invited_email text,
  add column invited_first_name text,
  add column invited_last_name text,
  add column invited_phone text,
  add column invited_by uuid references public.profiles(id) on delete set null,
  add column invited_at timestamptz,
  add column joined_at timestamptz,
  add column disabled_at timestamptz,
  add column updated_at timestamptz not null default now();

create table public.employee_details (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  employee_number text,
  weekly_hours numeric(5,2) check (weekly_hours is null or weekly_hours between 0 and 168),
  employment_start_date date,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, profile_id)
);

create table public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  member_id uuid not null references public.company_members(id) on delete cascade,
  email text not null,
  role public.company_role not null check (role in ('OFFICE', 'EMPLOYEE')),
  token_hash text not null unique,
  employee_number text,
  weekly_hours numeric(5,2) check (weekly_hours is null or weekly_hours between 0 and 168),
  employment_start_date date,
  notes text,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index company_members_active_or_invited_email_idx
  on public.company_members(company_id, lower(invited_email))
  where invited_email is not null and status in ('INVITED', 'ACTIVE');
create index company_members_company_role_status_idx on public.company_members(company_id, role, status);
create index employee_details_company_profile_idx on public.employee_details(company_id, profile_id);
create index company_invitations_member_idx on public.company_invitations(member_id);
create index company_invitations_token_expiry_idx on public.company_invitations(token_hash, expires_at) where accepted_at is null and revoked_at is null;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger company_members_set_updated_at
  before update on public.company_members
  for each row execute procedure public.set_updated_at();
create trigger employee_details_set_updated_at
  before update on public.employee_details
  for each row execute procedure public.set_updated_at();
create trigger company_invitations_set_updated_at
  before update on public.company_invitations
  for each row execute procedure public.set_updated_at();

create or replace function public.is_company_staff(target_company_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.company_members cm
    join public.profiles p on p.id = cm.profile_id
    where cm.company_id = target_company_id
      and p.auth_user_id = auth.uid()
      and cm.status = 'ACTIVE'
      and cm.role in ('OWNER', 'OFFICE')
  );
$$;

create or replace function public.can_manage_company_member(target_member_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.company_members target
    join public.company_members actor on actor.company_id = target.company_id
    join public.profiles actor_profile on actor_profile.id = actor.profile_id
    where target.id = target_member_id
      and target.role <> 'OWNER'
      and actor_profile.auth_user_id = auth.uid()
      and actor.status = 'ACTIVE'
      and (
        actor.role = 'OWNER'
        or (actor.role = 'OFFICE' and target.role = 'EMPLOYEE')
      )
  );
$$;

create or replace function public.is_staff_for_profile(target_profile_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.company_members target
    join public.company_members actor on actor.company_id = target.company_id
    join public.profiles actor_profile on actor_profile.id = actor.profile_id
    where target.profile_id = target_profile_id
      and actor_profile.auth_user_id = auth.uid()
      and actor.status = 'ACTIVE'
      and actor.role in ('OWNER', 'OFFICE')
  );
$$;

-- Phase 2 becomes available to OFFICE as specified in Phase 3.
drop policy "owners can manage own customers" on public.customers;
drop policy "owners can manage own cleaning objects" on public.cleaning_objects;
create policy "staff can manage own customers" on public.customers
  for all to authenticated
  using (public.is_company_staff(company_id))
  with check (public.is_company_staff(company_id));
create policy "staff can manage own cleaning objects" on public.cleaning_objects
  for all to authenticated
  using (public.is_company_staff(company_id))
  with check (
    public.is_company_staff(company_id)
    and public.customer_belongs_to_company(customer_id, company_id)
  );

drop policy "owners can view company memberships" on public.company_members;
create policy "staff can view company memberships" on public.company_members
  for select to authenticated using (public.is_company_staff(company_id));
create policy "staff can view company profiles" on public.profiles
  for select to authenticated using (public.is_staff_for_profile(id));
create policy "staff can update managed profiles" on public.profiles
  for update to authenticated
  using (public.is_staff_for_profile(id))
  with check (public.is_staff_for_profile(id));

alter table public.employee_details enable row level security;
alter table public.company_invitations enable row level security;
create policy "staff can view employee details" on public.employee_details
  for select to authenticated
  using (public.is_company_staff(company_id) or profile_id = (select id from public.profiles where auth_user_id = auth.uid()));
create policy "staff can view invitations" on public.company_invitations
  for select to authenticated using (public.is_company_staff(company_id));

revoke all on public.employee_details, public.company_invitations from anon;
revoke all on public.employee_details, public.company_invitations from authenticated;
grant select on public.employee_details, public.company_invitations to authenticated;
grant update (first_name, last_name, phone, avatar_url) on public.profiles to authenticated;

-- Invitation creation is the only path that can create a pending member record.
create or replace function public.create_employee_invitation(
  p_email text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_role public.company_role,
  p_employee_number text,
  p_weekly_hours numeric,
  p_employment_start_date date,
  p_notes text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns table (invitation_id uuid, member_id uuid, company_id uuid)
language plpgsql security definer set search_path = public
as $$
declare
  actor_member public.company_members;
  actor_profile_id uuid;
  new_member_id uuid;
  new_invitation_id uuid;
  normalized_email text := lower(trim(p_email));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_role not in ('OFFICE', 'EMPLOYEE') then raise exception 'Only OFFICE or EMPLOYEE can be invited'; end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid invitation email'; end if;
  if char_length(trim(p_first_name)) < 1 or char_length(trim(p_last_name)) < 1 then raise exception 'Name is required'; end if;
  if p_weekly_hours is not null and (p_weekly_hours < 0 or p_weekly_hours > 168) then raise exception 'Invalid weekly hours'; end if;
  if p_expires_at <= now() then raise exception 'Invitation must expire in the future'; end if;

  select cm.* into actor_member
  from public.company_members cm
  join public.profiles p on p.id = cm.profile_id
  where p.auth_user_id = auth.uid() and cm.status = 'ACTIVE'
  limit 1;
  if actor_member.id is null or actor_member.role not in ('OWNER', 'OFFICE') then raise exception 'Staff role required'; end if;
  if actor_member.role = 'OFFICE' and p_role <> 'EMPLOYEE' then raise exception 'Office may only invite employees'; end if;
  select id into actor_profile_id from public.profiles where auth_user_id = auth.uid();

  if exists (
    select 1 from public.company_members
    where company_id = actor_member.company_id
      and lower(invited_email) = normalized_email
      and status in ('INVITED', 'ACTIVE')
  ) then raise exception 'A member or invitation already exists for this email'; end if;

  insert into public.company_members (
    company_id, role, status, invited_email, invited_first_name, invited_last_name, invited_phone, invited_by, invited_at
  ) values (
    actor_member.company_id, p_role, 'INVITED', normalized_email, trim(p_first_name), trim(p_last_name), nullif(trim(p_phone), ''), actor_profile_id, now()
  ) returning id into new_member_id;

  insert into public.company_invitations (
    company_id, member_id, email, role, token_hash, employee_number, weekly_hours, employment_start_date, notes, expires_at
  ) values (
    actor_member.company_id, new_member_id, normalized_email, p_role, p_token_hash, nullif(trim(p_employee_number), ''), p_weekly_hours, p_employment_start_date, nullif(trim(p_notes), ''), p_expires_at
  ) returning id into new_invitation_id;

  return query select new_invitation_id, new_member_id, actor_member.company_id;
end;
$$;

create or replace function public.get_invitation_preview(p_token text)
returns table (email text, first_name text, last_name text, role public.company_role, company_name text, expires_at timestamptz)
language plpgsql security definer set search_path = public
as $$
begin
  return query
    select invitation.email, member.invited_first_name, member.invited_last_name, invitation.role, company.name, invitation.expires_at
    from public.company_invitations invitation
    join public.company_members member on member.id = invitation.member_id
    join public.companies company on company.id = invitation.company_id
    where invitation.token_hash = encode(digest(p_token, 'sha256'), 'hex')
      and invitation.expires_at > now()
      and invitation.accepted_at is null
      and invitation.revoked_at is null
      and member.status = 'INVITED';
end;
$$;

create or replace function public.complete_company_invitation(p_token text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  invitation public.company_invitations;
  member public.company_members;
  current_profile_id uuid;
  auth_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into invitation from public.company_invitations
    where token_hash = encode(digest(p_token, 'sha256'), 'hex') for update;
  if invitation.id is null or invitation.accepted_at is not null or invitation.revoked_at is not null or invitation.expires_at <= now() then
    raise exception 'Invitation is invalid, expired or already used'; end if;
  select lower(email) into auth_email from auth.users where id = auth.uid();
  if auth_email is null or auth_email <> lower(invitation.email) then raise exception 'Invitation email does not match the signed-in user'; end if;
  select * into member from public.company_members where id = invitation.member_id for update;
  if member.status <> 'INVITED' or member.company_id <> invitation.company_id then raise exception 'Invitation membership is invalid'; end if;
  select id into current_profile_id from public.profiles where auth_user_id = auth.uid();
  if current_profile_id is null then raise exception 'Profile missing'; end if;
  if exists (select 1 from public.company_members where company_id = invitation.company_id and profile_id = current_profile_id) then
    raise exception 'User already belongs to this company'; end if;

  update public.profiles set
    first_name = coalesce(member.invited_first_name, first_name),
    last_name = coalesce(member.invited_last_name, last_name),
    phone = coalesce(member.invited_phone, phone)
  where id = current_profile_id;
  update public.company_members set
    profile_id = current_profile_id, status = 'ACTIVE', joined_at = now(), disabled_at = null, invited_email = invitation.email
  where id = member.id;
  insert into public.employee_details (company_id, profile_id, employee_number, weekly_hours, employment_start_date, notes)
  values (invitation.company_id, current_profile_id, invitation.employee_number, invitation.weekly_hours, invitation.employment_start_date, invitation.notes)
  on conflict (company_id, profile_id) do nothing;
  update public.company_invitations set accepted_at = now() where id = invitation.id;
  return member.id;
end;
$$;

create or replace function public.resend_company_invitation(p_member_id uuid, p_token_hash text, p_expires_at timestamptz)
returns table (invitation_id uuid, email text)
language plpgsql security definer set search_path = public
as $$
declare
  member public.company_members;
  previous public.company_invitations;
  next_invitation_id uuid;
begin
  if not public.can_manage_company_member(p_member_id) then raise exception 'Not permitted to resend this invitation'; end if;
  if p_expires_at <= now() then raise exception 'Invitation must expire in the future'; end if;
  select * into member from public.company_members where id = p_member_id for update;
  if member.status <> 'INVITED' or member.profile_id is not null then raise exception 'Member is not awaiting an invitation'; end if;
  select * into previous from public.company_invitations where member_id = p_member_id and accepted_at is null and revoked_at is null order by created_at desc limit 1 for update;
  if previous.id is null then raise exception 'Invitation missing'; end if;
  update public.company_invitations set revoked_at = now() where id = previous.id;
  insert into public.company_invitations (company_id, member_id, email, role, token_hash, employee_number, weekly_hours, employment_start_date, notes, expires_at)
  values (previous.company_id, member.id, previous.email, previous.role, p_token_hash, previous.employee_number, previous.weekly_hours, previous.employment_start_date, previous.notes, p_expires_at)
  returning id into next_invitation_id;
  update public.company_members set invited_at = now() where id = member.id;
  return query select next_invitation_id, previous.email;
end;
$$;

create or replace function public.update_company_member(
  p_member_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_role public.company_role,
  p_employee_number text,
  p_weekly_hours numeric,
  p_employment_start_date date,
  p_notes text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  target public.company_members;
  actor_role public.company_role;
begin
  if not public.can_manage_company_member(p_member_id) then raise exception 'Not permitted to edit this member'; end if;
  if p_role not in ('OFFICE', 'EMPLOYEE') then raise exception 'Owner role cannot be assigned'; end if;
  if char_length(trim(p_first_name)) < 1 or char_length(trim(p_last_name)) < 1 then raise exception 'Name is required'; end if;
  if p_weekly_hours is not null and (p_weekly_hours < 0 or p_weekly_hours > 168) then raise exception 'Invalid weekly hours'; end if;
  select * into target from public.company_members where id = p_member_id for update;
  select cm.role into actor_role
  from public.company_members cm join public.profiles p on p.id = cm.profile_id
  where p.auth_user_id = auth.uid() and cm.company_id = target.company_id and cm.status = 'ACTIVE'
  limit 1;
  if actor_role = 'OFFICE' and p_role <> 'EMPLOYEE' then raise exception 'Office may only keep employees as employees'; end if;
  if target.profile_id is null then
    update public.company_members set role = p_role, invited_first_name = trim(p_first_name), invited_last_name = trim(p_last_name), invited_phone = nullif(trim(p_phone), '') where id = target.id;
    update public.company_invitations set
      role = p_role,
      employee_number = nullif(trim(p_employee_number), ''),
      weekly_hours = p_weekly_hours,
      employment_start_date = p_employment_start_date,
      notes = nullif(trim(p_notes), '')
    where member_id = target.id and accepted_at is null and revoked_at is null;
  else
    update public.company_members set role = p_role where id = target.id;
    update public.profiles set first_name = trim(p_first_name), last_name = trim(p_last_name), phone = nullif(trim(p_phone), '') where id = target.profile_id;
    insert into public.employee_details (company_id, profile_id, employee_number, weekly_hours, employment_start_date, notes, is_active)
    values (target.company_id, target.profile_id, nullif(trim(p_employee_number), ''), p_weekly_hours, p_employment_start_date, nullif(trim(p_notes), ''), target.status = 'ACTIVE')
    on conflict (company_id, profile_id) do update set employee_number = excluded.employee_number, weekly_hours = excluded.weekly_hours, employment_start_date = excluded.employment_start_date, notes = excluded.notes;
  end if;
  return target.id;
end;
$$;

create or replace function public.set_company_member_active(p_member_id uuid, p_is_active boolean)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare target public.company_members;
begin
  if not public.can_manage_company_member(p_member_id) then raise exception 'Not permitted to change this member'; end if;
  select * into target from public.company_members where id = p_member_id for update;
  if target.profile_id is null then raise exception 'Pending invitations cannot be disabled'; end if;
  update public.company_members set status = case when p_is_active then 'ACTIVE' else 'DISABLED' end, disabled_at = case when p_is_active then null else now() end where id = target.id;
  update public.employee_details set is_active = p_is_active where company_id = target.company_id and profile_id = target.profile_id;
  return target.id;
end;
$$;

revoke all on function public.create_employee_invitation(text, text, text, text, public.company_role, text, numeric, date, text, text, timestamptz) from public, anon;
revoke all on function public.complete_company_invitation(text) from public, anon;
revoke all on function public.resend_company_invitation(uuid, text, timestamptz) from public, anon;
revoke all on function public.update_company_member(uuid, text, text, text, public.company_role, text, numeric, date, text) from public, anon;
revoke all on function public.set_company_member_active(uuid, boolean) from public, anon;
revoke all on function public.get_invitation_preview(text) from public;
grant execute on function public.create_employee_invitation(text, text, text, text, public.company_role, text, numeric, date, text, text, timestamptz) to authenticated;
grant execute on function public.complete_company_invitation(text) to authenticated;
grant execute on function public.resend_company_invitation(uuid, text, timestamptz) to authenticated;
grant execute on function public.update_company_member(uuid, text, text, text, public.company_role, text, numeric, date, text) to authenticated;
grant execute on function public.set_company_member_active(uuid, boolean) to authenticated;
grant execute on function public.get_invitation_preview(text) to anon, authenticated;
