-- Require a real on-site signature before a VOR_ORT_UNTERSCHRIFT visit
-- becomes COMPLETED. Time tracking can end first, but the visit remains open
-- until the customer signs on the employee's device.

create or replace function public.build_service_record(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  job public.jobs;
  target_customer public.customers;
  object_row public.cleaning_objects;
  policy public.acceptance_policy;
  record_id uuid;
  initial public.service_record_status;
begin
  select id into record_id from public.service_records where job_id = p_job_id;
  if record_id is not null then return record_id; end if;

  select * into job from public.jobs where id = p_job_id for update;
  if job.id is null then raise exception 'Job not found'; end if;

  policy := public.resolve_acceptance_policy(job.id);

  if job.status <> 'COMPLETED' and not (
    policy = 'VOR_ORT_UNTERSCHRIFT'
    and job.status = 'IN_PROGRESS'
    and not exists (
      select 1 from public.job_time_entries entry
      where entry.job_id = job.id and entry.finished_at is null
    )
  ) then
    raise exception 'A Leistungsnachweis can only be created after the work is finished';
  end if;

  select * into target_customer from public.customers where id = job.customer_id;
  select * into object_row from public.cleaning_objects where id = job.cleaning_object_id;

  initial := case
    when policy = 'KEINE_ABNAHME_ERFORDERLICH' then 'ERFASST'::public.service_record_status
    else 'ABNAHME_AUSSTEHEND'::public.service_record_status
  end;

  insert into public.service_records (
    company_id, job_id, customer_id, cleaning_object_id, service_schedule_id,
    status, acceptance_policy, service_date, started_at, finished_at,
    break_minutes, net_minutes, title, service_description,
    customer_snapshot, object_snapshot, performed_by, checklist_snapshot, photo_snapshot,
    acceptance_method
  )
  select
    job.company_id, job.id, job.customer_id, job.cleaning_object_id, job.service_schedule_id,
    initial, policy, job.scheduled_date,
    (select min(entry.started_at) from public.job_time_entries entry where entry.job_id = job.id),
    (select max(entry.finished_at) from public.job_time_entries entry where entry.job_id = job.id),
    coalesce((select sum(entry.break_minutes)::integer from public.job_time_entries entry
              where entry.job_id = job.id and entry.finished_at is not null), 0),
    coalesce((select sum(entry.duration_minutes)::integer from public.job_time_entries entry
              where entry.job_id = job.id and entry.finished_at is not null), 0),
    job.title,
    coalesce(job.description, schedule.billing_description, schedule.description),
    jsonb_build_object('name', target_customer.name, 'customer_number', target_customer.customer_number),
    jsonb_build_object(
      'name', object_row.name,
      'street', object_row.street,
      'postal_code', object_row.postal_code,
      'city', object_row.city
    ),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'member_id', entry.member_id,
        'name', coalesce(nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''), 'Mitarbeiter'),
        'started_at', entry.started_at,
        'finished_at', entry.finished_at,
        'net_minutes', entry.duration_minutes
      ) order by entry.started_at)
      from public.job_time_entries entry
      left join public.company_members member on member.id = entry.member_id
      left join public.profiles profile on profile.id = member.profile_id
      where entry.job_id = job.id and entry.finished_at is not null
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', item.position,
        'title', item.title,
        'required', item.is_required,
        'completed', item.completed_at is not null,
        'completed_at', item.completed_at
      ) order by item.position)
      from public.job_checklists list
      join public.job_checklist_items item on item.job_checklist_id = list.id
      where list.job_id = job.id
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', photo.id,
        'storage_path', photo.storage_path,
        'category', photo.category,
        'description', photo.description
      ) order by photo.created_at)
      from public.job_photos photo
      where photo.job_id = job.id
    ), '[]'::jsonb),
    case when policy = 'KEINE_ABNAHME_ERFORDERLICH'
      then 'KEINE'::public.acceptance_method else null end
  from public.jobs j
  left join public.service_schedules schedule on schedule.id = job.service_schedule_id
  where j.id = job.id
  on conflict (job_id) do nothing
  returning id into record_id;

  if record_id is null then
    select id into record_id from public.service_records where job_id = p_job_id;
    return record_id;
  end if;

  insert into public.service_record_events (company_id, service_record_id, event, note)
  values (
    job.company_id,
    record_id,
    'ERSTELLT',
    case policy
      when 'KEINE_ABNAHME_ERFORDERLICH' then 'Keine Abnahme erforderlich'
      when 'VOR_ORT_UNTERSCHRIFT' then 'Unterschrift vor Ort erforderlich'
      else 'Abnahme im Kundenportal erforderlich'
    end
  );

  return record_id;
end;
$$;

create or replace function public.start_my_job(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  job public.jobs;
  entry_id uuid;
begin
  select * into actor from public.current_employee_member();
  if actor.id is null then raise exception 'Employee role required'; end if;

  select * into job from public.jobs where id = p_job_id for update;
  if job.id is null or not exists (
    select 1 from public.job_assignments assignment
    where assignment.job_id = job.id and assignment.member_id = actor.id
  ) then
    raise exception 'Job is not assigned to current employee';
  end if;

  if job.status not in ('PLANNED', 'CONFIRMED', 'IN_PROGRESS') then
    raise exception 'Job cannot be started';
  end if;

  if exists (
    select 1
    from public.service_records record
    where record.job_id = job.id
      and record.acceptance_policy = 'VOR_ORT_UNTERSCHRIFT'
      and record.status = 'ABNAHME_AUSSTEHEND'
  ) then
    raise exception 'On-site customer acceptance is pending';
  end if;

  if exists (
    select 1 from public.job_time_entries entry
    where entry.member_id = actor.id and entry.finished_at is null
  ) then
    raise exception 'Another active job must be ended first';
  end if;

  insert into public.job_time_entries (company_id, job_id, member_id, started_at, start_source)
  values (job.company_id, job.id, actor.id, now(), 'APP')
  returning id into entry_id;

  update public.jobs
  set status = 'IN_PROGRESS'
  where id = job.id and status in ('PLANNED', 'CONFIRMED');

  return entry_id;
end;
$$;

create or replace function public.stop_my_job(p_job_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  entry public.job_time_entries;
  policy public.acceptance_policy;
begin
  select * into actor from public.current_employee_member();
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
    from public.job_checklists list
    join public.job_checklist_items item on item.job_checklist_id = list.id
    where list.job_id = p_job_id
      and item.is_required
      and item.completed_at is null
  ) then
    raise exception 'Required checklist items are incomplete';
  end if;

  update public.job_time_breaks
  set ended_at = now()
  where time_entry_id = entry.id and ended_at is null;

  update public.job_time_entries
  set finished_at = now(), end_source = 'APP'
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
    policy := public.resolve_acceptance_policy(p_job_id);

    if policy = 'VOR_ORT_UNTERSCHRIFT' then
      -- Work time is finished, but the visit is not completed until the
      -- customer has actually signed.
      perform public.build_service_record(p_job_id);
    else
      update public.jobs set status = 'COMPLETED' where id = p_job_id;
      perform public.build_service_record(p_job_id);
    end if;
  end if;

  return entry.id;
end;
$$;

create or replace function public.sign_service_record_on_site(
  p_job_id uuid,
  p_signer_name text,
  p_signature_path text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  record_row public.service_records;
  signer text;
begin
  if not public.is_current_job_assignee(p_job_id) then
    raise exception 'Only an employee assigned to this visit can take an on-site signature';
  end if;

  signer := nullif(trim(coalesce(p_signer_name, '')), '');
  if signer is null or char_length(signer) < 2 or char_length(signer) > 160 then
    raise exception 'The name of the person accepting the work is required';
  end if;

  select * into record_row
  from public.service_records
  where job_id = p_job_id
  for update;

  if record_row.id is null then raise exception 'Leistungsnachweis not found'; end if;
  if record_row.acceptance_policy <> 'VOR_ORT_UNTERSCHRIFT' then
    raise exception 'This visit is not set up for an on-site signature';
  end if;
  if record_row.status = 'ABGENOMMEN' then
    raise exception 'This Leistungsnachweis has already been accepted';
  end if;
  if record_row.status = 'PROBLEM_GEMELDET' then
    raise exception 'A reported problem has to be resolved first';
  end if;

  if p_signature_path is null or trim(p_signature_path) = '' then
    raise exception 'A handwritten customer signature is required';
  end if;

  if p_signature_path !~
     ('^' || record_row.company_id::text || '/service/' || record_row.job_id::text || '/[0-9a-f-]{36}\.png$') then
    raise exception 'The signature file does not belong to this visit';
  end if;

  update public.service_records
  set status = 'ABGENOMMEN',
      accepted_at = now(),
      accepted_by_name = signer,
      acceptance_method = 'VOR_ORT_UNTERSCHRIFT',
      signature_storage_path = p_signature_path
  where id = record_row.id;

  insert into public.service_record_events (
    company_id, service_record_id, event, actor_name, note
  )
  values (
    record_row.company_id,
    record_row.id,
    'UNTERSCHRIEBEN',
    signer,
    'Handschriftliche Unterschrift vor Ort erfasst'
  );

  -- Only now is the visit itself complete.
  update public.jobs
  set status = 'COMPLETED'
  where id = p_job_id
    and company_id = record_row.company_id;

  return record_row.id;
end;
$$;

revoke all on function public.start_my_job(uuid), public.stop_my_job(uuid) from public, anon;
grant execute on function public.start_my_job(uuid), public.stop_my_job(uuid) to authenticated;

revoke all on function public.sign_service_record_on_site(uuid, text, text) from public, anon;
grant execute on function public.sign_service_record_on_site(uuid, text, text) to authenticated;
