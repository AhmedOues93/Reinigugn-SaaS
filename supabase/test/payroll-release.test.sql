-- Monatsabschluss mit Freigabe. Run with supabase/test/run.sh.
--
-- Der Fehler, den diese Suite festhaelt: der Monatsabschluss rechnete bei jedem
-- Aufruf neu. Eine Arbeitszeit liess sich also noch aendern, nachdem die CSV
-- beim Lohnbuero lag -- der naechste Export ergab andere Zahlen als der erste.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;

create or replace function pg_temp.sign_in(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set role authenticated;
end; $$;
create or replace function pg_temp.sign_out() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', true); end; $$;
create or replace function pg_temp.assert(p_condition boolean, p_message text) returns void language plpgsql as $$
begin if not p_condition then raise exception 'ASSERTION FAILED: %', p_message; end if; end; $$;

insert into auth.users (id, email) values
  ('c1100000-0000-4000-8000-000000000001', 'inhaberin@lohn.test'),
  ('c1100000-0000-4000-8000-000000000002', 'buero@lohn.test'),
  ('c1100000-0000-4000-8000-000000000003', 'nachbarin@lohn.test'),
  ('c1100000-0000-4000-8000-000000000011', 'kraft@lohn.test');

select pg_temp.sign_in('c1100000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Lohnreinigung GmbH');
select pg_temp.sign_in('c1100000-0000-4000-8000-000000000003');
select public.create_company_for_current_user('Nachbar Lohn GmbH');
select pg_temp.sign_out();

create temporary table ctx as select
  (select id from public.companies where name = 'Lohnreinigung GmbH') as company,
  (select id from public.companies where name = 'Nachbar Lohn GmbH') as other_company,
  -- Der Vormonat ist vorbei und damit freigebbar.
  (date_trunc('month', current_date - interval '1 month'))::date as closed_month,
  (date_trunc('month', current_date))::date as running_month;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select ctx.company, profile.id, 'OFFICE', 'ACTIVE'
from ctx, public.profiles profile where profile.auth_user_id = 'c1100000-0000-4000-8000-000000000002';
insert into public.company_members (company_id, profile_id, role, status)
select ctx.company, profile.id, 'EMPLOYEE', 'ACTIVE'
from ctx, public.profiles profile where profile.auth_user_id = 'c1100000-0000-4000-8000-000000000011';
insert into public.employee_details (company_id, profile_id, weekly_hours, is_active, employee_number)
select ctx.company, profile.id, 40, true, 'M-0001'
from ctx, public.profiles profile where profile.auth_user_id = 'c1100000-0000-4000-8000-000000000011';

insert into public.customers (company_id, name) select company, 'Kundin Lohn' from ctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company, customer.id, 'Objekt Lohn'
from ctx join public.customers customer on customer.company_id = ctx.company;

create temporary table ids as select
  (select member.id from public.company_members member
     join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'c1100000-0000-4000-8000-000000000011') as kraft;
grant select on ids to authenticated;

-- Eine gearbeitete Schicht im abgeschlossenen Monat: vier Stunden.
create or replace function pg_temp.shift(p_day date, p_hours integer) returns uuid language plpgsql as $$
declare job_id uuid; entry_id uuid;
begin
  insert into public.jobs (company_id, customer_id, cleaning_object_id, title, scheduled_date,
                           planned_start_at, planned_end_at, status)
  select ctx.company, customer.id, object.id, 'Unterhaltsreinigung', p_day,
    (p_day + time '08:00') at time zone 'Europe/Berlin',
    (p_day + time '12:00') at time zone 'Europe/Berlin', 'COMPLETED'
  from ctx
  join public.customers customer on customer.company_id = ctx.company
  join public.cleaning_objects object on object.company_id = ctx.company
  returning id into job_id;

  insert into public.job_assignments (company_id, job_id, member_id)
  select ctx.company, job_id, ids.kraft from ctx, ids;

  insert into public.job_time_entries (company_id, job_id, member_id, started_at, finished_at)
  select ctx.company, job_id, ids.kraft,
    (p_day + time '08:00') at time zone 'Europe/Berlin',
    (p_day + time '08:00') at time zone 'Europe/Berlin' + make_interval(hours => p_hours)
  from ctx, ids
  returning id into entry_id;
  return entry_id;
end; $$;

create temporary table shifts as
select pg_temp.shift((select closed_month from ctx) + 1, 4) as entry_a,
       pg_temp.shift((select closed_month from ctx) + 2, 4) as entry_b;
grant select on shifts to authenticated;

select pg_temp.assert(
  (select worked_minutes from public.member_month_figures(
     (select kraft from ids), (select closed_month from ctx))) = 480,
  'der Monat enthaelt die beiden Schichten mit zusammen acht Stunden');

-- ---------------------------------------------------------------------------
-- Ein laufender Monat wird nicht freigegeben.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('c1100000-0000-4000-8000-000000000001');
do $$
begin
  begin
    perform public.release_payroll_period((select running_month from ctx));
    raise exception 'NOT REJECTED: ein laufender Monat wurde freigegeben';
  exception when others then
    if position('noch nicht vorbei' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Freigabe: der Abzug wird eingefroren.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('c1100000-0000-4000-8000-000000000002');
select public.release_payroll_period((select closed_month from ctx));
select pg_temp.sign_out();

select pg_temp.assert(
  (select status from public.payroll_periods
    where company_id = (select company from ctx) and period = (select closed_month from ctx)) = 'RELEASED',
  'der Monat steht auf freigegeben');

select pg_temp.sign_in('c1100000-0000-4000-8000-000000000002');
create temporary table first_release as
select * from public.payroll_release_figures((select closed_month from ctx), null);
select pg_temp.sign_out();
grant select on first_release to authenticated;

select pg_temp.assert(
  (select (summary->0->>'worked_minutes')::integer from first_release) = 480,
  'der eingefrorene Abzug traegt die acht Stunden');
select pg_temp.assert(
  (select jsonb_array_length(days) from first_release) = 2,
  'der Tagesnachweis nach § 17 MiLoG ist mit eingefroren');
select pg_temp.assert(
  (select sequence from first_release) = 1,
  'die erste Freigabe traegt die Nummer eins');

-- Zweimal freigeben geht nicht.
select pg_temp.sign_in('c1100000-0000-4000-8000-000000000002');
do $$
begin
  begin
    perform public.release_payroll_period((select closed_month from ctx));
    raise exception 'NOT REJECTED: derselbe Monat wurde zweimal freigegeben';
  exception when others then
    if position('bereits freigegeben' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Die Sperre. Das ist der Kern.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('c1100000-0000-4000-8000-000000000002');
do $$
begin
  begin
    perform public.correct_time_entry(
      (select entry_a from shifts),
      ((select closed_month from ctx) + 1 + time '08:00') at time zone 'Europe/Berlin',
      ((select closed_month from ctx) + 1 + time '18:00') at time zone 'Europe/Berlin',
      'Nachtraeglich mehr Stunden');
    raise exception 'NOT REJECTED: eine Zeit im freigegebenen Monat wurde korrigiert';
  exception when others then
    if position('freigegeben' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

select pg_temp.assert(
  (select worked_minutes from public.member_month_figures(
     (select kraft from ids), (select closed_month from ctx))) = 480,
  'die Zeiten des freigegebenen Monats sind unveraendert');

-- Auch eine neue Buchung und eine geloeschte Pause werden abgewiesen.
do $$
begin
  begin
    insert into public.job_time_entries (company_id, job_id, member_id, started_at, finished_at)
    select ctx.company, job.id, ids.kraft,
      ((select closed_month from ctx) + 5 + time '08:00') at time zone 'Europe/Berlin',
      ((select closed_month from ctx) + 5 + time '12:00') at time zone 'Europe/Berlin'
    from ctx, ids, public.jobs job where job.company_id = ctx.company limit 1;
    raise exception 'NOT REJECTED: eine neue Zeit wurde in den freigegebenen Monat gebucht';
  exception when others then
    if position('freigegeben' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    delete from public.job_time_entries where id = (select entry_b from shifts);
    raise exception 'NOT REJECTED: eine Zeit im freigegebenen Monat wurde geloescht';
  exception when others then
    if position('freigegeben' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- Ein anderer Monat bleibt offen und beschreibbar.
select pg_temp.assert(
  (select pg_temp.shift((select running_month from ctx) + 1, 3)) is not null,
  'ein nicht freigegebener Monat nimmt weiterhin Zeiten an');

-- ---------------------------------------------------------------------------
-- Wiederoeffnen: nur die Inhaberin, nur mit Begruendung, und nachvollziehbar.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('c1100000-0000-4000-8000-000000000002');
do $$
begin
  begin
    perform public.reopen_payroll_period((select closed_month from ctx), 'Korrektur noetig');
    raise exception 'NOT REJECTED: das Buero hat einen freigegebenen Monat geoeffnet';
  exception when others then
    if position('OWNER' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

select pg_temp.sign_in('c1100000-0000-4000-8000-000000000001');
do $$
begin
  begin
    perform public.reopen_payroll_period((select closed_month from ctx), 'ok');
    raise exception 'NOT REJECTED: ohne Begruendung wiedergeoeffnet';
  exception when others then
    if position('Begruendung' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select public.reopen_payroll_period((select closed_month from ctx), 'Vergessene Krankmeldung nachgetragen');
select pg_temp.sign_out();

select pg_temp.assert(
  (select status from public.payroll_periods
    where company_id = (select company from ctx) and period = (select closed_month from ctx)) = 'OPEN',
  'nach dem Wiederoeffnen ist der Monat offen');
select pg_temp.assert(
  (select reopen_reason from public.payroll_period_releases
    where sequence = 1 and company_id = (select company from ctx)) = 'Vergessene Krankmeldung nachgetragen',
  'der Grund steht an der Freigabe, die aufgehoben wurde');

-- Jetzt laesst sich korrigieren.
select pg_temp.sign_in('c1100000-0000-4000-8000-000000000002');
select public.correct_time_entry(
  (select entry_a from shifts),
  ((select closed_month from ctx) + 1 + time '08:00') at time zone 'Europe/Berlin',
  ((select closed_month from ctx) + 1 + time '14:00') at time zone 'Europe/Berlin',
  'Zwei Stunden waren nicht erfasst');
select public.release_payroll_period((select closed_month from ctx));
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Reproduzierbarkeit: die erste CSV bleibt, was sie war.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('c1100000-0000-4000-8000-000000000002');
select pg_temp.assert(
  (select (summary->0->>'worked_minutes')::integer
     from public.payroll_release_figures((select closed_month from ctx), 1)) = 480,
  'die erste Freigabe liefert weiterhin die Zahlen von damals');
select pg_temp.assert(
  (select (summary->0->>'worked_minutes')::integer
     from public.payroll_release_figures((select closed_month from ctx), null)) = 600,
  'die neue Freigabe traegt die korrigierten zehn Stunden');
select pg_temp.assert(
  (select sequence from public.payroll_release_figures((select closed_month from ctx), null)) = 2,
  'die zweite Freigabe traegt die Nummer zwei');
select pg_temp.assert(
  (select count(*) from public.payroll_period_releases
    where company_id = (select company from ctx)) = 2,
  'beide Freigaben bleiben erhalten');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Mandantentrennung und Rollen.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('c1100000-0000-4000-8000-000000000003');
select pg_temp.assert(
  (select count(*) from public.payroll_periods) = 0,
  'der Nachbarbetrieb sieht den Lohnmonat nicht');
select pg_temp.assert(
  (select count(*) from public.payroll_period_releases) = 0,
  'der Nachbarbetrieb sieht die Freigaben nicht');
select pg_temp.assert(
  (select count(*) from public.payroll_release_figures((select closed_month from ctx), null)) = 0,
  'und bekommt auch ueber die Funktion keinen Abzug');
select pg_temp.sign_out();

select pg_temp.sign_in('c1100000-0000-4000-8000-000000000011');
do $$
begin
  begin
    perform public.release_payroll_period((select closed_month from ctx));
    raise exception 'NOT REJECTED: eine Mitarbeiterin hat den Lohnmonat freigegeben';
  exception when others then
    if position('OWNER or OFFICE' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.assert(
  (select count(*) from public.payroll_periods) = 0,
  'eine Mitarbeiterin sieht die Lohnmonate nicht');
select pg_temp.sign_out();

rollback;
\o
\echo 'Monatsabschluss mit Freigabe: all assertions passed'
