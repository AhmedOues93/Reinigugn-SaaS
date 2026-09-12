-- Storage objects must be removed through the Storage API. Its deletion transaction cleans metadata.
create or replace function public.cleanup_job_photo_metadata_after_storage_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.bucket_id = 'job-photos' then
    delete from public.job_photos where storage_path = old.name;
  end if;
  return old;
end;
$$;

drop trigger if exists job_photo_storage_delete_cleanup on storage.objects;
create trigger job_photo_storage_delete_cleanup
after delete on storage.objects
for each row execute procedure public.cleanup_job_photo_metadata_after_storage_delete();

drop policy if exists "employees delete own assigned job photo objects" on storage.objects;
create policy "employees delete own assigned job photo objects" on storage.objects
for delete to authenticated using (
  bucket_id = 'job-photos'
  and exists (
    select 1
    from public.job_photos photo
    join public.jobs job on job.id = photo.job_id
    join public.company_members member on member.id = photo.member_id
    join public.profiles profile on profile.id = member.profile_id
    where photo.storage_path = name
      and profile.auth_user_id = auth.uid()
      and member.role = 'EMPLOYEE'
      and member.status = 'ACTIVE'
      and job.status in ('PLANNED', 'CONFIRMED', 'IN_PROGRESS')
      and public.is_current_job_assignee(job.id)
  )
);

drop policy if exists "staff delete company job photo objects" on storage.objects;
create policy "staff delete company job photo objects" on storage.objects
for delete to authenticated using (
  bucket_id = 'job-photos'
  and exists (
    select 1 from public.job_photos photo where photo.storage_path = name and public.is_company_staff(photo.company_id)
  )
);

drop function if exists public.delete_job_photo(uuid);
create or replace function public.delete_job_photo(p_photo_id uuid)
returns text language plpgsql security definer set search_path = public as $$
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
  return photo.storage_path;
end;
$$;

revoke all on function public.cleanup_job_photo_metadata_after_storage_delete() from public, anon, authenticated;
revoke all on function public.delete_job_photo(uuid) from public, anon;
grant execute on function public.delete_job_photo(uuid) to authenticated;
