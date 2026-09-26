-- Phase 27: vacation decisions carry a reason and notify the employee.
alter table public.employee_absences
  add column if not exists review_note text
  check (review_note is null or char_length(review_note) <= 1000);

create or replace function public.review_absence_with_note(
  p_absence_id uuid,
  p_approved boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  target public.employee_absences;
  note text := nullif(trim(coalesce(p_note, '')), '');
begin
  select cm.* into actor
  from public.company_members cm
  join public.profiles p on p.id = cm.profile_id
  where p.auth_user_id = auth.uid()
    and cm.status = 'ACTIVE'
    and cm.role in ('OWNER', 'OFFICE')
  limit 1;

  if actor.id is null then raise exception 'Only OWNER or OFFICE may decide an absence'; end if;

  select * into target
  from public.employee_absences
  where id = p_absence_id
    and company_id = actor.company_id
  for update;

  if target.id is null then raise exception 'Absence not found'; end if;
  if target.absence_type <> 'VACATION' then raise exception 'Only a vacation request can be approved or rejected'; end if;
  if target.status <> 'PENDING' then raise exception 'This request has already been decided'; end if;
  if not p_approved and (note is null or char_length(note) < 3) then raise exception 'Rejection reason is required'; end if;
  if note is not null and char_length(note) > 1000 then raise exception 'Decision note is too long'; end if;

  update public.employee_absences
  set status = case when p_approved then 'APPROVED'::public.absence_status else 'REJECTED'::public.absence_status end,
      reviewed_by = actor.profile_id,
      reviewed_at = now(),
      review_note = note,
      updated_at = now()
  where id = target.id;

  insert into public.in_app_notifications (
    company_id, recipient_member_id, type, title, body, absence_id
  )
  values (
    target.company_id,
    target.member_id,
    case when p_approved then 'VACATION_APPROVED'::public.notification_type else 'VACATION_REJECTED'::public.notification_type end,
    case when p_approved then 'Urlaubsantrag genehmigt' else 'Urlaubsantrag abgelehnt' end,
    note,
    target.id
  );
end;
$$;

revoke all on function public.review_absence_with_note(uuid, boolean, text) from public, anon;
grant execute on function public.review_absence_with_note(uuid, boolean, text) to authenticated;
