-- Firmendaten speichern. Run with supabase/test/run.sh.
--
-- Drei Dinge sind hier schiefgegangen und duerfen nicht zurueckkommen:
--   1. set_company_datev_settings rief public.current_company_member() auf,
--      eine Funktion, die keine Migration angelegt hatte, und schrieb ausserdem
--      companies.updated_at, eine Spalte, die es nicht gibt. Jeder
--      Speicherversuch brach ab -- der gemeldete "DATEV-Fehler".
--   2. Geschaeftsfuehrung und Umsatzsteuersatz liessen sich nicht leeren, weil
--      die Onboarding-Funktion leere Werte bewusst festhaelt.
--   3. Beides zusammen hiess: wer ein Feld leerte, bekam einen Fehler, und
--      DATEV-Einstellungen und Schwerpunkte wurden gar nicht gespeichert.
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
  ('a2000000-0000-4000-8000-000000000001', 'owner@settings.test'),
  ('a2000000-0000-4000-8000-000000000002', 'office@settings.test'),
  ('a2000000-0000-4000-8000-000000000003', 'owner-other@settings.test');

select pg_temp.sign_in('a2000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Stammdaten GmbH');
select pg_temp.sign_in('a2000000-0000-4000-8000-000000000003');
select public.create_company_for_current_user('Nachbar GmbH');
select pg_temp.sign_out();

create temporary table ctx as select
  (select id from public.companies where name = 'Stammdaten GmbH') as company,
  (select id from public.companies where name = 'Nachbar GmbH') as other_company;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select ctx.company, profile.id, 'OFFICE', 'ACTIVE'
from ctx, public.profiles profile
where profile.auth_user_id = 'a2000000-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
-- Die Kern-Stammdaten, so wie das Einstellungsformular sie schickt.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a2000000-0000-4000-8000-000000000001');
select public.update_my_company_master_data(
  'Stammdaten GmbH', 'GmbH', 'Musterweg 3', '20095', 'Hamburg', 'Deutschland',
  '+49 40 1112233', 'buero@settings.test', 'https://settings.test',
  '22/815/08154', 'DE999999999', 'rechnung@settings.test',
  'DE02120300000000202051', 'BYLADEM1001', 14::smallint, 'Europe/Berlin', 'de');
select pg_temp.sign_out();

select pg_temp.assert(
  (select phone from public.companies where id = (select company from ctx)) = '+49 40 1112233'
    and (select iban from public.companies where id = (select company from ctx)) = 'DE02120300000000202051',
  'die Kern-Firmendaten werden gespeichert');

-- ---------------------------------------------------------------------------
-- DATEV. Ohne current_company_member() brach genau dieser Aufruf ab.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a2000000-0000-4000-8000-000000000001');
select public.set_company_datev_settings('1234567', '54321', 'SKR03', '8400', '8300', '8120');
select pg_temp.sign_out();

select pg_temp.assert(
  (select datev_beraternummer from public.companies where id = (select company from ctx)) = '1234567'
    and (select datev_kontenrahmen from public.companies where id = (select company from ctx)) = 'SKR03'
    and (select datev_revenue_account_19 from public.companies where id = (select company from ctx)) = '8400',
  'die DATEV-Einstellungen werden gespeichert');

-- Leeren muss auch leeren, sonst bleibt eine falsche Nummer stehen.
select pg_temp.sign_in('a2000000-0000-4000-8000-000000000001');
select public.set_company_datev_settings('', '', '', '', '', '');
select pg_temp.sign_out();
select pg_temp.assert(
  (select datev_beraternummer from public.companies where id = (select company from ctx)) is null,
  'eine geleerte DATEV-Nummer wird auch geleert');

-- Nur die Inhaberin. Das Buero sieht die Steuerdaten, aendert sie aber nicht.
select pg_temp.sign_in('a2000000-0000-4000-8000-000000000002');
do $$
begin
  begin
    perform public.set_company_datev_settings('9999999', '', '', '', '', '');
    raise exception 'NOT REJECTED: OFFICE konnte DATEV aendern';
  exception when others then
    if position('Only OWNER' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Geschaeftsfuehrung und Umsatzsteuersatz: setzen UND leeren.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a2000000-0000-4000-8000-000000000001');
select public.set_company_management('Ahmed Oues', 700);
select pg_temp.sign_out();
select pg_temp.assert(
  (select managing_director from public.companies where id = (select company from ctx)) = 'Ahmed Oues'
    and (select default_vat_rate_basis_points from public.companies where id = (select company from ctx)) = 700,
  'Geschaeftsfuehrung und Steuersatz werden gespeichert');

select pg_temp.sign_in('a2000000-0000-4000-8000-000000000001');
select public.set_company_management('   ', null);
select pg_temp.sign_out();
select pg_temp.assert(
  (select managing_director from public.companies where id = (select company from ctx)) is null,
  'eine geleerte Geschaeftsfuehrung wird wirklich entfernt');
select pg_temp.assert(
  (select default_vat_rate_basis_points from public.companies where id = (select company from ctx)) = 1900,
  'ein geleerter Steuersatz faellt auf den Regelsatz zurueck, statt NULL zu werden');

-- Die alte Onboarding-Funktion darf weiterhin festhalten, was sie festhaelt:
-- sie schickt die Felder einzeln, dort waere Loeschen ein Datenverlust.
select pg_temp.sign_in('a2000000-0000-4000-8000-000000000001');
select public.set_company_management('Ahmed Oues', 1900);
select public.save_company_profile(p_managing_director => '');
select pg_temp.sign_out();
select pg_temp.assert(
  (select managing_director from public.companies where id = (select company from ctx)) = 'Ahmed Oues',
  'save_company_profile behaelt sein Verhalten, damit der Wizard nichts loescht');

-- Unsinnige Steuersaetze werden abgelehnt, nicht gespeichert.
select pg_temp.sign_in('a2000000-0000-4000-8000-000000000001');
do $$
begin
  begin
    perform public.set_company_management('Ahmed Oues', 12000);
    raise exception 'NOT REJECTED: 120 %% Umsatzsteuer wurden gespeichert';
  exception when others then
    if position('VAT rate' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

select pg_temp.sign_in('a2000000-0000-4000-8000-000000000002');
do $$
begin
  begin
    perform public.set_company_management('Buero', 1900);
    raise exception 'NOT REJECTED: OFFICE konnte die Geschaeftsfuehrung aendern';
  exception when others then
    if position('OWNER' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Mandantentrennung: nichts davon fasst den Nachbarbetrieb an.
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select managing_director from public.companies where id = (select other_company from ctx)) is null
    and (select datev_beraternummer from public.companies where id = (select other_company from ctx)) is null
    and (select phone from public.companies where id = (select other_company from ctx)) is null,
  'der Nachbarbetrieb bleibt vollstaendig unberuehrt');

rollback;
\o
\echo 'Firmendaten- und DATEV-Invarianten: all assertions passed'
