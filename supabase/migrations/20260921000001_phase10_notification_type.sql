-- New enum values must be committed before they can be used, so the portal
-- notification type is added in its own migration ahead of phase 10.
alter type public.notification_type add value if not exists 'COMPLAINT_CREATED';

-- Consolidated duplicate version: 20260921000001_fix_branding_upload_policy.sql
-- Fix company branding uploads.
-- Storage already enforces the 2 MB bucket limit and allowed MIME types.
-- Checking metadata.size in the INSERT RLS policy can reject valid uploads
-- because that metadata is not guaranteed to be populated at policy time.
drop policy if exists "owners upload company branding" on storage.objects;
create policy "owners upload company branding" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'company-branding'
  and public.can_write_branding_path(name)
);
