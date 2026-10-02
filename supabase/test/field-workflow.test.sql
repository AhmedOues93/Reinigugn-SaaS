-- Der Ablauf vor Ort, am Stueck. Run with supabase/test/run.sh.
--
-- Start, Pause, Fortsetzen, Checkliste, Vorher-/Nachher-Fotos, Stopp und der
-- Leistungsnachweis, der daraus entsteht. Einzeln ist jeder Schritt geprueft;
-- diese Suite prueft, dass sie in dieser Reihenfolge zusammenpassen -- und
-- dass niemand den Einsatz einer Kollegin bedient.
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
  ('d5000000-0000-4000-8000-000000000001', 'owner@field.test'),
  ('d5000000-0000-4000-8000-000000000011', 'anna@field.test'),
  ('d5000000-0000-4000-8000-000000000012', 'kollegin@field.test');

select pg_temp.sign_in('d5000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Feldreinigung GmbH');
select pg_temp.sign_out();

create temporary table ctx as select
  (select id from public.companies where name = 'Feldreinigung GmbH') as company;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select ctx.company, profile.id, 'EMPLOYEE', 'ACTIVE'
from ctx, public.profiles profile
where profile.auth_user_id in ('d5000000-0000-4000-8000-000000000011','d5000000-0000-4000-8000-000000000012');

insert into public.customers (company_id, name) select company, 'Hausverwaltung West' from ctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company, customer.id, 'Treppenhaus West'
from ctx join public.customers customer on customer.company_id = ctx.company;

-- Zwei Einsaetze am selben Tag: einer zum Durcharbeiten, einer um zu zeigen,
-- dass zwei Uhren nicht gleichzeitig laufen.
insert into public.jobs (company_id, customer_id, cleaning_object_id, title, scheduled_date,
                         planned_start_at, planned_end_at, status)
select ctx.company, customer.id, object.id, title, current_date,
  (current_date + start_time) at time zone 'Europe/Berlin',
  (current_date + end_time) at time zone 'Europe/Berlin',
  'PLANNED'
from ctx
join public.customers customer on customer.company_id = ctx.company
join public.cleaning_objects object on object.company_id = ctx.company
cross join (values ('Vormittag', time '07:00', time '09:00'),
                   ('Nachmittag', time '14:00', time '16:00')) as t(title, start_time, end_time);

create temporary table ids as select
  (select id from public.jobs where title = 'Vormittag') as job_a,
  (select id from public.jobs where title = 'Nachmittag') as job_b,
  (select member.id from public.company_members member
     join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'd5000000-0000-4000-8000-000000000011') as anna,
  (select member.id from public.company_members member
     join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'd5000000-0000-4000-8000-000000000012') as kollegin;
grant select on ids to authenticated;

insert into public.job_assignments (company_id, job_id, member_id)
select ctx.company, ids.job_a, ids.anna from ctx, ids;
insert into public.job_assignments (company_id, job_id, member_id)
select ctx.company, ids.job_b, ids.anna from ctx, ids;

-- Eine Checkliste mit einem Pflicht- und einem freiwilligen Punkt.
insert into public.job_checklists (company_id, job_id)
select ctx.company, ids.job_a from ctx, ids;
insert into public.job_checklist_items (job_checklist_id, position, title, is_required)
select list.id, 1, 'Boeden wischen', true from public.job_checklists list;
insert into public.job_checklist_items (job_checklist_id, position, title, is_required)
select list.id, 2, 'Fenstergriffe polieren', false from public.job_checklists list;

create temporary table items as select
  (select id from public.job_checklist_items where title = 'Boeden wischen') as pflicht,
  (select id from public.job_checklist_items where title = 'Fenstergriffe polieren') as kuer;
grant select on items to authenticated;

-- ---------------------------------------------------------------------------
-- Fremde Einsaetze bedient niemand.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('d5000000-0000-4000-8000-000000000012');
do $$
begin
  begin
    perform public.start_my_job((select job_a from ids));
    raise exception 'NOT REJECTED: eine nicht eingeteilte Kollegin hat den Einsatz gestartet';
  exception when others then
    if position('not assigned' in lower(sqlerrm)) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Start.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('d5000000-0000-4000-8000-000000000011');
select public.start_my_job((select job_a from ids));
select pg_temp.sign_out();

select pg_temp.assert(
  (select status from public.jobs where id = (select job_a from ids)) = 'IN_PROGRESS',
  'der Start setzt den Einsatz auf laufend');
select pg_temp.assert(
  (select count(*) from public.job_time_entries
    where job_id = (select job_a from ids) and finished_at is null) = 1,
  'der Start oeffnet genau eine Zeiterfassung');

-- Zwei Uhren gleichzeitig gibt es nicht: sonst zahlt der Monatsabschluss
-- dieselbe Stunde zweimal.
select pg_temp.sign_in('d5000000-0000-4000-8000-000000000011');
do $$
begin
  begin
    perform public.start_my_job((select job_b from ids));
    raise exception 'NOT REJECTED: zwei Einsaetze liefen gleichzeitig';
  exception when others then
    if position('must be ended first' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();
select pg_temp.assert(
  (select status from public.jobs where id = (select job_b from ids)) = 'PLANNED',
  'der abgelehnte zweite Start hat den anderen Einsatz nicht angefasst');

-- ---------------------------------------------------------------------------
-- Pause und Fortsetzen.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('d5000000-0000-4000-8000-000000000011');
select public.pause_my_job((select job_a from ids));
select pg_temp.sign_out();
select pg_temp.assert(
  (select count(*) from public.job_time_breaks break
     join public.job_time_entries entry on entry.id = break.time_entry_id
    where entry.job_id = (select job_a from ids) and break.ended_at is null) = 1,
  'die Pause laeuft');

select pg_temp.sign_in('d5000000-0000-4000-8000-000000000011');
select public.resume_my_job((select job_a from ids));
select pg_temp.sign_out();
select pg_temp.assert(
  (select count(*) from public.job_time_breaks break
     join public.job_time_entries entry on entry.id = break.time_entry_id
    where entry.job_id = (select job_a from ids) and break.ended_at is null) = 0,
  'das Fortsetzen beendet die Pause');

-- ---------------------------------------------------------------------------
-- Pflichtpunkte der Checkliste. Ohne sie kein Feierabend.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('d5000000-0000-4000-8000-000000000011');
select public.complete_my_checklist_item((select kuer from items), true);
do $$
begin
  begin
    perform public.stop_my_job((select job_a from ids));
    raise exception 'NOT REJECTED: der Einsatz endete mit offenem Pflichtpunkt';
  exception when others then
    if position('checklist' in lower(sqlerrm)) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();
select pg_temp.assert(
  (select count(*) from public.job_time_entries
    where job_id = (select job_a from ids) and finished_at is null) = 1,
  'der abgelehnte Stopp laesst die Uhr weiterlaufen, statt sie halb zu schliessen');

-- ---------------------------------------------------------------------------
-- Vorher und Nachher.
-- ---------------------------------------------------------------------------
insert into public.job_photos (company_id, job_id, member_id, storage_path, category)
select ctx.company, ids.job_a, ids.anna,
       ctx.company::text || '/' || ids.job_a::text || '/vorher.jpg', 'BEFORE'
from ctx, ids;
insert into public.job_photos (company_id, job_id, member_id, storage_path, category)
select ctx.company, ids.job_a, ids.anna,
       ctx.company::text || '/' || ids.job_a::text || '/nachher.jpg', 'AFTER'
from ctx, ids;

select pg_temp.sign_in('d5000000-0000-4000-8000-000000000011');
select pg_temp.assert(
  (select count(*) from public.job_photos where job_id = (select job_a from ids)) = 2,
  'die eingeteilte Mitarbeiterin sieht ihre Vorher- und Nachher-Aufnahme');
select pg_temp.sign_out();

select pg_temp.sign_in('d5000000-0000-4000-8000-000000000012');
select pg_temp.assert(
  (select count(*) from public.job_photos where job_id = (select job_a from ids)) = 0,
  'eine nicht eingeteilte Kollegin sieht die Fotos nicht');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Stopp, und was daraus entsteht.
-- ---------------------------------------------------------------------------
-- Die Uhr um 90 Minuten zurueckdatieren, davon 30 Minuten Pause. In der Suite
-- laeuft alles in einer Transaktion, also waere now() beim Stopp derselbe
-- Zeitpunkt wie beim Start -- und die Netto-Dauer waere nicht pruefbar.
update public.job_time_entries
set started_at = now() - interval '90 minutes'
where job_id = (select job_a from ids);
update public.job_time_breaks
set started_at = now() - interval '60 minutes', ended_at = now() - interval '30 minutes'
where time_entry_id = (select id from public.job_time_entries where job_id = (select job_a from ids));

select pg_temp.sign_in('d5000000-0000-4000-8000-000000000011');
select public.complete_my_checklist_item((select pflicht from items), true);
select public.set_my_job_report((select job_a from ids), 'Fahrstuhl war ausser Betrieb.');
select public.stop_my_job((select job_a from ids));
select pg_temp.sign_out();

-- 90 Minuten abzueglich 30 Minuten Pause. Die Pause darf genau einmal
-- abgezogen werden -- sie einmal zu viel abzuziehen hat dem Monatsabschluss
-- schon einmal Minusstunden erfunden.
select pg_temp.assert(
  (select duration_minutes from public.job_time_entries where job_id = (select job_a from ids)) = 60,
  'die erfasste Zeit ist brutto minus Pause, und die Pause zaehlt genau einmal');
select pg_temp.assert(
  (select break_minutes from public.job_time_entries where job_id = (select job_a from ids)) = 30,
  'die Pause steht als eigene Zahl daneben, statt nur im Abzug zu stecken');
select pg_temp.assert(
  (select net_minutes from public.service_records where job_id = (select job_a from ids)) = 60
    and (select break_minutes from public.service_records where job_id = (select job_a from ids)) = 30,
  'der Leistungsnachweis uebernimmt Netto-Zeit und Pause unveraendert');

select pg_temp.assert(
  (select status from public.jobs where id = (select job_a from ids)) = 'COMPLETED',
  'mit erledigten Pflichtpunkten endet der Einsatz');
select pg_temp.assert(
  (select count(*) from public.job_time_entries
    where job_id = (select job_a from ids) and finished_at is null) = 0,
  'nach dem Stopp laeuft keine Uhr mehr');
select pg_temp.assert(
  (select count(*) from public.service_records where job_id = (select job_a from ids)) = 1,
  'der Leistungsnachweis entsteht im selben Schritt');
select pg_temp.assert(
  (select employee_note from public.service_records where job_id = (select job_a from ids))
    = 'Fahrstuhl war ausser Betrieb.',
  'die Notiz vom Einsatz steht im Leistungsnachweis');
select pg_temp.assert(
  (select jsonb_array_length(photo_snapshot) from public.service_records
    where job_id = (select job_a from ids)) = 2,
  'beide Aufnahmen sind im Nachweis festgehalten');
select pg_temp.assert(
  (select (checklist_snapshot->0->>'completed')::boolean from public.service_records
    where job_id = (select job_a from ids)),
  'der Nachweis haelt fest, dass der Pflichtpunkt erledigt war');

-- Nach dem Feierabend laeuft die naechste Uhr wieder an.
select pg_temp.sign_in('d5000000-0000-4000-8000-000000000011');
select public.start_my_job((select job_b from ids));
select pg_temp.sign_out();
select pg_temp.assert(
  (select status from public.jobs where id = (select job_b from ids)) = 'IN_PROGRESS',
  'nach dem Feierabend laesst sich der naechste Einsatz starten');

rollback;
\o
\echo 'Ablauf vor Ort (Start bis Leistungsnachweis): all assertions passed'
