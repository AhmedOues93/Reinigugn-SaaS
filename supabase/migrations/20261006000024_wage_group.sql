-- Lohngruppe und Stundenlohn je Mitarbeiter.
--
-- Bisher gab es nur einen firmenweiten Satz in den Unternehmenseinstellungen.
-- Der dient der Angebotskalkulation und sagt nichts darueber, was eine
-- bestimmte Person kostet. Im Gebaeudereinigerhandwerk gilt ein
-- Branchenmindestlohn nach Lohngruppen — Innen- und Unterhaltsreinigung wird
-- anders verguetet als Glas- und Fassadenreinigung — und ohne diesen Wert je
-- Person laesst sich nicht sagen, ob ein Objekt Geld verdient oder kostet.
--
-- Die Lohngruppe bleibt Text und ist keine Aufzaehlung: Tarife aendern sich,
-- und eine feste Liste in der Datenbank waere bei jeder Tarifrunde eine
-- Migration. Die Oberflaeche schlaegt die ueblichen Gruppen vor und laesst
-- abweichende Angaben zu.
--
-- Hier wird nichts abgerechnet. Der Satz ist eine Kostenangabe fuer die
-- Nachkalkulation, keine Lohnabrechnung: Steuern, Sozialabgaben und Zuschlaege
-- bleiben beim Lohnbuero.

alter table public.employee_details
  add column if not exists wage_group text,
  add column if not exists hourly_wage_cents integer;

alter table public.company_invitations
  add column if not exists wage_group text,
  add column if not exists hourly_wage_cents integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'employee_details_wage_check') then
    alter table public.employee_details
      add constraint employee_details_wage_check
      check (
        (wage_group is null or char_length(trim(wage_group)) between 1 and 40)
        and (hourly_wage_cents is null or (hourly_wage_cents >= 0 and hourly_wage_cents <= 100000))
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'company_invitations_wage_check') then
    alter table public.company_invitations
      add constraint company_invitations_wage_check
      check (
        (wage_group is null or char_length(trim(wage_group)) between 1 and 40)
        and (hourly_wage_cents is null or (hourly_wage_cents >= 0 and hourly_wage_cents <= 100000))
      );
  end if;
end $$;

comment on column public.employee_details.wage_group is
  'Tarifliche Lohngruppe, z. B. LG 1 fuer Unterhaltsreinigung. Frei, weil Tarife sich aendern.';
comment on column public.employee_details.hourly_wage_cents is
  'Stundenlohn in Cent. Kostenangabe fuer die Nachkalkulation, keine Lohnabrechnung.';

-- Die alte Signatur wird ausdruecklich entfernt. `create or replace function`
-- loest auf die Argumentliste auf: eine zusaetzliche Spalte haette eine zweite
-- Ueberladung neben der alten angelegt, und jeder Aufruf mit Vorgabewerten
-- waere mehrdeutig geworden. Genau daran ist in diesem Projekt schon einmal
-- die gesamte Migrationspruefung gescheitert.
drop function if exists public.set_employee_master_data(
  uuid, text, numeric, date, date, public.employment_type, text, text
);

create or replace function public.set_employee_master_data(
  p_member_id uuid,
  p_employee_number text,
  p_weekly_hours numeric,
  p_employment_start_date date,
  p_employment_end_date date,
  p_employment_type public.employment_type,
  p_preferred_language text,
  p_notes text,
  p_wage_group text default null,
  p_hourly_wage_cents integer default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare target public.company_members;
begin
  if not public.can_manage_company_member(p_member_id) then raise exception 'Not permitted to edit this member'; end if;
  if p_weekly_hours is not null and (p_weekly_hours < 0 or p_weekly_hours > 168) then raise exception 'Invalid weekly hours'; end if;
  if p_employment_end_date is not null and p_employment_start_date is not null and p_employment_end_date < p_employment_start_date then raise exception 'Employment end precedes start'; end if;
  if not public.is_supported_locale(p_preferred_language) then raise exception 'Invalid language'; end if;
  if p_hourly_wage_cents is not null and (p_hourly_wage_cents < 0 or p_hourly_wage_cents > 100000) then
    raise exception 'Invalid hourly wage';
  end if;

  select * into target from public.company_members where id = p_member_id for update;
  if target.id is null then raise exception 'Member not found'; end if;

  if target.profile_id is null then
    update public.company_invitations
    set employee_number = nullif(trim(p_employee_number), ''), weekly_hours = p_weekly_hours,
        employment_start_date = p_employment_start_date, employment_end_date = p_employment_end_date,
        employment_type = p_employment_type, preferred_language = p_preferred_language,
        notes = nullif(trim(p_notes), ''),
        wage_group = nullif(trim(p_wage_group), ''), hourly_wage_cents = p_hourly_wage_cents
    where member_id = target.id and accepted_at is null and revoked_at is null;
  else
    insert into public.employee_details (company_id, profile_id, employee_number, weekly_hours,
                                         employment_start_date, employment_end_date, employment_type,
                                         preferred_language, notes, is_active, wage_group, hourly_wage_cents)
    values (target.company_id, target.profile_id, nullif(trim(p_employee_number), ''), p_weekly_hours,
            p_employment_start_date, p_employment_end_date, p_employment_type, p_preferred_language,
            nullif(trim(p_notes), ''), target.status = 'ACTIVE',
            nullif(trim(p_wage_group), ''), p_hourly_wage_cents)
    on conflict (company_id, profile_id) do update set
      employee_number = excluded.employee_number, weekly_hours = excluded.weekly_hours,
      employment_start_date = excluded.employment_start_date, employment_end_date = excluded.employment_end_date,
      employment_type = excluded.employment_type, preferred_language = excluded.preferred_language,
      notes = excluded.notes, wage_group = excluded.wage_group, hourly_wage_cents = excluded.hourly_wage_cents;
  end if;
  return target.id;
end;
$$;

revoke all on function public.set_employee_master_data(
  uuid, text, numeric, date, date, public.employment_type, text, text, text, integer
) from public, anon;
grant execute on function public.set_employee_master_data(
  uuid, text, numeric, date, date, public.employment_type, text, text, text, integer
) to authenticated;

-- Der Monatsabschluss zeigt die Lohngruppe mit, damit das Lohnbuero die Zeile
-- ohne Rueckfrage zuordnen kann. Der Stundenlohn bleibt bewusst draussen: er
-- gehoert in die Nachkalkulation, nicht auf eine Stundenuebersicht, die im
-- Buero offen auf dem Bildschirm steht.
--
-- Gleiche Argumentliste wie bisher, also keine zweite Ueberladung. Die
-- Rueckgabespalten aendern sich aber, und das verlangt PostgreSQL ausdruecklich
-- ein DROP vorweg — `create or replace` allein wird abgelehnt.
drop function if exists public.list_monthly_work_summary(date);

create or replace function public.list_monthly_work_summary(p_month date)
returns table (
  member_id uuid,
  employee_name text,
  employee_number text,
  wage_group text,
  weekly_hours numeric,
  worked_minutes integer,
  break_minutes integer,
  days_worked integer,
  vacation_days integer,
  sick_days integer,
  target_minutes integer
) language sql stable security definer set search_path = public as $$
  select
    member.id,
    trim(coalesce(profile.first_name, '') || ' ' || coalesce(profile.last_name, '')),
    detail.employee_number,
    detail.wage_group,
    detail.weekly_hours,
    figures.worked_minutes,
    figures.break_minutes,
    figures.days_worked,
    figures.vacation_days,
    figures.sick_days,
    figures.target_minutes
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  left join public.employee_details detail
    on detail.profile_id = member.profile_id and detail.company_id = member.company_id
  cross join lateral public.member_month_figures(member.id, p_month) figures
  where public.is_company_staff(member.company_id)
    and member.role = 'EMPLOYEE'
    and member.status = 'ACTIVE'
  order by 2;
$$;

revoke all on function public.list_monthly_work_summary(date) from public, anon;
grant execute on function public.list_monthly_work_summary(date) to authenticated;
