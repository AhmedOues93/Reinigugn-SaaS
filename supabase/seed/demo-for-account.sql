-- Einen Demo-Betrieb an ein bestehendes Konto haengen.
--
-- Unterschied zu demo.sql: dort werden eigene Demo-Logins erfunden, hier wird
-- der Betrieb dem Konto zugeordnet, mit dem Sie sich ohnehin anmelden. Damit
-- sehen Sie Monatsabschluss, Arbeitszeiten und Planung sofort unter Ihrem
-- eigenen Login, ohne sich abzumelden.
--
-- SCHUTZ FUER BESTEHENDE MANDANTEN
-- Das Skript legt ausschliesslich einen NEUEN Betrieb an und fasst keinen
-- vorhandenen an. Gehoert das Zielkonto bereits zu einem Betrieb, bricht es ab,
-- statt irgendetwas zu aendern — so kann es einen echten Mandanten wie CRYSTA
-- weder veraendern noch loeschen. Wer trotzdem einen zweiten Betrieb fuer
-- dasselbe Konto will, setzt sauberwerk.demo_allow_second_company auf 'ja'.
--
-- AUFRUF
--   psql "$DATABASE_URL" \
--     -c "set sauberwerk.seed_confirmed = 'demo-account'" \
--     -c "set sauberwerk.demo_owner_email = 'ahmedoues38@gmail.com'" \
--     -f supabase/seed/demo-for-account.sql
--
-- Das Konto muss vorher existieren: melden Sie sich einmal normal an, dann
-- laeuft dieses Skript.
--
-- Die vier Mitarbeitenden bekommen eigene Logins, damit auch die
-- Mitarbeiter-App getestet werden kann:
--   demo-olena@reinplan.test / demo-maria@… / demo-mehmet@… / demo-anna@…
--   Passwort fuer alle: ReinPlanDemo2026!

do $$
declare
  owner_email text := nullif(current_setting('sauberwerk.demo_owner_email', true), '');
  allow_second boolean := coalesce(current_setting('sauberwerk.demo_allow_second_company', true), '') = 'ja';
  owner_user uuid;
  owner_profile uuid;
  demo_company uuid;
  customer_a uuid; customer_b uuid;
  object_a uuid; object_b uuid;
  emp record;
  shift record;
  day_row record;
  shift_job uuid;
  shift_entry uuid;
  day_net integer;
  members uuid[] := '{}';
begin
  if coalesce(current_setting('sauberwerk.seed_confirmed', true), '') <> 'demo-account' then
    raise exception 'Abbruch: set sauberwerk.seed_confirmed to ''demo-account'' first (siehe Kommentar oben).';
  end if;
  if owner_email is null then
    raise exception 'Abbruch: set sauberwerk.demo_owner_email to the address you sign in with.';
  end if;

  select id into owner_user from auth.users where lower(email) = lower(owner_email);
  if owner_user is null then
    raise exception 'Kein Konto mit % gefunden. Bitte zuerst einmal anmelden, dann erneut ausfuehren.', owner_email;
  end if;

  select id into owner_profile from public.profiles where auth_user_id = owner_user;
  if owner_profile is null then
    raise exception 'Zum Konto % gibt es noch kein Profil. Bitte einmal die App oeffnen, dann erneut ausfuehren.', owner_email;
  end if;

  if exists (select 1 from public.company_members where profile_id = owner_profile) and not allow_second then
    raise exception
      'Abbruch: % gehoert bereits zu einem Betrieb. Es wurde nichts geaendert. Dieses Skript legt nur neue Betriebe an und fasst bestehende Daten nie an. Wenn Sie bewusst einen zweiten, klar gekennzeichneten Demo-Betrieb wollen: set sauberwerk.demo_allow_second_company = ''ja''.',
      owner_email;
  end if;

  if exists (select 1 from public.companies where slug = 'reinplan-demo-konto') then
    raise notice 'Der Demo-Betrieb besteht bereits; es wurde nichts geaendert.';
    return;
  end if;

  insert into public.companies (name, slug, legal_form, street, postal_code, city, phone, email, default_payment_terms_days, default_language)
  values ('ReinPlan Demo (Testdaten)', 'reinplan-demo-konto', 'GmbH', 'Musterweg 3', '20095', 'Hamburg',
          '+49 40 1112233', owner_email, 14, 'de')
  returning id into demo_company;
  update public.companies set default_hourly_rate_cents = 3900 where id = demo_company;

  insert into public.company_members (company_id, profile_id, role, status)
  values (demo_company, owner_profile, 'OWNER', 'ACTIVE');

  -- Vier Mitarbeitende mit eigenen Logins, damit auch die Mitarbeiter-App
  -- ausprobiert werden kann.
  for emp in
    select * from (values
      ('demo-olena@reinplan.test',  'Olena',  'Kovalenko', 'M-0001', 30.0, 360, 30, time '08:00', false, 'LG 1', 1425),
      ('demo-maria@reinplan.test',  'Maria',  'Nowak',     'M-0002', 25.0, 300,  0, time '17:30', false, 'LG 1', 1425),
      ('demo-mehmet@reinplan.test', 'Mehmet', 'Yilmaz',    'M-0003', 39.0, 468, 45, time '06:30', false, 'LG 6', 1810),
      ('demo-anna@reinplan.test',   'Anna',   'Schneider', 'M-0004', 10.0, 120,  0, time '18:00', true,  'LG 1', 1425)
    ) as t(email, first_name, last_name, number, weekly, net_minutes, break_minutes, starts_at, weekdays_only, wage_group, wage_cents)
  loop
    declare
      emp_user uuid := gen_random_uuid();
      emp_profile uuid;
      emp_member uuid;
    begin
      insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                              raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      values (emp_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', emp.email,
              extensions.crypt('ReinPlanDemo2026!', extensions.gen_salt('bf')), now(),
              '{"provider":"email","providers":["email"]}',
              jsonb_build_object('first_name', emp.first_name, 'last_name', emp.last_name), now(), now());

      insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (emp_user, emp_user::text,
              jsonb_build_object('sub', emp_user::text, 'email', emp.email, 'email_verified', true),
              'email', now(), now(), now());

      select id into emp_profile from public.profiles where auth_user_id = emp_user;
      if emp_profile is null then
        insert into public.profiles (auth_user_id, first_name, last_name)
        values (emp_user, emp.first_name, emp.last_name) returning id into emp_profile;
      end if;

      insert into public.company_members (company_id, profile_id, role, status)
      values (demo_company, emp_profile, 'EMPLOYEE', 'ACTIVE') returning id into emp_member;

      insert into public.employee_details (company_id, profile_id, employee_number, weekly_hours,
                                           employment_start_date, preferred_language, is_active,
                                           wage_group, hourly_wage_cents)
      values (demo_company, emp_profile, emp.number, emp.weekly, current_date - 300, 'de', true,
              emp.wage_group, emp.wage_cents);

      members := members || emp_member;
    end;
  end loop;

  insert into public.customers (company_id, name, contact_person, email, phone, billing_address, postal_code, city)
  values (demo_company, 'Hausverwaltung Elbe GmbH', 'Sabine Lorenz', 'kunde-elbe@reinplan.test', '+49 40 7654321', 'Elbchaussee 21', '22765', 'Hamburg'),
         (demo_company, 'Praxis Dr. Berger', 'Dr. Jens Berger', 'praxis@reinplan.test', '+49 40 5556677', 'Suederstrasse 8', '20097', 'Hamburg');
  select id into customer_a from public.customers where company_id = demo_company and name = 'Hausverwaltung Elbe GmbH';
  select id into customer_b from public.customers where company_id = demo_company and name = 'Praxis Dr. Berger';

  insert into public.cleaning_objects (company_id, customer_id, name, street, postal_code, city)
  values (demo_company, customer_a, 'Buerohaus Elbpalais', 'Elbchaussee 21', '22765', 'Hamburg'),
         (demo_company, customer_b, 'Praxis Suederstrasse', 'Suederstrasse 8', '20097', 'Hamburg');
  select id into object_a from public.cleaning_objects where company_id = demo_company and name = 'Buerohaus Elbpalais';
  select id into object_b from public.cleaning_objects where company_id = demo_company and name = 'Praxis Suederstrasse';

  -- Genehmigte Abwesenheiten. Sie senken das Soll, und an diesen Tagen wird
  -- unten keine Zeit erfasst.
  insert into public.employee_absences (company_id, member_id, absence_type, status, start_date, end_date, note)
  values (demo_company, members[1], 'VACATION', 'APPROVED',
          date_trunc('month', current_date - interval '1 month')::date + 7,
          date_trunc('month', current_date - interval '1 month')::date + 11, 'Jahresurlaub'),
         (demo_company, members[2], 'SICKNESS', 'APPROVED',
          date_trunc('month', current_date)::date + 2,
          date_trunc('month', current_date)::date + 3, 'Krankmeldung');

  -- Der laufende und der vorige Monat, ein Einsatz je Arbeitstag und Person.
  -- Werktags und nie an einem bundesweiten Feiertag — an einem Tag zu arbeiten,
  -- den das Soll nicht zaehlt, erfaende Ueberstunden aus dem Kalender.
  for shift in
    select * from (values
      (1, 360, 30, time '08:00', false),
      (2, 300,  0, time '17:30', false),
      (3, 468, 45, time '06:30', false),
      (4, 120,  0, time '18:00', true)
    ) as t(slot, net_minutes, break_minutes, starts_at, weekdays_only)
  loop
    for day_row in
      select gs::date as work_date
      from generate_series(date_trunc('month', current_date - interval '1 month'), current_date, interval '1 day') gs
      where extract(isodow from gs) < 6
        and gs::date not in (select holiday from public.german_public_holidays(extract(year from gs)::integer))
    loop
      continue when shift.weekdays_only and extract(isodow from day_row.work_date) = 5;
      continue when exists (
        select 1 from public.employee_absences absence
        where absence.member_id = members[shift.slot]
          and absence.status = 'APPROVED'
          and day_row.work_date between absence.start_date and absence.end_date);

      day_net := shift.net_minutes + case when extract(isodow from day_row.work_date) = 1 then 30 else 0 end;

      insert into public.jobs (company_id, customer_id, cleaning_object_id, title, scheduled_date,
                               planned_start_at, planned_end_at, status)
      values (demo_company,
              case when shift.slot = 2 then customer_b else customer_a end,
              case when shift.slot = 2 then object_b else object_a end,
              'Unterhaltsreinigung', day_row.work_date,
              day_row.work_date + shift.starts_at,
              day_row.work_date + shift.starts_at + make_interval(mins => day_net + shift.break_minutes),
              'COMPLETED')
      returning id into shift_job;

      insert into public.job_assignments (company_id, job_id, member_id, assigned_by)
      values (demo_company, shift_job, members[shift.slot], owner_profile);

      insert into public.job_time_entries (company_id, job_id, member_id, started_at, finished_at)
      values (demo_company, shift_job, members[shift.slot],
              day_row.work_date + shift.starts_at,
              day_row.work_date + shift.starts_at + make_interval(mins => day_net + shift.break_minutes))
      returning id into shift_entry;

      if shift.break_minutes > 0 then
        insert into public.job_time_breaks (company_id, time_entry_id, started_at, ended_at)
        values (demo_company, shift_entry,
                day_row.work_date + shift.starts_at + make_interval(mins => day_net / 2),
                day_row.work_date + shift.starts_at + make_interval(mins => day_net / 2 + shift.break_minutes));
        -- Die Pause wird beim Schreiben des Eintrags verrechnet. Diese
        -- Beruehrung laesst den Trigger neu rechnen.
        update public.job_time_entries set updated_at = now() where id = shift_entry;
      end if;
    end loop;
  end loop;

  raise notice 'Demo-Betrieb "ReinPlan Demo (Testdaten)" fuer % angelegt.', owner_email;
end $$;
