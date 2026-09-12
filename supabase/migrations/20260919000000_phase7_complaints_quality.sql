-- Phase 7: tenant-scoped complaints and simple quality inspections.
create type public.complaint_priority as enum ('LOW', 'NORMAL', 'HIGH', 'URGENT');
create type public.complaint_status as enum ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
create type public.quality_result as enum ('PASS', 'FAIL');

create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  cleaning_object_id uuid not null references public.cleaning_objects(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete set null,
  title text not null check (char_length(trim(title)) between 2 and 160),
  description text not null check (char_length(trim(description)) between 2 and 4000),
  priority public.complaint_priority not null default 'NORMAL',
  status public.complaint_status not null default 'OPEN',
  assigned_member_id uuid references public.company_members(id) on delete set null,
  due_date date,
  internal_note text check (internal_note is null or char_length(internal_note) <= 4000),
  follow_up_job_id uuid unique references public.jobs(id) on delete set null,
  created_by uuid not null references public.company_members(id) on delete restrict,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.complaint_updates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  author_member_id uuid not null references public.company_members(id) on delete restrict,
  status public.complaint_status,
  note text not null check (char_length(trim(note)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.quality_inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  cleaning_object_id uuid not null references public.cleaning_objects(id) on delete restrict,
  job_id uuid references public.jobs(id) on delete set null,
  inspected_at date not null default current_date,
  inspector_member_id uuid not null references public.company_members(id) on delete restrict,
  result public.quality_result not null,
  score smallint check (score between 0 and 100),
  criteria jsonb not null default '[]'::jsonb check (jsonb_typeof(criteria) = 'array'),
  notes text check (notes is null or char_length(notes) <= 4000),
  follow_up_required boolean not null default false,
  created_at timestamptz not null default now()
);

create index complaints_company_status_due_idx on public.complaints(company_id, status, due_date);
create index complaints_object_created_idx on public.complaints(cleaning_object_id, created_at desc);
create index complaint_updates_complaint_created_idx on public.complaint_updates(complaint_id, created_at);
create index quality_inspections_object_created_idx on public.quality_inspections(cleaning_object_id, created_at desc);

create or replace function public.phase7_current_member()
returns public.company_members language sql stable security definer set search_path = public as $$
  select member.* from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid() and member.status = 'ACTIVE'
  limit 1;
$$;

create or replace function public.ensure_complaint_company_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.customers where id = new.customer_id and company_id = new.company_id) then
    raise exception 'Complaint customer must belong to the same company';
  end if;
  if not exists (select 1 from public.cleaning_objects where id = new.cleaning_object_id and company_id = new.company_id and customer_id = new.customer_id) then
    raise exception 'Complaint object must belong to the selected customer and company';
  end if;
  if new.job_id is not null and not exists (select 1 from public.jobs where id = new.job_id and company_id = new.company_id and customer_id = new.customer_id and cleaning_object_id = new.cleaning_object_id) then
    raise exception 'Complaint job must belong to the selected customer and object';
  end if;
  if new.assigned_member_id is not null and not exists (select 1 from public.company_members where id = new.assigned_member_id and company_id = new.company_id and role = 'EMPLOYEE' and status = 'ACTIVE') then
    raise exception 'Complaint assignee must be an active employee of the same company';
  end if;
  if new.follow_up_job_id is not null and not exists (select 1 from public.jobs where id = new.follow_up_job_id and company_id = new.company_id) then
    raise exception 'Follow-up job must belong to the same company';
  end if;
  return new;
end;
$$;

create or replace function public.ensure_quality_inspection_company_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.cleaning_objects where id = new.cleaning_object_id and company_id = new.company_id) then
    raise exception 'Inspection object must belong to the same company';
  end if;
  if new.job_id is not null and not exists (select 1 from public.jobs where id = new.job_id and company_id = new.company_id and cleaning_object_id = new.cleaning_object_id) then
    raise exception 'Inspection job must belong to the selected object and company';
  end if;
  if not exists (select 1 from public.company_members where id = new.inspector_member_id and company_id = new.company_id and role in ('OWNER', 'OFFICE') and status = 'ACTIVE') then
    raise exception 'Inspector must be active company staff';
  end if;
  return new;
end;
$$;

create or replace function public.touch_complaint()
returns trigger language plpgsql security definer set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger complaints_validate_company before insert or update on public.complaints for each row execute procedure public.ensure_complaint_company_integrity();
create trigger complaints_touch_updated_at before update on public.complaints for each row execute procedure public.touch_complaint();
create trigger quality_inspections_validate_company before insert or update on public.quality_inspections for each row execute procedure public.ensure_quality_inspection_company_integrity();

alter table public.complaints enable row level security;
alter table public.complaint_updates enable row level security;
alter table public.quality_inspections enable row level security;

create policy "staff manage company complaints" on public.complaints for all to authenticated using (public.is_company_staff(company_id)) with check (public.is_company_staff(company_id));
create policy "employees read operational complaints" on public.complaints for select to authenticated using (
  assigned_member_id = (select id from public.phase7_current_member())
  or (job_id is not null and public.is_current_job_assignee(job_id))
);
create policy "staff manage complaint updates" on public.complaint_updates for all to authenticated using (public.is_company_staff(company_id)) with check (public.is_company_staff(company_id));
create policy "employees read operational complaint updates" on public.complaint_updates for select to authenticated using (
  exists (select 1 from public.complaints complaint where complaint.id = complaint_id and (complaint.assigned_member_id = (select id from public.phase7_current_member()) or (complaint.job_id is not null and public.is_current_job_assignee(complaint.job_id))))
);
create policy "staff manage quality inspections" on public.quality_inspections for all to authenticated using (public.is_company_staff(company_id)) with check (public.is_company_staff(company_id));

-- Employees only receive this constrained operational update path; direct writes stay revoked.
create or replace function public.add_my_complaint_update(
  p_complaint_id uuid,
  p_status public.complaint_status,
  p_note text
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; complaint public.complaints; update_id uuid;
begin
  select * into actor from public.phase7_current_member();
  if actor.id is null or actor.role <> 'EMPLOYEE' then raise exception 'Employee role required'; end if;
  select * into complaint from public.complaints where id = p_complaint_id for update;
  if complaint.id is null or not (complaint.assigned_member_id = actor.id or (complaint.job_id is not null and exists (select 1 from public.job_assignments where job_id = complaint.job_id and member_id = actor.id))) then
    raise exception 'Complaint is not in current employee scope';
  end if;
  if complaint.status = 'CLOSED' or p_status not in ('IN_PROGRESS', 'RESOLVED') or char_length(trim(coalesce(p_note, ''))) = 0 then
    raise exception 'Invalid operational complaint update';
  end if;
  update public.complaints set status = p_status where id = complaint.id;
  insert into public.complaint_updates(company_id, complaint_id, author_member_id, status, note)
  values (complaint.company_id, complaint.id, actor.id, p_status, trim(p_note)) returning id into update_id;
  return update_id;
end;
$$;

create or replace function public.create_complaint_follow_up_job(
  p_complaint_id uuid,
  p_scheduled_date date,
  p_start_time time,
  p_end_time time,
  p_member_ids uuid[] default array[]::uuid[]
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; complaint public.complaints; profile_id uuid; member_id uuid; new_job_id uuid;
begin
  select * into actor from public.phase7_current_member();
  if actor.id is null or actor.role not in ('OWNER', 'OFFICE') then raise exception 'Staff role required'; end if;
  select * into complaint from public.complaints where id = p_complaint_id and company_id = actor.company_id for update;
  if complaint.id is null then raise exception 'Complaint not found'; end if;
  if complaint.follow_up_job_id is not null then raise exception 'Follow-up job already exists'; end if;
  if p_end_time <= p_start_time then raise exception 'Planned end must be after start'; end if;
  foreach member_id in array coalesce(p_member_ids, array[]::uuid[]) loop
    if not public.is_active_employee_member(member_id, actor.company_id) then raise exception 'Assigned member must be an active employee of the same company'; end if;
  end loop;
  select id into profile_id from public.profiles where auth_user_id = auth.uid();
  insert into public.jobs(company_id, customer_id, cleaning_object_id, title, description, scheduled_date, planned_start_at, planned_end_at, status, priority, internal_notes, employee_instructions)
  values (actor.company_id, complaint.customer_id, complaint.cleaning_object_id, 'Nacharbeit: ' || complaint.title, complaint.description, p_scheduled_date,
    ((p_scheduled_date + p_start_time) at time zone 'Europe/Berlin'), ((p_scheduled_date + p_end_time) at time zone 'Europe/Berlin'), 'PLANNED', complaint.priority::text::public.job_priority,
    'Erstellt aus Reklamation.', 'Nacharbeit zu Reklamation: ' || complaint.title) returning id into new_job_id;
  foreach member_id in array coalesce(p_member_ids, array[]::uuid[]) loop
    insert into public.job_assignments(company_id, job_id, member_id, assigned_by) values (actor.company_id, new_job_id, member_id, profile_id);
  end loop;
  update public.complaints set follow_up_job_id = new_job_id, status = 'IN_PROGRESS' where id = complaint.id;
  insert into public.complaint_updates(company_id, complaint_id, author_member_id, status, note)
  values (actor.company_id, complaint.id, actor.id, 'IN_PROGRESS', 'Nacharbeitsauftrag wurde erstellt.');
  return new_job_id;
end;
$$;

revoke all on public.complaint_updates from authenticated;
grant select, insert, update, delete on public.complaints, public.quality_inspections to authenticated;
grant select on public.complaint_updates to authenticated;
revoke all on function public.phase7_current_member(), public.ensure_complaint_company_integrity(), public.ensure_quality_inspection_company_integrity(), public.touch_complaint() from public, anon, authenticated;
grant execute on function public.phase7_current_member() to authenticated;
revoke all on function public.add_my_complaint_update(uuid, public.complaint_status, text), public.create_complaint_follow_up_job(uuid, date, time, time, uuid[]) from public, anon;
grant execute on function public.add_my_complaint_update(uuid, public.complaint_status, text), public.create_complaint_follow_up_job(uuid, date, time, time, uuid[]) to authenticated;
