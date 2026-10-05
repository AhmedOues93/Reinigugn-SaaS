-- Das Audit-Log. Run with supabase/test/run.sh.
--
-- Die Frage, die dieses Protokoll beantworten muss, lautet nicht "ist etwas
-- passiert", sondern "wer war das". Darum wird hier jede Zeile auf Handelnde,
-- Gegenstand und Begruendung geprueft -- und darauf, dass sich keine Zeile
-- nachtraeglich aendern laesst.
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
  ('b6600000-0000-4000-8000-000000000001', 'inhaberin@audit.test'),
  ('b6600000-0000-4000-8000-000000000002', 'buero@audit.test'),
  ('b6600000-0000-4000-8000-000000000003', 'kraft@audit.test'),
  ('b6600000-0000-4000-8000-000000000004', 'nachbarin@audit.test');

select pg_temp.sign_in('b6600000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Audit GmbH');
select pg_temp.sign_in('b6600000-0000-4000-8000-000000000004');
select public.create_company_for_current_user('Nachbar Audit GmbH');
select pg_temp.sign_out();

-- Der Name der Inhaberin, damit das Log ihn nennen kann.
update public.profiles set first_name = 'Ayse', last_name = 'Yilmaz'
where auth_user_id = 'b6600000-0000-4000-8000-000000000001';
update public.profiles set first_name = 'Bernd', last_name = 'Buero'
where auth_user_id = 'b6600000-0000-4000-8000-000000000002';

create temporary table actx as select
  (select id from public.companies where name = 'Audit GmbH') as company,
  (select id from public.companies where name = 'Nachbar Audit GmbH') as other_company,
  (select id from public.profiles where auth_user_id = 'b6600000-0000-4000-8000-000000000002') as office_profile,
  (select id from public.profiles where auth_user_id = 'b6600000-0000-4000-8000-000000000003') as staff_profile;
grant select on actx to authenticated;

-- ---------------------------------------------------------------------------
-- Ein neues Mitglied und eine Rollenaenderung
-- ---------------------------------------------------------------------------
insert into public.company_members (company_id, profile_id, role, status)
select company, office_profile, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status from actx;

select pg_temp.assert(
  (select count(*) from public.audit_events
   where company_id = (select company from actx) and action = 'MEMBER_ADDED'
     and subject_label = 'Bernd Buero') = 1,
  'ein neues Mitglied wird festgehalten, mit Namen');

update public.company_members set role = 'OFFICE'
where company_id = (select company from actx) and profile_id = (select office_profile from actx);

select pg_temp.assert(
  (select detail->>'previous_role' = 'EMPLOYEE' and detail->>'role' = 'OFFICE'
   from public.audit_events
   where company_id = (select company from actx) and action = 'MEMBER_ROLE_CHANGED'),
  'die Rollenaenderung haelt vorher und nachher fest');

insert into public.company_members (company_id, profile_id, role, status)
select company, staff_profile, 'EMPLOYEE', 'ACTIVE' from actx;

-- ---------------------------------------------------------------------------
-- Firmendaten: die Tatsache, nicht die Bankverbindung
-- ---------------------------------------------------------------------------
update public.companies set iban = 'DE02120300000000202051', bic = 'BYLADEM1001'
where id = (select company from actx);

select pg_temp.assert(
  (select count(*) from public.audit_events
   where company_id = (select company from actx) and action = 'COMPANY_SETTINGS_CHANGED') = 1,
  'die Aenderung der Firmendaten wird festgehalten');
select pg_temp.assert(
  (select detail->'fields' @> '["iban"]'::jsonb and detail->'fields' @> '["bic"]'::jsonb
   from public.audit_events
   where company_id = (select company from actx) and action = 'COMPANY_SETTINGS_CHANGED'),
  'und benennt die geaenderten Felder');
-- Das ist der Punkt: der Wert steht nicht im Protokoll.
select pg_temp.assert(
  (select detail::text not like '%DE02120300000000202051%'
   from public.audit_events
   where company_id = (select company from actx) and action = 'COMPANY_SETTINGS_CHANGED'),
  'die IBAN selbst landet nicht im Protokoll');

-- Eine Aenderung, die kein ueberwachtes Feld betrifft, erzeugt keine Zeile.
update public.companies set city = 'Offenbach' where id = (select company from actx);
select pg_temp.assert(
  (select count(*) from public.audit_events
   where company_id = (select company from actx) and action = 'COMPANY_SETTINGS_CHANGED') = 1,
  'eine beliebige andere Aenderung fuellt das Protokoll nicht');

-- Beim Zwei-Faktor-Zwang ist der Wert selbst die Information.
select pg_temp.sign_in('b6600000-0000-4000-8000-000000000001');
select public.set_require_staff_mfa(true);
select pg_temp.assert(
  (select count(*) from public.audit_events
   where company_id = (select company from actx)
     and action = 'COMPANY_SETTINGS_CHANGED'
     and detail->>'require_staff_mfa' = 'true'
     and actor_name = 'Ayse Yilmaz') = 1,
  'der Zwei-Faktor-Zwang steht mit Wert und Handelnder im Protokoll');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Rechnungen: Statuswechsel, keine Entwurfsbearbeitung
-- ---------------------------------------------------------------------------
insert into public.customers (company_id, name) select company, 'Auditkunde' from actx;
create temporary table acust as select id from public.customers where company_id = (select company from actx);
grant select on acust to authenticated;

select pg_temp.sign_in('b6600000-0000-4000-8000-000000000001');
create temporary table ainv as select public.create_draft_invoice(
  (select id from acust), current_date - 30, current_date - 1) as id;
grant select on ainv to authenticated;
select public.add_invoice_line((select id from ainv), 'Unterhaltsreinigung', 1, 'Einsatz', 24000, 1900);

select pg_temp.assert(
  (select count(*) from public.audit_events
   where company_id = (select company from actx) and subject_type = 'invoice') = 0,
  'ein Entwurf samt Positionen ist kein Vorgang fuers Protokoll');

\ir fixtures/invoice-master-data.sql
select public.issue_invoice((select id from ainv));
select pg_temp.assert(
  (select actor_name = 'Ayse Yilmaz' and detail->>'previous_status' = 'DRAFT'
     and (detail->>'gross_total_cents')::bigint = 28560
     and subject_label is not null and subject_label <> 'Entwurf'
   from public.audit_events
   where company_id = (select company from actx) and action = 'INVOICE_ISSUED'),
  'das Ausstellen steht mit Handelnder, Vorstatus, Betrag und Rechnungsnummer im Protokoll');

select public.cancel_invoice((select id from ainv), 'Falscher Leistungszeitraum');
select pg_temp.assert(
  (select detail->>'reason' = 'Falscher Leistungszeitraum' and detail->>'previous_status' = 'ISSUED'
   from public.audit_events
   where company_id = (select company from actx) and action = 'INVOICE_CANCELLED'),
  'die Stornierung nennt den Grund');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Lohnmonat: Freigabe und Wiederoeffnung
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('b6600000-0000-4000-8000-000000000001');
select public.release_payroll_period((date_trunc('month', current_date - interval '1 month'))::date);
select pg_temp.assert(
  (select count(*) from public.audit_events
   where company_id = (select company from actx) and action = 'PAYROLL_RELEASED'
     and actor_name = 'Ayse Yilmaz') = 1,
  'die Freigabe des Lohnmonats steht im Protokoll');

select public.reopen_payroll_period(
  (date_trunc('month', current_date - interval '1 month'))::date,
  'Nachgetragene Krankmeldung');
select pg_temp.assert(
  (select detail->>'reason' = 'Nachgetragene Krankmeldung'
   from public.audit_events
   where company_id = (select company from actx) and action = 'PAYROLL_REOPENED'),
  'die Wiederoeffnung nennt die Begruendung');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Unveraenderlichkeit
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    update public.audit_events set action = 'HARMLOS'
    where company_id = (select company from actx);
    raise exception 'NOT REJECTED: ein Audit-Eintrag wurde geaendert';
  exception when others then
    if position('nicht geändert' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
do $$
begin
  begin
    delete from public.audit_events where company_id = (select company from actx);
    raise exception 'NOT REJECTED: ein Audit-Eintrag wurde geloescht';
  exception when others then
    if position('nicht geändert' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Die Zeitleiste liest auch die Arbeitszeitkorrekturen mit
-- ---------------------------------------------------------------------------
insert into public.cleaning_objects (company_id, customer_id, name)
select (select company from actx), (select id from acust), 'Auditobjekt';
insert into public.jobs
  (company_id, customer_id, cleaning_object_id, title, scheduled_date, planned_start_at, planned_end_at, status)
select (select company from actx), (select id from acust),
  (select id from public.cleaning_objects where name = 'Auditobjekt'),
  'Auditeinsatz', current_date - 3,
  (current_date - 3 + time '08:00') at time zone 'Europe/Berlin',
  (current_date - 3 + time '12:00') at time zone 'Europe/Berlin',
  'COMPLETED'::public.job_status;
insert into public.job_time_entries (company_id, job_id, member_id, started_at, finished_at)
select (select company from actx), job.id,
  (select id from public.company_members where profile_id = (select staff_profile from actx)),
  (current_date - 3 + time '08:00') at time zone 'Europe/Berlin',
  (current_date - 3 + time '11:00') at time zone 'Europe/Berlin'
from public.jobs job where job.title = 'Auditeinsatz';

select pg_temp.sign_in('b6600000-0000-4000-8000-000000000001');
select public.correct_time_entry(
  (select id from public.job_time_entries where company_id = (select company from actx) limit 1),
  (current_date - 3 + time '08:00') at time zone 'Europe/Berlin',
  (current_date - 3 + time '12:00') at time zone 'Europe/Berlin',
  'Feierabend vergessen');

select pg_temp.assert(
  (select count(*) from public.list_audit_events()
   where action = 'TIME_ENTRY_CORRECTED' and detail->>'reason' = 'Feierabend vergessen') = 1,
  'die Arbeitszeitkorrektur erscheint in der Zeitleiste, ohne zweite Kopie');
select pg_temp.assert(
  (select count(*) from public.audit_events
   where company_id = (select company from actx) and action = 'TIME_ENTRY_CORRECTED') = 0,
  'und wird nicht noch einmal in audit_events gespeichert');

-- Die Sortierung der Zeitleiste ist hier nicht pruefbar: in einer einzigen
-- Transaktion geht `now()` nicht weiter, also tragen alle Vorgaenge dieselbe
-- Zeit. Eine Zusicherung darauf wuerde zufaellig bestehen oder scheitern --
-- schlimmer als keine.

-- Ein Fenster ohne Vorgaenge ist leer, nicht alles.
select pg_temp.assert(
  (select count(*) from public.list_audit_events(
    now() - interval '400 days', now() - interval '300 days')) = 0,
  'ein Zeitfenster ohne Vorgaenge ist leer');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Mandantentrennung und Berechtigung
-- ---------------------------------------------------------------------------
-- Die Nachbarin hat ihren eigenen Betrieb angelegt und sieht darum ihre
-- eigene Zeile -- aber keine einzige aus dem fremden Betrieb.
select pg_temp.sign_in('b6600000-0000-4000-8000-000000000004');
select pg_temp.assert(
  (select count(*) from public.audit_events
   where company_id = (select company from actx)) = 0,
  'die Nachbarin sieht kein fremdes Protokoll');
select pg_temp.assert(
  (select count(*) from public.audit_events
   where company_id = (select other_company from actx)) >= 1,
  'ihr eigener Betrieb protokolliert dagegen schon');
select pg_temp.assert(
  (select count(*) from public.list_audit_events(now() - interval '400 days', now())
   where subject_label in ('Ayse Yilmaz', 'Bernd Buero', 'Audit GmbH')) = 0,
  'und in ihrer Zeitleiste steht kein fremder Vorgang');
select pg_temp.sign_out();

select pg_temp.sign_in('b6600000-0000-4000-8000-000000000003');
select pg_temp.assert(
  (select count(*) from public.audit_events) = 0,
  'eine Mitarbeiterin sieht das Protokoll des Betriebs nicht');
select pg_temp.assert(
  (select count(*) from public.list_audit_events(now() - interval '400 days', now())) = 0,
  'auch nicht ueber die Zeitleiste');
select pg_temp.sign_out();

-- Das Buero darf lesen -- es ist dafuer gedacht.
select pg_temp.sign_in('b6600000-0000-4000-8000-000000000002');
select pg_temp.assert(
  (select count(*) from public.list_audit_events(now() - interval '400 days', now())) > 5,
  'das Buero sieht die Zeitleiste des eigenen Betriebs');
select pg_temp.sign_out();

rollback;
\o
\echo 'Audit-Log: all assertions passed'
