-- Close the portal-acceptance loop with an auditable request and one reminder.
alter table public.service_records
  add column if not exists acceptance_request_sent_at timestamptz,
  add column if not exists acceptance_reminder_sent_at timestamptz;

create or replace function public.get_portal_acceptance_mail_target(p_job_id uuid)
returns table (
  service_record_id uuid,
  customer_id uuid,
  customer_name text,
  job_title text,
  scheduled_date date,
  recipient_email text,
  recipient_name text,
  request_sent_at timestamptz,
  reminder_sent_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  record_row public.service_records;
begin
  select member.* into actor
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid()
    and member.status = 'ACTIVE'
  limit 1;

  if actor.id is null then raise exception 'Active membership required'; end if;

  select record.* into record_row
  from public.service_records record
  where record.job_id = p_job_id
    and record.company_id = actor.company_id
    and record.acceptance_policy = 'PORTAL_ABNAHME'
    and record.status = 'ABNAHME_AUSSTEHEND';

  if record_row.id is null then return; end if;

  if actor.role = 'EMPLOYEE' and not exists (
    select 1 from public.job_assignments assignment
    where assignment.job_id = p_job_id and assignment.member_id = actor.id
  ) then
    raise exception 'Job is not assigned to current employee';
  end if;

  return query
  select
    record_row.id,
    record_row.customer_id,
    customer.name,
    job.title,
    job.scheduled_date,
    member.invited_email,
    nullif(trim(concat_ws(' ', member.invited_first_name, member.invited_last_name)), ''),
    record_row.acceptance_request_sent_at,
    record_row.acceptance_reminder_sent_at
  from public.jobs job
  join public.customers customer on customer.id = record_row.customer_id
  join public.customer_contacts contact
    on contact.company_id = record_row.company_id
   and contact.customer_id = record_row.customer_id
  join public.company_members member
    on member.id = contact.member_id
   and member.company_id = record_row.company_id
   and member.role = 'CUSTOMER'
   and member.status = 'ACTIVE'
  where job.id = p_job_id
    and nullif(trim(coalesce(member.invited_email, '')), '') is not null
  order by member.joined_at nulls last, member.created_at
  limit 1;
end;
$$;

create or replace function public.record_portal_acceptance_mail(
  p_job_id uuid,
  p_kind text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  record_row public.service_records;
begin
  if p_kind not in ('REQUEST', 'REMINDER') then raise exception 'Invalid acceptance mail kind'; end if;

  select member.* into actor
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid()
    and member.status = 'ACTIVE'
  limit 1;

  if actor.id is null then raise exception 'Active membership required'; end if;

  select * into record_row
  from public.service_records
  where job_id = p_job_id
    and company_id = actor.company_id
    and acceptance_policy = 'PORTAL_ABNAHME'
    and status = 'ABNAHME_AUSSTEHEND'
  for update;

  if record_row.id is null then raise exception 'Pending portal acceptance not found'; end if;

  if actor.role = 'EMPLOYEE' and not exists (
    select 1 from public.job_assignments assignment
    where assignment.job_id = p_job_id and assignment.member_id = actor.id
  ) then
    raise exception 'Job is not assigned to current employee';
  end if;

  if actor.role not in ('OWNER', 'OFFICE', 'EMPLOYEE') then
    raise exception 'Staff role required';
  end if;

  if p_kind = 'REQUEST' then
    update public.service_records
    set acceptance_request_sent_at = coalesce(acceptance_request_sent_at, now())
    where id = record_row.id;
  else
    if record_row.acceptance_request_sent_at is null then
      raise exception 'Acceptance request has not been sent yet';
    end if;
    if record_row.acceptance_reminder_sent_at is not null then
      raise exception 'Acceptance reminder has already been sent';
    end if;
    update public.service_records
    set acceptance_reminder_sent_at = now()
    where id = record_row.id;
  end if;

  return record_row.id;
end;
$$;

revoke all on function public.get_portal_acceptance_mail_target(uuid) from public, anon;
revoke all on function public.record_portal_acceptance_mail(uuid, text) from public, anon;
grant execute on function public.get_portal_acceptance_mail_target(uuid) to authenticated;
grant execute on function public.record_portal_acceptance_mail(uuid, text) to authenticated;