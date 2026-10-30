-- Fix ambiguous company_id reference in customer portal invitations.
-- The actor's company remains the only tenant source; the client only supplies a customer id.

create or replace function public.create_customer_invitation(
  p_customer_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_token_hash text,
  p_expires_at timestamptz
) returns table (invitation_id uuid, member_id uuid, company_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  actor public.company_members;
  target_customer public.customers;
  new_member_id uuid;
  new_invitation_id uuid;
  normalized_email text := lower(trim(p_email));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select member.* into actor
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid()
    and member.role in ('OWNER', 'OFFICE')
    and member.status = 'ACTIVE'
  limit 1;

  if actor.id is null then raise exception 'Staff role required'; end if;

  select customer.*
  into target_customer
  from public.customers customer
  where customer.id = p_customer_id
    and customer.company_id = actor.company_id;

  if target_customer.id is null then raise exception 'Customer not found in this company'; end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid invitation email'; end if;
  if p_expires_at <= now() then raise exception 'Invitation must expire in the future'; end if;

  if exists (
    select 1
    from public.company_members member
    where member.company_id = actor.company_id
      and lower(member.invited_email) = normalized_email
      and member.status <> 'DISABLED'
  ) then
    raise exception 'This email already has access to the company';
  end if;

  insert into public.company_members (
    company_id, role, status, invited_email, invited_first_name, invited_last_name,
    invited_phone, invited_by, invited_at
  )
  values (
    actor.company_id, 'CUSTOMER', 'INVITED', normalized_email,
    nullif(trim(p_first_name), ''), nullif(trim(p_last_name), ''),
    nullif(trim(p_phone), ''), actor.profile_id, now()
  )
  returning id into new_member_id;

  insert into public.company_invitations (
    company_id, member_id, email, role, token_hash, expires_at, customer_id
  )
  values (
    actor.company_id, new_member_id, normalized_email, 'CUSTOMER',
    p_token_hash, p_expires_at, target_customer.id
  )
  returning id into new_invitation_id;

  return query
  select new_invitation_id, new_member_id, actor.company_id;
end;
$$;

revoke all on function public.create_customer_invitation(uuid, text, text, text, text, text, timestamptz)
from public, anon;
grant execute on function public.create_customer_invitation(uuid, text, text, text, text, text, timestamptz)
to authenticated;
