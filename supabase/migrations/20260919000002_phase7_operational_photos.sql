-- Private complaint and quality-inspection evidence in the existing job-photos bucket.
create type public.operational_photo_scope as enum ('COMPLAINT', 'QUALITY_INSPECTION');

create table public.operational_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  scope public.operational_photo_scope not null,
  complaint_id uuid references public.complaints(id) on delete cascade,
  quality_inspection_id uuid references public.quality_inspections(id) on delete cascade,
  member_id uuid not null references public.company_members(id) on delete restrict,
  storage_path text not null unique,
  category public.job_photo_category not null default 'DOCUMENTATION',
  description text check (description is null or char_length(description) <= 500),
  created_at timestamptz not null default now(),
  check ((scope = 'COMPLAINT' and complaint_id is not null and quality_inspection_id is null) or (scope = 'QUALITY_INSPECTION' and quality_inspection_id is not null and complaint_id is null))
);
create index operational_photos_scope_idx on public.operational_photos(scope, complaint_id, quality_inspection_id, created_at desc);

create or replace function public.cleanup_operational_photo_metadata_after_storage_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.bucket_id = 'job-photos' then delete from public.operational_photos where storage_path = old.name; end if;
  return old;
end;
$$;
create trigger operational_photo_storage_delete_cleanup after delete on storage.objects for each row execute procedure public.cleanup_operational_photo_metadata_after_storage_delete();

create or replace function public.is_allowed_operational_photo_storage_path(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(complaint|quality)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$';
$$;

create or replace function public.can_access_operational_photo_path(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.operational_photos photo
    where photo.storage_path = p_name and (
      public.is_company_staff(photo.company_id)
      or (photo.scope = 'COMPLAINT' and exists (
        select 1 from public.complaints complaint
        where complaint.id = photo.complaint_id and (
          complaint.assigned_member_id = (select id from public.phase7_current_member())
          or (complaint.job_id is not null and public.is_current_job_assignee(complaint.job_id))
        )
      ))
    )
  );
$$;

alter table public.operational_photos enable row level security;
create policy "staff read company operational photos" on public.operational_photos for select to authenticated using (public.is_company_staff(company_id));
create policy "employees read scoped complaint photos" on public.operational_photos for select to authenticated using (
  scope = 'COMPLAINT' and exists (
    select 1 from public.complaints complaint where complaint.id = complaint_id and (
      complaint.assigned_member_id = (select id from public.phase7_current_member())
      or (complaint.job_id is not null and public.is_current_job_assignee(complaint.job_id))
    )
  )
);

create policy "staff upload operational photo objects" on storage.objects for insert to authenticated with check (
  bucket_id = 'job-photos' and public.is_allowed_operational_photo_storage_path(name)
  and lower(coalesce(storage.extension(name), '')) in ('jpg', 'png', 'webp')
  and coalesce((metadata ->> 'mimetype'), '') in ('image/jpeg', 'image/png', 'image/webp')
  and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 10485760
  and public.is_company_staff((split_part(name, '/', 1))::uuid)
);
create policy "employees upload scoped complaint photo objects" on storage.objects for insert to authenticated with check (
  bucket_id = 'job-photos' and public.is_allowed_operational_photo_storage_path(name)
  and split_part(name, '/', 2) = 'complaint'
  and lower(coalesce(storage.extension(name), '')) in ('jpg', 'png', 'webp')
  and coalesce((metadata ->> 'mimetype'), '') in ('image/jpeg', 'image/png', 'image/webp')
  and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 10485760
  and exists (select 1 from public.complaints complaint where complaint.id::text = split_part(name, '/', 3) and complaint.company_id::text = split_part(name, '/', 1) and (complaint.assigned_member_id = (select id from public.phase7_current_member()) or (complaint.job_id is not null and public.is_current_job_assignee(complaint.job_id))))
);
create policy "operational photo object read" on storage.objects for select to authenticated using (bucket_id = 'job-photos' and public.is_allowed_operational_photo_storage_path(name) and public.can_access_operational_photo_path(name));
create policy "staff delete operational photo objects" on storage.objects for delete to authenticated using (bucket_id = 'job-photos' and public.is_allowed_operational_photo_storage_path(name) and public.can_access_operational_photo_path(name));

create or replace function public.create_operational_photo_metadata(
  p_scope public.operational_photo_scope,
  p_record_id uuid,
  p_storage_path text,
  p_category public.job_photo_category,
  p_description text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; target_company uuid; target_complaint public.complaints; photo_id uuid; object_mime text; object_size bigint;
begin
  select * into actor from public.phase7_current_member();
  if actor.id is null then raise exception 'Active membership required'; end if;
  if p_scope = 'COMPLAINT' then
    select * into target_complaint from public.complaints where id = p_record_id for update;
    if target_complaint.id is null then raise exception 'Complaint not found'; end if;
    target_company := target_complaint.company_id;
    if not (public.is_company_staff(target_company) or (actor.role = 'EMPLOYEE' and (target_complaint.assigned_member_id = actor.id or (target_complaint.job_id is not null and exists (select 1 from public.job_assignments where job_id = target_complaint.job_id and member_id = actor.id))))) then raise exception 'Complaint is not in current user scope'; end if;
  else
    select company_id into target_company from public.quality_inspections where id = p_record_id for update;
    if target_company is null or not public.is_company_staff(target_company) then raise exception 'Quality inspection is not in current staff scope'; end if;
  end if;
  if not public.is_allowed_operational_photo_storage_path(p_storage_path) or p_storage_path not like target_company::text || '/' || lower(replace(p_scope::text, '_INSPECTION', '')) || '/' || p_record_id::text || '/%' then raise exception 'Invalid operational photo path'; end if;
  select metadata ->> 'mimetype', (metadata ->> 'size')::bigint into object_mime, object_size from storage.objects where bucket_id = 'job-photos' and name = p_storage_path;
  if object_mime not in ('image/jpeg', 'image/png', 'image/webp') or object_size not between 1 and 10485760 then raise exception 'Invalid photo object'; end if;
  if char_length(coalesce(trim(p_description), '')) > 500 then raise exception 'Photo note is too long'; end if;
  insert into public.operational_photos(company_id, scope, complaint_id, quality_inspection_id, member_id, storage_path, category, description)
  values (target_company, p_scope, case when p_scope = 'COMPLAINT' then p_record_id end, case when p_scope = 'QUALITY_INSPECTION' then p_record_id end, actor.id, p_storage_path, p_category, nullif(trim(p_description), '')) returning id into photo_id;
  return photo_id;
end;
$$;

create or replace function public.delete_operational_photo(p_photo_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare actor public.company_members; photo public.operational_photos; complaint public.complaints;
begin
  select * into actor from public.phase7_current_member();
  select * into photo from public.operational_photos where id = p_photo_id for update;
  if actor.id is null or photo.id is null then raise exception 'Photo not found'; end if;
  if public.is_company_staff(photo.company_id) then null;
  elsif photo.scope = 'COMPLAINT' and actor.role = 'EMPLOYEE' and photo.member_id = actor.id then
    select * into complaint from public.complaints where id = photo.complaint_id;
    if complaint.status = 'CLOSED' or not (complaint.assigned_member_id = actor.id or (complaint.job_id is not null and exists (select 1 from public.job_assignments where job_id = complaint.job_id and member_id = actor.id))) then raise exception 'Photo cannot be deleted by current user'; end if;
  else raise exception 'Photo cannot be deleted by current user'; end if;
  return photo.storage_path;
end;
$$;

revoke all on public.operational_photos from authenticated;
grant select on public.operational_photos to authenticated;
revoke all on function public.is_allowed_operational_photo_storage_path(text), public.can_access_operational_photo_path(text) from public, anon;
grant execute on function public.is_allowed_operational_photo_storage_path(text), public.can_access_operational_photo_path(text) to authenticated;
revoke all on function public.cleanup_operational_photo_metadata_after_storage_delete() from public, anon, authenticated;
revoke all on function public.create_operational_photo_metadata(public.operational_photo_scope, uuid, text, public.job_photo_category, text), public.delete_operational_photo(uuid) from public, anon;
grant execute on function public.create_operational_photo_metadata(public.operational_photo_scope, uuid, text, public.job_photo_category, text), public.delete_operational_photo(uuid) to authenticated;
