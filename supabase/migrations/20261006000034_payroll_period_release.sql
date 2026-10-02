-- Monatsabschluss mit Freigabe.
--
-- Bisher war der Monatsabschluss eine Ansicht: er rechnete bei jedem Aufruf neu.
-- Damit liess sich eine Arbeitszeit noch aendern, nachdem die CSV beim
-- Lohnbuero lag -- der naechste Export ergab andere Zahlen als der erste, und
-- niemand konnte sagen, welche gezahlt wurden.
--
-- Eine Freigabe friert deshalb beide Bloecke der CSV ein: die Summen je
-- Mitarbeiterin und den Tagesnachweis nach § 17 MiLoG. Der Export eines
-- freigegebenen Monats liest diesen Abzug, er rechnet nicht neu. Danach
-- verweigert die Datenbank jede Aenderung an den Zeiten dieses Monats.
--
-- Korrigieren bleibt moeglich, aber nicht still: der Monat wird mit Begruendung
-- wieder geoeffnet, korrigiert und erneut freigegeben. Jede Freigabe bleibt
-- erhalten, der erste Export ist also weiterhin nachvollziehbar.

create table if not exists public.payroll_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  -- Immer der Monatserste, damit ein Monat nur einmal vorkommt.
  period date not null,
  status text not null default 'OPEN' check (status in ('OPEN', 'RELEASED')),
  created_at timestamptz not null default now(),
  unique (company_id, period),
  check (period = date_trunc('month', period)::date)
);

create table if not exists public.payroll_period_releases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  period_id uuid not null references public.payroll_periods(id) on delete cascade,
  -- 1 fuer die erste Freigabe, 2 fuer die nach einer Korrektur, und so weiter.
  sequence integer not null,
  released_at timestamptz not null default now(),
  released_by uuid not null references public.company_members(id) on delete restrict,
  -- Die beiden Bloecke der CSV, wie sie im Moment der Freigabe aussahen.
  summary jsonb not null,
  days jsonb not null,
  reopened_at timestamptz,
  reopened_by uuid references public.company_members(id) on delete restrict,
  reopen_reason text check (reopen_reason is null or char_length(trim(reopen_reason)) between 3 and 1000),
  unique (period_id, sequence)
);

create index if not exists payroll_releases_period_idx
  on public.payroll_period_releases (period_id, sequence desc);

comment on table public.payroll_periods is
  'Der Stand eines Lohnmonats je Betrieb: offen oder freigegeben.';
comment on table public.payroll_period_releases is
  'Jede Freigabe mit ihrem eingefrorenen Abzug. Macht einen frueheren Lohnexport reproduzierbar.';

alter table public.payroll_periods enable row level security;
alter table public.payroll_period_releases enable row level security;

create policy "staff read payroll periods" on public.payroll_periods
  for select to authenticated using (public.is_company_staff(company_id));
create policy "staff read payroll releases" on public.payroll_period_releases
  for select to authenticated using (public.is_company_staff(company_id));

-- Geschrieben wird ausschliesslich ueber die Funktionen unten.
revoke all on public.payroll_periods from anon, authenticated;
revoke all on public.payroll_period_releases from anon, authenticated;
grant select on public.payroll_periods to authenticated;
grant select on public.payroll_period_releases to authenticated;

/**
 * Ist der Lohnmonat, in den dieser Tag faellt, freigegeben?
 *
 * Der Tag wird in Berliner Zeit bestimmt, wie ueberall im Monatsabschluss:
 * eine Schicht, die um 23:30 beginnt, gehoert zu diesem Tag, nicht zum
 * naechsten UTC-Tag.
 */
create or replace function public.is_payroll_month_released(p_company uuid, p_day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.payroll_periods period
    where period.company_id = p_company
      and period.period = date_trunc('month', p_day)::date
      and period.status = 'RELEASED'
  );
$$;

/*
 * Die Sperre selbst.
 *
 * Bewusst ein Trigger und keine Pruefung in den Funktionen: es gibt mehrere
 * Wege, eine Zeit zu schreiben (Start, Stopp, nachgetragene Buchung,
 * Korrektur), und ein neuer Weg wuerde die Pruefung sonst schlicht vergessen.
 * An der Tabelle kommt niemand vorbei.
 */
create or replace function public.guard_released_time_entry()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  affected record;
begin
  for affected in
    select company_id, (started_at at time zone 'Europe/Berlin')::date as day
    from (select new.company_id, new.started_at where tg_op in ('INSERT','UPDATE')
          union all
          select old.company_id, old.started_at where tg_op in ('UPDATE','DELETE')) as rows(company_id, started_at)
  loop
    if public.is_payroll_month_released(affected.company_id, affected.day) then
      raise exception 'Der Monat % ist bereits zur Lohnabrechnung freigegeben. Zum Korrigieren den Monat erst wieder oeffnen.',
        to_char(affected.day, 'MM/YYYY');
    end if;
  end loop;
  return coalesce(new, old);
end;
$$;

drop trigger if exists job_time_entries_payroll_lock on public.job_time_entries;
create trigger job_time_entries_payroll_lock
  before insert or update or delete on public.job_time_entries
  for each row execute procedure public.guard_released_time_entry();

/* Pausen aendern die Nettozeit, also gilt fuer sie dasselbe. */
create or replace function public.guard_released_time_break()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  entry public.job_time_entries;
begin
  select * into entry from public.job_time_entries
  where id = coalesce(new.time_entry_id, old.time_entry_id);
  if entry.id is not null
     and public.is_payroll_month_released(
       entry.company_id, (entry.started_at at time zone 'Europe/Berlin')::date) then
    raise exception 'Der Monat % ist bereits zur Lohnabrechnung freigegeben. Zum Korrigieren den Monat erst wieder oeffnen.',
      to_char((entry.started_at at time zone 'Europe/Berlin')::date, 'MM/YYYY');
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists job_time_breaks_payroll_lock on public.job_time_breaks;
create trigger job_time_breaks_payroll_lock
  before insert or update or delete on public.job_time_breaks
  for each row execute procedure public.guard_released_time_break();

/**
 * Den Monat zur Lohnabrechnung freigeben.
 *
 * Nur ein beendeter Monat: die laufenden Zahlen enden heute, ein jetzt
 * eingefrorener laufender Monat waere ein halber Monat, der aussieht wie ein
 * ganzer.
 */
create or replace function public.release_payroll_period(p_month date)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  first_day date := date_trunc('month', p_month)::date;
  last_day date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  target_period public.payroll_periods;
  target_id uuid;
  next_sequence integer;
  release_id uuid;
  frozen_summary jsonb;
  frozen_days jsonb;
begin
  select * into actor from public.current_company_member()
  where role in ('OWNER','OFFICE') and status = 'ACTIVE';
  if actor.id is null then raise exception 'Payroll release requires OWNER or OFFICE'; end if;

  if last_day >= (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Der Monat % ist noch nicht vorbei und kann noch nicht freigegeben werden.',
      to_char(first_day, 'MM/YYYY');
  end if;

  select * into target_period from public.payroll_periods
  where company_id = actor.company_id and payroll_periods.period = first_day
  for update;

  if target_period.id is not null and target_period.status = 'RELEASED' then
    raise exception 'Der Monat % ist bereits freigegeben.', to_char(first_day, 'MM/YYYY');
  end if;

  if target_period.id is null then
    insert into public.payroll_periods (company_id, period, status)
    values (actor.company_id, first_day, 'RELEASED')
    returning id into target_id;
  else
    update public.payroll_periods set status = 'RELEASED'
    where id = target_period.id
    returning id into target_id;
  end if;

  select coalesce(max(release.sequence), 0) + 1 into next_sequence
  from public.payroll_period_releases release
  where release.period_id = target_id;

  -- Beide Bloecke der CSV, wie sie jetzt aussehen. Der Export eines
  -- freigegebenen Monats liest genau das und rechnet nicht neu.
  select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb) into frozen_summary
  from public.list_monthly_work_summary(first_day) row;

  select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb) into frozen_days
  from public.list_monthly_work_days(first_day, null) row;

  insert into public.payroll_period_releases (
    company_id, period_id, sequence, released_by, summary, days)
  values (actor.company_id, target_id, next_sequence, actor.id, frozen_summary, frozen_days)
  returning id into release_id;

  return release_id;
end;
$$;

/**
 * Den Monat wieder oeffnen, um zu korrigieren.
 *
 * Nur die Inhaberin, und nur mit Begruendung: einen bereits abgerechneten Monat
 * wieder aufzumachen ist eine Entscheidung, keine Routine. Die bisherige
 * Freigabe bleibt mit ihrem Abzug stehen, damit der Export von damals
 * nachvollziehbar bleibt.
 */
create or replace function public.reopen_payroll_period(p_month date, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  first_day date := date_trunc('month', p_month)::date;
  -- Nicht "period" nennen: so heisst die Spalte, und plpgsql kann die beiden
  -- in einer where-Klausel nicht auseinanderhalten.
  target_period public.payroll_periods;
begin
  select * into actor from public.current_company_member()
  where role = 'OWNER' and status = 'ACTIVE';
  if actor.id is null then raise exception 'Only the OWNER may reopen a released payroll month'; end if;

  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'Fuer das Wiederoeffnen wird eine Begruendung benoetigt.';
  end if;

  select * into target_period from public.payroll_periods
  where company_id = actor.company_id and payroll_periods.period = first_day
  for update;

  if target_period.id is null or target_period.status <> 'RELEASED' then
    raise exception 'Der Monat % ist nicht freigegeben.', to_char(first_day, 'MM/YYYY');
  end if;

  update public.payroll_period_releases release
  set reopened_at = now(), reopened_by = actor.id, reopen_reason = trim(p_reason)
  where release.period_id = target_period.id and release.reopened_at is null;

  update public.payroll_periods set status = 'OPEN' where id = target_period.id;
end;
$$;

/** Der Stand eines Monats, fuer die Oberflaeche. */
create or replace function public.payroll_period_state(p_month date)
returns table (
  status text,
  released_at timestamptz,
  released_by_name text,
  sequence integer,
  reopened_at timestamptz,
  reopen_reason text
)
language sql
stable
security definer
set search_path = public
as $$
  with target as (
    select period.id, period.status
    from public.payroll_periods period
    where period.period = date_trunc('month', p_month)::date
      and public.is_company_staff(period.company_id)
  )
  select
    coalesce(target.status, 'OPEN'),
    release.released_at,
    nullif(trim(concat_ws(' ', profile.first_name, profile.last_name)), ''),
    release.sequence,
    release.reopened_at,
    release.reopen_reason
  from (select 1) placeholder
  left join target on true
  left join lateral (
    select * from public.payroll_period_releases
    where period_id = target.id
    order by sequence desc limit 1
  ) release on true
  left join public.company_members member on member.id = release.released_by
  left join public.profiles profile on profile.id = member.profile_id;
$$;

/**
 * Der eingefrorene Abzug eines freigegebenen Monats.
 *
 * Ohne Angabe die letzte Freigabe; mit `p_sequence` eine fruehere, damit sich
 * genau die CSV von damals noch einmal erzeugen laesst.
 */
create or replace function public.payroll_release_figures(p_month date, p_sequence integer default null)
returns table (sequence integer, released_at timestamptz, summary jsonb, days jsonb)
language sql
stable
security definer
set search_path = public
as $$
  select release.sequence, release.released_at, release.summary, release.days
  from public.payroll_period_releases release
  join public.payroll_periods period on period.id = release.period_id
  where period.period = date_trunc('month', p_month)::date
    and public.is_company_staff(period.company_id)
    and (p_sequence is null or release.sequence = p_sequence)
  order by release.sequence desc
  limit 1;
$$;

revoke all on function
  public.release_payroll_period(date),
  public.reopen_payroll_period(date, text),
  public.payroll_period_state(date),
  public.payroll_release_figures(date, integer),
  public.is_payroll_month_released(uuid, date)
from public, anon;

grant execute on function
  public.release_payroll_period(date),
  public.reopen_payroll_period(date, text),
  public.payroll_period_state(date),
  public.payroll_release_figures(date, integer)
to authenticated;
