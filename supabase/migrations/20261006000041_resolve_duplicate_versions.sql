-- Die doppelten Migrationsnummern aufloesen.
--
-- Drei Nummern sind im Repository doppelt belegt, jede aus zwei parallelen
-- Zweigen:
--
--   20260921000001  phase10_notification_type       + fix_branding_upload_policy
--   20261005000000  pending_member_delete           + phase25_quote_snapshot_details
--   20261006000026  manual_assignment_capacity      + public_quote_signature_once
--
-- Auf einer leeren Datenbank ist das harmlos: angewendet wird nach Dateiname,
-- also laufen beide. Gegen eine gewachsene Datenbank ist es eine Falle. Die
-- Supabase-CLI fuehrt in `supabase_migrations.schema_migrations` *Versionen*,
-- und die Version ist der Zahlenteil des Namens. Steht eine Nummer einmal im
-- Buch, gilt sie als angewendet -- und die zweite Datei wird uebersprungen.
-- Welche von beiden das trifft, haengt davon ab, in welcher Reihenfolge sie
-- damals gelaufen sind, und laesst sich hinterher nicht mehr ablesen.
--
-- Darum hier noch einmal, unter einer eindeutigen Nummer. Alle sechs Dateien
-- bestehen ausschliesslich aus wiederholbaren Anweisungen -- `create or
-- replace function`, `drop policy if exists` samt Neuanlage, und ein
-- `alter type ... add value if not exists`. Keine Datenmigration, kein
-- `create table`. Ein zweiter Durchlauf aendert also nichts, und danach ist
-- der Inhalt aller sechs Dateien garantiert vorhanden.
--
-- Umbenennen oder zusammenlegen waere falsch: eine bereits angewendete
-- Migration bekommt keinen neuen Namen, sonst gilt sie dort ploetzlich als
-- fehlend und wird erneut eingespielt.
--
-- Geaendert wird nichts. Die Rumpfe unten sind Zeichen fuer Zeichen die der
-- Originaldateien; nachgetragen ist nur die Herkunftszeile.

-- ===========================================================================
-- Aus 20260921000001_phase10_notification_type.sql  (Version 20260921000001)
-- ===========================================================================

-- New enum values must be committed before they can be used, so the portal
-- notification type is added in its own migration ahead of phase 10.
alter type public.notification_type add value if not exists 'COMPLAINT_CREATED';

-- ===========================================================================
-- Aus 20260921000001_fix_branding_upload_policy.sql  (Version 20260921000001)
-- ===========================================================================

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

-- ===========================================================================
-- Aus 20261005000000_pending_member_delete.sql  (Version 20261005000000)
-- ===========================================================================

-- Allow staff to permanently remove only invitations that never became accounts.
-- Active/accepted members stay archival-only so operational history remains intact.
create or replace function public.delete_pending_company_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.company_members;
begin
  if not public.can_manage_company_member(p_member_id) then
    raise exception 'Not permitted to delete this invitation';
  end if;

  select * into target
  from public.company_members
  where id = p_member_id
  for update;

  if target.id is null then
    raise exception 'Member not found';
  end if;

  if target.profile_id is not null or target.status <> 'INVITED' then
    raise exception 'Only pending invitations can be permanently deleted';
  end if;

  delete from public.company_members where id = target.id;
exception
  when foreign_key_violation then
    raise exception 'This pending member is already referenced by operational data and cannot be deleted';
end;
$$;

revoke all on function public.delete_pending_company_member(uuid) from public, anon;
grant execute on function public.delete_pending_company_member(uuid) to authenticated;

-- ===========================================================================
-- Aus 20261005000000_phase25_quote_snapshot_details.sql  (Version 20261005000000)
-- ===========================================================================

-- Phase 25: richer immutable offer snapshots for professional PDFs.
-- This migration intentionally sorts after the sales pipeline migration that
-- creates public.quotes and its related tables.
create or replace function public.send_quote(p_quote_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  quote public.quotes;
  company public.companies;
  lead_row public.leads;
  customer_row public.customers;
  calc_row public.calculations;
  object_row public.cleaning_objects;
  survey_row public.site_surveys;
  send_year smallint := extract(year from current_date)::smallint;
  next_number integer;
  formatted text;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;

  select * into quote
  from public.quotes
  where id = p_quote_id and company_id = actor.company_id
  for update;

  if quote.id is null then raise exception 'Quote not found'; end if;
  if quote.status <> 'DRAFT' then raise exception 'Only a draft quote can be sent'; end if;
  if not exists (select 1 from public.quote_lines where quote_id = quote.id) then
    raise exception 'A quote needs at least one line';
  end if;

  select * into company from public.companies where id = actor.company_id;
  if quote.lead_id is not null then
    select * into lead_row from public.leads where id = quote.lead_id;
  end if;
  if quote.customer_id is not null then
    select * into customer_row from public.customers where id = quote.customer_id;
  end if;
  if quote.calculation_id is not null then
    select * into calc_row from public.calculations where id = quote.calculation_id;
  end if;
  if quote.site_survey_id is not null then
    select * into survey_row from public.site_surveys where id = quote.site_survey_id;
  end if;

  if calc_row.cleaning_object_id is not null then
    select * into object_row
    from public.cleaning_objects
    where id = calc_row.cleaning_object_id and company_id = actor.company_id;
  elsif lead_row.cleaning_object_id is not null then
    select * into object_row
    from public.cleaning_objects
    where id = lead_row.cleaning_object_id and company_id = actor.company_id;
  end if;

  insert into public.quote_number_counters (company_id, year, last_number)
  values (actor.company_id, send_year, 0)
  on conflict (company_id, year) do nothing;

  select last_number + 1 into next_number
  from public.quote_number_counters
  where company_id = actor.company_id and year = send_year
  for update;

  update public.quote_number_counters
  set last_number = next_number
  where company_id = actor.company_id and year = send_year;

  formatted := format('AN-%s-%s', send_year, lpad(next_number::text, 4, '0'));

  update public.quotes
  set
    status = 'SENT',
    quote_number = formatted,
    sent_at = now(),
    recipient_snapshot = jsonb_build_object(
      'name', coalesce(customer_row.name, lead_row.organisation),
      'contact_person', coalesce(customer_row.contact_person, lead_row.contact_person),
      'email', coalesce(customer_row.email, lead_row.email),
      'street', coalesce(customer_row.billing_address, lead_row.street),
      'postal_code', coalesce(customer_row.postal_code, lead_row.postal_code),
      'city', coalesce(customer_row.city, lead_row.city),
      'country', coalesce(customer_row.billing_country, 'Deutschland'),
      'vat_id', customer_row.vat_id,
      'object_name', coalesce(object_row.name, survey_row.site_name),
      'object_street', coalesce(object_row.street, survey_row.street),
      'object_postal_code', coalesce(object_row.postal_code, survey_row.postal_code),
      'object_city', coalesce(object_row.city, survey_row.city)
    ),
    company_snapshot = jsonb_build_object(
      'name', company.name,
      'legal_form', company.legal_form,
      'street', company.street,
      'postal_code', company.postal_code,
      'city', company.city,
      'country', company.country,
      'phone', company.phone,
      'email', company.email,
      'website', company.website,
      'tax_number', company.tax_number,
      'vat_id', company.vat_id,
      'iban', company.iban,
      'bic', company.bic,
      'default_payment_terms_days', company.default_payment_terms_days
    ),
    updated_at = now()
  where id = quote.id;

  return formatted;
end;
$$;

revoke all on function public.send_quote(uuid) from public, anon;
grant execute on function public.send_quote(uuid) to authenticated;

-- ===========================================================================
-- Aus 20261006000026_manual_assignment_capacity.sql  (Version 20261006000026)
-- ===========================================================================

-- Manual planning already refuses to double-book silently: the office has to
-- confirm an overlap. Weekly hours had no such guard, so a job could be given
-- to someone who is already at their contracted hours for that week without
-- anyone noticing until the month closed.
--
-- This reports the overrun for the ISO week of the job, so the warning can name
-- the employee and the actual hours. It only reports; the office decides.

create or replace function public.find_job_capacity_warnings(
  p_company_id uuid,
  p_date date,
  p_start timestamptz,
  p_end timestamptz,
  p_member_ids uuid[],
  p_exclude_job uuid default null
)
returns table (
  member_id uuid,
  member_name text,
  weekly_hours numeric,
  planned_minutes numeric,
  added_minutes numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select date_trunc('week', p_date::timestamp)::date as week_start
  ),
  candidate as (
    select
      member.id,
      coalesce(
        nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
        'Mitarbeiter ohne Namen') as member_name,
      details.weekly_hours
    from public.company_members member
    join public.profiles profile on profile.id = member.profile_id
    join public.employee_details details
      on details.company_id = member.company_id
     and details.profile_id = member.profile_id
     and details.is_active
    where member.company_id = p_company_id
      and public.is_company_staff(p_company_id)
      and member.id = any(coalesce(p_member_ids, array[]::uuid[]))
      and details.weekly_hours is not null
      and details.weekly_hours > 0
  ),
  load as (
    select
      candidate.id,
      candidate.member_name,
      candidate.weekly_hours,
      coalesce((
        select sum(extract(epoch from (job.planned_end_at - job.planned_start_at)) / 60)
        from public.job_assignments assignment
        join public.jobs job on job.id = assignment.job_id
        where assignment.member_id = candidate.id
          and job.company_id = p_company_id
          and job.status in ('PLANNED','CONFIRMED','IN_PROGRESS')
          and job.scheduled_date >= (select week_start from bounds)
          and job.scheduled_date < (select week_start from bounds) + 7
          and (p_exclude_job is null or job.id <> p_exclude_job)
      ), 0) as planned_minutes,
      extract(epoch from (p_end - p_start)) / 60 as added_minutes
    from candidate
  )
  select load.id, load.member_name, load.weekly_hours, load.planned_minutes, load.added_minutes
  from load
  where load.planned_minutes + load.added_minutes > load.weekly_hours * 60;
$$;

revoke all on function public.find_job_capacity_warnings(uuid, date, timestamptz, timestamptz, uuid[], uuid) from public, anon;
grant execute on function public.find_job_capacity_warnings(uuid, date, timestamptz, timestamptz, uuid[], uuid) to authenticated;

-- ===========================================================================
-- Aus 20261006000026_public_quote_signature_once.sql  (Version 20261006000026)
-- ===========================================================================

-- A public offer signature is an acceptance record, not an editable profile field.
-- Lock the offer before acceptance to serialize simultaneous clicks. The
-- existing accept_public_quote() performs the actual acceptance transaction.
create or replace function public.accept_public_quote_signed(
  p_token text, p_name text, p_signature text, p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  target public.quotes;
  signature_text text := trim(coalesce(p_signature, ''));
  result jsonb;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 256 then
    raise exception 'Invalid offer link';
  end if;
  if char_length(signature_text) < 2 or char_length(signature_text) > 160 then
    raise exception 'Please enter your signature';
  end if;

  select * into target
  from public.quotes
  where public_token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'::text), 'hex')
    and public_access_expires_at > now()
  for update;

  if target.id is null then raise exception 'Offer link is invalid or expired'; end if;
  if target.status <> 'SENT' or target.accepted_signature_text is not null then
    raise exception 'Offer has already been decided';
  end if;

  result := public.accept_public_quote(p_token, p_name, p_note);

  update public.quotes
  set accepted_signature_text = signature_text, updated_at = now()
  where id = target.id
    and status = 'ACCEPTED'
    and accepted_signature_text is null;
  if not found then raise exception 'Offer signature could not be stored'; end if;
  return result;
end;
$function$;

revoke all on function public.accept_public_quote_signed(text, text, text, text) from public;
grant execute on function public.accept_public_quote_signed(text, text, text, text) to anon, authenticated;
