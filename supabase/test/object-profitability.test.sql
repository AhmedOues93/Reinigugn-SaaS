-- Objektrentabilitaet. Run with supabase/test/run.sh.
--
-- Jede Zahl hier ist von Hand gerechnet. Eine Marge, die niemand nachrechnen
-- kann, wird trotzdem zur Grundlage einer Kuendigung.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;

create or replace function pg_temp.sign_in(p_user uuid) returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', p_user::text, true); set role authenticated; end; $$;
create or replace function pg_temp.sign_out() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', true); end; $$;
create or replace function pg_temp.assert(c boolean, m text) returns void language plpgsql as $$
begin if not c then raise exception 'ASSERTION FAILED: %', m; end if; end; $$;

insert into auth.users (id, email) values
  ('a5500000-0000-4000-8000-000000000001', 'inhaberin@rendite.test'),
  ('a5500000-0000-4000-8000-000000000002', 'teuer@rendite.test'),
  ('a5500000-0000-4000-8000-000000000003', 'ohne-lohn@rendite.test'),
  ('a5500000-0000-4000-8000-000000000004', 'nachbarin@rendite.test');

select pg_temp.sign_in('a5500000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Rendite GmbH');
select pg_temp.sign_in('a5500000-0000-4000-8000-000000000004');
select public.create_company_for_current_user('Nachbar Rendite GmbH');
select pg_temp.sign_out();

create temporary table rctx as select
  (select id from public.companies where name = 'Rendite GmbH') as company,
  (select id from public.companies where name = 'Nachbar Rendite GmbH') as other_company,
  (select id from public.profiles where auth_user_id = 'a5500000-0000-4000-8000-000000000002') as paid_profile,
  (select id from public.profiles where auth_user_id = 'a5500000-0000-4000-8000-000000000003') as unpaid_profile,
  date '2026-02-01' as window_from,
  date '2026-02-28' as window_to;
grant select on rctx to authenticated;

-- 20 Prozent Lohnnebenkosten, und ein Ruecklauf-Stundensatz fuer Konten ohne
-- eigenen Lohn -- hier bewusst null, damit der Fall "unbekannt" entsteht.
insert into public.company_calculation_defaults (company_id, wage_cents_per_hour, ancillary_rate_bp)
select company, 0, 2000 from rctx
on conflict (company_id) do update set wage_cents_per_hour = 0, ancillary_rate_bp = 2000;

insert into public.company_members (company_id, profile_id, role, status)
select company, paid_profile, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status from rctx
union all select company, unpaid_profile, 'EMPLOYEE', 'ACTIVE' from rctx;

-- 15,00 Euro die Stunde.
insert into public.employee_details (company_id, profile_id, employee_number, weekly_hours, hourly_wage_cents)
select company, paid_profile, 'R-001', 40, 1500 from rctx;
insert into public.employee_details (company_id, profile_id, employee_number, weekly_hours)
select company, unpaid_profile, 'R-002', 20 from rctx;

create temporary table rmem as select
  (select id from public.company_members where profile_id = (select paid_profile from rctx)) as paid,
  (select id from public.company_members where profile_id = (select unpaid_profile from rctx)) as unpaid;
grant select on rmem to authenticated;

insert into public.customers (company_id, name) select company, 'Renditekunde' from rctx;
create temporary table rcust as select id from public.customers where company_id = (select company from rctx);
grant select on rcust to authenticated;

insert into public.cleaning_objects (company_id, customer_id, name)
select (select company from rctx), (select id from rcust), name
from (values ('Gutes Objekt'), ('Objekt ohne Lohn'), ('Objekt ohne alles')) as o(name);

create temporary table robj as select
  (select id from public.cleaning_objects where name = 'Gutes Objekt') as good,
  (select id from public.cleaning_objects where name = 'Objekt ohne Lohn') as unpriced,
  (select id from public.cleaning_objects where name = 'Objekt ohne alles') as idle;
grant select on robj to authenticated;

insert into public.jobs
  (company_id, customer_id, cleaning_object_id, title, scheduled_date, planned_start_at, planned_end_at, status)
select (select company from rctx), (select id from rcust), (select good from robj), 'Einsatz gut', date '2026-02-10',
  timestamptz '2026-02-10 08:00+01', timestamptz '2026-02-10 16:00+01', 'COMPLETED'::public.job_status
union all
select (select company from rctx), (select id from rcust), (select unpriced from robj), 'Einsatz ohne Lohn', date '2026-02-11',
  timestamptz '2026-02-11 08:00+01', timestamptz '2026-02-11 16:00+01', 'COMPLETED'::public.job_status;

-- Acht Stunden der bezahlten Kraft am guten Objekt: 8 * 15,00 = 120,00 Euro,
-- plus 20 Prozent Lohnnebenkosten = 144,00 Euro = 14400 Cent.
insert into public.job_time_entries (company_id, job_id, member_id, started_at, finished_at)
select (select company from rctx), job.id, (select paid from rmem),
  timestamptz '2026-02-10 08:00+01', timestamptz '2026-02-10 16:00+01'
from public.jobs job where job.title = 'Einsatz gut';

-- Vier Stunden der Kraft ohne hinterlegten Lohn am anderen Objekt.
insert into public.job_time_entries (company_id, job_id, member_id, started_at, finished_at)
select (select company from rctx), job.id, (select unpaid from rmem),
  timestamptz '2026-02-11 08:00+01', timestamptz '2026-02-11 12:00+01'
from public.jobs job where job.title = 'Einsatz ohne Lohn';

-- Ein laufender Eintrag zaehlt nicht mit: er hat kein Ende.
insert into public.job_time_entries (company_id, job_id, member_id, started_at)
select (select company from rctx), job.id, (select paid from rmem), timestamptz '2026-02-12 08:00+01'
from public.jobs job where job.title = 'Einsatz gut';

select pg_temp.sign_in('a5500000-0000-4000-8000-000000000001');

-- Zwei Rechnungen: eine fuer den Einsatz am guten Objekt (240,00 Euro) und
-- eine fuer das Objekt ohne Lohn (100,00 Euro).
create temporary table rinv as select public.create_draft_invoice(
  (select id from rcust), date '2026-02-01', date '2026-02-28') as id;
grant select on rinv to authenticated;
select public.add_invoice_line((select id from rinv), 'Einsatz gut', 1, 'Einsatz', 24000, 1900,
  (select id from public.jobs where title = 'Einsatz gut'), null, (select good from robj));
select public.add_invoice_line((select id from rinv), 'Einsatz ohne Lohn', 1, 'Einsatz', 10000, 1900,
  (select id from public.jobs where title = 'Einsatz ohne Lohn'), null, (select unpriced from robj));

-- ---------------------------------------------------------------------------
-- Die Zahlen
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select revenue_cents = 24000 and worked_minutes = 480 and visits = 1
   from public.object_profitability((select window_from from rctx), (select window_to from rctx))
   where object_id = (select good from robj)),
  'Erloes, erfasste Zeit und Einsatzzahl am guten Objekt');
select pg_temp.assert(
  (select labour_cost_cents = 14400
   from public.object_profitability((select window_from from rctx), (select window_to from rctx))
   where object_id = (select good from robj)),
  'acht Stunden zu 15 Euro plus 20 Prozent Lohnnebenkosten sind 144 Euro');
select pg_temp.assert(
  (select margin_cents = 9600
   from public.object_profitability((select window_from from rctx), (select window_to from rctx))
   where object_id = (select good from robj)),
  '240 Euro minus 144 Euro sind 96 Euro Marge');
select pg_temp.assert(
  (select margin_bp = 4000
   from public.object_profitability((select window_from from rctx), (select window_to from rctx))
   where object_id = (select good from robj)),
  '96 von 240 sind 40 Prozent');

-- Der entscheidende Fall: ohne Stundensatz wird nichts geschaetzt.
select pg_temp.assert(
  (select labour_cost_cents is null and margin_cents is null and margin_bp is null
     and minutes_without_rate = 240 and worked_minutes = 240 and revenue_cents = 10000
   from public.object_profitability((select window_from from rctx), (select window_to from rctx))
   where object_id = (select unpriced from robj)),
  'ohne hinterlegten Stundenlohn bleibt die Marge unbekannt, nicht null Euro');

-- Ein Objekt ohne Erloes und ohne Arbeit ist keine Zeile wert.
select pg_temp.assert(
  (select count(*) from public.object_profitability((select window_from from rctx), (select window_to from rctx))
   where object_id = (select idle from robj)) = 0,
  'ein Objekt ohne Erloes und ohne Arbeit erscheint nicht');

-- Ein anderer Zeitraum zeigt nichts davon.
select pg_temp.assert(
  (select count(*) from public.object_profitability(date '2026-03-01', date '2026-03-31')) = 0,
  'ein Zeitraum ohne Leistung ist leer');

-- Die Zuordnung folgt dem Einsatz, nicht dem Rechnungsdatum: eine Rechnung
-- mit Leistungszeitraum Maerz, deren Einsatz im Februar lag, gehoert in den
-- Februar.
select pg_temp.assert(
  (select revenue_cents = 24000
   from public.object_profitability(date '2026-02-01', date '2026-02-28')
   where object_id = (select good from robj)),
  'der Erloes bleibt beim Monat des Einsatzes');

-- Eine stornierte Rechnung bringt keinen Erloes.
\ir fixtures/invoice-master-data.sql
select public.issue_invoice((select id from rinv));
select public.cancel_invoice((select id from rinv), 'Testweise storniert');
select pg_temp.assert(
  (select coalesce(revenue_cents, 0) = 0
   from public.object_profitability((select window_from from rctx), (select window_to from rctx))
   where object_id = (select good from robj)),
  'eine stornierte Rechnung zaehlt nicht als Erloes');
select pg_temp.assert(
  (select margin_cents = -14400
   from public.object_profitability((select window_from from rctx), (select window_to from rctx))
   where object_id = (select good from robj)),
  'die Kosten bleiben -- das Objekt macht jetzt Verlust');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Mandantentrennung und Berechtigung
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a5500000-0000-4000-8000-000000000004');
select pg_temp.assert(
  (select count(*) from public.object_profitability(date '2026-01-01', date '2026-12-31')) = 0,
  'die Nachbarin sieht keine fremde Rentabilitaet');
select pg_temp.sign_out();

select pg_temp.sign_in('a5500000-0000-4000-8000-000000000002');
select pg_temp.assert(
  (select count(*) from public.object_profitability(date '2026-01-01', date '2026-12-31')) = 0,
  'eine Mitarbeiterin sieht die Rentabilitaet des Betriebs nicht');
select pg_temp.sign_out();

rollback;
\o
\echo 'Objektrentabilitaet: all assertions passed'
