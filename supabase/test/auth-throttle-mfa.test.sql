-- Anmeldebremse und Zwei-Faktor-Zwang. Run with supabase/test/run.sh.
--
-- Was hier festgehalten wird: das Anmeldeformular hatte keine Bremse, und es
-- gab keine Moeglichkeit, von Buero-Konten einen zweiten Faktor zu verlangen.
-- Beides an einem Formular, das Zugang zu Lohn- und Kundendaten gibt.
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

-- ---------------------------------------------------------------------------
-- Die Bremse
-- ---------------------------------------------------------------------------

-- Sie muss vor der Anmeldung funktionieren, also auch fuer anon.
set role anon;

select pg_temp.assert(
  (select allowed from public.register_auth_attempt('login', '198.51.100.7', 3, 600)),
  'der erste Versuch ist erlaubt');
select pg_temp.assert(
  (select allowed from public.register_auth_attempt('login', '198.51.100.7', 3, 600)),
  'der zweite Versuch ist erlaubt');
select pg_temp.assert(
  (select allowed from public.register_auth_attempt('login', '198.51.100.7', 3, 600)),
  'der dritte Versuch ist noch erlaubt -- das Limit ist erreicht, nicht ueberschritten');
select pg_temp.assert(
  not (select allowed from public.register_auth_attempt('login', '198.51.100.7', 3, 600)),
  'der vierte Versuch ist gesperrt');
select pg_temp.assert(
  (select retry_after_seconds from public.register_auth_attempt('login', '198.51.100.7', 3, 600)) between 1 and 600,
  'die Wartezeit liegt im Fenster');

-- Eine andere Adresse ist davon unberuehrt: wer sich aussperrt, sperrt nur
-- sich selbst aus.
select pg_temp.assert(
  (select allowed from public.register_auth_attempt('login', '203.0.113.9', 3, 600)),
  'eine andere Adresse ist nicht mitgesperrt');

-- Und ein anderer Vorgang auch nicht.
select pg_temp.assert(
  (select allowed from public.register_auth_attempt('password-reset', '198.51.100.7', 3, 600)),
  'die Passwort-Mail hat ihren eigenen Zaehler');

-- Eine gelungene Anmeldung loescht den Zaehler.
select public.clear_auth_attempts('login', '198.51.100.7');
select pg_temp.assert(
  (select allowed from public.register_auth_attempt('login', '198.51.100.7', 3, 600)),
  'nach einer gelungenen Anmeldung zaehlt es von vorn');

-- Das Fenster laeuft ab. Die Zeile wird zurueckdatiert, weil in einer
-- einzigen Transaktion `now()` nicht weitergeht.
select public.clear_auth_attempts('login', '192.0.2.5');
select public.register_auth_attempt('login', '192.0.2.5', 1, 600);
select pg_temp.assert(
  not (select allowed from public.register_auth_attempt('login', '192.0.2.5', 1, 600)),
  'nach dem Limit gesperrt');
reset role;
update public.auth_throttle set window_start = now() - interval '20 minutes'
where scope = 'login' and bucket = '192.0.2.5';
set role anon;
select pg_temp.assert(
  (select allowed from public.register_auth_attempt('login', '192.0.2.5', 1, 600)),
  'nach Ablauf des Fensters ist wieder offen');

reset role;
select pg_temp.assert(
  (select attempts from public.auth_throttle where scope = 'login' and bucket = '192.0.2.5') = 1,
  'das abgelaufene Fenster beginnt bei eins und zaehlt nicht weiter');
set role anon;

-- Eine unsinnige Konfiguration wird abgewiesen, statt alles durchzulassen.
do $$
begin
  begin
    perform public.register_auth_attempt('login', '198.51.100.8', 0, 600);
    raise exception 'NOT REJECTED: ein Limit von null wurde angenommen';
  exception when others then
    if position('Invalid throttle configuration' in sqlerrm) = 0 then raise; end if;
  end;
end $$;

-- Die Tabelle selbst bleibt zu: gelesen wird nur ueber die Funktionen.
do $$
begin
  begin
    perform count(*) from public.auth_throttle;
    raise exception 'NOT REJECTED: anon hat die Zaehler-Tabelle gelesen';
  exception when insufficient_privilege then
    null;
  end;
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Zwei-Faktor fuer das Buero
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('d2200000-0000-4000-8000-000000000001', 'inhaberin@mfa.test'),
  ('d2200000-0000-4000-8000-000000000002', 'buero@mfa.test'),
  ('d2200000-0000-4000-8000-000000000003', 'nachbarin@mfa.test');

select pg_temp.sign_in('d2200000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('MFA Reinigung GmbH');
select pg_temp.sign_in('d2200000-0000-4000-8000-000000000003');
select public.create_company_for_current_user('Nachbar MFA GmbH');
select pg_temp.sign_out();

create temporary table mfa_ctx as select
  (select id from public.companies where name = 'MFA Reinigung GmbH') as company,
  (select id from public.companies where name = 'Nachbar MFA GmbH') as other_company;
grant select on mfa_ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select mfa_ctx.company, profile.id, 'OFFICE', 'ACTIVE'
from mfa_ctx, public.profiles profile where profile.auth_user_id = 'd2200000-0000-4000-8000-000000000002';

-- Frisch angelegt ist er aus: ein bestehender Betrieb darf sich mit dem
-- Einspielen dieser Migration nicht selbst aussperren.
select pg_temp.assert(
  (select require_staff_mfa from public.companies where id = (select company from mfa_ctx)) = false,
  'der Zwang ist standardmaessig aus');

select pg_temp.sign_in('d2200000-0000-4000-8000-000000000001');
select public.set_require_staff_mfa(true);
select pg_temp.assert(
  (select require_staff_mfa from public.companies where id = (select company from mfa_ctx)),
  'die Inhaberin schaltet den Zwang ein');
select public.set_require_staff_mfa(false);
select pg_temp.assert(
  (select require_staff_mfa from public.companies where id = (select company from mfa_ctx)) = false,
  'die Inhaberin schaltet ihn wieder aus');
select pg_temp.sign_out();

-- Das Buero nicht: wer ihn abschalten darf, entscheidet ueber die Sicherheit
-- aller Buero-Konten, auch der Inhaberin.
select pg_temp.sign_in('d2200000-0000-4000-8000-000000000002');
do $$
begin
  begin
    perform public.set_require_staff_mfa(true);
    raise exception 'NOT REJECTED: eine Buerokraft hat den Zwei-Faktor-Zwang geaendert';
  exception when others then
    if position('OWNER' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

-- Und die Nachbarin aendert nur ihren eigenen Betrieb.
select pg_temp.sign_in('d2200000-0000-4000-8000-000000000003');
select public.set_require_staff_mfa(true);
select pg_temp.sign_out();
select pg_temp.assert(
  (select require_staff_mfa from public.companies where id = (select company from mfa_ctx)) = false,
  'die Nachbarin hat den fremden Betrieb nicht angefasst');
select pg_temp.assert(
  (select require_staff_mfa from public.companies where id = (select other_company from mfa_ctx)),
  'die Nachbarin hat ihren eigenen Betrieb umgestellt');

rollback;
\o
\echo 'Anmeldebremse und Zwei-Faktor: all assertions passed'
