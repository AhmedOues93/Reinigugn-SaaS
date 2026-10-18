-- Phase 18 — vacation approval actually works, and sickness stops pretending
-- to have been approved.
--
-- Two separate problems, reported as one.
--
-- 1. `review_absence` could never succeed. It declared a variable named
--    `profile_id` and then selected the column `profile_id` into it:
--
--        select profile_id into profile_id from public.company_members ...
--
--    PostgreSQL cannot tell which `profile_id` is meant and raises
--    "column reference \"profile_id\" is ambiguous". Every approval and every
--    rejection has therefore thrown, for every tenant, since the function was
--    written. The office saw a generic failure, the request stayed where it
--    was, and `reviewed_by` and `reviewed_at` were never written — so even a
--    request that looked decided carried no record of who decided it.
--
-- 2. A reported sickness is stored with status APPROVED, which is then shown
--    to everyone as "Genehmigt". Nobody approves an illness. Reading
--    "Genehmigt" against an absence one has just reported is exactly what
--    makes it look as though vacation is auto-approved too.
--
--    The status column is not changed: APPROVED is what makes
--    `is_absence_unavailable` treat the day as unavailable, and reworking that
--    would touch planning, replacement search and the dashboard for a wording
--    problem. Instead the distinction is made explicit and queryable, so the
--    interface can say "Gemeldet" for a sickness and "Genehmigt" only where
--    somebody actually decided.
--
-- What was already correct, and stays: a VACATION request is created PENDING,
-- and `is_absence_unavailable` ignores a pending request, so an undecided
-- holiday never silently removes anyone from the plan.

-- ---------------------------------------------------------------------------
-- 1. The fix. `actor_profile` cannot collide with a column name.
-- ---------------------------------------------------------------------------
create or replace function public.review_absence(p_absence_id uuid, p_approved boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  actor public.company_members;
  target public.employee_absences;
  actor_profile uuid;
begin
  select cm.* into actor
  from public.company_members cm
  join public.profiles p on p.id = cm.profile_id
  where p.auth_user_id = auth.uid() and cm.status = 'ACTIVE' and cm.role in ('OWNER', 'OFFICE')
  limit 1;
  if actor.id is null then raise exception 'Only OWNER or OFFICE may decide an absence'; end if;

  select * into target from public.employee_absences
  where id = p_absence_id and company_id = actor.company_id for update;
  if target.id is null then raise exception 'Absence not found'; end if;

  -- Sickness is reported, not granted. Refusing here is what keeps "approved"
  -- meaning something.
  if target.absence_type <> 'VACATION' then
    raise exception 'Only a vacation request can be approved or rejected';
  end if;
  if target.status <> 'PENDING' then
    raise exception 'This request has already been decided';
  end if;

  actor_profile := actor.profile_id;

  update public.employee_absences
  set status = case when p_approved then 'APPROVED'::public.absence_status else 'REJECTED'::public.absence_status end,
      reviewed_by = actor_profile,
      reviewed_at = now(),
      updated_at = now()
  where id = target.id;

  insert into public.in_app_notifications (company_id, recipient_member_id, type, title, absence_id)
  values (
    target.company_id,
    target.member_id,
    case when p_approved then 'VACATION_APPROVED'::public.notification_type else 'VACATION_REJECTED'::public.notification_type end,
    case when p_approved then 'Urlaubsantrag genehmigt' else 'Urlaubsantrag abgelehnt' end,
    target.id
  );
end;
$$;

revoke all on function public.review_absence(uuid, boolean) from public, anon;
grant execute on function public.review_absence(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Telling a decision apart from a report.
--
-- A generated column rather than application logic, so every reader — the
-- office list, the employee app, a future export — agrees without repeating
-- the rule. Sickness is always REPORTED. A vacation is what its status says.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'absence_decision') then
    create type public.absence_decision as enum ('REPORTED', 'PENDING', 'APPROVED', 'REJECTED');
  end if;
end $$;

alter table public.employee_absences
  add column if not exists decision public.absence_decision
  generated always as (
    case
      when absence_type = 'SICKNESS' then 'REPORTED'::public.absence_decision
      when status = 'PENDING' then 'PENDING'::public.absence_decision
      when status = 'APPROVED' then 'APPROVED'::public.absence_decision
      else 'REJECTED'::public.absence_decision
    end
  ) stored;

comment on column public.employee_absences.decision is
  'What the office actually did. Sickness is REPORTED — nobody approves an illness. Only a VACATION can be APPROVED or REJECTED, and only by review_absence.';

comment on column public.employee_absences.reviewed_by is
  'The profile that decided a vacation request. Null for sickness and for an undecided request.';

-- ---------------------------------------------------------------------------
-- 3. An employee may create and read their own absences, and nothing else.
--
-- The existing policies already scope reads; this makes the decision columns
-- explicitly unwritable from a session, so approval can only ever happen
-- through review_absence.
-- ---------------------------------------------------------------------------
revoke update on public.employee_absences from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Attaching an AU document, which also could never succeed.
--
-- Found while testing that this phase leaves the sick-note workflow intact —
-- it did, because the workflow was already broken. The path guard was written
-- as `\\.` inside an ordinary SQL string, and with standard_conforming_strings
-- on (the default) that is two characters, a backslash and a dot. The regex
-- therefore demanded a literal backslash before the file extension, which no
-- storage path the application builds can contain:
--
--     <company>/absence/<absence>/<uuid>.pdf      -- what is sent
--     <company>/absence/<absence>/<uuid>\x.pdf    -- what was required
--
-- So every upload uploaded the file, had the RPC reject it, deleted the file
-- again and told the employee their sick note could not be saved. `\.` is one
-- character: an escaped dot, which is what was meant.
--
-- The rest of the guard is unchanged and still does its job: the path must
-- name this company, this absence, and a UUID with an allowed extension, so a
-- caller cannot point the record at somebody else's file.
-- ---------------------------------------------------------------------------
create or replace function public.attach_my_au_document(p_absence_id uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare target public.employee_absences;
begin
  select * into target from public.employee_absences where id = p_absence_id for update;
  if target.id is null or not public.is_current_member(target.member_id) or target.absence_type <> 'SICKNESS'
    or p_path !~ ('^' || target.company_id::text || '/absence/' || target.id::text || '/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png)$') then
    raise exception 'AU document cannot be attached';
  end if;
  update public.employee_absences set au_storage_path = p_path, updated_at = now() where id = target.id;
end; $$;

revoke all on function public.attach_my_au_document(uuid, text) from public, anon;
grant execute on function public.attach_my_au_document(uuid, text) to authenticated;
