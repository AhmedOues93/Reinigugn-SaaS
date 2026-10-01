-- Nachgetragene Fotos. Run with supabase/test/run.sh.
--
-- Zwei Eigenschaften entscheiden, ob eine Warteschlange fuer Fotos taugt:
-- eine zweite Zustellung darf kein zweites Foto erzeugen, und ein Foto, das
-- nach dem Feierabend ankommt, darf nicht verloren gehen -- es ist der
-- Nachweis, auf den sich die Kundin beruft.
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
  ('b9000000-0000-4000-8000-000000000001', 'owner@fotos.test'),
  ('b9000000-0000-4000-8000-000000000011', 'kraft@fotos.test'),
  ('b9000000-0000-4000-8000-000000000012', 'fremd@fotos.test');

select pg_temp.sign_in('b9000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Fotoreinigung GmbH');
select pg_temp.sign_out();

create temporary table ctx as select
  (select id from public.companies where name = 'Fotoreinigung GmbH') as company;
grant select on ctx to authenticated;

insert into public.company_members (company_id, profile_id, role, status)
select ctx.company, profile.id, 'EMPLOYEE', 'ACTIVE'
from ctx, public.profiles profile
where profile.auth_user_id in ('b9000000-0000-4000-8000-000000000011','b9000000-0000-4000-8000-000000000012');

insert into public.customers (company_id, name) select company, 'Kundin Foto' from ctx;
insert into public.cleaning_objects (company_id, customer_id, name)
select ctx.company, customer.id, 'Objekt Foto'
from ctx join public.customers customer on customer.company_id = ctx.company;

create temporary table ids as select
  (select member.id from public.company_members member
     join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'b9000000-0000-4000-8000-000000000011') as kraft,
  (select member.id from public.company_members member
     join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = 'b9000000-0000-4000-8000-000000000012') as fremd;
grant select on ids to authenticated;

select pg_temp.sign_in('b9000000-0000-4000-8000-000000000001');
create temporary table job as
select public.create_single_job(
  (select id from public.customers where company_id = (select company from ctx)),
  (select id from public.cleaning_objects where company_id = (select company from ctx)),
  'Unterhaltsreinigung', '', current_date, '07:00'::time, '09:00'::time,
  'PLANNED'::public.job_status, 'NORMAL'::public.job_priority, '', '',
  array[(select kraft from ids)]::uuid[], null::uuid) as id;
select pg_temp.sign_out();
grant select on job to authenticated;

-- Die Speicherobjekte, die der Server sonst vom Upload vorfindet.
create or replace function pg_temp.stored(p_name text, p_size bigint default 120000)
returns void language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name, metadata)
  values ('job-photos', p_name, jsonb_build_object('mimetype', 'image/jpeg', 'size', p_size));
end; $$;

-- Der Speicherpfad muss uuid/uuid/uuid.jpg sein; die Anwendung baut ihn aus
-- Mandant, Einsatz und einer neuen Kennung.
create temporary table paths as select
  (select company from ctx)::text || '/' || (select id from job)::text
    || '/11111111-1111-4111-8111-111111111111.jpg' as vorher,
  (select company from ctx)::text || '/' || (select id from job)::text
    || '/22222222-2222-4222-8222-222222222222.jpg' as nachher,
  (select company from ctx)::text || '/' || (select id from job)::text
    || '/33333333-3333-4333-8333-333333333333.jpg' as spaet,
  (select company from ctx)::text || '/' || (select id from job)::text
    || '/44444444-4444-4444-8444-444444444444.jpg' as nach_abnahme,
  (select company from ctx)::text || '/' || (select id from job)::text
    || '/55555555-5555-4555-8555-555555555555.jpg' as fremd;
grant select on paths to authenticated;

select pg_temp.stored((select vorher from paths));
select pg_temp.stored((select nachher from paths));
select pg_temp.stored((select spaet from paths));
select pg_temp.stored((select nach_abnahme from paths));
select pg_temp.stored((select fremd from paths));

-- ---------------------------------------------------------------------------
-- Dieselbe Kennung zweimal: eine Aufnahme, nicht zwei.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('b9000000-0000-4000-8000-000000000011');
create temporary table first_upload as
select public.create_my_job_photo_metadata(
  (select id from job), (select vorher from paths), 'BEFORE', null, 'Treppenhaus vorher',
  'geraet-aufnahme-0001') as id;
grant select on first_upload to authenticated;

create temporary table second_upload as
select public.create_my_job_photo_metadata(
  (select id from job), (select vorher from paths), 'BEFORE', null, 'Treppenhaus vorher',
  'geraet-aufnahme-0001') as id;
grant select on second_upload to authenticated;
select pg_temp.sign_out();

select pg_temp.assert(
  (select count(*) from public.job_photos where job_id = (select id from job)) = 1,
  'dieselbe Geraetekennung erzeugt kein zweites Foto');
select pg_temp.assert(
  (select id from first_upload) = (select id from second_upload),
  'die zweite Zustellung meldet dieselbe Aufnahme zurueck, statt zu scheitern');

-- Ohne Kennung bleibt es beim alten Verhalten: zwei Aufnahmen sind zwei.
select pg_temp.sign_in('b9000000-0000-4000-8000-000000000011');
select public.create_my_job_photo_metadata(
  (select id from job), (select nachher from paths), 'AFTER', null, null, null);
select pg_temp.sign_out();
select pg_temp.assert(
  (select count(*) from public.job_photos where job_id = (select id from job)) = 2,
  'ohne Kennung bleibt jede Aufnahme eine eigene');

-- ---------------------------------------------------------------------------
-- Die Aufnahme kommt nach dem Feierabend an.
-- ---------------------------------------------------------------------------
update public.job_time_entries set finished_at = now() where job_id = (select id from job);
insert into public.job_time_entries (company_id, job_id, member_id, started_at, finished_at)
select ctx.company, job.id, ids.kraft, now() - interval '2 hours', now() - interval '10 minutes'
from ctx, job, ids
where not exists (select 1 from public.job_time_entries where job_id = job.id);
update public.jobs set status = 'COMPLETED' where id = (select id from job);
select public.build_service_record((select id from job));

select pg_temp.assert(
  (select jsonb_array_length(photo_snapshot) from public.service_records where job_id = (select id from job)) = 2,
  'der Nachweis haelt die beiden bereits vorhandenen Aufnahmen fest');

select pg_temp.sign_in('b9000000-0000-4000-8000-000000000011');
select public.create_my_job_photo_metadata(
  (select id from job), (select spaet from paths), 'AFTER', null, 'Nachgereicht',
  'geraet-aufnahme-0002');
select pg_temp.sign_out();

select pg_temp.assert(
  (select count(*) from public.job_photos where job_id = (select id from job)) = 3,
  'eine nach dem Feierabend eintreffende Aufnahme geht nicht verloren');
select pg_temp.assert(
  (select jsonb_array_length(photo_snapshot) from public.service_records where job_id = (select id from job)) = 3,
  'der noch nicht abgenommene Nachweis zieht die nachgereichte Aufnahme nach');

-- ---------------------------------------------------------------------------
-- Nach der Abnahme ist Schluss.
-- ---------------------------------------------------------------------------
update public.service_records
set status = 'ABGENOMMEN', accepted_at = now(), accepted_by_name = 'Sabine Lorenz', acceptance_method = 'KEINE'
where job_id = (select id from job);

select pg_temp.sign_in('b9000000-0000-4000-8000-000000000011');
do $$
begin
  begin
    perform public.create_my_job_photo_metadata(
      (select id from job), (select nach_abnahme from paths), 'AFTER', null, null, 'geraet-aufnahme-0003');
    raise exception 'NOT REJECTED: Foto nach der Abnahme ergaenzt';
  exception when others then
    if position('abgenommen' in sqlerrm) = 0 then raise; end if;
  end;
end $$;
select pg_temp.sign_out();
select pg_temp.assert(
  (select jsonb_array_length(photo_snapshot) from public.service_records where job_id = (select id from job)) = 3,
  'der abgenommene Nachweis behaelt genau die Aufnahmen der Abnahme');

-- ---------------------------------------------------------------------------
-- Wer nicht eingeteilt ist, laedt nichts hoch und sieht nichts nach.
-- ---------------------------------------------------------------------------
select pg_temp.sign_in('b9000000-0000-4000-8000-000000000012');
do $$
begin
  begin
    perform public.create_my_job_photo_metadata(
      (select id from job), (select fremd from paths), 'AFTER', null, null, 'geraet-fremd-0001');
    raise exception 'NOT REJECTED: eine nicht eingeteilte Kollegin hat ein Foto angelegt';
  exception when others then
    if position('not assigned' in lower(sqlerrm)) = 0 then raise; end if;
  end;
end $$;
select pg_temp.assert(
  (select public.my_job_photo_for_client_upload((select id from job), 'geraet-aufnahme-0001')) is null,
  'eine fremde Kollegin erfaehrt nicht, ob eine Aufnahme schon da ist');
select pg_temp.sign_out();

select pg_temp.sign_in('b9000000-0000-4000-8000-000000000011');
select pg_temp.assert(
  (select public.my_job_photo_for_client_upload((select id from job), 'geraet-aufnahme-0001'))
    = (select id from first_upload),
  'die eingeteilte Kraft findet ihre Aufnahme ueber die Geraetekennung wieder');
select pg_temp.sign_out();

rollback;
\o
\echo 'Nachgetragene Fotos: all assertions passed'
