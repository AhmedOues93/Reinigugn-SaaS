-- In welchem Betrieb handelt jemand. Run with supabase/test/run.sh.
--
-- Fuenf Funktionen loesen "wer ruft hier auf" in eine Mitgliedschaft auf und
-- endeten mit `limit 1` ohne `order by`. Mehrere Mitgliedschaften sind
-- erlaubt -- `company_members` ist nur je Betrieb eindeutig -- und kommen vor:
-- eine Buerokraft, die zwei Reinigungsbetriebe betreut.
--
-- Dann durfte PostgreSQL jede Zeile liefern, abhaengig vom Ausfuehrungsplan.
-- Die Folge ist meist keine stille Falschbuchung, sondern eine
-- unverstaendliche Fehlermeldung: "Customer not found in this company",
-- obwohl die Kundin in der Liste steht -- und beim naechsten Mal klappt es.
--
-- Ehrlich zur Aussagekraft: ein Test kann "unbestimmt" nicht erzwingen.
-- Festgehalten ist darum die Regel selbst, und dass sie fuer alle fuenf
-- Funktionen dieselbe ist.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;

-- Diese fuenf Funktionen sind bewusst NICHT an `authenticated` vergeben: sie
-- sind interne Bausteine anderer security-definer-Funktionen, kein Dienst
-- fuer den Browser. Gepruefft wird darum ihre Zeilenauswahl mit gesetztem
-- Token, aber ohne Rollenwechsel -- und weiter unten, dass die Sperre haelt.
create or replace function pg_temp.sign_in(p_user uuid) returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', p_user::text, true); end; $$;
create or replace function pg_temp.sign_out() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', true); end; $$;
create or replace function pg_temp.assert(c boolean, m text) returns void language plpgsql as $$
begin if not c then raise exception 'ASSERTION FAILED: %', m; end if; end; $$;

insert into auth.users (id, email) values
  ('a2200000-0000-4000-8000-000000000001', 'inhaberin-alt@actor.test'),
  ('a2200000-0000-4000-8000-000000000002', 'inhaberin-neu@actor.test'),
  ('a2200000-0000-4000-8000-000000000011', 'buerokraft@actor.test'),
  ('a2200000-0000-4000-8000-000000000012', 'springerin@actor.test'),
  ('a2200000-0000-4000-8000-000000000013', 'inhaberin-und-buero@actor.test');

-- Zwei Betriebe. "Alt" wird zuerst angelegt und ist damit die aeltere
-- Mitgliedschaft -- darauf stuetzt sich die Regel.
select pg_temp.sign_in('a2200000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Actor Alt GmbH');
select pg_temp.sign_in('a2200000-0000-4000-8000-000000000002');
select public.create_company_for_current_user('Actor Neu GmbH');
select pg_temp.sign_out();

create temporary table actx as select
  (select id from public.companies where name = 'Actor Alt GmbH') as alt,
  (select id from public.companies where name = 'Actor Neu GmbH') as neu;
grant select on actx to authenticated;

-- Eine Buerokraft in beiden Betrieben. Die aeltere Mitgliedschaft zuerst
-- eingefuegt, mit ausdruecklich aelterem Zeitstempel.
insert into public.company_members (company_id, profile_id, role, status, created_at)
select (select alt from actx), profile.id, 'OFFICE'::public.company_role,
       'ACTIVE'::public.membership_status, now() - interval '2 days'
from public.profiles profile where profile.auth_user_id = 'a2200000-0000-4000-8000-000000000011';
insert into public.company_members (company_id, profile_id, role, status, created_at)
select (select neu from actx), profile.id, 'OFFICE'::public.company_role,
       'ACTIVE'::public.membership_status, now() - interval '1 day'
from public.profiles profile where profile.auth_user_id = 'a2200000-0000-4000-8000-000000000011';

-- Eine Springerin, die in beiden Betrieben putzt.
insert into public.company_members (company_id, profile_id, role, status, created_at)
select (select alt from actx), profile.id, 'EMPLOYEE'::public.company_role,
       'ACTIVE'::public.membership_status, now() - interval '2 days'
from public.profiles profile where profile.auth_user_id = 'a2200000-0000-4000-8000-000000000012';
insert into public.company_members (company_id, profile_id, role, status, created_at)
select (select neu from actx), profile.id, 'EMPLOYEE'::public.company_role,
       'ACTIVE'::public.membership_status, now() - interval '1 day'
from public.profiles profile where profile.auth_user_id = 'a2200000-0000-4000-8000-000000000012';

-- Jemand, der im *neueren* Betrieb Inhaberin und im aelteren nur Buero ist.
-- Hier gewinnt die Rolle, nicht das Alter.
insert into public.company_members (company_id, profile_id, role, status, created_at)
select (select alt from actx), profile.id, 'OFFICE'::public.company_role,
       'ACTIVE'::public.membership_status, now() - interval '2 days'
from public.profiles profile where profile.auth_user_id = 'a2200000-0000-4000-8000-000000000013';
insert into public.company_members (company_id, profile_id, role, status, created_at)
select (select neu from actx), profile.id, 'OWNER'::public.company_role,
       'ACTIVE'::public.membership_status, now() - interval '1 day'
from public.profiles profile where profile.auth_user_id = 'a2200000-0000-4000-8000-000000000013';

-- ---------------------------------------------------------------------------
-- Gleiche Rolle in beiden Betrieben: die aeltere Mitgliedschaft gewinnt
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a2200000-0000-4000-8000-000000000011');
select pg_temp.assert(
  (select company_id from public.billing_actor()) = (select alt from actx),
  'billing_actor waehlt die aeltere Mitgliedschaft');
select pg_temp.assert(
  (select company_id from public.sales_actor()) = (select alt from actx),
  'sales_actor waehlt die aeltere Mitgliedschaft');
select pg_temp.assert(
  (select company_id from public.messaging_actor()) = (select alt from actx),
  'messaging_actor waehlt die aeltere Mitgliedschaft');
select pg_temp.assert(
  (select company_id from public.phase7_current_member()) = (select alt from actx),
  'phase7_current_member waehlt die aeltere Mitgliedschaft');
select pg_temp.assert(
  (select company_id from public.current_company_member()) = (select alt from actx),
  'current_company_member folgt derselben Regel');

-- Und zwar bei jedem Aufruf dieselbe. Das war der eigentliche Defekt:
-- vorher war nicht festgelegt, welche Zeile kommt.
select pg_temp.assert(
  (select company_id from public.billing_actor()) = (select company_id from public.billing_actor()),
  'billing_actor liefert bei jedem Aufruf denselben Betrieb');
select pg_temp.assert(
  (select count(distinct company_id) from (
     select (select company_id from public.billing_actor()) as company_id
     union all select (select company_id from public.sales_actor())
     union all select (select company_id from public.messaging_actor())
     union all select (select company_id from public.phase7_current_member())
     union all select (select company_id from public.current_company_member())
   ) alle) = 1,
  'alle fuenf Funktionen waehlen denselben Betrieb -- eine Regel, nicht fuenf');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Die Zeiterfassung waehlt auch den aelteren Betrieb
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('a2200000-0000-4000-8000-000000000012');
select pg_temp.assert(
  (select company_id from public.current_employee_member()) = (select alt from actx),
  'current_employee_member waehlt die aeltere Mitgliedschaft');
select pg_temp.assert(
  (select company_id from public.current_employee_member())
    = (select company_id from public.current_employee_member()),
  'und bei jedem Aufruf dieselbe');
-- Eine Buerokraft ist keine Mitarbeiterin: der Rollenfilter bleibt, wie er war.
select pg_temp.sign_out();
select pg_temp.sign_in('a2200000-0000-4000-8000-000000000011');
select pg_temp.assert(
  (select count(*) from public.current_employee_member()) = 0
  or (select company_id from public.current_employee_member()) is null,
  'current_employee_member liefert einer Buerokraft keine Mitgliedschaft');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Verschiedene Rollen: die Rolle schlaegt das Alter
-- ---------------------------------------------------------------------------
-- Wer in einem Betrieb Inhaberin und im anderen Buero ist, handelt als
-- Inhaberin -- auch wenn diese Mitgliedschaft die neuere ist. Sonst waere
-- jemand in seinem eigenen Betrieb nur Buero.
select pg_temp.sign_in('a2200000-0000-4000-8000-000000000013');
select pg_temp.assert(
  (select company_id from public.billing_actor()) = (select neu from actx)
  and (select role from public.billing_actor()) = 'OWNER',
  'billing_actor nimmt die Inhaberschaft, nicht die aeltere Buerorolle');
select pg_temp.assert(
  (select role from public.sales_actor()) = 'OWNER'
  and (select role from public.messaging_actor()) = 'OWNER'
  and (select role from public.phase7_current_member()) = 'OWNER'
  and (select role from public.current_company_member()) = 'OWNER',
  'alle folgen derselben Rollenreihenfolge');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Eine abgeschaltete Mitgliedschaft zaehlt nicht mit
-- ---------------------------------------------------------------------------
-- Der Statusfilter bleibt unveraendert; gepruefft wird, dass die neue
-- Reihenfolge ihn nicht aushebelt.
update public.company_members set status = 'DISABLED'
where company_id = (select alt from actx)
  and profile_id = (select id from public.profiles where auth_user_id = 'a2200000-0000-4000-8000-000000000011');

select pg_temp.sign_in('a2200000-0000-4000-8000-000000000011');
select pg_temp.assert(
  (select company_id from public.billing_actor()) = (select neu from actx),
  'nach dem Abschalten der aelteren Mitgliedschaft gilt die neuere');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Die Sperre gegen den Browser haelt
-- ---------------------------------------------------------------------------
-- `security definer` umgeht RLS. Diese fuenf duerfen darum kein Dienst fuer
-- `anon` oder `authenticated` sein, sondern nur Baustein anderer Funktionen.
select pg_temp.assert(
  not exists (
    select 1
    from unnest(array[
      'public.billing_actor()', 'public.sales_actor()', 'public.messaging_actor()',
      'public.phase7_current_member()', 'public.current_employee_member()',
      'public.current_company_member()'
    ]) as fn
    cross join unnest(array['anon', 'authenticated']) as grantee
    where has_function_privilege(grantee, fn, 'execute')
      -- Die eine begruendete Ausnahme: drei RLS-Richtlinien rufen
      -- `phase7_current_member()` als `authenticated` auf ("employees read
      -- operational complaints", "... complaint updates", "... scoped
      -- complaint photos"). Ohne das Recht sehen Mitarbeiterinnen ihre
      -- Reklamationen nicht mehr. Darum steht sie hier namentlich und nicht
      -- als pauschale Lockerung.
      and not (fn = 'public.phase7_current_member()' and grantee = 'authenticated')
  ),
  'keine Actor-Funktion ist aus dem Browser aufrufbar -- ausser der, die eine Richtlinie braucht');

-- Und die Ausnahme ist wirklich begruendet: ohne eine Richtlinie, die sie
-- aufruft, waere sie keine.
select pg_temp.assert(
  (select count(*) from pg_policy pol
   where pg_get_expr(pol.polqual, pol.polrelid) like '%phase7_current_member%'
      or pg_get_expr(pol.polwithcheck, pol.polrelid) like '%phase7_current_member%') >= 1,
  'phase7_current_member wird tatsaechlich von mindestens einer Richtlinie aufgerufen');
select pg_temp.assert(
  (select count(*) from pg_policy pol
   where pg_get_expr(pol.polqual, pol.polrelid) like '%current_company_member%'
      or pg_get_expr(pol.polwithcheck, pol.polrelid) like '%current_company_member%') = 0,
  'current_company_member wird von keiner Richtlinie aufgerufen und braucht das Recht nicht');

rollback;
\o
\echo 'Betriebsauswahl (deterministisch): all assertions passed'
