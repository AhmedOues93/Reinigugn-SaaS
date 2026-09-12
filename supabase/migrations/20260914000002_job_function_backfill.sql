-- Applies Phase-4 function and policy refinements to databases that received the first migration before they were finalized.
drop policy if exists "employees can view assigned job customers" on public.customers;
create policy "employees can view assigned job customers" on public.customers for select to authenticated using (exists (select 1 from public.jobs job where job.customer_id = customers.id and public.is_current_job_assignee(job.id)));
drop policy if exists "employees can view assigned job objects" on public.cleaning_objects;
create policy "employees can view assigned job objects" on public.cleaning_objects for select to authenticated using (exists (select 1 from public.jobs job where job.cleaning_object_id = cleaning_objects.id and public.is_current_job_assignee(job.id)));
grant delete on public.service_schedule_assignments to authenticated;

create or replace function public.create_single_job(p_customer_id uuid, p_cleaning_object_id uuid, p_title text, p_description text, p_scheduled_date date, p_start_time time, p_end_time time, p_status public.job_status, p_priority public.job_priority, p_internal_notes text, p_employee_instructions text, p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; new_job_id uuid; actor_profile_id uuid; employee_id uuid;
begin
  select cm.* into actor from public.company_members cm join public.profiles profile on profile.id = cm.profile_id where profile.auth_user_id = auth.uid() and cm.status = 'ACTIVE' and cm.role in ('OWNER', 'OFFICE') limit 1;
  if actor.id is null then raise exception 'Staff role required'; end if;
  if p_end_time <= p_start_time then raise exception 'Planned end must be after start'; end if;
  if p_status not in ('PLANNED', 'CONFIRMED', 'CANCELLED') then raise exception 'Job status is not operationally editable'; end if;
  select id into actor_profile_id from public.profiles where auth_user_id = auth.uid();
  insert into public.jobs (company_id, customer_id, cleaning_object_id, title, description, scheduled_date, planned_start_at, planned_end_at, status, priority, internal_notes, employee_instructions)
  values (actor.company_id, p_customer_id, p_cleaning_object_id, trim(p_title), nullif(trim(p_description), ''), p_scheduled_date, ((p_scheduled_date + p_start_time) at time zone 'Europe/Berlin'), ((p_scheduled_date + p_end_time) at time zone 'Europe/Berlin'), p_status, p_priority, nullif(trim(p_internal_notes), ''), nullif(trim(p_employee_instructions), '')) returning id into new_job_id;
  foreach employee_id in array coalesce(p_member_ids, array[]::uuid[]) loop
    insert into public.job_assignments (company_id, job_id, member_id, assigned_by) values (actor.company_id, new_job_id, employee_id, actor_profile_id) on conflict (job_id, member_id) do nothing;
  end loop;
  return new_job_id;
end;
$$;

create or replace function public.update_job_details(p_job_id uuid, p_customer_id uuid, p_cleaning_object_id uuid, p_title text, p_description text, p_scheduled_date date, p_start_time time, p_end_time time, p_status public.job_status, p_priority public.job_priority, p_internal_notes text, p_employee_instructions text, p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; target public.jobs; actor_profile_id uuid; employee_id uuid;
begin
  select cm.* into actor from public.company_members cm join public.profiles profile on profile.id = cm.profile_id where profile.auth_user_id = auth.uid() and cm.status = 'ACTIVE' and cm.role in ('OWNER', 'OFFICE') limit 1;
  if actor.id is null then raise exception 'Staff role required'; end if;
  select * into target from public.jobs where id = p_job_id and company_id = actor.company_id for update;
  if target.id is null then raise exception 'Job not found'; end if;
  if target.status in ('COMPLETED', 'MISSED') then raise exception 'Historical jobs cannot be silently changed'; end if;
  if p_end_time <= p_start_time then raise exception 'Planned end must be after start'; end if;
  if p_status not in ('PLANNED', 'CONFIRMED', 'CANCELLED') then raise exception 'Job status is not operationally editable'; end if;
  select id into actor_profile_id from public.profiles where auth_user_id = auth.uid();
  update public.jobs set customer_id = p_customer_id, cleaning_object_id = p_cleaning_object_id, title = trim(p_title), description = nullif(trim(p_description), ''), scheduled_date = p_scheduled_date, planned_start_at = ((p_scheduled_date + p_start_time) at time zone 'Europe/Berlin'), planned_end_at = ((p_scheduled_date + p_end_time) at time zone 'Europe/Berlin'), status = p_status, priority = p_priority, internal_notes = nullif(trim(p_internal_notes), ''), employee_instructions = nullif(trim(p_employee_instructions), '') where id = target.id;
  delete from public.job_assignments where job_id = target.id;
  foreach employee_id in array coalesce(p_member_ids, array[]::uuid[]) loop
    insert into public.job_assignments (company_id, job_id, member_id, assigned_by) values (actor.company_id, target.id, employee_id, actor_profile_id) on conflict (job_id, member_id) do nothing;
  end loop;
  return target.id;
end;
$$;

revoke all on function public.create_single_job(uuid, uuid, text, text, date, time, time, public.job_status, public.job_priority, text, text, uuid[]) from public, anon;
revoke all on function public.update_job_details(uuid, uuid, uuid, text, text, date, time, time, public.job_status, public.job_priority, text, text, uuid[]) from public, anon;
grant execute on function public.create_single_job(uuid, uuid, text, text, date, time, time, public.job_status, public.job_priority, text, text, uuid[]) to authenticated;
grant execute on function public.update_job_details(uuid, uuid, uuid, text, text, date, time, time, public.job_status, public.job_priority, text, text, uuid[]) to authenticated;
