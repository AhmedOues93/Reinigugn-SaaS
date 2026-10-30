-- Ein Audit-Log fuer die Dinge, bei denen spaeter jemand fragt, wer das war.
--
-- Zwei Entscheidungen tragen dieses Ganze:
--
-- 1. Geschrieben wird von Triggern, nicht von den RPCs. Eine Funktion zu
--    instrumentieren heisst, es bei der naechsten Funktion zu vergessen; ein
--    Trigger an der Tabelle sieht jeden Weg, auch den, den es heute noch nicht
--    gibt. Dafuer gibt es keine Absicht im Log, nur Tatsachen -- und Tatsachen
--    sind, wonach gefragt wird.
--
-- 2. Festgehalten wird, *dass* etwas geaendert wurde, nicht immer *worauf*.
--    Bei den Firmendaten stehen die Namen der geaenderten Felder im Log, nicht
--    ihre Werte. Eine IBAN in einem Protokoll, das das ganze Buero lesen darf,
--    waere ein Leck -- und dass die Bankverbindung geaendert wurde, ist genau
--    die Information, die jemanden aufhorchen laesst.
--
-- Was hier *nicht* hineingehoert: die Leistungsnachweise. Deren Verlauf steht
-- in `service_record_events` und wird am Nachweis selbst gezeigt. Sie hier
-- noch einmal zu fuehren hiesse, dieselbe Wahrheit zweimal zu speichern, und
-- jeder erledigte Einsatz wuerde das Log zuschuetten.

-- ---------------------------------------------------------------------------
-- 1. Die Tabelle
-- ---------------------------------------------------------------------------

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  action text not null check (char_length(action) between 3 and 60),
  -- Die Handelnde als Momentaufnahme: ein Mitglied kann den Betrieb
  -- verlassen, und dann soll im Log nicht "unbekannt" stehen.
  actor_member_id uuid references public.company_members(id) on delete set null,
  actor_name text,
  subject_type text not null check (char_length(subject_type) between 2 and 40),
  subject_id uuid,
  subject_label text,
  detail jsonb not null default '{}'::jsonb
);

create index if not exists audit_events_company_time_idx
  on public.audit_events (company_id, occurred_at desc);

comment on table public.audit_events is
  'Unveraenderliches Protokoll der Vorgaenge um Geld, Lohn und Berechtigungen.';

alter table public.audit_events enable row level security;

-- Lesen darf das Buero des eigenen Betriebs. Schreiben darf niemand von
-- aussen: die Zeilen entstehen ausschliesslich in den Triggern unten, und die
-- laufen als security definer.
drop policy if exists audit_events_staff_read on public.audit_events;
create policy audit_events_staff_read on public.audit_events
  for select using (public.is_company_staff(company_id));

revoke all on public.audit_events from anon, authenticated;
grant select on public.audit_events to authenticated;

/**
 * Ein Protokoll, das sich aendern laesst, ist keines.
 *
 * Der Riegel sitzt an der Tabelle und nicht in einer Richtlinie, damit er auch
 * fuer `security definer`-Funktionen gilt -- die umgehen RLS, aber keinen
 * Trigger.
 */
create or replace function public.forbid_audit_change()
returns trigger language plpgsql as $$
begin
  raise exception 'Audit-Einträge können nicht geändert oder gelöscht werden';
end;
$$;

drop trigger if exists audit_events_immutable on public.audit_events;
create trigger audit_events_immutable
  before update or delete on public.audit_events
  for each row execute function public.forbid_audit_change();

-- ---------------------------------------------------------------------------
-- 2. Der Schreiber
-- ---------------------------------------------------------------------------

/**
 * Einen Vorgang festhalten.
 *
 * Findet sich keine handelnde Person -- ein Hintergrundlauf, ein Trigger ohne
 * Sitzung --, wird der Eintrag trotzdem geschrieben, mit leerem Namen. Eine
 * Aenderung ohne Protokoll waere schlechter als eine ohne Namen.
 */
create or replace function public.record_audit_event(
  p_company_id uuid,
  p_action text,
  p_subject_type text,
  p_subject_id uuid,
  p_subject_label text,
  p_detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid;
  actor_label text;
begin
  if p_company_id is null then return; end if;

  select member.id,
         nullif(trim(coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '')), '')
    into actor_id, actor_label
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid()
    and member.company_id = p_company_id
  order by case member.status when 'ACTIVE' then 0 else 1 end
  limit 1;

  insert into public.audit_events
    (company_id, action, actor_member_id, actor_name, subject_type, subject_id, subject_label, detail)
  values
    (p_company_id, p_action, actor_id, actor_label, p_subject_type, p_subject_id, p_subject_label,
     coalesce(p_detail, '{}'::jsonb));
end;
$$;

revoke all on function public.record_audit_event(uuid, text, text, uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Rechnungen
-- ---------------------------------------------------------------------------
--
-- Nur Statuswechsel. Ein Entwurf, der dreimal bearbeitet wird, ist kein
-- Vorgang, nach dem jemand fragt; ausgestellt, bezahlt und storniert sind es.

create or replace function public.audit_invoice_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform public.record_audit_event(
      new.company_id,
      'INVOICE_' || new.status::text,
      'invoice',
      new.id,
      coalesce(new.invoice_number, 'Entwurf'),
      jsonb_build_object(
        'previous_status', old.status::text,
        'gross_total_cents', new.gross_total_cents,
        'reason', new.cancellation_reason
      )
    );
  end if;
  return null;
end;
$$;

drop trigger if exists invoices_audit_status on public.invoices;
create trigger invoices_audit_status
  after update of status on public.invoices
  for each row execute function public.audit_invoice_status();

-- ---------------------------------------------------------------------------
-- 4. Wer darf was
-- ---------------------------------------------------------------------------

create or replace function public.audit_member_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  label text;
begin
  select nullif(trim(coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '')), '')
    into label
  from public.profiles profile where profile.id = new.profile_id;
  label := coalesce(label, new.invited_email, 'Unbekannt');

  if tg_op = 'INSERT' then
    perform public.record_audit_event(
      new.company_id, 'MEMBER_ADDED', 'member', new.id, label,
      jsonb_build_object('role', new.role::text, 'status', new.status::text));
    return null;
  end if;

  if new.role is distinct from old.role then
    perform public.record_audit_event(
      new.company_id, 'MEMBER_ROLE_CHANGED', 'member', new.id, label,
      jsonb_build_object('previous_role', old.role::text, 'role', new.role::text));
  end if;
  if new.status is distinct from old.status then
    perform public.record_audit_event(
      new.company_id, 'MEMBER_STATUS_CHANGED', 'member', new.id, label,
      jsonb_build_object('previous_status', old.status::text, 'status', new.status::text));
  end if;
  return null;
end;
$$;

drop trigger if exists company_members_audit on public.company_members;
create trigger company_members_audit
  after insert or update of role, status on public.company_members
  for each row execute function public.audit_member_change();

-- ---------------------------------------------------------------------------
-- 5. Firmendaten, bei denen es auf die Aenderung ankommt
-- ---------------------------------------------------------------------------
--
-- Protokolliert werden die Namen der geaenderten Felder, nicht ihre Werte.
-- Dass die Bankverbindung geaendert wurde, ist der Befund; die IBAN selbst
-- gehoert nicht in ein Protokoll, das das ganze Buero lesen darf.

create or replace function public.audit_company_settings()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  changed text[] := '{}';
begin
  if new.iban is distinct from old.iban then changed := changed || 'iban'::text; end if;
  if new.bic is distinct from old.bic then changed := changed || 'bic'::text; end if;
  if new.tax_number is distinct from old.tax_number then changed := changed || 'tax_number'::text; end if;
  if new.vat_id is distinct from old.vat_id then changed := changed || 'vat_id'::text; end if;
  if new.billing_email is distinct from old.billing_email then changed := changed || 'billing_email'::text; end if;
  if new.require_staff_mfa is distinct from old.require_staff_mfa then
    changed := changed || 'require_staff_mfa'::text;
  end if;
  if new.datev_beraternummer is distinct from old.datev_beraternummer then changed := changed || 'datev_beraternummer'::text; end if;
  if new.datev_mandantennummer is distinct from old.datev_mandantennummer then changed := changed || 'datev_mandantennummer'::text; end if;
  if new.default_vat_rate_basis_points is distinct from old.default_vat_rate_basis_points then
    changed := changed || 'default_vat_rate_basis_points'::text;
  end if;

  if array_length(changed, 1) > 0 then
    perform public.record_audit_event(
      new.id, 'COMPANY_SETTINGS_CHANGED', 'company', new.id, new.name,
      -- Beim Zwei-Faktor-Zwang ist der Wert selbst die Information und kein
      -- Geheimnis, darum steht er hier ausnahmsweise mit drin.
      jsonb_build_object(
        'fields', to_jsonb(changed),
        'require_staff_mfa', case when 'require_staff_mfa' = any(changed) then to_jsonb(new.require_staff_mfa) else null end
      )
    );
  end if;
  return null;
end;
$$;

drop trigger if exists companies_audit_settings on public.companies;
create trigger companies_audit_settings
  after update on public.companies
  for each row execute function public.audit_company_settings();

-- ---------------------------------------------------------------------------
-- 6. Lohnmonate
-- ---------------------------------------------------------------------------

create or replace function public.audit_payroll_release()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  month date;
begin
  select period into month from public.payroll_periods where id = new.period_id;

  if tg_op = 'INSERT' then
    perform public.record_audit_event(
      new.company_id, 'PAYROLL_RELEASED', 'payroll_period', new.period_id,
      to_char(month, 'MM/YYYY'),
      jsonb_build_object('sequence', new.sequence));
    return null;
  end if;

  if new.reopened_at is not null and old.reopened_at is null then
    perform public.record_audit_event(
      new.company_id, 'PAYROLL_REOPENED', 'payroll_period', new.period_id,
      to_char(month, 'MM/YYYY'),
      jsonb_build_object('sequence', new.sequence, 'reason', new.reopen_reason));
  end if;
  return null;
end;
$$;

drop trigger if exists payroll_releases_audit on public.payroll_period_releases;
create trigger payroll_releases_audit
  after insert or update of reopened_at on public.payroll_period_releases
  for each row execute function public.audit_payroll_release();

-- ---------------------------------------------------------------------------
-- 7. Lesen
-- ---------------------------------------------------------------------------
--
-- Eine Zeitleiste, zwei Quellen. Die nachtraegliche Korrektur einer
-- Arbeitszeit steht schon in `time_entry_audit_logs`, mit Vorher, Nachher und
-- Begruendung. Sie dorthin zu kopieren waere eine zweite Wahrheit; hier wird
-- sie nur mitgelesen.

create or replace function public.list_audit_events(
  p_from timestamptz default (now() - interval '90 days'),
  p_to timestamptz default now()
)
returns table (
  occurred_at timestamptz,
  action text,
  actor_name text,
  subject_type text,
  subject_id uuid,
  subject_label text,
  detail jsonb
)
language sql stable security definer set search_path = public as $$
  with actor as (
    select member.company_id
    from public.company_members member
    join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = auth.uid()
      and member.status = 'ACTIVE'
      and member.role in ('OWNER', 'OFFICE')
    limit 1
  )
  select
    event.occurred_at,
    event.action,
    event.actor_name,
    event.subject_type,
    event.subject_id,
    event.subject_label,
    event.detail
  from actor
  join public.audit_events event on event.company_id = actor.company_id
  where event.occurred_at between p_from and p_to

  union all

  select
    log.changed_at,
    'TIME_ENTRY_CORRECTED',
    nullif(trim(coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '')), ''),
    'time_entry',
    log.time_entry_id,
    to_char(log.new_started_at at time zone 'Europe/Berlin', 'DD.MM.YYYY'),
    jsonb_build_object(
      'reason', log.reason,
      'previous_started_at', log.previous_started_at,
      'previous_finished_at', log.previous_finished_at,
      'new_started_at', log.new_started_at,
      'new_finished_at', log.new_finished_at
    )
  from actor
  join public.time_entry_audit_logs log on log.company_id = actor.company_id
  left join public.profiles profile on profile.id = log.changed_by
  where log.changed_at between p_from and p_to

  order by 1 desc
  limit 500;
$$;

revoke all on function public.list_audit_events(timestamptz, timestamptz) from public, anon;
grant execute on function public.list_audit_events(timestamptz, timestamptz) to authenticated;
