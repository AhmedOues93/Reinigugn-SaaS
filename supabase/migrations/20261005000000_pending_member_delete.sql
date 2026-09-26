-- Allow staff to permanently remove only invitations that never became accounts.
-- Active/accepted members stay archival-only so operational history remains intact.
create or replace function public.delete_pending_company_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.company_members;
begin
  if not public.can_manage_company_member(p_member_id) then
    raise exception 'Not permitted to delete this invitation';
  end if;

  select * into target
  from public.company_members
  where id = p_member_id
  for update;

  if target.id is null then
    raise exception 'Member not found';
  end if;

  if target.profile_id is not null or target.status <> 'INVITED' then
    raise exception 'Only pending invitations can be permanently deleted';
  end if;

  delete from public.company_members where id = target.id;
exception
  when foreign_key_violation then
    raise exception 'This pending member is already referenced by operational data and cannot be deleted';
end;
$$;

revoke all on function public.delete_pending_company_member(uuid) from public, anon;
grant execute on function public.delete_pending_company_member(uuid) to authenticated;
