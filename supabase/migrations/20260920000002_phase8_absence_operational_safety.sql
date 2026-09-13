create table public.job_assignment_changes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  from_member_id uuid not null references public.company_members(id) on delete restrict,
  to_member_id uuid not null references public.company_members(id) on delete restrict,
  changed_by uuid not null references public.profiles(id) on delete restrict,
  reason text not null default 'ABSENCE_REPLACEMENT',
  created_at timestamptz not null default now()
);
create index job_assignment_changes_job_idx on public.job_assignment_changes(job_id, created_at desc);
alter table public.job_assignment_changes enable row level security;
create policy "staff view assignment changes" on public.job_assignment_changes for select to authenticated using (public.is_company_staff(company_id));

create or replace function public.attach_my_au_document(p_absence_id uuid, p_path text) returns void language plpgsql security definer set search_path = public as $$
declare target public.employee_absences;
begin
  select * into target from public.employee_absences where id = p_absence_id for update;
  if target.id is null or not public.is_current_member(target.member_id) or target.absence_type <> 'SICKNESS'
    or p_path !~ ('^' || target.company_id::text || '/absence/' || target.id::text || '/[0-9a-f-]{36}\\.(pdf|jpg|jpeg|png)$') then
    raise exception 'AU document cannot be attached';
  end if;
  update public.employee_absences set au_storage_path = p_path, updated_at = now() where id = target.id;
end; $$;

create or replace function public.list_absence_affected_assignments(p_from date default current_date, p_to date default null)
returns table(job_id uuid, job_title text, scheduled_date date, member_id uuid, first_name text, last_name text, absence_id uuid, absence_type public.absence_type, absence_status public.absence_status, start_date date, end_date date)
language sql stable security definer set search_path = public as $$
  select j.id, j.title, j.scheduled_date, ja.member_id, p.first_name, p.last_name, a.id, a.absence_type, a.status, a.start_date, a.end_date
  from public.job_assignments ja
  join public.jobs j on j.id = ja.job_id
  join public.employee_absences a on a.member_id = ja.member_id and a.company_id = j.company_id
  join public.company_members cm on cm.id = ja.member_id
  join public.profiles p on p.id = cm.profile_id
  where public.is_company_staff(j.company_id)
    and j.scheduled_date >= p_from and (p_to is null or j.scheduled_date <= p_to)
    and j.status not in ('CANCELLED', 'COMPLETED', 'MISSED')
    and a.start_date <= j.scheduled_date and a.end_date >= j.scheduled_date
    and (a.absence_type = 'SICKNESS' or a.status = 'APPROVED');
$$;

create or replace function public.reassign_absence_affected_job(p_job_id uuid, p_from_member_id uuid, p_to_member_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members; job public.jobs; actor_profile_id uuid;
begin
  select cm.* into actor from public.company_members cm join public.profiles p on p.id=cm.profile_id where p.auth_user_id=auth.uid() and cm.role in ('OWNER','OFFICE') and cm.status='ACTIVE' limit 1;
  select * into job from public.jobs where id=p_job_id and company_id=actor.company_id for update;
  if actor.id is null or job.id is null or not exists (select 1 from public.job_assignments where job_id=job.id and member_id=p_from_member_id)
    or not exists (select 1 from public.employee_absences a where a.company_id=job.company_id and a.member_id=p_from_member_id and a.start_date <= job.scheduled_date and a.end_date >= job.scheduled_date and (a.absence_type='SICKNESS' or a.status='APPROVED'))
    or not exists (select 1 from public.list_replacement_candidates(job.id) where member_id=p_to_member_id) then
    raise exception 'Replacement is not eligible';
  end if;
  select profile_id into actor_profile_id from public.company_members where id=actor.id;
  delete from public.job_assignments where job_id=job.id and member_id=p_from_member_id;
  insert into public.job_assignments(company_id,job_id,member_id,assigned_by) values(job.company_id,job.id,p_to_member_id,actor_profile_id);
  insert into public.job_assignment_changes(company_id, job_id, from_member_id, to_member_id, changed_by) values(job.company_id, job.id, p_from_member_id, p_to_member_id, actor_profile_id);
  insert into public.in_app_notifications(company_id,recipient_member_id,type,title,job_id) values
    (job.company_id,p_from_member_id,'ASSIGNMENT_CHANGED','Assignment changed',job.id),
    (job.company_id,p_to_member_id,'REPLACEMENT_ASSIGNED','Replacement assignment',job.id);
end; $$;

grant select on public.job_assignment_changes to authenticated;
grant execute on function public.attach_my_au_document(uuid,text), public.list_absence_affected_assignments(date,date), public.reassign_absence_affected_job(uuid,uuid,uuid) to authenticated;
