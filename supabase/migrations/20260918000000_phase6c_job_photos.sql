-- Phase 6C: private, tenant-scoped job photo documentation.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create or replace function public.is_allowed_job_photo_storage_path(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$';
$$;

drop policy if exists "employees upload assigned job photos" on storage.objects;
create policy "employees upload assigned job photos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'job-photos'
  and public.is_allowed_job_photo_storage_path(name)
  and lower(coalesce(storage.extension(name), '')) in ('jpg', 'png', 'webp')
  and coalesce((metadata ->> 'mimetype'), '') in ('image/jpeg', 'image/png', 'image/webp')
  and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 10485760
  and exists (
    select 1
    from public.jobs job
    join public.job_assignments assignment on assignment.job_id = job.id
    join public.company_members member on member.id = assignment.member_id
    join public.profiles profile on profile.id = member.profile_id
    where job.company_id::text = split_part(name, '/', 1)
      and job.id::text = split_part(name, '/', 2)
      and profile.auth_user_id = auth.uid()
      and member.role = 'EMPLOYEE'
      and member.status = 'ACTIVE'
  )
);

drop policy if exists "staff view company job photo objects" on storage.objects;
create policy "staff view company job photo objects" on storage.objects
for select to authenticated using (
  bucket_id = 'job-photos'
  and public.is_allowed_job_photo_storage_path(name)
  and exists (
    select 1 from public.jobs job
    where job.company_id::text = split_part(name, '/', 1)
      and job.id::text = split_part(name, '/', 2)
      and public.is_company_staff(job.company_id)
  )
);

drop policy if exists "employees view assigned job photo objects" on storage.objects;
create policy "employees view assigned job photo objects" on storage.objects
for select to authenticated using (
  bucket_id = 'job-photos'
  and public.is_allowed_job_photo_storage_path(name)
  and exists (
    select 1 from public.jobs job
    where job.company_id::text = split_part(name, '/', 1)
      and job.id::text = split_part(name, '/', 2)
      and public.is_current_job_assignee(job.id)
  )
);

create or replace function public.create_my_job_photo_metadata(
  p_job_id uuid,
  p_storage_path text,
  p_category public.job_photo_category,
  p_checklist_item_id uuid default null,
  p_description text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; target_job public.jobs; photo_id uuid; object_mime text; object_size bigint;
begin
  select member.* into actor from public.company_members member join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid() and member.role = 'EMPLOYEE' and member.status = 'ACTIVE' limit 1;
  if actor.id is null then raise exception 'Employee role required'; end if;
  select * into target_job from public.jobs where id = p_job_id for update;
  if target_job.id is null or not exists (select 1 from public.job_assignments where job_id = target_job.id and member_id = actor.id) then
    raise exception 'Job is not assigned to current employee';
  end if;
  if target_job.status in ('COMPLETED', 'CANCELLED', 'MISSED') then raise exception 'Photo upload is not allowed for this job'; end if;
  if not public.is_allowed_job_photo_storage_path(p_storage_path) or p_storage_path not like target_job.company_id::text || '/' || target_job.id::text || '/%' then
    raise exception 'Invalid job photo path';
  end if;
  select metadata ->> 'mimetype', (metadata ->> 'size')::bigint into object_mime, object_size
  from storage.objects where bucket_id = 'job-photos' and name = p_storage_path;
  if object_mime not in ('image/jpeg', 'image/png', 'image/webp') or object_size not between 1 and 10485760 then
    raise exception 'Invalid photo object';
  end if;
  if char_length(coalesce(trim(p_description), '')) > 500 then raise exception 'Photo note is too long'; end if;
  if p_checklist_item_id is not null and not exists (
    select 1 from public.job_checklist_items item join public.job_checklists checklist on checklist.id = item.job_checklist_id
    where item.id = p_checklist_item_id and checklist.job_id = target_job.id
  ) then raise exception 'Checklist item does not belong to job'; end if;
  insert into public.job_photos (company_id, job_id, member_id, storage_path, category, checklist_item_id, description)
  values (target_job.company_id, target_job.id, actor.id, p_storage_path, p_category, p_checklist_item_id, nullif(trim(p_description), ''))
  returning id into photo_id;
  return photo_id;
end;
$$;

create or replace function public.delete_job_photo(p_photo_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; photo public.job_photos; target_job public.jobs;
begin
  select member.* into actor from public.company_members member join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid() and member.status = 'ACTIVE' limit 1;
  if actor.id is null then raise exception 'Active membership required'; end if;
  select * into photo from public.job_photos where id = p_photo_id for update;
  if photo.id is null then raise exception 'Photo not found'; end if;
  select * into target_job from public.jobs where id = photo.job_id;
  if public.is_company_staff(photo.company_id) then
    null;
  elsif actor.role = 'EMPLOYEE' and photo.member_id = actor.id and target_job.status in ('PLANNED', 'CONFIRMED', 'IN_PROGRESS') and exists (select 1 from public.job_assignments where job_id = target_job.id and member_id = actor.id) then
    null;
  else
    raise exception 'Photo cannot be deleted by current user';
  end if;
  delete from storage.objects where bucket_id = 'job-photos' and name = photo.storage_path;
  delete from public.job_photos where id = photo.id;
  return photo.id;
end;
$$;

revoke insert, update, delete on public.job_photos from authenticated;
grant select on public.job_photos to authenticated;
revoke all on function public.is_allowed_job_photo_storage_path(text), public.create_my_job_photo_metadata(uuid, text, public.job_photo_category, uuid, text), public.delete_job_photo(uuid) from public, anon;
grant execute on function public.create_my_job_photo_metadata(uuid, text, public.job_photo_category, uuid, text), public.delete_job_photo(uuid) to authenticated;
