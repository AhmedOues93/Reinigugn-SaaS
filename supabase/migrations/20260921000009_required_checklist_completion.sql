-- Phase 26: required checklist items are a server-side completion rule.
-- The UI already blocks Finish; this closes the same rule at the RPC boundary.
create or replace function public.stop_my_job(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  entry public.job_time_entries;
begin
  select member.*
  into actor
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid()
    and member.status = 'ACTIVE'
    and member.role = 'EMPLOYEE'
  limit 1;

  if actor.id is null then raise exception 'Employee role required'; end if;

  select * into entry
  from public.job_time_entries
  where job_id = p_job_id
    and member_id = actor.id
    and finished_at is null
  for update;

  if entry.id is null then raise exception 'No active time entry found'; end if;

  if exists (
    select 1
    from public.job_checklists checklist
    join public.job_checklist_items item on item.job_checklist_id = checklist.id
    where checklist.job_id = p_job_id
      and item.is_required
      and item.completed_at is null
  ) then
    raise exception 'Required checklist items are incomplete';
  end if;

  update public.job_time_breaks
  set ended_at = now()
  where time_entry_id = entry.id
    and ended_at is null;

  update public.job_time_entries
  set finished_at = now(),
      end_source = 'APP'
  where id = entry.id;

  if not exists (
    select 1
    from public.job_assignments assignment
    where assignment.job_id = p_job_id
      and not exists (
        select 1
        from public.job_time_entries time_entry
        where time_entry.job_id = p_job_id
          and time_entry.member_id = assignment.member_id
          and time_entry.finished_at is not null
      )
  ) then
    update public.jobs
    set status = 'COMPLETED'
    where id = p_job_id;
  end if;

  return entry.id;
end;
$$;

revoke all on function public.stop_my_job(uuid) from public, anon;
grant execute on function public.stop_my_job(uuid) to authenticated;
