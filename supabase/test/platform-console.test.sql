-- Plattform-Konsole und Zugangssperre.
-- Run with supabase/test/run.sh.
--
-- Was hier nicht passieren darf: ein Betrieb sieht die Konsole, ein Betrieb
-- verlaengert sich selbst den Test, oder das Einspielen der Migration sperrt
-- laufende Pilotbetriebe, bevor jemand den Schalter umlegt.
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
begin if not coalesce(c, false) then raise exception 'ASSERTION FAILED: %', m; end if; end; $$;
create or replace function pg_temp.rejects(q text) returns boolean language plpgsql as $$
begin
  begin execute q; exception when others then return true; end;
  return false;
end; $$;

-- Ein Betrieb mit Inhaberin, eine Betreiberin, eine Fremde.
insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'inhaberin@plattform.test'),
  ('f1000000-0000-4000-8000-000000000002', 'betreiberin@plattform.test'),
  ('f1000000-0000-4000-8000-000000000003', 'fremde@plattform.test');
insert into public.companies (id, name, slug)
  values ('f2000000-0000-4000-8000-000000000001', 'Glanz Plattform GmbH', 'glanz-plattform');
insert into public.company_members (company_id, profile_id, role, status)
  select 'f2000000-0000-4000-8000-000000000001', id, 'OWNER', 'ACTIVE'
    from public.profiles where auth_user_id = 'f1000000-0000-4000-8000-000000000001';
insert into public.platform_admins (auth_user_id)
  values ('f1000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
select pg_temp.assert(not has_table_privilege('authenticated', 'public.platform_admins', 'SELECT'),
  'Betreiberliste ist fuer Browser unsichtbar');
select pg_temp.assert(not has_table_privilege('authenticated', 'public.platform_admins', 'INSERT'),
  'niemand macht sich per API zum Betreiber');
select pg_temp.assert(not has_table_privilege('authenticated', 'public.platform_settings', 'UPDATE'),
  'der Sperrschalter ist nur ueber die Konsole erreichbar');
select pg_temp.assert(not has_function_privilege('anon', 'public.platform_list_companies()', 'EXECUTE'),
  'anonym keine Konsole');
select pg_temp.assert(not has_function_privilege('anon', 'public.company_has_access(uuid)', 'EXECUTE'),
  'anonym keine Zugangsabfrage');
select pg_temp.assert(not has_function_privilege('authenticated', 'public.platform_log(uuid,text,jsonb)', 'EXECUTE'),
  'das Protokoll schreibt nur die Konsole selbst');

-- Die Inhaberin ist keine Betreiberin.
select pg_temp.sign_in('f1000000-0000-4000-8000-000000000001');
select pg_temp.assert(not public.is_platform_admin(), 'Inhaberin ist keine Betreiberin');
select pg_temp.assert(pg_temp.rejects('select * from public.platform_list_companies()'),
  'Inhaberin sieht keine fremden Betriebe');
select pg_temp.assert(pg_temp.rejects($q$select public.platform_set_trial_end('f2000000-0000-4000-8000-000000000001', now() + interval '1 year')$q$),
  'Inhaberin verlaengert sich nicht selbst den Test');
select pg_temp.assert(pg_temp.rejects($q$select public.platform_set_comp_access('f2000000-0000-4000-8000-000000000001', now() + interval '1 year', 'selbst')$q$),
  'Inhaberin schenkt sich keinen Zugang');
select pg_temp.assert(pg_temp.rejects('select public.platform_set_enforce_access(false)'),
  'Inhaberin schaltet die Sperre nicht ab');

-- Fremde: kein Mitglied, also auch keine Begruendung zum Zugang.
select pg_temp.sign_in('f1000000-0000-4000-8000-000000000003');
select pg_temp.assert(pg_temp.rejects($q$select * from public.get_my_company_access('f2000000-0000-4000-8000-000000000001')$q$),
  'Fremde erfahren nichts ueber den Zugang eines Betriebs');

-- ---------------------------------------------------------------------------
-- Ausgangslage: Sperre aus, Pilotbetrieb arbeitet weiter
-- ---------------------------------------------------------------------------
select pg_temp.sign_out();
update public.company_subscriptions
   set trial_started_at = now() - interval '60 days', trial_ends_at = now() - interval '30 days', status = 'TRIALING'
 where company_id = 'f2000000-0000-4000-8000-000000000001';
select pg_temp.assert(not (select enforce_access from public.platform_settings), 'die Sperre beginnt ausgeschaltet');
select pg_temp.assert(public.company_has_access('f2000000-0000-4000-8000-000000000001'),
  'abgelaufener Test sperrt nicht, solange die Sperre aus ist');

select pg_temp.sign_in('f1000000-0000-4000-8000-000000000001');
insert into public.customers (company_id, name) values ('f2000000-0000-4000-8000-000000000001', 'Kunde vor der Sperre');
select pg_temp.assert((select count(*) = 1 from public.customers where name = 'Kunde vor der Sperre'),
  'Pilotbetrieb schreibt weiter');

-- ---------------------------------------------------------------------------
-- Betreiberin sieht den Betrieb und was die Sperre bewirken wuerde
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('f1000000-0000-4000-8000-000000000002');
select pg_temp.assert(public.is_platform_admin(), 'Betreiberin erkannt');
select pg_temp.assert((
  select owner_email = 'inhaberin@plattform.test' and customer_count = 1 and has_access and not would_have_access
    from public.platform_list_companies()
   where company_id = 'f2000000-0000-4000-8000-000000000001'),
  'Liste zeigt Inhaberin, Kunden und dass die Sperre diesen Betrieb treffen wuerde');

select public.platform_set_enforce_access(true);
select pg_temp.assert((select enforce_access from public.platform_get_settings()), 'Sperre eingeschaltet');

-- ---------------------------------------------------------------------------
-- Sperre an: abgelaufener Test darf lesen, nicht schreiben
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('f1000000-0000-4000-8000-000000000001');
select pg_temp.assert(not public.company_has_access('f2000000-0000-4000-8000-000000000001'), 'Test abgelaufen, kein Zugang');
select pg_temp.assert((select reason = 'TRIAL_ENDED' from public.get_my_company_access('f2000000-0000-4000-8000-000000000001')),
  'Grund: Test beendet');
select pg_temp.assert((select count(*) = 1 from public.customers where company_id = 'f2000000-0000-4000-8000-000000000001'),
  'Daten bleiben lesbar (Export)');
select pg_temp.assert(pg_temp.rejects($q$insert into public.customers (company_id, name) values ('f2000000-0000-4000-8000-000000000001', 'nach der Sperre')$q$),
  'ohne Zugang kein neuer Datensatz');
update public.customers set name = 'umbenannt' where company_id = 'f2000000-0000-4000-8000-000000000001';
select pg_temp.assert((select count(*) = 0 from public.customers where name = 'umbenannt'),
  'ohne Zugang keine Aenderung');
select pg_temp.assert((select count(*) = 3 from pg_policies
                        where tablename = 'customers' and policyname like 'access\_required\_%' and permissive = 'RESTRICTIVE'),
  'Einfuegen, Aendern und Loeschen sind restriktiv geregelt');

-- ---------------------------------------------------------------------------
-- Test verlaengern stellt den Zugang wieder her
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('f1000000-0000-4000-8000-000000000002');
select pg_temp.assert(pg_temp.rejects($q$select public.platform_set_trial_end('f2000000-0000-4000-8000-000000000001', now() - interval '90 days')$q$),
  'Testende vor dem Teststart wird abgelehnt');
select public.platform_set_trial_end('f2000000-0000-4000-8000-000000000001', now() + interval '14 days');
select pg_temp.assert(public.company_has_access('f2000000-0000-4000-8000-000000000001'), 'verlaengerter Test gibt Zugang');

-- ---------------------------------------------------------------------------
-- Freier Zugang auch nach Testende
-- ---------------------------------------------------------------------------
select pg_temp.sign_out();
update public.company_subscriptions set trial_ends_at = now() - interval '1 day'
 where company_id = 'f2000000-0000-4000-8000-000000000001';
select pg_temp.sign_in('f1000000-0000-4000-8000-000000000002');
select pg_temp.assert(not public.company_has_access('f2000000-0000-4000-8000-000000000001'), 'wieder abgelaufen');
select pg_temp.assert(pg_temp.rejects($q$select public.platform_set_comp_access('f2000000-0000-4000-8000-000000000001', now() - interval '1 day', 'x')$q$),
  'freier Zugang in der Vergangenheit wird abgelehnt');
select public.platform_set_comp_access('f2000000-0000-4000-8000-000000000001', now() + interval '6 months', '  Pilotkunde  ');
select pg_temp.assert(public.company_has_access('f2000000-0000-4000-8000-000000000001'), 'freier Zugang wirkt');
select pg_temp.assert((select comp_access_note = 'Pilotkunde' from public.platform_list_companies()
                        where company_id = 'f2000000-0000-4000-8000-000000000001'), 'Notiz ohne Leerraum gespeichert');

select pg_temp.sign_in('f1000000-0000-4000-8000-000000000001');
insert into public.customers (company_id, name) values ('f2000000-0000-4000-8000-000000000001', 'mit freiem Zugang');
select pg_temp.assert((select count(*) = 2 from public.customers where company_id = 'f2000000-0000-4000-8000-000000000001'),
  'mit freiem Zugang wird wieder geschrieben');

-- ---------------------------------------------------------------------------
-- Sperre eines Betriebs schlaegt alles, auch bei ausgeschalteter Sperre
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('f1000000-0000-4000-8000-000000000002');
select pg_temp.assert(pg_temp.rejects($q$select public.platform_set_suspended('f2000000-0000-4000-8000-000000000001', true, '  ')$q$),
  'Sperre braucht einen Grund');
select public.platform_set_suspended('f2000000-0000-4000-8000-000000000001', true, 'Zahlung offen');
select public.platform_set_enforce_access(false);
select pg_temp.assert(not public.company_has_access('f2000000-0000-4000-8000-000000000001'),
  'gesperrt trotz freiem Zugang und ausgeschalteter Sperre');
select pg_temp.sign_in('f1000000-0000-4000-8000-000000000001');
select pg_temp.assert((select reason = 'SUSPENDED' from public.get_my_company_access('f2000000-0000-4000-8000-000000000001')),
  'Grund: gesperrt');
select pg_temp.sign_in('f1000000-0000-4000-8000-000000000002');
select public.platform_set_suspended('f2000000-0000-4000-8000-000000000001', false, null);
select pg_temp.assert(public.company_has_access('f2000000-0000-4000-8000-000000000001'), 'Freigabe hebt die Sperre auf');

-- ---------------------------------------------------------------------------
-- Aktives und ueberfaelliges Abo
-- ---------------------------------------------------------------------------
select public.platform_set_enforce_access(true);
select public.platform_set_comp_access('f2000000-0000-4000-8000-000000000001', null, 'egal');
select pg_temp.sign_out();
update public.company_subscriptions set status = 'PAST_DUE' where company_id = 'f2000000-0000-4000-8000-000000000001';
select pg_temp.assert(public.company_has_access('f2000000-0000-4000-8000-000000000001'),
  'PAST_DUE arbeitet weiter, solange Stripe die Zahlung versucht');
update public.company_subscriptions set status = 'CANCELED' where company_id = 'f2000000-0000-4000-8000-000000000001';
select pg_temp.assert(not public.company_has_access('f2000000-0000-4000-8000-000000000001'), 'gekuendigt ohne Test: kein Zugang');
update public.company_subscriptions set status = 'ACTIVE' where company_id = 'f2000000-0000-4000-8000-000000000001';
select pg_temp.assert(public.company_has_access('f2000000-0000-4000-8000-000000000001'), 'aktives Abo: Zugang');

-- ---------------------------------------------------------------------------
-- Protokoll: vollstaendig und unveraenderlich
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('f1000000-0000-4000-8000-000000000002');
select pg_temp.assert((
  select array_agg(action order by occurred_at, action) @> array[
    'ENFORCEMENT_ON', 'TRIAL_END_SET', 'COMP_ACCESS_GRANTED', 'SUSPENDED', 'ENFORCEMENT_OFF', 'UNSUSPENDED', 'COMP_ACCESS_REVOKED']
    from public.platform_list_actions(50)),
  'jede Aenderung steht im Protokoll');
select pg_temp.assert((select bool_and(actor_email = 'betreiberin@plattform.test') from public.platform_list_actions(50)),
  'mit der Betreiberin als Urheberin');
select pg_temp.sign_out();
select pg_temp.assert(pg_temp.rejects('update public.platform_admin_actions set action = $$x$$'),
  'Protokoll laesst sich nicht aendern');
select pg_temp.assert(pg_temp.rejects('delete from public.platform_admin_actions'),
  'Protokoll laesst sich nicht loeschen');

rollback;
\o
\echo 'Plattform-Konsole und Zugangssperre: all assertions passed'
