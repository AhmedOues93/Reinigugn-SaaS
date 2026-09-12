create or replace function public.can_upload_scoped_complaint_photo_path(p_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare actor public.company_members;
begin
  select * into actor from public.phase7_current_member();
  if actor.id is null or actor.role <> 'EMPLOYEE' or not public.is_allowed_operational_photo_storage_path(p_name) or split_part(p_name, '/', 2) <> 'complaint' then return false; end if;
  return exists (
    select 1 from public.complaints complaint
    where complaint.id::text = split_part(p_name, '/', 3)
      and complaint.company_id::text = split_part(p_name, '/', 1)
      and (complaint.assigned_member_id = actor.id or (complaint.job_id is not null and exists (select 1 from public.job_assignments where job_id = complaint.job_id and member_id = actor.id)))
  );
end;
$$;
drop policy if exists "employees upload scoped complaint photo objects" on storage.objects;
create policy "employees upload scoped complaint photo objects" on storage.objects for insert to authenticated with check (
  bucket_id = 'job-photos' and public.is_allowed_operational_photo_storage_path(name)
  and lower(coalesce(storage.extension(name), '')) in ('jpg', 'png', 'webp')
  and coalesce((metadata ->> 'mimetype'), '') in ('image/jpeg', 'image/png', 'image/webp')
  and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 10485760
  and public.can_upload_scoped_complaint_photo_path(name)
);
revoke all on function public.can_upload_scoped_complaint_photo_path(text) from public, anon;
grant execute on function public.can_upload_scoped_complaint_photo_path(text) to authenticated;
