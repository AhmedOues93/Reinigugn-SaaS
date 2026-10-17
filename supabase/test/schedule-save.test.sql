-- Wiederkehrende Plaene atomar speichern. Run with supabase/test/run.sh.
--
-- Der Fehler, den diese Suite festhaelt: das Speichern lief als Folge
-- einzelner Schreibvorgaenge und konnte mittendrin stehenbleiben. Uebrig blieb
-- ein aktiver Plan ohne Wochentag und ohne Team, waehrend die Oberflaeche
-- einen Fehler meldete. Alles oder nichts.
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
  ('b3000000-0000-4000-8000-000000000001', 'owner@planatomic.test'),
  ('b3000000-0000-4000-8000-000000000002', 'owner-other@planatomic.test'),
  ('b3000000-0000-4000-8000-000000000011', 'cleaner@planatomic.test');

select pg_temp.sign_in('b3000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Planfest GmbH');
select pg_temp.sign_in('b3000000-0000-4000-8000-000000000002');
select public.create_company_for_current_user('Fremdplan GmbH');
select pg_temp.sign_out();

create temporary table ctx as select
  (select id from public.companies where name = 'Planfest GmbH') as company,
  (select id from public.companies where name = 'Fremdplan GmbH') as other_company;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select ctx.company, profile.id, 'EMPLOYEE', 'ACTIVE'
from ctx, public.profiles profile
where profile.auth_user_id = 'b3000000-0000-4000-8000-000000000011';

insert into public.employee_details (company_id, profile_id, weekly_hours, is_active)
select ctx.company, profile.id, 40, true
from ctx, public.profiles profile
where profile.auth_user_id = 'b3000000-0000-4000-8000-000000000011';

insert into public.customers (company_id, name) select company, 'Kundin Nord' from ctx;
insert into public.customers (company_id, name) select company, 'Kundin Sued' from ctx;
insert into public.customers (company_id, name) select other_company, 'Fremde Kundin' from ctx;

insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company, customer.id, 'Objekt Nord'
from ctx join public.customers customer on customer.name = 'Kundin Nord';
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company, customer.id, 'Objekt Sued'
from ctx join public.customers customer on customer.name = 'Kundin Sued';
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.other_company, customer.id, 'Fremdes Objekt'
from ctx join public.customers customer on customer.name = 'Fremde Kundin';

create temporary table ids as select
  (select id from public.customers where name = 'Kundin Nord') as customer_nord,
  (select id from public.customers where name = 'Kundin Sued') as customer_sued,
  (select id from public.cleaning_objects where name = 'Objekt Nord') as object_nord,
  (select id from public.cleaning_objects where name = 'Objekt Sued') as object_sued,
  (select id from public.cleaning_objects where name = 'Fremdes Objekt') as object_fremd,
  (select member.id from public.company_members member
     join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'b3000000-0000-4000-8000-000000000011') as cleaner;
grant select on ids to authenticated;

create or replace function pg_temp.rules(p_days int[], p_from time, p_to time)
returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', null, 'weekday', day,
    'planned_start_time', p_from::text, 'planned_end_time', p_to::text)), '[]'::jsonb)
  from unnest(p_days) as day;
$$;

-- ---------------------------------------------------------------------------
-- Anlegen und aktivieren.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('b3000000-0000-4000-8000-000000000001');
create temporary table created as
select * from public.save_service_schedule(
  null, (select customer_nord from ids), (select object_nord from ids), null,
  'Unterhaltsreinigung Nord', 'Taeglich vormittags',
  current_date, null,
  'KEINE_ABNAHME_ERFORDERLICH'::public.acceptance_policy,
  'PAUSCHALE_PRO_EINSATZ'::public.billing_mode,
  'AUTO', true, array[]::uuid[],
  pg_temp.rules(array[1,2,3,4,5], '07:00', '09:00'),
  current_date + 13);
select pg_temp.sign_out();

select pg_temp.assert(
  (select count(*) from created) = 1 and (select assigned_member from created) = (select cleaner from ids),
  'ein neuer Auto-Plan bekommt sein Team und meldet, wer es ist');
select pg_temp.assert(
  (select count(*) from public.schedule_rules
    where service_schedule_id = (select schedule_id from created) and is_active) = 5,
  'die fuenf Wochentage werden gespeichert');
select pg_temp.assert(
  (select count(*) from public.jobs
    where service_schedule_id = (select schedule_id from created)) > 0,
  'ein aktivierter Plan erzeugt seine Einsaetze im selben Schritt');

-- ---------------------------------------------------------------------------
-- Der Kern: ein Fehlschlag laesst nichts Halbfertiges zurueck.
--
-- Der Mitarbeiter bekommt eine genehmigte Abwesenheit ueber den ganzen
-- Zeitraum, damit die automatische Zuweisung niemanden mehr findet. Vorher
-- waren an dieser Stelle die Regeln schon deaktiviert und das Team geloescht.
-- ---------------------------------------------------------------------------
insert into public.employee_absences (company_id, member_id, absence_type, status, start_date, end_date)
select ctx.company, ids.cleaner, 'VACATION', 'APPROVED', current_date, current_date + 90 from ctx, ids;

create temporary table before_failure as
select
  (select name from public.service_schedules where id = (select schedule_id from created)) as name,
  (select count(*) from public.schedule_rules
    where service_schedule_id = (select schedule_id from created) and is_active) as active_rules,
  (select count(*) from public.service_schedule_assignments
    where service_schedule_id = (select schedule_id from created)) as assignments,
  (select is_active from public.service_schedules where id = (select schedule_id from created)) as active;

select pg_temp.sign_in('b3000000-0000-4000-8000-000000000001');
do $$
declare target uuid;
begin
  select schedule_id into target from created;
  begin
    perform public.save_service_schedule(
      target, (select customer_sued from ids), (select object_sued from ids), null,
      'Umbenannt und umgezogen', 'Neu',
      current_date, null,
      'KEINE_ABNAHME_ERFORDERLICH'::public.acceptance_policy,
      'PAUSCHALE_PRO_EINSATZ'::public.billing_mode,
      'AUTO', true, array[]::uuid[],
      pg_temp.rules(array[6], '05:00', '06:00'),
      current_date + 13);
    raise exception 'NOT REJECTED: ein aktiver Plan ohne Team wurde gespeichert';
  exception when others then
    if position('Wochenstunden' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

select pg_temp.assert(
  (select name from public.service_schedules where id = (select schedule_id from created))
    = (select name from before_failure),
  'nach einem Fehlschlag traegt der Plan noch seinen alten Namen');
select pg_temp.assert(
  (select count(*) from public.schedule_rules
    where service_schedule_id = (select schedule_id from created) and is_active)
    = (select active_rules from before_failure),
  'nach einem Fehlschlag sind die bisherigen Wochentage noch aktiv');
select pg_temp.assert(
  (select count(*) from public.service_schedule_assignments
    where service_schedule_id = (select schedule_id from created))
    = (select assignments from before_failure),
  'nach einem Fehlschlag steht das bisherige Team noch im Plan');
select pg_temp.assert(
  (select cleaning_object_id from public.service_schedules where id = (select schedule_id from created))
    = (select object_nord from ids),
  'nach einem Fehlschlag zeigt der Plan noch auf sein altes Objekt');

-- Derselbe Plan, nur nicht aktiviert: ohne Team ist das erlaubt, weil ihn
-- niemand faehrt. Ein Entwurf darf unbesetzt sein.
select pg_temp.sign_in('b3000000-0000-4000-8000-000000000001');
select public.save_service_schedule(
  (select schedule_id from created), (select customer_nord from ids), (select object_nord from ids), null,
  'Unterhaltsreinigung Nord', 'Taeglich vormittags',
  current_date, null,
  'KEINE_ABNAHME_ERFORDERLICH'::public.acceptance_policy,
  'PAUSCHALE_PRO_EINSATZ'::public.billing_mode,
  'AUTO', false, array[]::uuid[],
  pg_temp.rules(array[1,2,3], '07:00', '09:00'),
  null);
select pg_temp.sign_out();
select pg_temp.assert(
  (select is_active from public.service_schedules where id = (select schedule_id from created)) = false
    and (select count(*) from public.schedule_rules
          where service_schedule_id = (select schedule_id from created) and is_active) = 3,
  'ein Entwurf darf ohne Team gespeichert werden und behaelt genau seine Wochentage');

-- Abgewaehlte Wochentage werden stillgelegt, nicht geloescht: erzeugte
-- Einsaetze zeigen auf ihre Regel.
select pg_temp.assert(
  (select count(*) from public.schedule_rules
    where service_schedule_id = (select schedule_id from created) and not is_active) = 2,
  'abgewaehlte Wochentage bleiben als stillgelegte Regel erhalten');

-- ---------------------------------------------------------------------------
-- Mandantentrennung und Zusammengehoerigkeit von Kunde und Objekt.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('b3000000-0000-4000-8000-000000000001');
do $$
begin
  begin
    perform public.save_service_schedule(
      null, (select customer_nord from ids), (select object_fremd from ids), null,
      'Fremdes Objekt', null, current_date, null,
      'KEINE_ABNAHME_ERFORDERLICH'::public.acceptance_policy,
      'PAUSCHALE_PRO_EINSATZ'::public.billing_mode,
      'AUTO', false, array[]::uuid[], '[]'::jsonb, null);
    raise exception 'NOT REJECTED: ein fremdes Objekt wurde eingeplant';
  exception when others then
    if position('Objekt' in sqlerrm) = 0 then raise; end if;
  end;

  begin
    perform public.save_service_schedule(
      null, (select customer_nord from ids), (select object_sued from ids), null,
      'Objekt der falschen Kundin', null, current_date, null,
      'KEINE_ABNAHME_ERFORDERLICH'::public.acceptance_policy,
      'PAUSCHALE_PRO_EINSATZ'::public.billing_mode,
      'AUTO', false, array[]::uuid[], '[]'::jsonb, null);
    raise exception 'NOT REJECTED: ein Objekt einer anderen Kundin wurde eingeplant';
  exception when others then
    if position('Kunden' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

-- Der Nachbarbetrieb kann diesen Plan nicht aendern.
select pg_temp.sign_in('b3000000-0000-4000-8000-000000000002');
do $$
begin
  begin
    perform public.save_service_schedule(
      (select schedule_id from created), (select customer_nord from ids), (select object_nord from ids), null,
      'Uebernommen', null, current_date, null,
      'KEINE_ABNAHME_ERFORDERLICH'::public.acceptance_policy,
      'PAUSCHALE_PRO_EINSATZ'::public.billing_mode,
      'AUTO', false, array[]::uuid[], '[]'::jsonb, null);
    raise exception 'NOT REJECTED: ein fremder Betrieb hat den Plan geaendert';
  exception when others then
    if position('not found' in lower(sqlerrm)) = 0 and position('customer' in lower(sqlerrm)) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();
select pg_temp.assert(
  (select name from public.service_schedules where id = (select schedule_id from created))
    = 'Unterhaltsreinigung Nord',
  'der Plan traegt nach dem Fremdzugriff unveraendert seinen Namen');

-- Mitarbeitende planen nicht.
select pg_temp.sign_in('b3000000-0000-4000-8000-000000000011');
do $$
begin
  begin
    perform public.save_service_schedule(
      null, (select customer_nord from ids), (select object_nord from ids), null,
      'Selbst geplant', null, current_date, null,
      'KEINE_ABNAHME_ERFORDERLICH'::public.acceptance_policy,
      'PAUSCHALE_PRO_EINSATZ'::public.billing_mode,
      'AUTO', false, array[]::uuid[], '[]'::jsonb, null);
    raise exception 'NOT REJECTED: eine Mitarbeiterin hat einen Plan angelegt';
  exception when others then
    if position('OWNER or OFFICE' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

rollback;
\o
\echo 'Planspeicherung (atomar): all assertions passed'
