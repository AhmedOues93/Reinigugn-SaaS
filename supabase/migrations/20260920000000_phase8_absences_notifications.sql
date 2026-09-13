create type public.absence_type as enum ('VACATION', 'SICKNESS');
create type public.absence_status as enum ('PENDING', 'APPROVED', 'REJECTED');
create type public.notification_type as enum ('VACATION_SUBMITTED', 'VACATION_APPROVED', 'VACATION_REJECTED', 'SICKNESS_REPORTED', 'ASSIGNMENT_CHANGED', 'REPLACEMENT_ASSIGNED');

create table public.employee_absences (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete restrict, absence_type public.absence_type not null,
  status public.absence_status not null default 'PENDING', start_date date not null, end_date date not null,
  note text, au_storage_path text unique, reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (end_date >= start_date), check (char_length(coalesce(note, '')) <= 1000),
  check ((absence_type = 'VACATION' and au_storage_path is null) or absence_type = 'SICKNESS')
);
create index employee_absences_company_dates_idx on public.employee_absences(company_id, start_date, end_date);
create index employee_absences_member_dates_idx on public.employee_absences(member_id, start_date, end_date);

create table public.in_app_notifications (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  recipient_member_id uuid not null references public.company_members(id) on delete cascade, type public.notification_type not null,
  title text not null, body text, absence_id uuid references public.employee_absences(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete cascade, read_at timestamptz, created_at timestamptz not null default now()
);
create index in_app_notifications_recipient_idx on public.in_app_notifications(recipient_member_id, created_at desc);

create or replace function public.is_current_member(target_member_id uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.company_members cm join public.profiles p on p.id = cm.profile_id where cm.id = target_member_id and cm.status = 'ACTIVE' and p.auth_user_id = auth.uid());
$$;
create or replace function public.is_absence_unavailable(p_member_id uuid, p_date date) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.employee_absences where member_id = p_member_id and start_date <= p_date and end_date >= p_date and (absence_type = 'SICKNESS' or status = 'APPROVED'));
$$;

alter table public.employee_absences enable row level security;
alter table public.in_app_notifications enable row level security;
create policy "employees view own absences" on public.employee_absences for select to authenticated using (public.is_current_member(member_id));
create policy "staff manage company absences" on public.employee_absences for all to authenticated using (public.is_company_staff(company_id)) with check (public.is_company_staff(company_id));
create policy "employees submit own absences" on public.employee_absences for insert to authenticated with check (public.is_current_member(member_id) and absence_type in ('VACATION', 'SICKNESS') and (absence_type = 'SICKNESS' or status = 'PENDING'));
create policy "recipients view notifications" on public.in_app_notifications for select to authenticated using (public.is_current_member(recipient_member_id));
create policy "recipients update notifications" on public.in_app_notifications for update to authenticated using (public.is_current_member(recipient_member_id)) with check (public.is_current_member(recipient_member_id));

create or replace function public.create_my_absence(p_type public.absence_type, p_start date, p_end date, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; absence_id uuid;
begin
 select cm.* into actor from public.company_members cm join public.profiles p on p.id = cm.profile_id where p.auth_user_id = auth.uid() and cm.status = 'ACTIVE' and cm.role = 'EMPLOYEE' limit 1;
 if actor.id is null or p_end < p_start then raise exception 'Invalid absence request'; end if;
 insert into public.employee_absences(company_id, member_id, absence_type, status, start_date, end_date, note) values(actor.company_id, actor.id, p_type, case when p_type = 'SICKNESS' then 'APPROVED'::public.absence_status else 'PENDING'::public.absence_status end, p_start, p_end, nullif(trim(p_note), '')) returning id into absence_id;
 insert into public.in_app_notifications(company_id, recipient_member_id, type, title, absence_id)
 select actor.company_id, id, case when p_type = 'VACATION' then 'VACATION_SUBMITTED'::public.notification_type else 'SICKNESS_REPORTED'::public.notification_type end, case when p_type = 'VACATION' then 'Vacation request submitted' else 'Sickness reported' end, absence_id from public.company_members where company_id = actor.company_id and role in ('OWNER','OFFICE') and status = 'ACTIVE';
 return absence_id;
end; $$;

create or replace function public.review_absence(p_absence_id uuid, p_approved boolean) returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members; target public.employee_absences; profile_id uuid;
begin
 select cm.* into actor from public.company_members cm join public.profiles p on p.id = cm.profile_id where p.auth_user_id = auth.uid() and cm.status = 'ACTIVE' and cm.role in ('OWNER','OFFICE') limit 1;
 select * into target from public.employee_absences where id = p_absence_id and company_id = actor.company_id for update;
 if actor.id is null or target.id is null or target.absence_type <> 'VACATION' or target.status <> 'PENDING' then raise exception 'Absence cannot be reviewed'; end if;
 select profile_id into profile_id from public.company_members where id = actor.id;
 update public.employee_absences set status = case when p_approved then 'APPROVED' else 'REJECTED' end, reviewed_by = profile_id, reviewed_at = now(), updated_at = now() where id = target.id;
 insert into public.in_app_notifications(company_id, recipient_member_id, type, title, absence_id) values(target.company_id, target.member_id, case when p_approved then 'VACATION_APPROVED' else 'VACATION_REJECTED' end, case when p_approved then 'Vacation request approved' else 'Vacation request rejected' end, target.id);
end; $$;

create or replace function public.list_replacement_candidates(p_job_id uuid) returns table(member_id uuid, first_name text, last_name text)
language sql stable security definer set search_path = public as $$
 select cm.id, p.first_name, p.last_name from public.jobs j join public.company_members cm on cm.company_id = j.company_id and cm.role = 'EMPLOYEE' and cm.status = 'ACTIVE' join public.profiles p on p.id = cm.profile_id
 where j.id = p_job_id and public.is_company_staff(j.company_id) and not public.is_absence_unavailable(cm.id, j.scheduled_date)
 and not exists (select 1 from public.job_assignments a join public.jobs other on other.id = a.job_id where a.member_id = cm.id and other.status not in ('CANCELLED','COMPLETED','MISSED') and other.planned_start_at < j.planned_end_at and other.planned_end_at > j.planned_start_at);
$$;
revoke all on public.employee_absences, public.in_app_notifications from anon;
grant select, insert, update on public.employee_absences, public.in_app_notifications to authenticated;
grant execute on function public.create_my_absence(public.absence_type, date, date, text), public.review_absence(uuid, boolean), public.list_replacement_candidates(uuid) to authenticated;
