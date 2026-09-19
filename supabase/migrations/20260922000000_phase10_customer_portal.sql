-- Phase 10: the customer portal.
--
-- Design note on authorisation. Several operational tables carry columns a
-- customer must never see (`jobs.internal_notes`, `customers.notes`,
-- `complaints.internal_note`, employee names on assignments). Row-level security
-- is row-level, not column-level, so this phase deliberately does NOT open those
-- tables to the CUSTOMER role. Every portal read goes through a security-definer
-- function that returns an explicit, curated column list, and every portal write
-- goes through a narrow function. The only thing the browser controls is which of
-- its own rows it asks for; the tenant and the customer identity always come from
-- the session.

create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  member_id uuid not null unique references public.company_members(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index customer_contacts_company_customer_idx on public.customer_contacts(company_id, customer_id);

-- A portal contact must be a CUSTOMER member of the same company as the customer
-- record it points at. Enforced in the database, not only in the action layer.
create or replace function public.ensure_customer_contact_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare member public.company_members; owner_company uuid;
begin
  select * into member from public.company_members where id = new.member_id;
  if member.id is null or member.role <> 'CUSTOMER' then raise exception 'Portal contact must be a CUSTOMER member'; end if;
  if member.company_id <> new.company_id then raise exception 'Member belongs to another company'; end if;
  select company_id into owner_company from public.customers where id = new.customer_id;
  if owner_company is null or owner_company <> new.company_id then raise exception 'Customer belongs to another company'; end if;
  return new;
end;
$$;

create trigger customer_contacts_integrity
  before insert or update on public.customer_contacts
  for each row execute procedure public.ensure_customer_contact_integrity();

alter table public.customer_contacts enable row level security;

create policy "staff manage portal contacts" on public.customer_contacts
for all to authenticated using (public.is_company_staff(company_id)) with check (public.is_company_staff(company_id));

create policy "contacts read their own link" on public.customer_contacts
for select to authenticated using (public.is_current_member(member_id));

revoke all on public.customer_contacts from anon;
revoke insert, update, delete on public.customer_contacts from authenticated;
grant select on public.customer_contacts to authenticated;

-- Customer invitations reuse the existing token flow, so expiry, single use and
-- the email match are inherited rather than reimplemented.
alter table public.company_invitations add column if not exists customer_id uuid references public.customers(id) on delete cascade;
do $$
declare constraint_name text;
begin
  -- The original check was declared inline, so drop it by lookup rather than by
  -- a guessed name.
  for constraint_name in
    select con.conname from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public' and rel.relname = 'company_invitations'
      and con.contype = 'c' and pg_get_constraintdef(con.oid) like '%role%'
      and pg_get_constraintdef(con.oid) not like '%CUSTOMER%'
  loop
    execute format('alter table public.company_invitations drop constraint %I', constraint_name);
  end loop;
end $$;
alter table public.company_invitations add constraint company_invitations_role_check check (role in ('OFFICE', 'EMPLOYEE', 'CUSTOMER'));
alter table public.company_invitations drop constraint if exists company_invitations_customer_role_check;
alter table public.company_invitations add constraint company_invitations_customer_role_check
  check ((role = 'CUSTOMER') = (customer_id is not null));

-- The signed-in portal identity. Everything else in this file builds on it.
create or replace function public.current_customer_contact()
returns public.customer_contacts language sql stable security definer set search_path = public as $$
  select contact.*
  from public.customer_contacts contact
  join public.company_members member on member.id = contact.member_id
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid()
    and member.role = 'CUSTOMER'
    and member.status = 'ACTIVE'
  limit 1;
$$;

create or replace function public.is_portal_customer_of(p_company_id uuid, p_customer_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.current_customer_contact() contact
    where contact.company_id = p_company_id and contact.customer_id = p_customer_id
  );
$$;

create or replace function public.create_customer_invitation(
  p_customer_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_token_hash text,
  p_expires_at timestamptz
) returns table (invitation_id uuid, member_id uuid, company_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  actor public.company_members;
  target_customer public.customers;
  new_member_id uuid;
  new_invitation_id uuid;
  normalized_email text := lower(trim(p_email));
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select member.* into actor from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid() and member.role in ('OWNER', 'OFFICE') and member.status = 'ACTIVE' limit 1;
  if actor.id is null then raise exception 'Staff role required'; end if;

  -- The tenant comes from the actor's membership; the client only names a customer.
  select * into target_customer from public.customers where id = p_customer_id and company_id = actor.company_id;
  if target_customer.id is null then raise exception 'Customer not found in this company'; end if;
  if normalized_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Invalid invitation email'; end if;
  if p_expires_at <= now() then raise exception 'Invitation must expire in the future'; end if;
  if exists (
    select 1 from public.company_members member
    where member.company_id = actor.company_id and lower(member.invited_email) = normalized_email and member.status <> 'DISABLED'
  ) then raise exception 'This email already has access to the company'; end if;

  insert into public.company_members (company_id, role, status, invited_email, invited_first_name, invited_last_name, invited_phone, invited_by, invited_at)
  values (actor.company_id, 'CUSTOMER', 'INVITED', normalized_email, nullif(trim(p_first_name), ''), nullif(trim(p_last_name), ''), nullif(trim(p_phone), ''), actor.profile_id, now())
  returning id into new_member_id;

  insert into public.company_invitations (company_id, member_id, email, role, token_hash, expires_at, customer_id)
  values (actor.company_id, new_member_id, normalized_email, 'CUSTOMER', p_token_hash, p_expires_at, target_customer.id)
  returning id into new_invitation_id;

  return query select new_invitation_id, new_member_id, actor.company_id;
end;
$$;

-- Acceptance now branches on the invited role: employees get an employee record,
-- portal customers get a contact link. Everything else is unchanged.
create or replace function public.complete_company_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare invitation public.company_invitations; member public.company_members; current_profile_id uuid; auth_email text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into invitation from public.company_invitations
  where token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'::text), 'hex') for update;
  if invitation.id is null or invitation.accepted_at is not null or invitation.revoked_at is not null or invitation.expires_at <= now() then raise exception 'Invitation is invalid, expired or already used'; end if;
  select lower(email) into auth_email from auth.users where id = auth.uid();
  if auth_email is null or auth_email <> lower(invitation.email) then raise exception 'Invitation email does not match the signed-in user'; end if;
  select * into member from public.company_members where id = invitation.member_id for update;
  if member.status <> 'INVITED' or member.company_id <> invitation.company_id then raise exception 'Invitation membership is invalid'; end if;
  select id into current_profile_id from public.profiles where auth_user_id = auth.uid();
  if current_profile_id is null then raise exception 'Profile missing'; end if;
  if exists (select 1 from public.company_members where company_id = invitation.company_id and profile_id = current_profile_id) then raise exception 'User already belongs to this company'; end if;

  update public.profiles set first_name = coalesce(member.invited_first_name, first_name), last_name = coalesce(member.invited_last_name, last_name), phone = coalesce(member.invited_phone, phone) where id = current_profile_id;
  update public.company_members set profile_id = current_profile_id, status = 'ACTIVE', joined_at = now(), disabled_at = null, invited_email = invitation.email where id = member.id;

  if invitation.role = 'CUSTOMER' then
    insert into public.customer_contacts (company_id, customer_id, member_id, created_by)
    values (invitation.company_id, invitation.customer_id, member.id, member.invited_by)
    on conflict (member_id) do nothing;
  else
    insert into public.employee_details (company_id, profile_id, employee_number, weekly_hours, employment_start_date, employment_end_date, employment_type, preferred_language, notes)
    values (invitation.company_id, current_profile_id, invitation.employee_number, invitation.weekly_hours, invitation.employment_start_date, invitation.employment_end_date, invitation.employment_type, invitation.preferred_language, invitation.notes)
    on conflict (company_id, profile_id) do nothing;
  end if;

  update public.company_invitations set accepted_at = now() where id = invitation.id;
  return member.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Portal reads. Each function returns an explicit column list; no internal note,
-- no employee identity, no price and no other customer's data is reachable.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_portal_overview()
returns table (company_id uuid, company_name text, customer_id uuid, customer_name text, customer_number text)
language sql stable security definer set search_path = public as $$
  select company.id, company.name, customer.id, customer.name, customer.customer_number
  from public.current_customer_contact() contact
  join public.companies company on company.id = contact.company_id
  join public.customers customer on customer.id = contact.customer_id;
$$;

create or replace function public.list_my_portal_objects()
returns table (id uuid, name text, street text, postal_code text, city text, contact_person text, is_active boolean)
language sql stable security definer set search_path = public as $$
  select object.id, object.name, object.street, object.postal_code, object.city, object.contact_person, object.is_active
  from public.current_customer_contact() contact
  join public.cleaning_objects object on object.customer_id = contact.customer_id and object.company_id = contact.company_id
  order by object.name;
$$;

create or replace function public.list_my_portal_upcoming_jobs(p_from date default current_date, p_days integer default 42)
returns table (id uuid, title text, scheduled_date date, planned_start_at timestamptz, planned_end_at timestamptz, status public.job_status, object_id uuid, object_name text)
language sql stable security definer set search_path = public as $$
  select job.id, job.title, job.scheduled_date, job.planned_start_at, job.planned_end_at, job.status, object.id, object.name
  from public.current_customer_contact() contact
  join public.jobs job on job.customer_id = contact.customer_id and job.company_id = contact.company_id
  join public.cleaning_objects object on object.id = job.cleaning_object_id
  where job.scheduled_date >= p_from
    and job.scheduled_date <= p_from + least(greatest(coalesce(p_days, 42), 1), 180)
    and job.status <> 'CANCELLED'
  order by job.scheduled_date, job.planned_start_at;
$$;

/*
 * Delivered services. The customer sees what was done and how long it took, but
 * never which employee did it — that is HR data, not service documentation.
 */
create or replace function public.list_my_portal_service_records(p_limit integer default 50)
returns table (job_id uuid, scheduled_date date, object_id uuid, object_name text, title text, status public.job_status, duration_minutes integer, completed_items integer, total_items integer)
language sql stable security definer set search_path = public as $$
  select
    job.id,
    job.scheduled_date,
    object.id,
    object.name,
    job.title,
    job.status,
    coalesce((select sum(entry.duration_minutes)::integer from public.job_time_entries entry where entry.job_id = job.id and entry.finished_at is not null), 0),
    coalesce((select count(*)::integer from public.job_checklists list join public.job_checklist_items item on item.job_checklist_id = list.id where list.job_id = job.id and item.completed_at is not null), 0),
    coalesce((select count(*)::integer from public.job_checklists list join public.job_checklist_items item on item.job_checklist_id = list.id where list.job_id = job.id), 0)
  from public.current_customer_contact() contact
  join public.jobs job on job.customer_id = contact.customer_id and job.company_id = contact.company_id
  join public.cleaning_objects object on object.id = job.cleaning_object_id
  where job.status = 'COMPLETED'
  order by job.scheduled_date desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

create or replace function public.get_my_portal_service_record(p_job_id uuid)
returns table (job_id uuid, scheduled_date date, object_name text, title text, status public.job_status, duration_minutes integer, items jsonb)
language sql stable security definer set search_path = public as $$
  select
    job.id,
    job.scheduled_date,
    object.name,
    job.title,
    job.status,
    coalesce((select sum(entry.duration_minutes)::integer from public.job_time_entries entry where entry.job_id = job.id and entry.finished_at is not null), 0),
    coalesce((
      select jsonb_agg(jsonb_build_object('title', item.title, 'completed', item.completed_at is not null) order by item.position)
      from public.job_checklists list
      join public.job_checklist_items item on item.job_checklist_id = list.id
      where list.job_id = job.id
    ), '[]'::jsonb)
  from public.current_customer_contact() contact
  join public.jobs job on job.id = p_job_id and job.customer_id = contact.customer_id and job.company_id = contact.company_id
  join public.cleaning_objects object on object.id = job.cleaning_object_id;
$$;

/* Documentation photos for the customer's own completed visits. Storage paths
 * are returned so the server can sign them; the bucket stays private. */
create or replace function public.list_my_portal_job_photos(p_job_id uuid)
returns table (id uuid, storage_path text, category public.job_photo_category, description text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select photo.id, photo.storage_path, photo.category, photo.description, photo.created_at
  from public.current_customer_contact() contact
  join public.jobs job on job.id = p_job_id and job.customer_id = contact.customer_id and job.company_id = contact.company_id
  join public.job_photos photo on photo.job_id = job.id
  where photo.category in ('AFTER', 'DOCUMENTATION')
  order by photo.created_at desc;
$$;

create or replace function public.list_my_portal_complaints()
returns table (id uuid, title text, description text, status public.complaint_status, priority public.complaint_priority, created_at timestamptz, object_id uuid, object_name text, updates jsonb)
language sql stable security definer set search_path = public as $$
  select
    complaint.id,
    complaint.title,
    complaint.description,
    complaint.status,
    complaint.priority,
    complaint.created_at,
    object.id,
    object.name,
    coalesce((
      select jsonb_agg(jsonb_build_object('status', update_row.status, 'note', update_row.note, 'created_at', update_row.created_at) order by update_row.created_at)
      from public.complaint_updates update_row
      where update_row.complaint_id = complaint.id
    ), '[]'::jsonb)
  from public.current_customer_contact() contact
  join public.complaints complaint on complaint.customer_id = contact.customer_id and complaint.company_id = contact.company_id
  join public.cleaning_objects object on object.id = complaint.cleaning_object_id
  order by complaint.created_at desc;
$$;

create or replace function public.create_my_portal_complaint(p_object_id uuid, p_title text, p_description text, p_job_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare contact public.customer_contacts; object_row public.cleaning_objects; new_id uuid; linked_job uuid;
begin
  select * into contact from public.current_customer_contact();
  if contact.id is null then raise exception 'Portal access required'; end if;
  if char_length(trim(p_title)) not between 2 and 160 then raise exception 'Invalid complaint title'; end if;
  if char_length(trim(p_description)) not between 2 and 4000 then raise exception 'Invalid complaint description'; end if;

  -- The object must belong to this customer, not merely to the company.
  select * into object_row from public.cleaning_objects
  where id = p_object_id and customer_id = contact.customer_id and company_id = contact.company_id;
  if object_row.id is null then raise exception 'Object not found for this customer'; end if;

  if p_job_id is not null then
    select job.id into linked_job from public.jobs job
    where job.id = p_job_id and job.customer_id = contact.customer_id and job.company_id = contact.company_id;
    if linked_job is null then raise exception 'Job not found for this customer'; end if;
  end if;

  -- priority and status are set by the company, never by the reporter.
  insert into public.complaints (company_id, customer_id, cleaning_object_id, job_id, title, description, priority, status, created_by)
  values (contact.company_id, contact.customer_id, object_row.id, linked_job, trim(p_title), trim(p_description), 'NORMAL', 'OPEN', contact.member_id)
  returning id into new_id;

  insert into public.in_app_notifications (company_id, recipient_member_id, type, title, body)
  select contact.company_id, member.id, 'COMPLAINT_CREATED', 'Neue Reklamation aus dem Kundenportal', trim(p_title)
  from public.company_members member
  where member.company_id = contact.company_id and member.role in ('OWNER', 'OFFICE') and member.status = 'ACTIVE';

  return new_id;
end;
$$;

-- Portal customers are company members, so the existing
-- "members can view their company" policy already gives them their own
-- company's branding and nothing else. No new policy is needed here.

revoke all on function
  public.current_customer_contact(),
  public.is_portal_customer_of(uuid, uuid),
  public.ensure_customer_contact_integrity(),
  public.create_customer_invitation(uuid, text, text, text, text, text, timestamptz),
  public.get_my_portal_overview(),
  public.list_my_portal_objects(),
  public.list_my_portal_upcoming_jobs(date, integer),
  public.list_my_portal_service_records(integer),
  public.get_my_portal_service_record(uuid),
  public.list_my_portal_job_photos(uuid),
  public.list_my_portal_complaints(),
  public.create_my_portal_complaint(uuid, text, text, uuid)
from public, anon;

grant execute on function
  public.current_customer_contact(),
  public.is_portal_customer_of(uuid, uuid),
  public.create_customer_invitation(uuid, text, text, text, text, text, timestamptz),
  public.get_my_portal_overview(),
  public.list_my_portal_objects(),
  public.list_my_portal_upcoming_jobs(date, integer),
  public.list_my_portal_service_records(integer),
  public.get_my_portal_service_record(uuid),
  public.list_my_portal_job_photos(uuid),
  public.list_my_portal_complaints(),
  public.create_my_portal_complaint(uuid, text, text, uuid)
to authenticated;

-- Portal customers may read the storage objects behind their own documentation
-- photos. The policy re-derives ownership from the job, never from the path alone.
create or replace function public.can_portal_customer_read_job_photo(p_name text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.job_photos photo
    join public.jobs job on job.id = photo.job_id
    join public.current_customer_contact() contact
      on contact.customer_id = job.customer_id and contact.company_id = job.company_id
    where photo.storage_path = p_name and photo.category in ('AFTER', 'DOCUMENTATION')
  );
$$;

drop policy if exists "portal customers view own job photos" on storage.objects;
create policy "portal customers view own job photos" on storage.objects
for select to authenticated using (
  bucket_id = 'job-photos'
  and public.is_allowed_job_photo_storage_path(name)
  and public.can_portal_customer_read_job_photo(name)
);

grant execute on function public.can_portal_customer_read_job_photo(text) to authenticated;
