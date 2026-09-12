-- Phase 6B: bind templates to operational sources and snapshot them for each job.
alter table public.service_schedules
  add column if not exists checklist_template_id uuid references public.checklist_templates(id) on delete set null;

create or replace function public.ensure_checklist_template_in_company(
  p_template_id uuid,
  p_company_id uuid
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_template_id is not null and not exists (
    select 1 from public.checklist_templates
    where id = p_template_id and company_id = p_company_id and is_active
  ) then
    raise exception 'Checklist template must be active and belong to the same company';
  end if;
end;
$$;

create or replace function public.ensure_cleaning_object_company_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.customers where id = new.customer_id and company_id = new.company_id) then
    raise exception 'Object customer must belong to the same company';
  end if;
  perform public.ensure_checklist_template_in_company(new.checklist_template_id, new.company_id);
  return new;
end;
$$;

drop trigger if exists cleaning_objects_validate_company on public.cleaning_objects;
create trigger cleaning_objects_validate_company
before insert or update of company_id, customer_id, checklist_template_id on public.cleaning_objects
for each row execute procedure public.ensure_cleaning_object_company_integrity();

create or replace function public.ensure_schedule_company_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.customers where id = new.customer_id and company_id = new.company_id) then
    raise exception 'Schedule customer must belong to the same company';
  end if;
  if not exists (select 1 from public.cleaning_objects where id = new.cleaning_object_id and company_id = new.company_id and customer_id = new.customer_id) then
    raise exception 'Schedule object must belong to the selected customer and company';
  end if;
  perform public.ensure_checklist_template_in_company(new.checklist_template_id, new.company_id);
  return new;
end;
$$;

create or replace function public.ensure_job_company_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.customers where id = new.customer_id and company_id = new.company_id) then
    raise exception 'Job customer must belong to the same company';
  end if;
  if not exists (select 1 from public.cleaning_objects where id = new.cleaning_object_id and company_id = new.company_id and customer_id = new.customer_id) then
    raise exception 'Job object must belong to the selected customer and company';
  end if;
  if new.service_schedule_id is not null and not exists (select 1 from public.service_schedules where id = new.service_schedule_id and company_id = new.company_id and customer_id = new.customer_id and cleaning_object_id = new.cleaning_object_id) then
    raise exception 'Job schedule must belong to the same company and object';
  end if;
  perform public.ensure_checklist_template_in_company(new.checklist_template_id, new.company_id);
  return new;
end;
$$;

drop trigger if exists service_schedules_validate_company on public.service_schedules;
create trigger service_schedules_validate_company
before insert or update of company_id, customer_id, cleaning_object_id, checklist_template_id on public.service_schedules
for each row execute procedure public.ensure_schedule_company_integrity();

drop trigger if exists jobs_validate_company on public.jobs;
create trigger jobs_validate_company
before insert or update of company_id, customer_id, cleaning_object_id, service_schedule_id, checklist_template_id on public.jobs
for each row execute procedure public.ensure_job_company_integrity();

create or replace function public.resolve_job_checklist_template()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.checklist_template_id is null then
    select coalesce(schedule.checklist_template_id, object.checklist_template_id)
    into new.checklist_template_id
    from public.cleaning_objects object
    left join public.service_schedules schedule on schedule.id = new.service_schedule_id
    where object.id = new.cleaning_object_id;
  end if;
  perform public.ensure_checklist_template_in_company(new.checklist_template_id, new.company_id);
  return new;
end;
$$;

drop trigger if exists jobs_resolve_checklist_template on public.jobs;
create trigger jobs_resolve_checklist_template
before insert on public.jobs
for each row execute procedure public.resolve_job_checklist_template();

create or replace function public.create_job_checklist_snapshot(p_job_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare target_job public.jobs; checklist_id uuid;
begin
  select * into target_job from public.jobs where id = p_job_id for update;
  if target_job.id is null or target_job.checklist_template_id is null then return null; end if;
  insert into public.job_checklists (company_id, job_id, template_id)
  values (target_job.company_id, target_job.id, target_job.checklist_template_id)
  on conflict (job_id) do nothing
  returning id into checklist_id;
  if checklist_id is not null then
    insert into public.job_checklist_items (job_checklist_id, source_template_item_id, position, title, instruction, is_required)
    select checklist_id, item.id, item.position, item.title, item.instruction, item.is_required
    from public.checklist_template_items item
    where item.template_id = target_job.checklist_template_id
    order by item.position;
  else
    select id into checklist_id from public.job_checklists where job_id = target_job.id;
  end if;
  return checklist_id;
end;
$$;

create or replace function public.snapshot_checklist_for_new_job()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.create_job_checklist_snapshot(new.id);
  return new;
end;
$$;

drop trigger if exists jobs_snapshot_checklist on public.jobs;
create trigger jobs_snapshot_checklist
after insert on public.jobs
for each row execute procedure public.snapshot_checklist_for_new_job();

drop function if exists public.create_single_job(uuid, uuid, text, text, date, time, time, public.job_status, public.job_priority, text, text, uuid[]);
create function public.create_single_job(
  p_customer_id uuid, p_cleaning_object_id uuid, p_title text, p_description text, p_scheduled_date date, p_start_time time, p_end_time time,
  p_status public.job_status, p_priority public.job_priority, p_internal_notes text, p_employee_instructions text, p_member_ids uuid[], p_checklist_template_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; new_job_id uuid; actor_profile_id uuid; employee_id uuid;
begin
  select cm.* into actor from public.company_members cm join public.profiles profile on profile.id = cm.profile_id where profile.auth_user_id = auth.uid() and cm.status = 'ACTIVE' and cm.role in ('OWNER', 'OFFICE') limit 1;
  if actor.id is null then raise exception 'Staff role required'; end if;
  if p_end_time <= p_start_time then raise exception 'Planned end must be after start'; end if;
  if p_status not in ('PLANNED', 'CONFIRMED', 'CANCELLED') then raise exception 'Job status is not operationally editable'; end if;
  perform public.ensure_checklist_template_in_company(p_checklist_template_id, actor.company_id);
  foreach employee_id in array coalesce(p_member_ids, array[]::uuid[]) loop
    if not public.is_active_employee_member(employee_id, actor.company_id) then
      raise exception 'Assigned member must be an active employee of the same company';
    end if;
  end loop;
  select id into actor_profile_id from public.profiles where auth_user_id = auth.uid();
  insert into public.jobs (company_id, customer_id, cleaning_object_id, checklist_template_id, title, description, scheduled_date, planned_start_at, planned_end_at, status, priority, internal_notes, employee_instructions)
  values (actor.company_id, p_customer_id, p_cleaning_object_id, p_checklist_template_id, trim(p_title), nullif(trim(p_description), ''), p_scheduled_date,
    ((p_scheduled_date + p_start_time) at time zone 'Europe/Berlin'), ((p_scheduled_date + p_end_time) at time zone 'Europe/Berlin'), p_status, p_priority, nullif(trim(p_internal_notes), ''), nullif(trim(p_employee_instructions), ''))
  returning id into new_job_id;
  foreach employee_id in array coalesce(p_member_ids, array[]::uuid[]) loop
    insert into public.job_assignments (company_id, job_id, member_id, assigned_by) values (actor.company_id, new_job_id, employee_id, actor_profile_id) on conflict (job_id, member_id) do nothing;
  end loop;
  return new_job_id;
end;
$$;

drop function if exists public.update_job_details(uuid, uuid, uuid, text, text, date, time, time, public.job_status, public.job_priority, text, text, uuid[]);
create function public.update_job_details(
  p_job_id uuid, p_customer_id uuid, p_cleaning_object_id uuid, p_title text, p_description text, p_scheduled_date date, p_start_time time, p_end_time time,
  p_status public.job_status, p_priority public.job_priority, p_internal_notes text, p_employee_instructions text, p_member_ids uuid[], p_checklist_template_id uuid default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; target public.jobs; actor_profile_id uuid; employee_id uuid;
begin
  select cm.* into actor from public.company_members cm join public.profiles profile on profile.id = cm.profile_id where profile.auth_user_id = auth.uid() and cm.status = 'ACTIVE' and cm.role in ('OWNER', 'OFFICE') limit 1;
  if actor.id is null then raise exception 'Staff role required'; end if;
  select * into target from public.jobs where id = p_job_id and company_id = actor.company_id for update;
  if target.id is null then raise exception 'Job not found'; end if;
  if target.status in ('COMPLETED', 'MISSED') then raise exception 'Historical jobs cannot be silently changed'; end if;
  if p_end_time <= p_start_time then raise exception 'Planned end must be after start'; end if;
  if p_status not in ('PLANNED', 'CONFIRMED', 'CANCELLED') then raise exception 'Job status is not operationally editable'; end if;
  if exists (select 1 from public.job_checklists where job_id = target.id) and p_checklist_template_id is distinct from target.checklist_template_id then
    raise exception 'Checklist assignment cannot change after snapshot creation';
  end if;
  perform public.ensure_checklist_template_in_company(p_checklist_template_id, actor.company_id);
  foreach employee_id in array coalesce(p_member_ids, array[]::uuid[]) loop
    if not public.is_active_employee_member(employee_id, actor.company_id) then
      raise exception 'Assigned member must be an active employee of the same company';
    end if;
  end loop;
  select id into actor_profile_id from public.profiles where auth_user_id = auth.uid();
  update public.jobs set customer_id = p_customer_id, cleaning_object_id = p_cleaning_object_id, checklist_template_id = p_checklist_template_id, title = trim(p_title), description = nullif(trim(p_description), ''), scheduled_date = p_scheduled_date,
    planned_start_at = ((p_scheduled_date + p_start_time) at time zone 'Europe/Berlin'), planned_end_at = ((p_scheduled_date + p_end_time) at time zone 'Europe/Berlin'), status = p_status, priority = p_priority,
    internal_notes = nullif(trim(p_internal_notes), ''), employee_instructions = nullif(trim(p_employee_instructions), '') where id = target.id;
  if not exists (select 1 from public.job_checklists where job_id = target.id) then perform public.create_job_checklist_snapshot(target.id); end if;
  delete from public.job_assignments where job_id = target.id;
  foreach employee_id in array coalesce(p_member_ids, array[]::uuid[]) loop
    insert into public.job_assignments (company_id, job_id, member_id, assigned_by) values (actor.company_id, target.id, employee_id, actor_profile_id) on conflict (job_id, member_id) do nothing;
  end loop;
  return target.id;
end;
$$;

revoke all on function public.ensure_checklist_template_in_company(uuid, uuid), public.resolve_job_checklist_template(), public.create_job_checklist_snapshot(uuid), public.snapshot_checklist_for_new_job() from public, anon, authenticated;
revoke all on function public.create_single_job(uuid, uuid, text, text, date, time, time, public.job_status, public.job_priority, text, text, uuid[], uuid), public.update_job_details(uuid, uuid, uuid, text, text, date, time, time, public.job_status, public.job_priority, text, text, uuid[], uuid) from public, anon;
grant execute on function public.create_single_job(uuid, uuid, text, text, date, time, time, public.job_status, public.job_priority, text, text, uuid[], uuid), public.update_job_details(uuid, uuid, uuid, text, text, date, time, time, public.job_status, public.job_priority, text, text, uuid[], uuid) to authenticated;
