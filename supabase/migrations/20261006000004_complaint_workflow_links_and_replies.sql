alter table public.in_app_notifications
  add column if not exists complaint_id uuid references public.complaints(id) on delete cascade;

create index if not exists in_app_notifications_complaint_idx
  on public.in_app_notifications(complaint_id)
  where complaint_id is not null;

-- Make already-created portal complaint notifications actionable too.
update public.in_app_notifications notification
set complaint_id = matched.id
from lateral (
  select complaint.id
  from public.complaints complaint
  where complaint.company_id = notification.company_id
    and complaint.title = notification.body
  order by abs(extract(epoch from (complaint.created_at - notification.created_at))) asc
  limit 1
) matched
where notification.type = 'COMPLAINT_CREATED'
  and notification.complaint_id is null;

create or replace function public.create_my_portal_complaint(
  p_object_id uuid,
  p_title text,
  p_description text,
  p_job_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  contact public.customer_contacts;
  object_row public.cleaning_objects;
  new_id uuid;
  linked_job uuid;
begin
  select * into contact from public.current_customer_contact();
  if contact.id is null then raise exception 'Portal access required'; end if;
  if char_length(trim(p_title)) not between 2 and 160 then raise exception 'Invalid complaint title'; end if;
  if char_length(trim(p_description)) not between 2 and 4000 then raise exception 'Invalid complaint description'; end if;

  select * into object_row
  from public.cleaning_objects
  where id = p_object_id
    and customer_id = contact.customer_id
    and company_id = contact.company_id;
  if object_row.id is null then raise exception 'Object not found for this customer'; end if;

  if p_job_id is not null then
    select job.id into linked_job
    from public.jobs job
    where job.id = p_job_id
      and job.customer_id = contact.customer_id
      and job.company_id = contact.company_id;
    if linked_job is null then raise exception 'Job not found for this customer'; end if;
  end if;

  insert into public.complaints (
    company_id, customer_id, cleaning_object_id, job_id, title, description,
    priority, status, created_by
  )
  values (
    contact.company_id, contact.customer_id, object_row.id, linked_job,
    trim(p_title), trim(p_description), 'NORMAL', 'OPEN', contact.member_id
  )
  returning id into new_id;

  insert into public.in_app_notifications (
    company_id, recipient_member_id, type, title, body, complaint_id
  )
  select
    contact.company_id,
    member.id,
    'COMPLAINT_CREATED',
    'Neue Reklamation aus dem Kundenportal',
    trim(p_title),
    new_id
  from public.company_members member
  where member.company_id = contact.company_id
    and member.role in ('OWNER', 'OFFICE')
    and member.status = 'ACTIVE';

  return new_id;
end;
$$;

create or replace function public.add_staff_complaint_reply(
  p_complaint_id uuid,
  p_note text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  target public.complaints;
  update_id uuid;
begin
  select member.* into actor
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid()
    and member.role in ('OWNER', 'OFFICE')
    and member.status = 'ACTIVE'
  limit 1;

  if actor.id is null then raise exception 'Staff role required'; end if;
  if char_length(trim(p_note)) not between 1 and 4000 then raise exception 'Invalid reply'; end if;

  select * into target
  from public.complaints complaint
  where complaint.id = p_complaint_id
    and complaint.company_id = actor.company_id;

  if target.id is null then raise exception 'Complaint not found'; end if;

  insert into public.complaint_updates (
    company_id, complaint_id, author_member_id, status, note
  )
  values (
    actor.company_id, target.id, actor.id, target.status, trim(p_note)
  )
  returning id into update_id;

  insert into public.in_app_notifications (
    company_id, recipient_member_id, type, title, body, complaint_id
  )
  select
    actor.company_id,
    contact.member_id,
    'COMPLAINT_UPDATED',
    'Neue Antwort zu Ihrer Reklamation',
    target.title,
    target.id
  from public.customer_contacts contact
  join public.company_members member on member.id = contact.member_id
  where contact.company_id = actor.company_id
    and contact.customer_id = target.customer_id
    and member.status = 'ACTIVE';

  return update_id;
end;
$$;

revoke all on function public.add_staff_complaint_reply(uuid, text) from public, anon;
grant execute on function public.add_staff_complaint_reply(uuid, text) to authenticated;
