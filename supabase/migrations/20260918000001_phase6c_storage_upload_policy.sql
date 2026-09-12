-- Storage populates object metadata after its insert policy is evaluated.
drop policy if exists "employees upload assigned job photos" on storage.objects;
create policy "employees upload assigned job photos" on storage.objects
for insert to authenticated with check (
  bucket_id = 'job-photos'
  and public.is_allowed_job_photo_storage_path(name)
  and lower(coalesce(storage.extension(name), '')) in ('jpg', 'png', 'webp')
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
