-- Manual planning already refuses to double-book silently: the office has to
-- confirm an overlap. Weekly hours had no such guard, so a job could be given
-- to someone who is already at their contracted hours for that week without
-- anyone noticing until the month closed.
--
-- This reports the overrun for the ISO week of the job, so the warning can name
-- the employee and the actual hours. It only reports; the office decides.

create or replace function public.find_job_capacity_warnings(
  p_company_id uuid,
  p_date date,
  p_start timestamptz,
  p_end timestamptz,
  p_member_ids uuid[],
  p_exclude_job uuid default null
)
returns table (
  member_id uuid,
  member_name text,
  weekly_hours numeric,
  planned_minutes numeric,
  added_minutes numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select date_trunc('week', p_date::timestamp)::date as week_start
  ),
  candidate as (
    select
      member.id,
      coalesce(
        nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
        'Mitarbeiter ohne Namen') as member_name,
      details.weekly_hours
    from public.company_members member
    join public.profiles profile on profile.id = member.profile_id
    join public.employee_details details
      on details.company_id = member.company_id
     and details.profile_id = member.profile_id
     and details.is_active
    where member.company_id = p_company_id
      and public.is_company_staff(p_company_id)
      and member.id = any(coalesce(p_member_ids, array[]::uuid[]))
      and details.weekly_hours is not null
      and details.weekly_hours > 0
  ),
  load as (
    select
      candidate.id,
      candidate.member_name,
      candidate.weekly_hours,
      coalesce((
        select sum(extract(epoch from (job.planned_end_at - job.planned_start_at)) / 60)
        from public.job_assignments assignment
        join public.jobs job on job.id = assignment.job_id
        where assignment.member_id = candidate.id
          and job.company_id = p_company_id
          and job.status in ('PLANNED','CONFIRMED','IN_PROGRESS')
          and job.scheduled_date >= (select week_start from bounds)
          and job.scheduled_date < (select week_start from bounds) + 7
          and (p_exclude_job is null or job.id <> p_exclude_job)
      ), 0) as planned_minutes,
      extract(epoch from (p_end - p_start)) / 60 as added_minutes
    from candidate
  )
  select load.id, load.member_name, load.weekly_hours, load.planned_minutes, load.added_minutes
  from load
  where load.planned_minutes + load.added_minutes > load.weekly_hours * 60;
$$;

revoke all on function public.find_job_capacity_warnings(uuid, date, timestamptz, timestamptz, uuid[], uuid) from public, anon;
grant execute on function public.find_job_capacity_warnings(uuid, date, timestamptz, timestamptz, uuid[], uuid) to authenticated;

-- Consolidated duplicate version: 20261006000026_public_quote_signature_once.sql
-- A public offer signature is an acceptance record, not an editable profile field.
-- Lock the offer before acceptance to serialize simultaneous clicks. The
-- existing accept_public_quote() performs the actual acceptance transaction.
create or replace function public.accept_public_quote_signed(
  p_token text, p_name text, p_signature text, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  target public.quotes;
  signature_text text := trim(coalesce(p_signature, ''));
  result jsonb;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 256 then
    raise exception 'Invalid offer link';
  end if;
  if char_length(signature_text) < 2 or char_length(signature_text) > 160 then
    raise exception 'Please enter your signature';
  end if;

  select * into target
  from public.quotes
  where public_token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'::text), 'hex')
    and public_access_expires_at > now()
  for update;

  if target.id is null then raise exception 'Offer link is invalid or expired'; end if;
  if target.status <> 'SENT' or target.accepted_signature_text is not null then
    raise exception 'Offer has already been decided';
  end if;

  result := public.accept_public_quote(p_token, p_name, p_note);

  update public.quotes
  set accepted_signature_text = signature_text, updated_at = now()
  where id = target.id
    and status = 'ACCEPTED'
    and accepted_signature_text is null;
  if not found then raise exception 'Offer signature could not be stored'; end if;
  return result;
end;
$function$;

revoke all on function public.accept_public_quote_signed(text, text, text, text) from public;
grant execute on function public.accept_public_quote_signed(text, text, text, text) to anon, authenticated;
