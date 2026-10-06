-- Das Kundenportal: wer sieht was. Run with supabase/test/run.sh.
--
-- Diese Suite ist als Angriff geschrieben. Das Portal ist die einzige Stelle,
-- an der Menschen ohne Vertrag zum Betrieb an Daten kommen -- und zwei Kunden
-- desselben Betriebs duerfen voneinander nichts sehen. Ein Fehler hier ist
-- nicht ein falscher Bildschirm, sondern eine Offenlegung.
--
-- Vorher gab es fuer dreizehn Portal-Funktionen keine einzige Zusicherung.
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
create or replace function pg_temp.assert_rejected(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if position(lower(p_expected) in lower(sqlerrm)) = 0 then
      raise exception 'WRONG REJECTION for %: expected "%", got "%"', p_sql, p_expected, sqlerrm; end if; return;
  end;
  raise exception 'NOT REJECTED: % (expected "%")', p_sql, p_expected;
end; $$;

insert into auth.users (id, email) values
  ('d8800000-0000-4000-8000-000000000001', 'inhaberin@portal.test'),
  ('d8800000-0000-4000-8000-000000000011', 'kunde-eins@portal.test'),
  ('d8800000-0000-4000-8000-000000000012', 'kunde-zwei@portal.test'),
  ('d8800000-0000-4000-8000-000000000013', 'kraft@portal.test'),
  ('d8800000-0000-4000-8000-000000000021', 'nachbarin@portal.test'),
  ('d8800000-0000-4000-8000-000000000022', 'kunde-nachbar@portal.test'),
  ('d8800000-0000-4000-8000-000000000031', 'doppelt@portal.test');

select pg_temp.sign_in('d8800000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Portal GmbH');
select pg_temp.sign_in('d8800000-0000-4000-8000-000000000021');
select public.create_company_for_current_user('Nachbar Portal GmbH');
select pg_temp.sign_out();

create temporary table pctx as select
  (select id from public.companies where name = 'Portal GmbH') as company_a,
  (select id from public.companies where name = 'Nachbar Portal GmbH') as company_b;
grant select on pctx to authenticated;

-- Zwei Kunden im selben Betrieb. Das ist der interessante Fall: nicht zwei
-- Betriebe, sondern zwei Kunden, die beide legitim ins Portal duerfen.
insert into public.customers (company_id, name) select company_a, 'Kunde Eins' from pctx;
insert into public.customers (company_id, name) select company_a, 'Kunde Zwei' from pctx;
insert into public.customers (company_id, name) select company_b, 'Kunde Nachbar' from pctx;

insert into public.cleaning_objects (company_id, customer_id, name)
select c.company_id, c.id, c.name || ' · Objekt' from public.customers c;

create temporary table pids as select
  (select id from public.customers where name = 'Kunde Eins') as cust1,
  (select id from public.customers where name = 'Kunde Zwei') as cust2,
  (select id from public.customers where name = 'Kunde Nachbar') as custb,
  (select id from public.cleaning_objects where name = 'Kunde Eins · Objekt') as obj1,
  (select id from public.cleaning_objects where name = 'Kunde Zwei · Objekt') as obj2;
grant select on pids to authenticated;

-- Je ein erledigter Einsatz mit Leistungsnachweis. Den Nachweis legt der
-- Trigger an.
insert into public.jobs
  (company_id, customer_id, cleaning_object_id, title, scheduled_date, planned_start_at, planned_end_at, status)
select (select company_a from pctx), object.customer_id, object.id,
  object.name || ' · Einsatz', current_date - 2,
  (current_date - 2 + time '08:00') at time zone 'Europe/Berlin',
  (current_date - 2 + time '12:00') at time zone 'Europe/Berlin',
  'COMPLETED'::public.job_status
from public.cleaning_objects object
where object.company_id = (select company_a from pctx);

create temporary table pjobs as select
  (select id from public.jobs where title = 'Kunde Eins · Objekt · Einsatz') as job1,
  (select id from public.jobs where title = 'Kunde Zwei · Objekt · Einsatz') as job2;
grant select on pjobs to authenticated;

-- Die Portalzugaenge. Eine Mitgliedschaft mit Rolle CUSTOMER plus die
-- Verknuepfung auf genau einen Kunden -- so legt sie auch die Einladung an.
insert into public.company_members (company_id, profile_id, role, status)
select (select company_a from pctx), profile.id, 'CUSTOMER'::public.company_role, 'ACTIVE'::public.membership_status
from public.profiles profile where profile.auth_user_id = 'd8800000-0000-4000-8000-000000000011'
union all
select (select company_a from pctx), profile.id, 'CUSTOMER', 'ACTIVE'
from public.profiles profile where profile.auth_user_id = 'd8800000-0000-4000-8000-000000000012'
union all
select (select company_a from pctx), profile.id, 'EMPLOYEE', 'ACTIVE'
from public.profiles profile where profile.auth_user_id = 'd8800000-0000-4000-8000-000000000013'
union all
select (select company_b from pctx), profile.id, 'CUSTOMER', 'ACTIVE'
from public.profiles profile where profile.auth_user_id = 'd8800000-0000-4000-8000-000000000022';

insert into public.customer_contacts (company_id, customer_id, member_id)
select (select company_a from pctx), (select cust1 from pids), member.id
from public.company_members member
join public.profiles profile on profile.id = member.profile_id
where profile.auth_user_id = 'd8800000-0000-4000-8000-000000000011'
union all
select (select company_a from pctx), (select cust2 from pids), member.id
from public.company_members member
join public.profiles profile on profile.id = member.profile_id
where profile.auth_user_id = 'd8800000-0000-4000-8000-000000000012'
union all
select (select company_b from pctx), (select custb from pids), member.id
from public.company_members member
join public.profiles profile on profile.id = member.profile_id
where profile.auth_user_id = 'd8800000-0000-4000-8000-000000000022';

-- Je eine gestellte Rechnung, damit es etwas zu verwechseln gibt.
-- `issue_invoice` verlangt seit 20261005054437 vollstaendige Stammdaten von
-- Verkaeuferin und Kundin -- zu Recht, eine Rechnung ohne sie ist keine. Die
-- gemeinsame Fixture fuellt genau die fehlenden Felder, ohne vorhandene zu
-- ueberschreiben.
\ir fixtures/invoice-master-data.sql

select pg_temp.sign_in('d8800000-0000-4000-8000-000000000001');
create temporary table pinv as
select public.create_draft_invoice((select cust1 from pids), current_date - 30, current_date - 1) as inv1,
       public.create_draft_invoice((select cust2 from pids), current_date - 30, current_date - 1) as inv2;
grant select on pinv to authenticated;
select public.add_invoice_line((select inv1 from pinv), 'Reinigung Eins', 1, 'Einsatz', 10000, 1900);
select public.add_invoice_line((select inv2 from pinv), 'Reinigung Zwei', 1, 'Einsatz', 20000, 1900);
select public.issue_invoice((select inv1 from pinv));
select public.issue_invoice((select inv2 from pinv));
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Kunde Eins sieht genau das Seine
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('d8800000-0000-4000-8000-000000000011');

select pg_temp.assert(
  (select count(*) from public.get_my_portal_overview()) = 1
  and (select customer_name from public.get_my_portal_overview()) = 'Kunde Eins',
  'die Uebersicht zeigt genau den eigenen Kunden');
select pg_temp.assert(
  (select count(*) from public.list_my_portal_objects()) = 1
  and (select name from public.list_my_portal_objects()) = 'Kunde Eins · Objekt',
  'nur das eigene Objekt');
select pg_temp.assert(
  (select count(*) from public.list_my_portal_upcoming_jobs(current_date - 10, 30)) = 1,
  'nur den eigenen Einsatz');
select pg_temp.assert(
  (select count(*) from public.list_my_portal_invoices()) = 1
  and (select gross_total_cents from public.list_my_portal_invoices()) = 11900,
  'nur die eigene Rechnung, mit dem eigenen Betrag');
select pg_temp.assert(
  (select count(*) from public.list_my_portal_service_records()) = 1,
  'nur den eigenen Leistungsnachweis');

-- ---------------------------------------------------------------------------
-- Und nichts vom Nachbarkunden -- auch nicht mit dessen Kennung in der Hand
-- ---------------------------------------------------------------------------
-- Eine Kennung ist kein Geheimnis: sie steht in URLs, in E-Mails, in Logs.
-- Die Pruefung muss serverseitig passieren, nicht ueber Unkenntnis.
select pg_temp.assert(
  (select count(*) from public.get_my_portal_invoice((select inv2 from pinv))) = 0,
  'die Rechnung des anderen Kunden ist mit ihrer Kennung nicht lesbar');
select pg_temp.assert(
  (select count(*) from public.get_my_portal_invoice((select inv1 from pinv))) = 1,
  'die eigene schon -- die Pruefung sperrt nicht alles');
select pg_temp.assert(
  (select count(*) from public.get_my_portal_service_record((select job2 from pjobs))) = 0,
  'der Leistungsnachweis des anderen Kunden ist nicht lesbar');
select pg_temp.assert(
  (select count(*) from public.list_my_portal_job_photos((select job2 from pjobs))) = 0,
  'die Fotos des anderen Kunden sind nicht lesbar');
select pg_temp.assert(
  (select count(*) from public.get_my_portal_acceptance((select job2 from pjobs))) = 0,
  'die Abnahme des anderen Kunden ist nicht lesbar');

-- Schreiben erst recht nicht.
select pg_temp.assert_rejected(
  'select public.create_my_portal_complaint((select obj2 from pids), ''Beschwerde'', ''Beschreibung lang genug'')',
  'Object not found for this customer');
select pg_temp.assert(
  public.is_portal_customer_of((select company_a from pctx), (select cust2 from pids)) = false,
  'is_portal_customer_of sagt nein fuer einen fremden Kunden');
select pg_temp.assert(
  public.is_portal_customer_of((select company_a from pctx), (select cust1 from pids)),
  'und ja fuer den eigenen');

-- Die eigene Beschwerde geht, und der andere Kunde sieht sie nicht.
create temporary table pcomp as select public.create_my_portal_complaint(
  (select obj1 from pids), 'Treppenhaus nicht gereinigt', 'Im zweiten Obergeschoss lag Laub.') as id;
grant select on pcomp to authenticated;
select pg_temp.assert(
  (select count(*) from public.list_my_portal_complaints()) = 1,
  'die eigene Beschwerde ist da');
select pg_temp.sign_out();

select pg_temp.sign_in('d8800000-0000-4000-8000-000000000012');
select pg_temp.assert(
  (select count(*) from public.list_my_portal_complaints()) = 0,
  'der andere Kunde sieht die Beschwerde nicht');
select pg_temp.assert(
  (select customer_name from public.get_my_portal_overview()) = 'Kunde Zwei',
  'und sieht seinen eigenen Namen');
select pg_temp.assert(
  (select gross_total_cents from public.list_my_portal_invoices()) = 23800,
  'und seine eigene Rechnung');
-- `add_my_complaint_update` heisst "my", ist aber trotz des Namens keine
-- Portalfunktion: sie verlangt die Rolle EMPLOYEE und den Einsatzbezug. Ein
-- Portalkunde kommt also gar nicht daran -- festgehalten, weil der Name das
-- Gegenteil nahelegt und beim Lesen zu einer falschen Annahme fuehrt.
select pg_temp.assert_rejected(
  'select public.add_my_complaint_update((select id from pcomp), ''IN_PROGRESS''::public.complaint_status, ''Nachtrag von fremder Hand'')',
  'Employee role required');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Der Nachbarbetrieb sieht gar nichts
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('d8800000-0000-4000-8000-000000000022');
select pg_temp.assert(
  (select customer_name from public.get_my_portal_overview()) = 'Kunde Nachbar',
  'der Kunde des Nachbarbetriebs sieht seinen eigenen Betrieb');
-- Das eigene Objekt sieht er -- das ist richtig. Gepruefft wird, dass keine
-- Zeile aus dem fremden Betrieb dabei ist, nicht dass die Liste leer ist:
-- eine leere Liste waere auch bei einem kaputten Filter leer.
select pg_temp.assert(
  (select count(*) from public.list_my_portal_objects()) = 1
  and (select name from public.list_my_portal_objects()) = 'Kunde Nachbar · Objekt',
  'der Nachbarkunde sieht genau sein eigenes Objekt');
select pg_temp.assert(
  not exists (select 1 from public.list_my_portal_objects() where name like 'Kunde Eins%' or name like 'Kunde Zwei%'),
  'und kein Objekt aus dem fremden Betrieb');
select pg_temp.assert(
  (select count(*) from public.list_my_portal_invoices()) = 0
  and (select count(*) from public.list_my_portal_service_records()) = 0
  and (select count(*) from public.list_my_portal_upcoming_jobs(current_date - 10, 30)) = 0,
  'und keine Rechnung, keinen Nachweis und keinen Einsatz des fremden Betriebs');
select pg_temp.assert(
  (select count(*) from public.get_my_portal_invoice((select inv1 from pinv))) = 0,
  'auch nicht mit der Kennung einer fremden Rechnung');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Wer kein Portalkunde ist, bekommt keine Portalzeile
-- ---------------------------------------------------------------------------
-- Das ist kein Schoenheitsfehler: die Portalfunktionen sind security definer
-- und umgehen RLS. Waere der Rollenfilter falsch, sähe das Buero die Daten
-- durch das Portal mit der Brille eines beliebigen Kunden.
select pg_temp.sign_in('d8800000-0000-4000-8000-000000000013');
select pg_temp.assert(
  (select count(*) from public.get_my_portal_overview()) = 0
  and (select count(*) from public.list_my_portal_invoices()) = 0,
  'eine Mitarbeiterin ist kein Portalkunde');
select pg_temp.assert_rejected(
  'select public.create_my_portal_complaint((select obj1 from pids), ''Beschwerde'', ''Beschreibung lang genug'')',
  'Portal access required');
select pg_temp.sign_out();

select pg_temp.sign_in('d8800000-0000-4000-8000-000000000001');
select pg_temp.assert(
  (select count(*) from public.get_my_portal_overview()) = 0
  and (select count(*) from public.list_my_portal_invoices()) = 0,
  'die Inhaberin ist kein Portalkunde');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Ein abgeschalteter Zugang ist zu
-- ---------------------------------------------------------------------------
update public.company_members set status = 'DISABLED'
where profile_id = (select id from public.profiles where auth_user_id = 'd8800000-0000-4000-8000-000000000011');

select pg_temp.sign_in('d8800000-0000-4000-8000-000000000011');
select pg_temp.assert(
  (select count(*) from public.get_my_portal_overview()) = 0
  and (select count(*) from public.list_my_portal_invoices()) = 0
  and (select count(*) from public.list_my_portal_objects()) = 0
  and (select count(*) from public.list_my_portal_complaints()) = 0,
  'ein abgeschalteter Portalzugang sieht nichts mehr');
select pg_temp.assert(
  (select count(*) from public.get_my_portal_invoice((select inv1 from pinv))) = 0,
  'auch nicht die Rechnung, die er gestern noch sehen durfte');
select pg_temp.assert_rejected(
  'select public.create_my_portal_complaint((select obj1 from pids), ''Beschwerde'', ''Beschreibung lang genug'')',
  'Portal access required');
select pg_temp.sign_out();

update public.company_members set status = 'ACTIVE'
where profile_id = (select id from public.profiles where auth_user_id = 'd8800000-0000-4000-8000-000000000011');

-- ---------------------------------------------------------------------------
-- Dieselbe Person als Ansprechpartnerin bei zwei Betrieben
-- ---------------------------------------------------------------------------
-- Erlaubt: `company_members` ist nur je Betrieb eindeutig. Eine
-- Hausverwaltung kann bei zwei Reinigungsbetrieben Kundin sein.
--
-- Die Frage ist, welche der beiden Beziehungen das Portal zeigt. `limit 1`
-- ohne `order by` beantwortet sie nicht -- PostgreSQL darf dann beide Zeilen
-- liefern, und zwar von Aufruf zu Aufruf verschieden. Festgehalten wird
-- darum die Regel: die aeltere Beziehung gewinnt, immer dieselbe.
insert into public.company_members (company_id, profile_id, role, status)
select (select company_a from pctx), profile.id, 'CUSTOMER'::public.company_role, 'ACTIVE'::public.membership_status
from public.profiles profile where profile.auth_user_id = 'd8800000-0000-4000-8000-000000000031'
union all
select (select company_b from pctx), profile.id, 'CUSTOMER'::public.company_role, 'ACTIVE'::public.membership_status
from public.profiles profile where profile.auth_user_id = 'd8800000-0000-4000-8000-000000000031';

-- Ehrlich zur Aussagekraft: diese Zusicherung besteht auch mit der alten
-- Definition ohne `order by` -- nachgemessen. Der Defekt war nicht
-- "zuverlaessig falsch", sondern "unbestimmt": PostgreSQL *darf* jede der
-- beiden Zeilen liefern, und welche es tut, haengt am Plan und damit an
-- Datenmenge, Statistiken und Version. Ein Test kann das nicht erzwingen.
--
-- Was er festhaelt, ist darum die Regel selbst: genau eine Zeile, die aeltere
-- Beziehung, bei jedem Aufruf dieselbe. Ab 20261006000042 ist das zugesichert
-- statt zufaellig.
insert into public.customer_contacts (company_id, customer_id, member_id, created_at)
select (select company_b from pctx), (select custb from pids), member.id, now() - interval '1 day'
from public.company_members member
join public.profiles profile on profile.id = member.profile_id
where profile.auth_user_id = 'd8800000-0000-4000-8000-000000000031'
  and member.company_id = (select company_b from pctx);
insert into public.customer_contacts (company_id, customer_id, member_id, created_at)
select (select company_a from pctx), (select cust1 from pids), member.id, now() - interval '2 days'
from public.company_members member
join public.profiles profile on profile.id = member.profile_id
where profile.auth_user_id = 'd8800000-0000-4000-8000-000000000031'
  and member.company_id = (select company_a from pctx);

select pg_temp.sign_in('d8800000-0000-4000-8000-000000000031');
select pg_temp.assert(
  (select count(*) from public.get_my_portal_overview()) = 1,
  'das Portal zeigt genau eine Beziehung, nicht zwei und nicht keine');
select pg_temp.assert(
  (select company_name from public.get_my_portal_overview()) = 'Portal GmbH',
  'und zwar die aeltere');
select pg_temp.assert(
  (select company_name from public.get_my_portal_overview())
    = (select company_name from public.get_my_portal_overview()),
  'bei jedem Aufruf dieselbe');
select pg_temp.sign_out();

rollback;
\o
\echo 'Kundenportal (Mandantentrennung): all assertions passed'
