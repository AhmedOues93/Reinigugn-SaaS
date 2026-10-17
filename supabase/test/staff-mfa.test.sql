-- Zwei-Faktor-Zwang fuer das Buero. Run with supabase/test/run.sh.
--
-- Was hier festgehalten wird: es gab keine Moeglichkeit, von Buero-Konten
-- einen zweiten Faktor zu verlangen -- an einem Zugang, der Lohn- und
-- Kundendaten haelt.
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

-- Die Bremse selbst steht in auth-throttle-hardening.test.sql. Sie ist dort
-- als Angriff geschrieben, nachdem die Fassung aus Migration 35 sich
-- oeffentlich zuruecksetzen liess; hier bleibt nur der Zwei-Faktor-Teil.

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
\echo 'Zwei-Faktor-Zwang: all assertions passed'
