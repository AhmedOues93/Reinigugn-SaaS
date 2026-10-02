-- Der ganze Weg: Anfrage, Besichtigung, Angebot, Annahme, Leistungsplan,
-- Einsatz, Leistungsnachweis, Rechnung. Run with supabase/test/run.sh.
--
-- Jede Stufe ist fuer sich geprueft. Was bisher niemand geprueft hat: dass die
-- Uebergaenge zusammenpassen -- dass aus der Anfrage wirklich ein Kunde wird,
-- aus dem Angebot ein Plan mit Einsaetzen, aus dem Einsatz ein Nachweis und
-- aus dem Nachweis eine Rechnung, die als XRechnung vollstaendig ist.
--
-- Und dass der Nachbarbetrieb auf keiner einzigen Stufe etwas davon sieht.
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
  ('e6000000-0000-4000-8000-000000000001', 'inhaberin@e2e.test'),
  ('e6000000-0000-4000-8000-000000000002', 'nachbarin@e2e.test'),
  ('e6000000-0000-4000-8000-000000000011', 'putzkraft@e2e.test');

select pg_temp.sign_in('e6000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Glanzwerk GmbH');
select pg_temp.sign_in('e6000000-0000-4000-8000-000000000002');
select public.create_company_for_current_user('Nachbar Reinigung GmbH');
select pg_temp.sign_out();

create temporary table ctx as select
  (select id from public.companies where name = 'Glanzwerk GmbH') as company,
  (select id from public.companies where name = 'Nachbar Reinigung GmbH') as other_company;
grant select on ctx to authenticated;

-- Vollstaendige Stammdaten: ohne sie ist am Ende keine XRechnung moeglich.
-- Alle Werte sind reservierte Test- und Dokumentationswerte.
select pg_temp.sign_in('e6000000-0000-4000-8000-000000000001');
select public.update_my_company_master_data(
  'Glanzwerk GmbH', 'GmbH', 'Musterweg 3', '20095', 'Hamburg', 'Deutschland',
  '+49 40 1112233', 'buero@e2e.test', null,
  '22/815/08154', 'DE999999999', null,
  'DE02120300000000202051', 'BYLADEM1001', 14::smallint, 'Europe/Berlin', 'de');
select pg_temp.sign_out();

insert into public.company_members (company_id, profile_id, role, status)
select ctx.company, profile.id, 'EMPLOYEE', 'ACTIVE'
from ctx, public.profiles profile where profile.auth_user_id = 'e6000000-0000-4000-8000-000000000011';
insert into public.employee_details (company_id, profile_id, weekly_hours, is_active)
select ctx.company, profile.id, 40, true
from ctx, public.profiles profile where profile.auth_user_id = 'e6000000-0000-4000-8000-000000000011';

-- ---------------------------------------------------------------------------
-- 1. Anfrage.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('e6000000-0000-4000-8000-000000000001');
create temporary table lead_row as
select public.create_lead(
  'Hausverwaltung Elbe GmbH', 'Sabine Lorenz', 'kundin@e2e.test', '+49 40 7654321',
  'Elbchaussee 21', '22765', 'Hamburg', 'Empfehlung', 'Treppenhaus und Buero') as id;
select pg_temp.sign_out();
grant select on lead_row to authenticated;

select pg_temp.assert(
  (select count(*) from public.leads where id = (select id from lead_row)
     and company_id = (select company from ctx)) = 1,
  'die Anfrage liegt im eigenen Betrieb');

-- ---------------------------------------------------------------------------
-- 2. Besichtigung mit Flaechen.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('e6000000-0000-4000-8000-000000000001');
create temporary table survey as
select public.schedule_site_survey(
  (select id from lead_row), null, 'Buerohaus Elbpalais', now() + interval '2 days',
  null, 'Elbchaussee 21', '22765', 'Hamburg', 'Schluessel beim Hausmeister') as id;
select pg_temp.sign_out();
grant select on survey to authenticated;

select pg_temp.sign_in('e6000000-0000-4000-8000-000000000001');
select public.add_survey_area(
  (select id from survey), 'Treppenhaus', 120, 'Stein', 5, 45, 3900, null);
select public.complete_site_survey((select id from survey), 'Zwei Etagen, Aufzug vorhanden.');
select pg_temp.sign_out();

select pg_temp.assert(
  (select status from public.site_surveys where id = (select id from survey))::text
    not in ('GEPLANT','PLANNED'),
  'die abgeschlossene Besichtigung steht nicht mehr auf geplant');

-- ---------------------------------------------------------------------------
-- 3. Angebot, verschickt.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('e6000000-0000-4000-8000-000000000001');
create temporary table quote as
select public.create_quote_from_survey((select id from survey), 'Unterhaltsreinigung Elbpalais', 30) as id;
select pg_temp.sign_out();
grant select on quote to authenticated;

select pg_temp.assert(
  (select count(*) from public.quote_lines where quote_id = (select id from quote)) > 0,
  'das Angebot uebernimmt die Flaechen der Besichtigung als Positionen');

select pg_temp.sign_in('e6000000-0000-4000-8000-000000000001');
select public.send_quote((select id from quote));
select pg_temp.sign_out();
select pg_temp.assert(
  (select status from public.quotes where id = (select id from quote))::text = 'SENT',
  'das Angebot ist verschickt');

-- Ein verschicktes Angebot ist ein Wort: seine Positionen aendern sich nicht.
select pg_temp.sign_in('e6000000-0000-4000-8000-000000000001');
do $$
begin
  begin
    perform public.add_quote_line(
      (select id from quote), 'Nachtraeglich teurer', 1, 'Pauschale', 99900, 1900, 'ONE_OFF');
    raise exception 'NOT REJECTED: ein verschicktes Angebot wurde nachtraeglich ergaenzt';
  exception when others then
    if position('sent' in lower(sqlerrm)) = 0 and position('draft' in lower(sqlerrm)) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- 4. Annahme: daraus entstehen Kunde, Objekt und Leistungsplan.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('e6000000-0000-4000-8000-000000000001');
-- accept_quote liefert die Kundin zurueck; der angelegte Plan haengt am
-- Angebot.
create temporary table accepted as
select public.accept_quote(
  (select id from quote), array[1,2,3,4,5]::smallint[], '07:00', '09:00',
  'KEINE_ABNAHME_ERFORDERLICH'::public.acceptance_policy) as customer_id;
select pg_temp.sign_out();
grant select on accepted to authenticated;

create temporary table schedule as
select created_schedule_id as id from public.quotes where id = (select id from quote);
grant select on schedule to authenticated;

select pg_temp.assert(
  (select id from schedule) is not null,
  'die Annahme legt einen Leistungsplan an, nicht nur einen Kunden');

select pg_temp.assert(
  (select count(*) from public.customers
    where company_id = (select company from ctx) and name = 'Hausverwaltung Elbe GmbH') = 1,
  'aus der Anfrage ist genau ein Kunde geworden');
select pg_temp.assert(
  (select count(*) from public.cleaning_objects
    where company_id = (select company from ctx)) = 1,
  'aus der Besichtigung ist genau ein Objekt geworden');
select pg_temp.assert(
  (select count(*) from public.schedule_rules
    where service_schedule_id = (select id from schedule) and is_active) = 5,
  'der Leistungsplan traegt die fuenf vereinbarten Wochentage');
select pg_temp.assert(
  (select count(*) from public.jobs where service_schedule_id = (select id from schedule)) > 0,
  'die Annahme erzeugt die Einsaetze, statt den Plan leer zu lassen');

-- Die vereinbarten Bedingungen lassen sich ueber das Planformular nicht
-- aushebeln: save_service_schedule holt sie aus dem angenommenen Angebot.
select pg_temp.sign_in('e6000000-0000-4000-8000-000000000001');
select public.save_service_schedule(
  (select id from schedule),
  (select customer_id from public.service_schedules where id = (select id from schedule)),
  (select cleaning_object_id from public.service_schedules where id = (select id from schedule)),
  null, 'Umbenannt', null, current_date, null,
  'VOR_ORT_UNTERSCHRIFT'::public.acceptance_policy,
  'STUNDENSATZ'::public.billing_mode,
  'MANUAL', false, array[]::uuid[], '[]'::jsonb, null);
select pg_temp.sign_out();
select pg_temp.assert(
  (select acceptance_policy from public.service_schedules where id = (select id from schedule))
    = 'KEINE_ABNAHME_ERFORDERLICH',
  'die Abnahmebedingung des angenommenen Angebots bleibt, was vereinbart wurde');

-- ---------------------------------------------------------------------------
-- 5. Der Einsatz wird gearbeitet.
-- ---------------------------------------------------------------------------
create temporary table visit as
select id from public.jobs
where service_schedule_id = (select id from schedule)
order by scheduled_date limit 1;
grant select on visit to authenticated;

insert into public.job_assignments (company_id, job_id, member_id)
select ctx.company, visit.id, member.id
from ctx, visit, public.company_members member
join public.profiles profile on profile.id = member.profile_id
where profile.auth_user_id = 'e6000000-0000-4000-8000-000000000011'
on conflict do nothing;

select pg_temp.sign_in('e6000000-0000-4000-8000-000000000011');
select public.start_my_job((select id from visit));
select pg_temp.sign_out();

update public.job_time_entries
set started_at = now() - interval '2 hours'
where job_id = (select id from visit);

select pg_temp.sign_in('e6000000-0000-4000-8000-000000000011');
select public.stop_my_job((select id from visit));
select pg_temp.sign_out();

select pg_temp.assert(
  (select status from public.jobs where id = (select id from visit)) = 'COMPLETED',
  'der gearbeitete Einsatz ist abgeschlossen');
select pg_temp.assert(
  (select count(*) from public.service_records where job_id = (select id from visit)) = 1,
  'aus dem Einsatz ist ein Leistungsnachweis geworden');

-- ---------------------------------------------------------------------------
-- 6. Rechnung, und ob sie als XRechnung vollstaendig ist.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('e6000000-0000-4000-8000-000000000001');
create temporary table invoice as
select public.create_draft_invoice(
  (select id from public.customers where company_id = (select company from ctx)),
  date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
  14::smallint, null::text, '991-01234-56'::text) as id;
grant select on invoice to authenticated;

select public.add_invoice_line(
  (select id from invoice), 'Unterhaltsreinigung Elbpalais'::text,
  2::numeric, 'Std'::text, 3900::bigint, 1900,
  (select id from visit), null, null);
select public.issue_invoice((select id from invoice), current_date);
select pg_temp.sign_out();

select pg_temp.assert(
  (select status from public.invoices where id = (select id from invoice))::text = 'ISSUED',
  'die Rechnung ist ausgestellt');
select pg_temp.assert(
  (select net_total_cents from public.invoices where id = (select id from invoice)) = 7800
    and (select vat_total_cents from public.invoices where id = (select id from invoice)) = 1482
    and (select gross_total_cents from public.invoices where id = (select id from invoice)) = 9282,
  'die Summen rechnen auf: 2 x 39,00 netto, 19 Prozent, 92,82 brutto');

-- Die XRechnung-Pflichtangaben, gegen den eingefrorenen Firmenabzug geprueft.
-- Fehlt hier etwas, laesst sich die Rechnung in Deutschland nicht versenden.
select pg_temp.assert(
  (select buyer_reference from public.invoices where id = (select id from invoice)) = '991-01234-56',
  'die Leitweg-ID steht auf der Rechnung (BT-10)');
select pg_temp.assert(
  (select (company_snapshot->>'phone') from public.invoices where id = (select id from invoice)) is not null,
  'die Telefonnummer des Verkaeufers ist eingefroren (BR-DE-6)');
select pg_temp.assert(
  (select (company_snapshot->>'iban') from public.invoices where id = (select id from invoice)) is not null
    and (select (company_snapshot->>'vat_id') from public.invoices where id = (select id from invoice)) is not null,
  'IBAN und Steuernummer stehen im Firmenabzug');
select pg_temp.assert(
  (select (customer_snapshot->>'name') from public.invoices where id = (select id from invoice))
    = 'Hausverwaltung Elbe GmbH',
  'der Kundenabzug traegt den Namen aus der urspruenglichen Anfrage');

-- Derselbe Einsatz wird nicht zweimal berechnet.
select pg_temp.sign_in('e6000000-0000-4000-8000-000000000001');
create temporary table second_invoice as
select public.create_draft_invoice(
  (select id from public.customers where company_id = (select company from ctx)),
  current_date, current_date, 14::smallint, null::text, null::text) as id;
grant select on second_invoice to authenticated;
do $$
begin
  begin
    perform public.add_invoice_line(
      (select id from second_invoice), 'Nochmal derselbe Einsatz'::text,
      2::numeric, 'Std'::text, 3900::bigint, 1900, (select id from visit), null, null);
    raise exception 'NOT REJECTED: derselbe Einsatz wurde zweimal berechnet';
  exception when others then
    if position('already been billed' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

-- Eine ausgestellte Rechnung wird nicht nachtraeglich veraendert.
select pg_temp.sign_in('e6000000-0000-4000-8000-000000000001');
do $$
begin
  begin
    perform public.add_invoice_line(
      (select id from invoice), 'Nachtrag'::text, 1::numeric, 'Pauschale'::text, 5000::bigint, 1900,
      null, null, null);
    raise exception 'NOT REJECTED: eine ausgestellte Rechnung wurde ergaenzt';
  exception when others then
    if position('draft' in lower(sqlerrm)) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- 7. Der Nachbarbetrieb sieht auf keiner Stufe etwas.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('e6000000-0000-4000-8000-000000000002');
select pg_temp.assert((select count(*) from public.leads) = 0, 'der Nachbarbetrieb sieht keine Anfrage');
select pg_temp.assert((select count(*) from public.site_surveys) = 0, 'der Nachbarbetrieb sieht keine Besichtigung');
select pg_temp.assert((select count(*) from public.quotes) = 0, 'der Nachbarbetrieb sieht kein Angebot');
select pg_temp.assert((select count(*) from public.customers) = 0, 'der Nachbarbetrieb sieht keinen Kunden');
select pg_temp.assert((select count(*) from public.cleaning_objects) = 0, 'der Nachbarbetrieb sieht kein Objekt');
select pg_temp.assert((select count(*) from public.service_schedules) = 0, 'der Nachbarbetrieb sieht keinen Plan');
select pg_temp.assert((select count(*) from public.jobs) = 0, 'der Nachbarbetrieb sieht keinen Einsatz');
select pg_temp.assert((select count(*) from public.service_records) = 0, 'der Nachbarbetrieb sieht keinen Leistungsnachweis');
select pg_temp.assert((select count(*) from public.invoices) = 0, 'der Nachbarbetrieb sieht keine Rechnung');
select pg_temp.assert((select count(*) from public.invoice_lines) = 0, 'der Nachbarbetrieb sieht keine Rechnungsposition');
select pg_temp.sign_out();

-- Die Mitarbeiterin sieht den Verkauf und die Abrechnung nicht.
select pg_temp.sign_in('e6000000-0000-4000-8000-000000000011');
select pg_temp.assert((select count(*) from public.quotes) = 0, 'eine Mitarbeiterin sieht keine Angebote');
select pg_temp.assert((select count(*) from public.invoices) = 0, 'eine Mitarbeiterin sieht keine Rechnungen');
select pg_temp.assert((select count(*) from public.leads) = 0, 'eine Mitarbeiterin sieht keine Anfragen');
select pg_temp.sign_out();

rollback;
\o
\echo 'Anfrage bis Rechnung: all assertions passed'
