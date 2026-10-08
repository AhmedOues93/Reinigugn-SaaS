-- Fotos, die ohne Empfang entstanden sind.
--
-- Zwei Dinge fehlten dafuer.
--
-- 1) Eine Kennung des Geraets. Reisst die Verbindung mitten in der Antwort ab,
--    weiss die Warteschlange nicht, ob das Foto angekommen ist. Ohne Kennung
--    bleibt nur die Wahl zwischen einem verlorenen und einem doppelten Foto.
--
-- 2) Ein Foto fuer einen bereits abgeschlossenen Einsatz wurde abgelehnt. Das
--    ist richtig, solange jemand live arbeitet -- nach dem Feierabend gibt es
--    nichts mehr zu dokumentieren. Bei nachgetragenen Buchungen trifft es aber
--    den Normalfall: die Aufnahmen entstehen vor dem Feierabend, kommen aber
--    danach beim Server an. Das Foto waere dauerhaft verloren, und zwar
--    ausgerechnet der Nachweis, auf den sich die Kundin beruft.
--
--    Die Grenze liegt jetzt dort, wo sie inhaltlich hingehoert: an der Abnahme.
--    Was die Kundin unterschrieben hat, aendert sich nicht mehr -- vorher schon.

alter table public.job_photos
  add column if not exists client_upload_id text;

alter table public.job_photos
  drop constraint if exists job_photos_client_upload_id_length;
alter table public.job_photos
  add constraint job_photos_client_upload_id_length
  check (client_upload_id is null or char_length(client_upload_id) between 8 and 64);

-- Die eigentliche Absicherung gegen das doppelte Foto: zweimal dieselbe
-- Kennung am selben Einsatz kann es nicht geben, auch nicht bei zwei
-- gleichzeitigen Zustellungen.
create unique index if not exists job_photos_client_upload_idx
  on public.job_photos (job_id, client_upload_id)
  where client_upload_id is not null;

comment on column public.job_photos.client_upload_id is
  'Vom Geraet erzeugte Kennung einer nachgetragenen Aufnahme. Macht eine erneute Zustellung harmlos.';

/**
 * Gibt es diese Aufnahme schon?
 *
 * Wird vor dem Hochladen gefragt. Ohne diese Frage wuerde ein zweiter Versuch
 * erst eine Datei in den Speicher legen und dann am eindeutigen Index
 * scheitern -- die Datei bliebe als Waise liegen.
 */
create or replace function public.my_job_photo_for_client_upload(
  p_job_id uuid,
  p_client_upload_id text
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select photo.id
  from public.job_photos photo
  where photo.job_id = p_job_id
    and photo.client_upload_id = p_client_upload_id
    and public.is_current_job_assignee(photo.job_id)
  limit 1;
$$;

revoke all on function public.my_job_photo_for_client_upload(uuid, text) from public, anon;
grant execute on function public.my_job_photo_for_client_upload(uuid, text) to authenticated;

-- Ein Parameter mit Vorgabewert laesst sich nicht per create or replace
-- ergaenzen, ohne eine zweite Ueberladung zu erzeugen -- und die waere beim
-- Aufruf mit fuenf benannten Argumenten mehrdeutig.
drop function if exists public.create_my_job_photo_metadata(uuid, text, public.job_photo_category, uuid, text);

create or replace function public.create_my_job_photo_metadata(
  p_job_id uuid,
  p_storage_path text,
  p_category public.job_photo_category,
  p_checklist_item_id uuid default null,
  p_description text default null,
  p_client_upload_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  target_job public.jobs;
  photo_id uuid;
  object_mime text;
  object_size bigint;
begin
  select member.* into actor
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid() and member.role = 'EMPLOYEE' and member.status = 'ACTIVE'
  limit 1;
  if actor.id is null then raise exception 'Employee role required'; end if;

  select * into target_job from public.jobs where id = p_job_id for update;
  if target_job.id is null or not exists (
    select 1 from public.job_assignments where job_id = target_job.id and member_id = actor.id
  ) then
    raise exception 'Job is not assigned to current employee';
  end if;

  -- Schon da? Dann ist das eine zweite Zustellung, kein zweites Foto.
  if p_client_upload_id is not null then
    select id into photo_id from public.job_photos
    where job_id = target_job.id and client_upload_id = p_client_upload_id;
    if photo_id is not null then return photo_id; end if;
  end if;

  if target_job.status in ('CANCELLED', 'MISSED') then
    raise exception 'Photo upload is not allowed for this job';
  end if;

  -- Nach der Abnahme ist Schluss: die Aufnahmen sind Teil dessen, was die
  -- Kundin unterschrieben hat.
  if exists (
    select 1 from public.service_records record
    where record.job_id = target_job.id and record.accepted_at is not null
  ) then
    raise exception 'Der Leistungsnachweis ist bereits abgenommen; Fotos lassen sich nicht mehr ergaenzen.';
  end if;

  if not public.is_allowed_job_photo_storage_path(p_storage_path)
     or p_storage_path not like target_job.company_id::text || '/' || target_job.id::text || '/%' then
    raise exception 'Invalid job photo path';
  end if;

  select metadata ->> 'mimetype', (metadata ->> 'size')::bigint into object_mime, object_size
  from storage.objects where bucket_id = 'job-photos' and name = p_storage_path;
  if object_mime not in ('image/jpeg', 'image/png', 'image/webp') or object_size not between 1 and 10485760 then
    raise exception 'Invalid photo object';
  end if;

  if char_length(coalesce(trim(p_description), '')) > 500 then raise exception 'Photo note is too long'; end if;

  if p_checklist_item_id is not null and not exists (
    select 1 from public.job_checklist_items item
    join public.job_checklists checklist on checklist.id = item.job_checklist_id
    where item.id = p_checklist_item_id and checklist.job_id = target_job.id
  ) then
    raise exception 'Checklist item does not belong to job';
  end if;

  insert into public.job_photos (
    company_id, job_id, member_id, storage_path, category, checklist_item_id, description, client_upload_id)
  values (
    target_job.company_id, target_job.id, actor.id, p_storage_path, p_category,
    p_checklist_item_id, nullif(trim(p_description), ''), p_client_upload_id)
  returning id into photo_id;

  return photo_id;
end;
$$;

revoke all on function public.create_my_job_photo_metadata(uuid, text, public.job_photo_category, uuid, text, text) from public, anon;
grant execute on function public.create_my_job_photo_metadata(uuid, text, public.job_photo_category, uuid, text, text) to authenticated;

/*
 * Kommt eine Aufnahme nach dem Feierabend an, steht sie noch nicht im
 * Leistungsnachweis -- der wurde beim Stopp aus den damals vorhandenen Fotos
 * gebaut. Solange die Kundin nicht abgenommen hat, wird er nachgezogen.
 *
 * Ein Trigger und keine Ergaenzung in build_service_record(): dort entsteht der
 * Nachweis, hier kommt etwas nach. Beides zu vermischen hiesse, die Funktion
 * ein weiteres Mal zu kopieren.
 */
create or replace function public.refresh_service_record_photos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.service_records record
  set photo_snapshot = coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', photo.id,
      'storage_path', photo.storage_path,
      'category', photo.category,
      'description', photo.description
    ) order by photo.created_at)
    from public.job_photos photo
    where photo.job_id = new.job_id
  ), '[]'::jsonb)
  where record.job_id = new.job_id
    and record.accepted_at is null;
  return new;
end;
$$;

drop trigger if exists job_photos_refresh_record on public.job_photos;
create trigger job_photos_refresh_record
  after insert on public.job_photos
  for each row execute procedure public.refresh_service_record_photos();
