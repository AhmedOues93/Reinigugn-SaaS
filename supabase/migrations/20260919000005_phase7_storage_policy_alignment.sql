drop policy if exists "staff upload operational photo objects" on storage.objects;
create policy "staff upload operational photo objects" on storage.objects for insert to authenticated with check (
  bucket_id = 'job-photos' and public.is_allowed_operational_photo_storage_path(name) and public.is_company_staff((split_part(name, '/', 1))::uuid)
);
drop policy if exists "employees upload scoped complaint photo objects" on storage.objects;
create policy "employees upload scoped complaint photo objects" on storage.objects for insert to authenticated with check (
  bucket_id = 'job-photos' and public.is_allowed_operational_photo_storage_path(name) and public.can_upload_scoped_complaint_photo_path(name)
);
