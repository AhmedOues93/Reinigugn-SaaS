-- Die Ablaufsperre des Abos. Run with supabase/test/run.sh.
--
-- Zwei Richtungen, und die zweite ist die wichtigere:
--
--   * Nach Ablauf des Testzeitraums ohne Abo wird Bueroarbeit abgelehnt.
--   * Lesen, Exportieren, Zeiterfassung, Krankmeldung und Beschwerde gehen
--     weiter -- sonst waere die Sperre ein Datenverlust und kein Druckmittel.
--
-- Ohne die zweite Richtung koennte man die Sperre "sicherheitshalber" auf
-- alles legen und haette eine Kraft, die nicht ausstempeln kann.
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
/** Fuehrt eine Anweisung aus und erwartet, dass sie abgelehnt wird. */
create or replace function pg_temp.reject(p_sql text, p_message text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'ASSERTION FAILED: % (wurde nicht abgelehnt)', p_message;
exception
  when sqlstate 'P0001' then
    if position('ASSERTION FAILED' in sqlerrm) > 0 then raise; end if;
  when others then null;
end; $$;

insert into auth.users (id, email) values
  ('fa000000-0000-4000-8000-000000000001', 'owner@abo.test'),
  ('fa000000-0000-4000-8000-000000000011', 'kraft@abo.test');

select pg_temp.sign_in('fa000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Abo GmbH');
select pg_temp.sign_out();

create temporary table ctx as select
  (select id from public.companies where name = 'Abo GmbH') as company;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select ctx.company, profile.id, 'EMPLOYEE'::public.company_role, 'ACTIVE'::public.membership_status
from ctx, public.profiles profile
where profile.auth_user_id = 'fa000000-0000-4000-8000-000000000011';

create temporary table ids as select
  (select member.id from public.company_members member
     join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'fa000000-0000-4000-8000-000000000011') as kraft;
grant select on ids to authenticated;

-- ---------------------------------------------------------------------------
-- Ohne Abo-Zeile: alles wie bisher. Altbestand darf nicht ploetzlich stehen.
--
-- `create_company_for_current_user` legt die Zeile selbst an -- nachgemessen:
-- TRIALING mit 30 Tagen. Der Fall "keine Zeile" betrifft also nur Mandanten
-- aus der Zeit vor der Abo-Tabelle. Er wird hier absichtlich hergestellt,
-- damit die Zusicherung auch fuer die gilt.
-- ---------------------------------------------------------------------------
select pg_temp.assert(
  exists (select 1 from public.company_subscriptions where company_id = (select company from ctx)),
  'Vorbedingung: das Anlegen eines Betriebs legt eine Abo-Zeile an.');

delete from public.company_subscriptions where company_id = (select company from ctx);
select pg_temp.assert(
  public.company_may_write((select company from ctx)),
  'Ohne Abo-Zeile muss geschrieben werden duerfen.');

select pg_temp.sign_in('fa000000-0000-4000-8000-000000000001');
insert into public.customers (company_id, name) select company, 'Kunde ohne Abo' from ctx;
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Laufender Testzeitraum: Bueroarbeit geht.
-- ---------------------------------------------------------------------------
insert into public.company_subscriptions (company_id, status, trial_started_at, trial_ends_at)
select company, 'TRIALING', now() - interval '3 days', now() + interval '27 days' from ctx;

select pg_temp.assert(
  public.company_may_write((select company from ctx)),
  'Im laufenden Testzeitraum muss geschrieben werden duerfen.');

select pg_temp.sign_in('fa000000-0000-4000-8000-000000000001');
insert into public.customers (company_id, name) select company, 'Kunde im Test' from ctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company, customer.id, 'Objekt im Test'
from ctx join public.customers customer on customer.name = 'Kunde im Test';
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Testzeitraum abgelaufen: die Bueroarbeit steht.
-- ---------------------------------------------------------------------------
update public.company_subscriptions
set trial_started_at = now() - interval '40 days', trial_ends_at = now() - interval '10 days'
where company_id = (select company from ctx);

select pg_temp.assert(
  not public.company_may_write((select company from ctx)),
  'Nach Ablauf darf nicht mehr geschrieben werden.');

select pg_temp.sign_in('fa000000-0000-4000-8000-000000000001');

select pg_temp.reject(
  $$insert into public.customers (company_id, name) select company, 'Kunde nach Ablauf' from ctx$$,
  'Ein neuer Kunde nach Ablauf muss abgelehnt werden.');
select pg_temp.reject(
  $$insert into public.cleaning_objects (company_id, customer_id, name)
    select ctx.company, customer.id, 'Objekt nach Ablauf'
    from ctx join public.customers customer on customer.name = 'Kunde im Test'$$,
  'Ein neues Objekt nach Ablauf muss abgelehnt werden.');
/*
  Die Planzeiten sind hier vollstaendig gesetzt, obwohl der Einsatz abgelehnt
  werden soll: sonst scheiterte er an einer Pflichtspalte und die Zusicherung
  wuerde den Riegel nur vortaeuschen.
*/
select pg_temp.reject(
  $$insert into public.jobs (company_id, customer_id, cleaning_object_id, title, scheduled_date,
                             planned_start_at, planned_end_at, status)
    select ctx.company, customer.id, object.id, 'Einsatz nach Ablauf', current_date,
      (current_date + time '09:00') at time zone 'Europe/Berlin',
      (current_date + time '11:00') at time zone 'Europe/Berlin', 'PLANNED'
    from ctx
    join public.customers customer on customer.name = 'Kunde im Test'
    join public.cleaning_objects object on object.name = 'Objekt im Test'$$,
  'Ein neuer Einsatz nach Ablauf muss abgelehnt werden.');
select pg_temp.reject(
  $$insert into public.checklist_templates (company_id, name) select company, 'Vorlage nach Ablauf' from ctx$$,
  'Eine neue Checklistenvorlage nach Ablauf muss abgelehnt werden.');

-- Und das Aendern vorhandener Daten auch: sonst waere die Sperre nur halb da.
select pg_temp.reject(
  $$update public.customers set name = 'Umbenannt nach Ablauf' where name = 'Kunde im Test'$$,
  'Das Umbenennen eines Kunden nach Ablauf muss abgelehnt werden.');

-- ---------------------------------------------------------------------------
-- Was trotzdem gehen MUSS. Der eigentliche Punkt dieser Suite.
-- ---------------------------------------------------------------------------

-- Lesen: ohne das kaeme niemand an die eigenen Daten, auch nicht zum Export.
select pg_temp.assert(
  (select count(*) from public.customers where company_id = (select company from ctx)) = 2,
  'Die eigenen Kunden muessen nach Ablauf weiter lesbar sein.');
select pg_temp.assert(
  (select count(*) from public.cleaning_objects where company_id = (select company from ctx)) = 1,
  'Die eigenen Objekte muessen nach Ablauf weiter lesbar sein.');

/*
  Archivieren ist nach Ablauf ebenfalls gesperrt, und das steht hier als
  geprüfte Tatsache statt als Ueberraschung.

  Gelöscht wird in diesem Produkt nie -- `authenticated` hat auf customers nur
  INSERT/SELECT/UPDATE, archiviert wird ueber `is_active`. Eine Richtlinie
  sieht in `with check` nur die neue Zeile und kann ein Archivieren nicht von
  einer Umbenennung unterscheiden. Nach Ablauf ist der Stammdatenbestand
  darum unveraenderlich, bis bezahlt wird.
*/
select pg_temp.reject(
  $$update public.customers set is_active = false where name = 'Kunde im Test'$$,
  'Auch das Archivieren ist nach Ablauf gesperrt -- bekannte Folge, keine Ueberraschung.');

-- Betriebsdaten: sonst kaeme die Inhaberin nie an die Abo-Seite zurueck.
update public.companies set name = 'Abo GmbH (geaendert)' where id = (select company from ctx);
select pg_temp.assert(
  (select name from public.companies where id = (select company from ctx)) = 'Abo GmbH (geaendert)',
  'Die Betriebsdaten muessen nach Ablauf aenderbar bleiben.');
update public.companies set name = 'Abo GmbH' where id = (select company from ctx);

select pg_temp.sign_out();

-- Die Zeiterfassung der Kraft. Ein Einsatz aus der Zeit vor dem Ablauf.
insert into public.customers (company_id, name) select company, 'Altkunde' from ctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company, customer.id, 'Altobjekt' from ctx
join public.customers customer on customer.name = 'Altkunde';
insert into public.jobs (company_id, customer_id, cleaning_object_id, title, scheduled_date,
                         planned_start_at, planned_end_at, status)
select ctx.company, customer.id, object.id, 'Einsatz von vorher', current_date,
  (current_date + time '06:00') at time zone 'Europe/Berlin',
  (current_date + time '08:00') at time zone 'Europe/Berlin', 'PLANNED'
from ctx
join public.customers customer on customer.name = 'Altkunde'
join public.cleaning_objects object on object.name = 'Altobjekt';
insert into public.job_assignments (company_id, job_id, member_id)
select ctx.company, job.id, ids.kraft from ctx, ids
join public.jobs job on job.title = 'Einsatz von vorher';

select pg_temp.sign_in('fa000000-0000-4000-8000-000000000011');

/*
  Start, Pause, Fortsetzen, Feierabend -- alles nach Ablauf des Abos, und mit
  auseinanderliegenden Zeitpunkten: die Tabellenbedingung verlangt einen
  Feierabend nach dem Arbeitsbeginn, und eine Schicht in derselben
  Millisekunde gibt es nicht. Nachgetragene Zeiten sind hier ausserdem der
  realistischere Fall: die Warteschlange eines Telefons stellt gerade dann
  spaet zu, wenn vorher kein Empfang war.
*/
create temporary table shift as
select public.start_my_job(
  (select id from public.jobs where title = 'Einsatz von vorher'),
  now() - interval '3 hours') as entry;
select pg_temp.assert(
  (select entry from shift) is not null,
  'Eine Kraft muss nach Ablauf des Abos noch einstempeln koennen.');
select public.pause_my_job((select id from public.jobs where title = 'Einsatz von vorher'), now() - interval '2 hours');
select public.resume_my_job((select id from public.jobs where title = 'Einsatz von vorher'), now() - interval '90 minutes');
select public.stop_my_job((select id from public.jobs where title = 'Einsatz von vorher'), now() - interval '1 hour');
select pg_temp.assert(
  (select finished_at is not null from public.job_time_entries where id = (select entry from shift)),
  'Eine Kraft muss nach Ablauf des Abos auch ausstempeln koennen -- sonst fehlt ihr der Lohnnachweis.');

-- Krankmeldung: muss immer erfassbar sein.
insert into public.employee_absences (company_id, member_id, absence_type, start_date, end_date)
select ctx.company, ids.kraft, 'SICKNESS'::public.absence_type, current_date, current_date from ctx, ids;
select pg_temp.assert(
  (select count(*) from public.employee_absences where member_id = (select kraft from ids)) = 1,
  'Eine Krankmeldung muss nach Ablauf des Abos erfassbar bleiben.');

select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Bezahlt: die Sperre loest sich wieder. Ohne das waere sie eine Falle.
-- ---------------------------------------------------------------------------
update public.company_subscriptions set status = 'ACTIVE' where company_id = (select company from ctx);
select pg_temp.assert(
  public.company_may_write((select company from ctx)),
  'Mit aktivem Abo muss wieder geschrieben werden duerfen.');

select pg_temp.sign_in('fa000000-0000-4000-8000-000000000001');
insert into public.customers (company_id, name) select company, 'Kunde nach Zahlung' from ctx;
select pg_temp.sign_out();

select pg_temp.assert(
  exists (select 1 from public.customers where name = 'Kunde nach Zahlung'),
  'Nach dem Bezahlen muss ein neuer Kunde wieder anlegbar sein.');

-- Und die uebrigen Abo-Zustaende sind keine nutzbaren Abos.
do $$
declare bad text;
begin
  foreach bad in array array['PAST_DUE', 'PAUSED', 'CANCELED', 'UNPAID'] loop
    update public.company_subscriptions
    set status = bad::public.reinplan_subscription_status
    where company_id = (select company from ctx);
    if public.company_may_write((select company from ctx)) then
      raise exception 'ASSERTION FAILED: % darf kein nutzbares Abo sein.', bad;
    end if;
  end loop;
end $$;

rollback;
\o
\echo 'subscription write lock invariants: all assertions passed'
