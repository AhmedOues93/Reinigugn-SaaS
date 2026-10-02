-- Die Anmeldebremse, nach der Korrektur. Run with supabase/test/run.sh.
--
-- Diese Suite ist als Angriff geschrieben, nicht als Funktionsnachweis. Jede
-- der drei Umgehungen aus Migration 35 wird hier versucht, und jede muss
-- scheitern:
--
--   1. Zaehler oeffentlich zuruecksetzen.
--   2. Grenze selbst waehlen.
--   3. Schluessel selbst waehlen -- entweder um nie zu zaehlen, oder um eine
--      andere Person auszusperren.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;

create or replace function pg_temp.assert(c boolean, m text) returns void language plpgsql as $$
begin if not c then raise exception 'ASSERTION FAILED: %', m; end if; end; $$;
create or replace function pg_temp.sign_in(p_user uuid) returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', p_user::text, true); set role authenticated; end; $$;
create or replace function pg_temp.sign_out() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', true); end; $$;

-- Die Unterschrift, wie die Anwendung sie bildet.
create or replace function pg_temp.proof(p_scope text, p_bucket text, p_secret text)
returns text language sql as $$
  select encode(
    extensions.hmac(convert_to(p_scope || ':' || p_bucket, 'UTF8'), convert_to(p_secret, 'UTF8'), 'sha256'),
    'hex');
$$;

-- ---------------------------------------------------------------------------
-- Die alte, unsichere Signatur existiert nicht mehr
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'register_auth_attempt'
     and pg_get_function_identity_arguments(p.oid) = 'text, text, integer, integer') = 0,
  'die Fassung mit frei waehlbarer Grenze ist weg, nicht nur ueberdeckt');
select pg_temp.assert(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'register_auth_attempt') = 1,
  'und es gibt genau eine Fassung, keine zweite Ueberladung');

-- ---------------------------------------------------------------------------
-- Rechte: wer darf ueberhaupt was
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  has_function_privilege('anon', 'public.register_auth_attempt(text, text, text)', 'execute'),
  'zaehlen muss anon duerfen -- eine Anmeldung passiert vor der Anmeldung');
-- Das ist der Fehler aus 35, Zeile fuer Zeile:
select pg_temp.assert(
  not has_function_privilege('anon', 'public.clear_auth_attempts(text, text, text)', 'execute'),
  'anon darf den Zaehler NICHT zuruecksetzen');
select pg_temp.assert(
  has_function_privilege('authenticated', 'public.clear_auth_attempts(text, text, text)', 'execute'),
  'eine angemeldete Sitzung darf ihren eigenen Zaehler zuruecksetzen');
select pg_temp.assert(
  not has_function_privilege('anon', 'public.resolve_auth_throttle_key(text, text, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.resolve_auth_throttle_key(text, text, text)', 'execute'),
  'die Schluesselaufloesung ist kein oeffentlicher Dienst');
select pg_temp.assert(
  not has_table_privilege('anon', 'public.auth_throttle_config', 'select')
  and not has_table_privilege('authenticated', 'public.auth_throttle_config', 'select'),
  'der Signierschluessel ist fuer niemanden von aussen lesbar');
select pg_temp.assert(
  not has_table_privilege('anon', 'public.auth_throttle_policies', 'select')
  and not has_table_privilege('authenticated', 'public.auth_throttle_policies', 'update'),
  'die Grenzen sind von aussen weder lesbar noch aenderbar');
select pg_temp.assert(
  not has_table_privilege('anon', 'public.auth_throttle', 'select')
  and not has_table_privilege('authenticated', 'public.auth_throttle', 'select'),
  'die Zaehlertabelle bleibt zu');

-- ---------------------------------------------------------------------------
-- Ohne Signierschluessel: gemeinsamer Zaehler, weite Grenze, kein Aussperren
-- ---------------------------------------------------------------------------
set role anon;

-- Ein frei erfundener Schluessel und eine erfundene Unterschrift aendern ohne
-- hinterlegtes Geheimnis nichts: gezaehlt wird gemeinsam.
select public.register_auth_attempt('login', '198.51.100.7', 'nicht-die-echte-unterschrift');
select public.register_auth_attempt('login', '203.0.113.9', null);
reset role;
select pg_temp.assert(
  (select count(*) from public.auth_throttle) = 1
  and (select bucket from public.auth_throttle) = 'shared'
  and (select attempts from public.auth_throttle) = 2,
  'ohne Geheimnis zaehlen verschiedene erfundene Schluessel auf denselben Zaehler');
select pg_temp.assert(
  (select scope from public.auth_throttle) = 'login:shared',
  'und zwar unter der weiten Richtlinie, nicht unter der engen');
delete from public.auth_throttle;

-- Ein unbekannter Vorgang ist kein Freifahrtschein.
set role anon;
do $$
begin
  begin
    perform public.register_auth_attempt('irgendwas-neues', null, null);
    raise exception 'NOT REJECTED: ein unbekannter Vorgang wurde gezaehlt';
  exception when others then
    if position('Unknown throttle scope' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Mit Signierschluessel: nur die eigene Anwendung waehlt den Schluessel
-- ---------------------------------------------------------------------------
update public.auth_throttle_config
set signing_secret = 'ein-ausreichend-langes-testgeheimnis-32+'
where id;

set role anon;
-- Falsche Unterschrift: der mitgeschickte Schluessel wird verworfen.
select public.register_auth_attempt('login', '198.51.100.7', 'falsch');
reset role;
select pg_temp.assert(
  (select bucket from public.auth_throttle) = 'shared',
  'eine falsche Unterschrift waehlt keinen Schluessel');
delete from public.auth_throttle;

set role anon;
-- Richtige Unterschrift: der Schluessel gilt, gespeichert wird sein Hash.
select public.register_auth_attempt('login', '198.51.100.7',
  pg_temp.proof('login', '198.51.100.7', 'ein-ausreichend-langes-testgeheimnis-32+'));
reset role;
select pg_temp.assert(
  (select bucket from public.auth_throttle) <> 'shared'
  and (select scope from public.auth_throttle) = 'login',
  'mit richtiger Unterschrift gilt der Schluessel und die enge Richtlinie');
select pg_temp.assert(
  (select bucket from public.auth_throttle) not like '%198.51.100.7%'
  and (select length(bucket) from public.auth_throttle) = 64,
  'die Adresse selbst steht nicht in der Tabelle, nur ihr Hash');

-- ---------------------------------------------------------------------------
-- Die Grenze gilt und laesst sich nicht wegargumentieren
-- ---------------------------------------------------------------------------
delete from public.auth_throttle;
update public.auth_throttle_policies set max_attempts = 3 where scope = 'login';

set role anon;
select pg_temp.assert(
  (select allowed from public.register_auth_attempt('login', '198.51.100.7',
    pg_temp.proof('login', '198.51.100.7', 'ein-ausreichend-langes-testgeheimnis-32+'))),
  'erster Versuch erlaubt');
select public.register_auth_attempt('login', '198.51.100.7',
  pg_temp.proof('login', '198.51.100.7', 'ein-ausreichend-langes-testgeheimnis-32+'));
select pg_temp.assert(
  (select allowed from public.register_auth_attempt('login', '198.51.100.7',
    pg_temp.proof('login', '198.51.100.7', 'ein-ausreichend-langes-testgeheimnis-32+'))),
  'dritter Versuch noch erlaubt -- die Grenze ist erreicht, nicht ueberschritten');
select pg_temp.assert(
  not (select allowed from public.register_auth_attempt('login', '198.51.100.7',
    pg_temp.proof('login', '198.51.100.7', 'ein-ausreichend-langes-testgeheimnis-32+'))),
  'vierter Versuch gesperrt');
select pg_temp.assert(
  (select retry_after_seconds from public.register_auth_attempt('login', '198.51.100.7',
    pg_temp.proof('login', '198.51.100.7', 'ein-ausreichend-langes-testgeheimnis-32+'))) between 1 and 600,
  'und die Wartezeit liegt im Fenster');

-- Der eigentliche Angriff aus 35: zuruecksetzen und weitermachen.
do $$
begin
  begin
    perform public.clear_auth_attempts('login', '198.51.100.7', null);
    raise exception 'NOT REJECTED: anon hat den Zaehler zurueckgesetzt';
  exception when insufficient_privilege then
    null;
  end;
end $$;
select pg_temp.assert(
  not (select allowed from public.register_auth_attempt('login', '198.51.100.7',
    pg_temp.proof('login', '198.51.100.7', 'ein-ausreichend-langes-testgeheimnis-32+'))),
  'nach dem Versuch, zurueckzusetzen, ist weiter gesperrt');
reset role;

-- Auch ein anderer Vorgang hilft nicht weiter: eigener Zaehler.
set role anon;
select pg_temp.assert(
  (select allowed from public.register_auth_attempt('password-reset', '198.51.100.7',
    pg_temp.proof('password-reset', '198.51.100.7', 'ein-ausreichend-langes-testgeheimnis-32+'))),
  'die Passwort-Mail hat ihren eigenen Zaehler');
-- Und eine Unterschrift aus einem Vorgang gilt nicht im anderen.
select public.register_auth_attempt('login', '198.51.100.8',
  pg_temp.proof('password-reset', '198.51.100.8', 'ein-ausreichend-langes-testgeheimnis-32+'));
reset role;
select pg_temp.assert(
  (select count(*) from public.auth_throttle where bucket = 'shared' and scope = 'login:shared') = 1,
  'eine Unterschrift aus einem anderen Vorgang waehlt keinen Schluessel');

-- ---------------------------------------------------------------------------
-- Zuruecksetzen: nur angemeldet, nur mit Unterschrift, nie gemeinsam
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values ('c7700000-0000-4000-8000-000000000001', 'drin@bremse.test');
select pg_temp.sign_in('c7700000-0000-4000-8000-000000000001');
select public.clear_auth_attempts('login', '198.51.100.7',
  pg_temp.proof('login', '198.51.100.7', 'ein-ausreichend-langes-testgeheimnis-32+'));
select pg_temp.sign_out();
select pg_temp.assert(
  (select count(*) from public.auth_throttle
   where scope = 'login'
     and bucket = encode(extensions.digest(convert_to('signed:198.51.100.7', 'UTF8'), 'sha256'::text), 'hex')) = 0,
  'eine angemeldete Sitzung setzt ihren eigenen Zaehler mit Unterschrift zurueck');

-- Ohne Unterschrift und ohne Kopfzeilen laeuft es auf den gemeinsamen Zaehler,
-- und der wird nie geloescht: sonst loest eine gelungene Anmeldung die Bremse
-- fuer alle.
select pg_temp.sign_in('c7700000-0000-4000-8000-000000000001');
select public.clear_auth_attempts('login', '203.0.113.9', null);
select pg_temp.sign_out();
select pg_temp.assert(
  (select count(*) from public.auth_throttle where bucket = 'shared') >= 1,
  'der gemeinsame Zaehler wird nicht zurueckgesetzt');

-- Und eine fremde Adresse laesst sich ohne Unterschrift nicht zuruecksetzen.
delete from public.auth_throttle;
set role anon;
select public.register_auth_attempt('login', '198.51.100.7',
  pg_temp.proof('login', '198.51.100.7', 'ein-ausreichend-langes-testgeheimnis-32+'));
reset role;
select pg_temp.sign_in('c7700000-0000-4000-8000-000000000001');
select public.clear_auth_attempts('login', '198.51.100.7', 'erfundene-unterschrift');
select pg_temp.sign_out();
select pg_temp.assert(
  (select count(*) from public.auth_throttle where scope = 'login') = 1,
  'ohne gueltige Unterschrift bleibt der Zaehler der fremden Adresse stehen');

rollback;
\o
\echo 'Anmeldebremse (gehaertet): all assertions passed'
