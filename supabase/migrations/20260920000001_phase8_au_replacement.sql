insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('absence-documents', 'absence-documents', false, 10485760, array['application/pdf','image/jpeg','image/png']) on conflict (id) do nothing;

create or replace function public.is_allowed_absence_document_path(p_name text) returns boolean language sql immutable as $$
  select p_name ~ '^[0-9a-f-]{36}/absence/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$';
$$;
create or replace function public.can_access_absence_document_path(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.employee_absences a where a.au_storage_path = p_name and (public.is_current_member(a.member_id) or public.is_company_staff(a.company_id)));
$$;
create or replace function public.can_upload_own_absence_document_path(p_name text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.employee_absences a where a.id = split_part(p_name, '/', 3)::uuid and a.company_id = split_part(p_name, '/', 1)::uuid and a.absence_type = 'SICKNESS' and public.is_current_member(a.member_id));
$$;
create policy "absence documents select" on storage.objects for select to authenticated using (bucket_id = 'absence-documents' and public.can_access_absence_document_path(name));
create policy "employees upload own absence document" on storage.objects for insert to authenticated with check (bucket_id = 'absence-documents' and public.is_allowed_absence_document_path(name) and public.can_upload_own_absence_document_path(name));

create or replace function public.reassign_absence_affected_job(p_job_id uuid, p_from_member_id uuid, p_to_member_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members; job public.jobs;
begin
 select cm.* into actor from public.company_members cm join public.profiles p on p.id=cm.profile_id where p.auth_user_id=auth.uid() and cm.role in ('OWNER','OFFICE') and cm.status='ACTIVE' limit 1;
 select * into job from public.jobs where id=p_job_id and company_id=actor.company_id for update;
 if actor.id is null or job.id is null or not exists (select 1 from public.job_assignments where job_id=job.id and member_id=p_from_member_id) or not exists (select 1 from public.list_replacement_candidates(job.id) where member_id=p_to_member_id) then raise exception 'Replacement is not eligible'; end if;
 delete from public.job_assignments where job_id=job.id and member_id=p_from_member_id;
 insert into public.job_assignments(company_id,job_id,member_id,assigned_by) values(job.company_id,job.id,p_to_member_id,(select profile_id from public.company_members where id=actor.id));
 insert into public.in_app_notifications(company_id,recipient_member_id,type,title,job_id) values(job.company_id,p_from_member_id,'ASSIGNMENT_CHANGED','Assignment changed',job.id),(job.company_id,p_to_member_id,'REPLACEMENT_ASSIGNED','Replacement assignment',job.id);
end; $$;
grant execute on function public.reassign_absence_affected_job(uuid,uuid,uuid), public.can_access_absence_document_path(text), public.can_upload_own_absence_document_path(text), public.is_allowed_absence_document_path(text) to authenticated;
