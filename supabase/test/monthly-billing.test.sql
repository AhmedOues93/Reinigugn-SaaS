-- Der Monatslauf (Sammelrechnung). Run with supabase/test/run.sh.
--
-- Was hier festgehalten wird: ein Lauf, der zweimal laeuft, darf nicht zweimal
-- abrechnen, und er darf keine gestellte Rechnung anfassen. Beides merkt man
-- sonst erst, wenn der Kunde anruft.
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
  ('f4400000-0000-4000-8000-000000000001', 'inhaberin@lauf.test'),
  ('f4400000-0000-4000-8000-000000000002', 'nachbarin@lauf.test');

select pg_temp.sign_in('f4400000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Lauf GmbH');
select pg_temp.sign_in('f4400000-0000-4000-8000-000000000002');
select public.create_company_for_current_user('Nachbar Lauf GmbH');
select pg_temp.sign_out();

-- Der Vormonat ist vorbei und damit abrechenbar.
create temporary table lctx as select
  (select id from public.companies where name = 'Lauf GmbH') as company,
  (select id from public.companies where name = 'Nachbar Lauf GmbH') as other_company,
  (date_trunc('month', current_date - interval '1 month'))::date as closed_month,
  (date_trunc('month', current_date))::date as running_month;
grant select on lctx to authenticated;

-- Drei Kunden: einer mit Pauschale pro Einsatz, einer mit Monatspauschale,
-- einer ohne hinterlegten Preis.
insert into public.customers (company_id, name) select company, 'Kunde Pauschale' from lctx;
insert into public.customers (company_id, name) select company, 'Kunde Monat' from lctx;
insert into public.customers (company_id, name) select company, 'Kunde ohne Preis' from lctx;
insert into public.customers (company_id, name) select company, 'Kunde ohne Arbeit' from lctx;

insert into public.cleaning_objects (company_id, customer_id, name)
select lctx.company, c.id, c.name || ' · Objekt'
from lctx join public.customers c on c.company_id = lctx.company;

insert into public.service_schedules
  (company_id, customer_id, cleaning_object_id, name, valid_from, billing_mode,
   billing_unit_price_cents, billing_vat_rate_basis_points)
select lctx.company, c.id, o.id, c.name || ' · Plan', lctx.closed_month - 60,
  case c.name when 'Kunde Monat' then 'MONATSPAUSCHALE'::public.billing_mode
              else 'PAUSCHALE_PRO_EINSATZ'::public.billing_mode end,
  case c.name when 'Kunde ohne Preis' then null
              when 'Kunde Monat' then 95000
              else 4800 end,
  1900
from lctx
join public.customers c on c.company_id = lctx.company
join public.cleaning_objects o on o.customer_id = c.id
where c.name <> 'Kunde ohne Arbeit';

-- Je zwei erledigte Einsaetze im abgeschlossenen Monat. Den Leistungsnachweis
-- legt der Trigger `jobs_build_service_record` selbst an -- ihn hier von Hand
-- einzufuegen wuerde an der Wirklichkeit vorbei testen.
insert into public.jobs
  (company_id, customer_id, cleaning_object_id, service_schedule_id, title,
   scheduled_date, planned_start_at, planned_end_at, status)
select lctx.company, c.id, o.id, s.id, 'Unterhaltsreinigung',
  lctx.closed_month + day,
  (lctx.closed_month + day + time '07:00') at time zone 'Europe/Berlin',
  (lctx.closed_month + day + time '10:00') at time zone 'Europe/Berlin',
  'COMPLETED'::public.job_status
from lctx
join public.customers c on c.company_id = lctx.company
join public.cleaning_objects o on o.customer_id = c.id
join public.service_schedules s on s.cleaning_object_id = o.id
cross join (values (0), (7)) as d(day)
where c.name <> 'Kunde ohne Arbeit';


-- ---------------------------------------------------------------------------
-- Die Vorschau schreibt nichts
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('f4400000-0000-4000-8000-000000000001');

select pg_temp.assert(
  (select count(*) from public.run_monthly_billing((select closed_month from lctx), true)) = 4,
  'die Vorschau zeigt jeden aktiven Kunden, auch den ohne Arbeit');
select pg_temp.assert(
  (select outcome = 'WOULD_CREATE' and lines_added = 2 and net_total_cents = 9600
   from public.run_monthly_billing((select closed_month from lctx), true)
   where customer_name = 'Kunde Pauschale'),
  'zwei Einsaetze zu 48 Euro ergeben 96 Euro');
select pg_temp.assert(
  (select outcome = 'WOULD_CREATE' and lines_added = 1 and net_total_cents = 95000
   from public.run_monthly_billing((select closed_month from lctx), true)
   where customer_name = 'Kunde Monat'),
  'die Monatspauschale ist eine Zeile, nicht zwei Einsaetze');
select pg_temp.assert(
  (select outcome = 'NO_PRICE' and lines_added = 0 and skipped_without_price = 2
     and reason like '%ohne hinterlegten Preis%'
   from public.run_monthly_billing((select closed_month from lctx), true)
   where customer_name = 'Kunde ohne Preis'),
  'ohne Preis wird nichts geraten, sondern gemeldet');
select pg_temp.assert(
  (select outcome = 'NOTHING_TO_BILL' and lines_added = 0
   from public.run_monthly_billing((select closed_month from lctx), true)
   where customer_name = 'Kunde ohne Arbeit'),
  'ein Kunde ohne Leistung wird genannt und nicht uebergangen');
select pg_temp.assert(
  (select count(*) from public.invoices where company_id = (select company from lctx)) = 0,
  'die Vorschau hat nichts geschrieben');

-- ---------------------------------------------------------------------------
-- Der Lauf schreibt genau einmal
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select count(*) from public.run_monthly_billing((select closed_month from lctx), false)
   where outcome = 'CREATED') = 2,
  'zwei Entwuerfe entstehen');
select pg_temp.assert(
  (select count(*) from public.invoices
   where company_id = (select company from lctx) and status = 'DRAFT') = 2,
  'und genau zwei Rechnungen liegen danach da');
select pg_temp.assert(
  (select count(*) from public.invoice_lines where company_id = (select company from lctx)) = 3,
  'zwei Einsatzzeilen und eine Monatszeile');
select pg_temp.assert(
  (select service_period_start = (select closed_month from lctx)
     and service_period_end = ((select closed_month from lctx) + interval '1 month - 1 day')::date
   from public.invoices invoice
   join public.customers c on c.id = invoice.customer_id
   where c.name = 'Kunde Pauschale'),
  'der Leistungszeitraum ist der abgerechnete Monat');
select pg_temp.assert(
  (select net_total_cents = 9600 from public.invoices invoice
   join public.customers c on c.id = invoice.customer_id
   where c.name = 'Kunde Pauschale'),
  'die Summe der Rechnung stimmt mit der Vorschau ueberein');

-- Der zweite Lauf findet nichts mehr. Das ist der eigentliche Punkt.
select pg_temp.assert(
  (select count(*) from public.run_monthly_billing((select closed_month from lctx), false)
   where lines_added > 0) = 0,
  'der zweite Lauf rechnet nichts erneut ab');
select pg_temp.assert(
  (select count(*) from public.invoice_lines where company_id = (select company from lctx)) = 3,
  'und hinterlaesst keine zusaetzliche Zeile');

-- ---------------------------------------------------------------------------
-- Eine gestellte Rechnung wird nicht angefasst
-- ---------------------------------------------------------------------------
\ir fixtures/invoice-master-data.sql
select public.issue_invoice(
  (select invoice.id from public.invoices invoice
   join public.customers c on c.id = invoice.customer_id
   where c.name = 'Kunde Pauschale'));
select pg_temp.assert(
  (select status = 'ISSUED' from public.invoices invoice
   join public.customers c on c.id = invoice.customer_id where c.name = 'Kunde Pauschale'),
  'die Rechnung ist gestellt');

-- Ein nachtraeglich erledigter Einsatz landet in einem neuen Entwurf, nicht in
-- der gestellten Rechnung.
select pg_temp.sign_out();
insert into public.jobs
  (company_id, customer_id, cleaning_object_id, service_schedule_id, title,
   scheduled_date, planned_start_at, planned_end_at, status)
select lctx.company, c.id, o.id, s.id, 'Nachgereichter Einsatz',
  lctx.closed_month + 14,
  (lctx.closed_month + 14 + time '07:00') at time zone 'Europe/Berlin',
  (lctx.closed_month + 14 + time '10:00') at time zone 'Europe/Berlin',
  'COMPLETED'::public.job_status
from lctx
join public.customers c on c.company_id = lctx.company and c.name = 'Kunde Pauschale'
join public.cleaning_objects o on o.customer_id = c.id
join public.service_schedules s on s.cleaning_object_id = o.id;
select pg_temp.sign_in('f4400000-0000-4000-8000-000000000001');

select pg_temp.assert(
  (select outcome = 'CREATED' and lines_added = 1
   from public.run_monthly_billing((select closed_month from lctx), false)
   where customer_name = 'Kunde Pauschale'),
  'der Nachtrag bekommt einen eigenen Entwurf');
select pg_temp.assert(
  (select count(*) from public.invoice_lines line
   join public.invoices invoice on invoice.id = line.invoice_id
   where invoice.status = 'ISSUED') = 2,
  'die gestellte Rechnung hat unveraendert zwei Zeilen');

-- Ein bestehender Entwurf derselben Periode wird ergaenzt und nicht verdoppelt.
select pg_temp.sign_out();
insert into public.jobs
  (company_id, customer_id, cleaning_object_id, service_schedule_id, title,
   scheduled_date, planned_start_at, planned_end_at, status)
select lctx.company, c.id, o.id, s.id, 'Zweiter Nachtrag',
  lctx.closed_month + 15,
  (lctx.closed_month + 15 + time '07:00') at time zone 'Europe/Berlin',
  (lctx.closed_month + 15 + time '10:00') at time zone 'Europe/Berlin',
  'COMPLETED'::public.job_status
from lctx
join public.customers c on c.company_id = lctx.company and c.name = 'Kunde Pauschale'
join public.cleaning_objects o on o.customer_id = c.id
join public.service_schedules s on s.cleaning_object_id = o.id;
select pg_temp.sign_in('f4400000-0000-4000-8000-000000000001');

select pg_temp.assert(
  (select outcome = 'EXTENDED' and lines_added = 1
   from public.run_monthly_billing((select closed_month from lctx), false)
   where customer_name = 'Kunde Pauschale'),
  'der bestehende Entwurf wird ergaenzt');
select pg_temp.assert(
  (select count(*) from public.invoices invoice
   join public.customers c on c.id = invoice.customer_id
   where c.name = 'Kunde Pauschale' and invoice.status = 'DRAFT') = 1,
  'und kein zweiter Entwurf fuer denselben Monat angelegt');

-- ---------------------------------------------------------------------------
-- Ein laufender Monat wird nicht abgerechnet
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    perform public.run_monthly_billing((select running_month from lctx), true);
    raise exception 'NOT REJECTED: der laufende Monat wurde abgerechnet';
  exception when others then
    if position('noch nicht abgeschlossen' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Mandantentrennung und Berechtigung
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('f4400000-0000-4000-8000-000000000002');
select pg_temp.assert(
  (select count(*) from public.run_monthly_billing((select closed_month from lctx), true)) = 0,
  'die Nachbarin sieht keinen fremden Kunden im Lauf');
select pg_temp.assert(
  (select count(*) from public.invoices) = 0,
  'und keine fremde Rechnung');
select pg_temp.sign_out();

insert into auth.users (id, email) values ('f4400000-0000-4000-8000-000000000003', 'kraft@lauf.test');
insert into public.company_members (company_id, profile_id, role, status)
select company, profile.id, 'EMPLOYEE', 'ACTIVE' from lctx, public.profiles profile
where profile.auth_user_id = 'f4400000-0000-4000-8000-000000000003';
select pg_temp.sign_in('f4400000-0000-4000-8000-000000000003');
do $$
begin
  begin
    perform public.run_monthly_billing((select closed_month from lctx), false);
    raise exception 'NOT REJECTED: eine Mitarbeiterin hat den Monatslauf gestartet';
  exception when others then
    if position('OWNER or OFFICE' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

rollback;
\o
\echo 'Monatslauf (Sammelrechnung): all assertions passed'
