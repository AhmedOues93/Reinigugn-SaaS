-- Phase 13: the Employee PWA as a field application — profile and avatar,
-- two-way messaging with the office, and the server side of offline sync.
--
-- Reuse over new concepts:
--   * `profiles.avatar_url` already existed and was never populated; it is
--     renamed to `avatar_storage_path` rather than adding a second avatar
--     column, because a private bucket stores a path, not a URL.
--   * `in_app_notifications` stays the single notification system. Messaging
--     adds threads and messages — which notifications cannot express — and then
--     raises an ordinary notification so the existing badge keeps working.
--   * Russian joins the existing locale set rather than a parallel mechanism.

-- ---------------------------------------------------------------------------
-- Russian
-- ---------------------------------------------------------------------------
create or replace function public.is_supported_locale(p_locale text)
returns boolean language sql immutable as $$
  select p_locale in ('de', 'en', 'ar', 'tr', 'uk', 'ru');
$$;

alter table public.companies drop constraint if exists companies_language_check;
alter table public.companies add constraint companies_language_check check (default_language in ('de', 'en', 'ar', 'tr', 'uk', 'ru'));
alter table public.employee_details drop constraint if exists employee_details_language_check;
alter table public.employee_details add constraint employee_details_language_check check (preferred_language in ('de', 'en', 'ar', 'tr', 'uk', 'ru'));
alter table public.company_invitations drop constraint if exists company_invitations_language_check;
alter table public.company_invitations add constraint company_invitations_language_check check (preferred_language in ('de', 'en', 'ar', 'tr', 'uk', 'ru'));

-- ---------------------------------------------------------------------------
-- Avatars
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='avatar_url')
     and not exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='avatar_storage_path')
  then
    alter table public.profiles rename column avatar_url to avatar_storage_path;
  end if;
end $$;
alter table public.profiles add column if not exists avatar_storage_path text;

-- The path is written only by the owner's own security-definer call, so the
-- browser cannot point a profile at someone else's object.
revoke update (avatar_storage_path) on public.profiles from authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 2097152,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

-- <profile_id>/<uuid>.<ext> — the first segment is the owner, which both
-- policies below check against the caller's own profile.
create or replace function public.is_allowed_avatar_path(p_name text)
returns boolean language sql immutable as $$
  select p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp)$';
$$;

create or replace function public.owns_avatar_path(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_allowed_avatar_path(p_name)
    and exists (select 1 from public.profiles p where p.id = split_part(p_name, '/', 1)::uuid and p.auth_user_id = auth.uid());
$$;

/* Colleagues in the same company may see each other's avatar; nobody outside
 * that company can, and a customer-portal member sees only their own. */
create or replace function public.can_read_avatar_path(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_allowed_avatar_path(p_name)
    and exists (
      select 1
      from public.company_members viewer
      join public.profiles viewer_profile on viewer_profile.id = viewer.profile_id
      join public.company_members owner on owner.company_id = viewer.company_id
      where viewer_profile.auth_user_id = auth.uid()
        and viewer.status = 'ACTIVE'
        and viewer.role in ('OWNER', 'OFFICE', 'EMPLOYEE')
        and owner.profile_id = split_part(p_name, '/', 1)::uuid
        and owner.role in ('OWNER', 'OFFICE', 'EMPLOYEE')
    );
$$;

drop policy if exists "members read company avatars" on storage.objects;
create policy "members read company avatars" on storage.objects
for select to authenticated using (bucket_id = 'avatars' and (public.owns_avatar_path(name) or public.can_read_avatar_path(name)));

drop policy if exists "owners upload their avatar" on storage.objects;
create policy "owners upload their avatar" on storage.objects
for insert to authenticated with check (
  bucket_id = 'avatars' and public.owns_avatar_path(name)
  and coalesce((metadata ->> 'size')::bigint, 0) between 1 and 2097152
);

drop policy if exists "owners delete their avatar" on storage.objects;
create policy "owners delete their avatar" on storage.objects
for delete to authenticated using (bucket_id = 'avatars' and public.owns_avatar_path(name));

create or replace function public.set_my_avatar(p_storage_path text)
returns void language plpgsql security definer set search_path = public as $$
declare my_profile uuid; previous text;
begin
  select id into my_profile from public.profiles where auth_user_id = auth.uid();
  if my_profile is null then raise exception 'Profile required'; end if;
  if p_storage_path is not null then
    if not public.is_allowed_avatar_path(p_storage_path) then raise exception 'Invalid avatar path'; end if;
    -- The owning segment comes from the caller's own profile, never the client.
    if split_part(p_storage_path, '/', 1)::uuid <> my_profile then raise exception 'Avatar path belongs to another profile'; end if;
  end if;
  select avatar_storage_path into previous from public.profiles where id = my_profile for update;
  update public.profiles set avatar_storage_path = p_storage_path where id = my_profile;
  if previous is not null and previous is distinct from p_storage_path then
    delete from storage.objects where bucket_id = 'avatars' and name = previous;
  end if;
end;
$$;

/* Contact details an employee maintains about themselves. Email is deliberately
 * absent: it is the Supabase Auth identity, and changing it belongs to the Auth
 * email-change flow, not to a profile row that would then disagree with it. */
create or replace function public.update_my_contact_details(p_first_name text, p_last_name text, p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if char_length(trim(coalesce(p_first_name, ''))) not between 1 and 120 then raise exception 'Invalid first name'; end if;
  if char_length(trim(coalesce(p_last_name, ''))) not between 1 and 120 then raise exception 'Invalid last name'; end if;
  if p_phone is not null and char_length(trim(p_phone)) > 64 then raise exception 'Invalid phone number'; end if;
  update public.profiles
  set first_name = trim(p_first_name), last_name = trim(p_last_name), phone = nullif(trim(p_phone), '')
  where auth_user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Messaging: office <-> one employee
-- ---------------------------------------------------------------------------
create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Every thread has exactly one employee side; the other side is the company's
  -- office collectively, which is what makes staff hand-over work.
  employee_member_id uuid not null references public.company_members(id) on delete cascade,
  subject text not null check (char_length(trim(subject)) between 1 and 160),
  created_by uuid not null references public.company_members(id) on delete restrict,
  last_message_at timestamptz not null default clock_timestamp(),
  -- Read marks per side; unread is derived from these, so no counter can drift.
  -- clock_timestamp(), not now(): now() is the transaction start time, so a
  -- message and a read mark written in one transaction would carry the same
  -- instant and the "newer than my read mark" comparison would never fire.
  employee_read_at timestamptz,
  staff_read_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);

create index message_threads_company_idx on public.message_threads(company_id, last_message_at desc);
create index message_threads_employee_idx on public.message_threads(employee_member_id, last_message_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  sender_member_id uuid not null references public.company_members(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp()
);

create index messages_thread_idx on public.messages(thread_id, created_at);

create or replace function public.ensure_message_thread_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare employee public.company_members;
begin
  select * into employee from public.company_members where id = new.employee_member_id;
  if employee.id is null or employee.role <> 'EMPLOYEE' then raise exception 'A thread needs an employee participant'; end if;
  if employee.company_id <> new.company_id then raise exception 'Employee belongs to another company'; end if;
  return new;
end;
$$;

create trigger message_threads_integrity
  before insert or update on public.message_threads
  for each row execute procedure public.ensure_message_thread_integrity();

alter table public.message_threads enable row level security;
alter table public.messages enable row level security;

/* An employee sees only threads where they are the employee participant, so one
 * employee cannot enumerate another's conversations. Staff see their company's
 * threads. No policy mentions CUSTOMER, so a portal member reads nothing. */
create policy "participants read threads" on public.message_threads
for select to authenticated
using (public.is_current_member(employee_member_id) or public.is_company_staff(company_id));

create policy "participants read messages" on public.messages
for select to authenticated
using (exists (
  select 1 from public.message_threads t
  where t.id = messages.thread_id
    and (public.is_current_member(t.employee_member_id) or public.is_company_staff(t.company_id))
));

revoke all on public.message_threads, public.messages from anon, authenticated;
grant select on public.message_threads, public.messages to authenticated;

-- The caller's membership, whichever side they are on.
create or replace function public.messaging_actor()
returns public.company_members language sql stable security definer set search_path = public as $$
  select m.* from public.company_members m
  join public.profiles p on p.id = m.profile_id
  where p.auth_user_id = auth.uid() and m.status = 'ACTIVE' and m.role in ('OWNER', 'OFFICE', 'EMPLOYEE')
  limit 1;
$$;

create or replace function public.start_message_thread(p_employee_member_id uuid, p_subject text, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; target uuid; new_thread uuid;
begin
  select * into actor from public.messaging_actor();
  if actor.id is null then raise exception 'Active membership required'; end if;
  if char_length(trim(coalesce(p_subject, ''))) not between 1 and 160 then raise exception 'Invalid subject'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 4000 then raise exception 'Invalid message'; end if;

  if actor.role = 'EMPLOYEE' then
    -- An employee may only open a thread about themselves.
    target := actor.id;
  else
    if not exists (
      select 1 from public.company_members m
      where m.id = p_employee_member_id and m.company_id = actor.company_id and m.role = 'EMPLOYEE' and m.status = 'ACTIVE'
    ) then raise exception 'Employee not found in this company'; end if;
    target := p_employee_member_id;
  end if;

  insert into public.message_threads (company_id, employee_member_id, subject, created_by)
  values (actor.company_id, target, trim(p_subject), actor.id)
  returning id into new_thread;

  perform public.send_message(new_thread, p_body);
  return new_thread;
end;
$$;

create or replace function public.send_message(p_thread_id uuid, p_body text)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; thread public.message_threads; new_id uuid; sender_is_employee boolean;
begin
  select * into actor from public.messaging_actor();
  if actor.id is null then raise exception 'Active membership required'; end if;
  if char_length(trim(coalesce(p_body, ''))) not between 1 and 4000 then raise exception 'Invalid message'; end if;

  select * into thread from public.message_threads where id = p_thread_id for update;
  if thread.id is null or thread.company_id <> actor.company_id then raise exception 'Thread not found'; end if;

  sender_is_employee := actor.role = 'EMPLOYEE';
  -- An employee may only write in their own thread; staff in any company thread.
  if sender_is_employee and thread.employee_member_id <> actor.id then raise exception 'Not a participant of this thread'; end if;

  insert into public.messages (company_id, thread_id, sender_member_id, body)
  values (actor.company_id, thread.id, actor.id, trim(p_body))
  returning id into new_id;

  update public.message_threads set
    last_message_at = clock_timestamp(),
    -- The sender's own side is read by definition.
    employee_read_at = case when sender_is_employee then clock_timestamp() else employee_read_at end,
    staff_read_at = case when sender_is_employee then staff_read_at else clock_timestamp() end
  where id = thread.id;

  -- Reuse the one notification system rather than inventing a second.
  if sender_is_employee then
    insert into public.in_app_notifications (company_id, recipient_member_id, type, title, body)
    select thread.company_id, m.id, 'MESSAGE_RECEIVED', thread.subject, left(trim(p_body), 200)
    from public.company_members m
    where m.company_id = thread.company_id and m.role in ('OWNER', 'OFFICE') and m.status = 'ACTIVE';
  else
    insert into public.in_app_notifications (company_id, recipient_member_id, type, title, body)
    values (thread.company_id, thread.employee_member_id, 'MESSAGE_RECEIVED', thread.subject, left(trim(p_body), 200));
  end if;

  return new_id;
end;
$$;

create or replace function public.mark_thread_read(p_thread_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members; thread public.message_threads;
begin
  select * into actor from public.messaging_actor();
  if actor.id is null then raise exception 'Active membership required'; end if;
  select * into thread from public.message_threads where id = p_thread_id for update;
  if thread.id is null or thread.company_id <> actor.company_id then raise exception 'Thread not found'; end if;
  if actor.role = 'EMPLOYEE' then
    if thread.employee_member_id <> actor.id then raise exception 'Not a participant of this thread'; end if;
    update public.message_threads set employee_read_at = clock_timestamp() where id = thread.id;
  else
    update public.message_threads set staff_read_at = clock_timestamp() where id = thread.id;
  end if;
end;
$$;

/* Threads for the caller, with the unread count derived from the read marks
 * rather than stored, plus the participant name the other side should see. */
create or replace function public.list_my_threads()
returns table (
  id uuid, subject text, last_message_at timestamptz, unread_count bigint,
  employee_member_id uuid, employee_name text, last_message_preview text
)
language sql stable security definer set search_path = public as $$
  with actor as (select * from public.messaging_actor())
  select
    t.id, t.subject, t.last_message_at,
    (select count(*) from public.messages m
      where m.thread_id = t.id
        and m.sender_member_id <> a.id
        and m.created_at > coalesce(case when a.role = 'EMPLOYEE' then t.employee_read_at else t.staff_read_at end, 'epoch'::timestamptz)
    ),
    t.employee_member_id,
    coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), em.invited_email, ''),
    (select left(m.body, 120) from public.messages m where m.thread_id = t.id order by m.created_at desc limit 1)
  from actor a
  join public.message_threads t
    on t.company_id = a.company_id
   and (a.role <> 'EMPLOYEE' or t.employee_member_id = a.id)
  join public.company_members em on em.id = t.employee_member_id
  left join public.profiles p on p.id = em.profile_id
  order by t.last_message_at desc;
$$;

create or replace function public.list_thread_messages(p_thread_id uuid)
returns table (id uuid, body text, created_at timestamptz, sender_member_id uuid, sender_name text, sender_is_staff boolean, mine boolean)
language sql stable security definer set search_path = public as $$
  with actor as (select * from public.messaging_actor())
  select
    m.id, m.body, m.created_at, m.sender_member_id,
    coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), sm.invited_email, ''),
    sm.role in ('OWNER', 'OFFICE'),
    m.sender_member_id = a.id
  from actor a
  join public.message_threads t
    on t.id = p_thread_id
   and t.company_id = a.company_id
   and (a.role <> 'EMPLOYEE' or t.employee_member_id = a.id)
  join public.messages m on m.thread_id = t.id
  join public.company_members sm on sm.id = m.sender_member_id
  left join public.profiles p on p.id = sm.profile_id
  order by m.created_at;
$$;

-- ---------------------------------------------------------------------------
-- Offline sync: an idempotent, conflict-aware checklist write
-- ---------------------------------------------------------------------------
/*
 * The offline queue replays this instead of `complete_my_checklist_item`.
 *
 * Idempotency: the call sets an absolute state rather than toggling, so
 * replaying it after a failed retry produces the same row.
 *
 * Conflict rule: `p_client_time` is when the cleaner actually tapped. If the
 * server row was changed after that moment — by the office, or from another
 * device — the newer server state wins and the queued write is dropped rather
 * than silently overwriting it. The caller can tell the two apart because the
 * function reports which happened.
 */
create or replace function public.sync_my_checklist_item(p_item_id uuid, p_completed boolean, p_client_time timestamptz)
returns text language plpgsql security definer set search_path = public as $$
declare item public.job_checklist_items; server_changed_at timestamptz;
begin
  if p_client_time is null or p_client_time > now() + interval '1 day' then raise exception 'Invalid client time'; end if;
  select * into item from public.job_checklist_items where id = p_item_id;
  if item.id is null then raise exception 'Checklist item not found'; end if;

  server_changed_at := item.completed_at;
  if server_changed_at is not null and server_changed_at > p_client_time then
    return 'SERVER_NEWER';
  end if;
  if (item.completed_at is not null) = p_completed then
    return 'ALREADY_APPLIED';
  end if;

  -- Authorisation is delegated to the existing employee-scoped function, so the
  -- offline path cannot be a way around the assignment check.
  perform public.complete_my_checklist_item(p_item_id, p_completed);
  return 'APPLIED';
end;
$$;

revoke all on function
  public.set_my_avatar(text), public.update_my_contact_details(text, text, text),
  public.messaging_actor(), public.start_message_thread(uuid, text, text),
  public.send_message(uuid, text), public.mark_thread_read(uuid),
  public.list_my_threads(), public.list_thread_messages(uuid),
  public.sync_my_checklist_item(uuid, boolean, timestamptz),
  public.ensure_message_thread_integrity(), public.is_allowed_avatar_path(text),
  public.owns_avatar_path(text), public.can_read_avatar_path(text)
from public, anon;

grant execute on function
  public.set_my_avatar(text), public.update_my_contact_details(text, text, text),
  public.start_message_thread(uuid, text, text), public.send_message(uuid, text),
  public.mark_thread_read(uuid), public.list_my_threads(), public.list_thread_messages(uuid),
  public.sync_my_checklist_item(uuid, boolean, timestamptz),
  public.is_allowed_avatar_path(text), public.owns_avatar_path(text), public.can_read_avatar_path(text)
to authenticated;
