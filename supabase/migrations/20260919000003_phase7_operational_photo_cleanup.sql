create or replace function public.cleanup_operational_photo_metadata_after_storage_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.bucket_id = 'job-photos' then delete from public.operational_photos where storage_path = old.name; end if;
  return old;
end;
$$;
drop trigger if exists operational_photo_storage_delete_cleanup on storage.objects;
create trigger operational_photo_storage_delete_cleanup after delete on storage.objects for each row execute procedure public.cleanup_operational_photo_metadata_after_storage_delete();
revoke all on function public.cleanup_operational_photo_metadata_after_storage_delete() from public, anon, authenticated;
