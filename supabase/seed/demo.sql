-- Demo data for local development.
--
-- Note on the task's "extend the existing demo seed": the repository shipped no
-- seed. supabase/seed/README.md stated that phase 1 intentionally contained no
-- sample tenants. This file is that seed, created once and covering the whole
-- product including billing, rather than a second demo company alongside a first
-- one that never existed. Re-running it is a no-op: it detects its own company
-- and stops, so it never produces duplicates.
--
-- LOCAL DEVELOPMENT ONLY. It creates users with a known password and refuses to
-- run against anything that is not a local Supabase stack.
\set ON_ERROR_STOP on

/*
 * Refusing to run anywhere it does not belong.
 *
 * The header above always claimed this was local-only, but for a long time
 * nothing enforced it: pointing psql at a staging or production database and
 * running this file would have created sign-in-able users with a password
 * printed in the README. Two independent guards now stand in the way, because
 * either one alone is too easy to defeat by accident.
 *
 * 1. Real data present. A database that already holds a company which is not
 *    the demo one is somebody's real tenant. There is no situation in which
 *    seeding demo users into it is correct.
 *
 * 2. Explicit acknowledgement. An empty production database would pass the
 *    first guard, so the operator must also say out loud what they are doing:
 *
 *      psql -v ON_ERROR_STOP=1 \
 *           -c "set sauberwerk.seed_confirmed = 'local-development'" \
 *           -f supabase/seed/demo.sql
 *
 *    or, in one session, `set sauberwerk.seed_confirmed = 'local-development';`
 *    before running this file. The value is deliberately a phrase rather than a
 *    boolean, so it cannot be set true by a stray flag.
 */
do $$
declare foreign_companies integer;
begin
  if current_setting('server_version_num')::int < 150000 then
    raise exception 'PostgreSQL 15 or newer required';
  end if;

  select count(*) into foreign_companies
  from public.companies where slug not like 'demo-sauberwerk%';
  if foreign_companies > 0 then
    raise exception
      'Refusing to seed: this database already holds % real tenant(s). The demo seed is for an empty local database only.',
      foreign_companies;
  end if;

  if coalesce(current_setting('sauberwerk.seed_confirmed', true), '') <> 'local-development' then
    raise exception
      'Refusing to seed: set sauberwerk.seed_confirmed to ''local-development'' first (see the comment at the top of this file).';
  end if;

  if exists (select 1 from public.companies where slug like 'demo-sauberwerk%') then
    raise notice 'Demo data already present; nothing to do.';
    return;
  end if;
end $$;

do $$
declare
  demo_company uuid;
  owner_user uuid := '0a000000-0000-4000-8000-000000000001';
  office_user uuid := '0a000000-0000-4000-8000-000000000002';
  employee_user uuid := '0a000000-0000-4000-8000-000000000003';
  portal_user uuid := '0a000000-0000-4000-8000-000000000004';
  owner_member uuid; office_member uuid; employee_member uuid; portal_member uuid;
  owner_profile uuid; employee_profile uuid; portal_profile uuid;
  customer_nord uuid; customer_sued uuid;
  object_alster uuid; object_hafen uuid; object_sued uuid;
  schedule_weekly uuid;
  draft_invoice uuid; open_invoice uuid; paid_invoice uuid;
  won_lead uuid; open_lead uuid; won_survey uuid; open_survey uuid; won_quote uuid; open_quote uuid;
  demo_thread uuid; checklist_template uuid;
  job_row record;
  billed integer := 0;
begin
  if exists (select 1 from public.companies where slug like 'demo-sauberwerk%') then return; end if;

  -- Auth users. `crypt` comes from pgcrypto, which the initial migration installs.
  --
  -- The token columns (confirmation_token, recovery_token, email_change*,
  -- reauthentication_token) are NOT NULL-by-convention as far as GoTrue is
  -- concerned: its Go code scans them into `string`, and a NULL fails that scan
  -- with "converting NULL to string is unsupported" on the very first password
  -- grant, even though the column itself is nullable in the schema. Every
  -- token column is therefore seeded as '' rather than left to default to NULL.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    email_change_token_current, reauthentication_token
  )
  values
    (owner_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'inhaber@demo.test', extensions.crypt('DemoPasswort2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Miriam","last_name":"Kessler"}', now(), now(), '', '', '', '', '', ''),
    (office_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'buero@demo.test', extensions.crypt('DemoPasswort2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Tobias","last_name":"Renner"}', now(), now(), '', '', '', '', '', ''),
    (employee_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mitarbeiter@demo.test', extensions.crypt('DemoPasswort2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Olena","last_name":"Kovalenko"}', now(), now(), '', '', '', '', '', ''),
    (portal_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'kunde@demo.test', extensions.crypt('DemoPasswort2026!', extensions.gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"first_name":"Sabine","last_name":"Lorenz"}', now(), now(), '', '', '', '', '', '')
  on conflict (id) do nothing;

  -- GoTrue links an email/password account through `auth.identities`; without a
  -- matching row here the account exists but has no provider identity, which
  -- breaks account linking and the Studio/Admin view of the user even though
  -- the token-column fix above already makes password sign-in itself work.
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at, last_sign_in_at)
  values
    (gen_random_uuid(), owner_user, owner_user::text, jsonb_build_object('sub', owner_user::text, 'email', 'inhaber@demo.test', 'email_verified', true), 'email', now(), now(), now()),
    (gen_random_uuid(), office_user, office_user::text, jsonb_build_object('sub', office_user::text, 'email', 'buero@demo.test', 'email_verified', true), 'email', now(), now(), now()),
    (gen_random_uuid(), employee_user, employee_user::text, jsonb_build_object('sub', employee_user::text, 'email', 'mitarbeiter@demo.test', 'email_verified', true), 'email', now(), now(), now()),
    (gen_random_uuid(), portal_user, portal_user::text, jsonb_build_object('sub', portal_user::text, 'email', 'kunde@demo.test', 'email_verified', true), 'email', now(), now(), now())
  on conflict (provider_id, provider) do nothing;

  select id into owner_profile from public.profiles where auth_user_id = owner_user;
  select id into employee_profile from public.profiles where auth_user_id = employee_user;
  select id into portal_profile from public.profiles where auth_user_id = portal_user;

  insert into public.companies (name, slug, legal_form, street, postal_code, city, phone, email, website, tax_number, vat_id, iban, bic, default_payment_terms_days, default_language)
  values ('SauberWerk Demo GmbH', 'demo-sauberwerk', 'GmbH', 'Reeperbahn 42', '20359', 'Hamburg', '+49 40 1234567', 'kontakt@demo.test', 'https://demo.test', '22/815/01234', 'DE123456789', 'DE02120300000000202051', 'BYLADEM1001', 14, 'de')
  returning id into demo_company;
  update public.companies set default_hourly_rate_cents = 3900 where id = demo_company;

  insert into public.company_members (company_id, profile_id, role, status, invited_email, joined_at)
  values
    (demo_company, owner_profile, 'OWNER', 'ACTIVE', 'inhaber@demo.test', now()),
    (demo_company, (select id from public.profiles where auth_user_id = office_user), 'OFFICE', 'ACTIVE', 'buero@demo.test', now()),
    (demo_company, employee_profile, 'EMPLOYEE', 'ACTIVE', 'mitarbeiter@demo.test', now()),
    (demo_company, portal_profile, 'CUSTOMER', 'ACTIVE', 'kunde@demo.test', now());

  select id into owner_member from public.company_members where company_id = demo_company and role = 'OWNER';
  select id into office_member from public.company_members where company_id = demo_company and role = 'OFFICE';
  select id into employee_member from public.company_members where company_id = demo_company and role = 'EMPLOYEE';
  select id into portal_member from public.company_members where company_id = demo_company and role = 'CUSTOMER';

  insert into public.employee_details (company_id, profile_id, employee_number, weekly_hours, employment_start_date, employment_type, preferred_language, is_active)
  -- German, so the demo employee app is legible to a German-speaking reviewer.
  -- Any of the five shipped locales works here; the employee changes it in the
  -- app under Profil, and nothing about the localisation behaviour depends on
  -- this value.
  values (demo_company, employee_profile, 'M-0001', 30, current_date - 400, 'PART_TIME', 'de', true);

  insert into public.customers (company_id, name, contact_person, email, phone, billing_address, postal_code, city)
  values
    (demo_company, 'Hausverwaltung Nord GmbH', 'Sabine Lorenz', 'kunde@demo.test', '+49 40 7654321', 'Alsterufer 12', '20354', 'Hamburg'),
    (demo_company, 'Praxis Dr. Sonnenberg', 'Dr. Jens Sonnenberg', 'praxis@demo.test', '+49 40 5556677', 'Süderstraße 8', '20097', 'Hamburg');
  select id into customer_nord from public.customers where company_id = demo_company and name = 'Hausverwaltung Nord GmbH';
  select id into customer_sued from public.customers where company_id = demo_company and name = 'Praxis Dr. Sonnenberg';

  insert into public.customer_contacts (company_id, customer_id, member_id) values (demo_company, customer_nord, portal_member);

  insert into public.cleaning_objects (company_id, customer_id, name, street, postal_code, city, contact_person, access_instructions, cleaning_instructions)
  values
    (demo_company, customer_nord, 'Bürohaus Alster', 'Alsterufer 12', '20354', 'Hamburg', 'Herr Baum', 'Schlüssel im Hausmeisterbüro, Code 4711.', 'Böden feucht wischen, Glasflächen streifenfrei.'),
    (demo_company, customer_nord, 'Lagerhalle Hafen', 'Am Sandtorkai 3', '20457', 'Hamburg', 'Frau Tan', 'Tor 2, Anmeldung an der Pforte.', 'Staplerwege freihalten.'),
    (demo_company, customer_sued, 'Praxisräume Süderstraße', 'Süderstraße 8', '20097', 'Hamburg', 'Frau Adam', 'Zugang ab 18:00 Uhr.', 'Desinfektion nach Hygieneplan.');
  select id into object_alster from public.cleaning_objects where company_id = demo_company and name = 'Bürohaus Alster';
  select id into object_hafen from public.cleaning_objects where company_id = demo_company and name = 'Lagerhalle Hafen';
  select id into object_sued from public.cleaning_objects where company_id = demo_company and name = 'Praxisräume Süderstraße';

  -- A checklist the cleaner actually works through. It is attached to the
  -- objects, so every job created below snapshots it through the existing
  -- trigger rather than the seed writing job rows by hand.
  insert into public.checklist_templates (company_id, name, description)
  values (demo_company, 'Unterhaltsreinigung Büro', 'Standardablauf für Büroflächen.')
  returning id into checklist_template;
  insert into public.checklist_template_items (template_id, position, title, instruction, is_required)
  values
    (checklist_template, 1, 'Eingangsbereich und Foyer reinigen', 'Glastüren streifenfrei, Fußmatten aufnehmen.', true),
    (checklist_template, 2, 'Büroflächen saugen und wischen', 'Unter den Schreibtischen nicht vergessen.', true),
    (checklist_template, 3, 'Sanitärbereiche reinigen und auffüllen', 'Seife, Papier und Handtücher prüfen.', true),
    (checklist_template, 4, 'Teeküche reinigen', null, true),
    (checklist_template, 5, 'Abfallbehälter leeren', null, true),
    (checklist_template, 6, 'Fensterbänke abstauben', 'Nur bei Bedarf.', false);
  update public.cleaning_objects set checklist_template_id = checklist_template
  where company_id = demo_company and id in (object_alster, object_sued);

  -- A recurring agreement that carries the rate it was sold at, so a draft
  -- invoice can take its price from the agreement rather than from guesswork.
  insert into public.service_schedules (company_id, customer_id, cleaning_object_id, name, description, valid_from, is_active, billing_description, billing_unit_price_cents, billing_vat_rate_basis_points)
  values (demo_company, customer_nord, object_alster, 'Unterhaltsreinigung Bürohaus Alster', 'Montags und donnerstags', current_date - 90, true, 'Unterhaltsreinigung nach Vereinbarung', 4200, 1900)
  returning id into schedule_weekly;

  insert into public.schedule_rules (service_schedule_id, weekday, planned_start_time, planned_end_time, is_active)
  values (schedule_weekly, 1, '07:00', '10:00', true), (schedule_weekly, 4, '07:00', '10:00', true);
  insert into public.service_schedule_assignments (company_id, service_schedule_id, member_id)
  values (demo_company, schedule_weekly, employee_member);

  -- Past visits, completed with recorded working time, plus upcoming ones.
  for billed in 1..8 loop
    insert into public.jobs (company_id, customer_id, cleaning_object_id, service_schedule_id, title, scheduled_date, planned_start_at, planned_end_at, status, employee_instructions)
    values (demo_company, customer_nord, object_alster, schedule_weekly, 'Unterhaltsreinigung Bürohaus Alster',
            current_date - (billed * 7), (current_date - (billed * 7)) + time '07:00', (current_date - (billed * 7)) + time '10:00',
            'COMPLETED', 'Glasflächen im Foyer nicht vergessen.');
  end loop;

  insert into public.jobs (company_id, customer_id, cleaning_object_id, title, scheduled_date, planned_start_at, planned_end_at, status, employee_instructions)
  values
    (demo_company, customer_nord, object_alster, 'Unterhaltsreinigung Bürohaus Alster', current_date, current_date + time '07:00', current_date + time '10:00', 'CONFIRMED', 'Glasflächen im Foyer nicht vergessen.'),
    (demo_company, customer_nord, object_hafen, 'Hallenreinigung', current_date, current_date + time '14:00', current_date + time '17:00', 'PLANNED', 'Staplerwege zuerst.'),
    (demo_company, customer_sued, object_sued, 'Praxisreinigung', current_date + 1, (current_date + 1) + time '18:30', (current_date + 1) + time '20:00', 'PLANNED', 'Hygieneplan beachten.'),
    (demo_company, customer_nord, object_alster, 'Unterhaltsreinigung Bürohaus Alster', current_date + 3, (current_date + 3) + time '07:00', (current_date + 3) + time '10:00', 'PLANNED', null);

  insert into public.job_assignments (company_id, job_id, member_id, assigned_by)
  select demo_company, job.id, employee_member, owner_profile from public.jobs job where job.company_id = demo_company;

  -- Recorded working time on the completed visits, so service records and the
  -- billable-job list have something real behind them.
  for job_row in select id, scheduled_date from public.jobs where company_id = demo_company and status = 'COMPLETED' loop
    insert into public.job_time_entries (company_id, job_id, member_id, started_at, finished_at)
    values (demo_company, job_row.id, employee_member, job_row.scheduled_date + time '07:02', job_row.scheduled_date + time '09:50');
  end loop;

  insert into public.complaints (company_id, customer_id, cleaning_object_id, title, description, priority, status, created_by)
  values (demo_company, customer_nord, object_alster, 'Treppenhaus im 2. OG übersehen',
          'Am Montag war das Treppenhaus im zweiten Obergeschoss nicht gereinigt.', 'NORMAL', 'IN_PROGRESS', office_member);
  insert into public.complaint_updates (company_id, complaint_id, author_member_id, status, note)
  select demo_company, complaint.id, office_member, 'IN_PROGRESS', 'Nachreinigung für morgen eingeplant, Rückmeldung folgt.'
  from public.complaints complaint where complaint.company_id = demo_company;

  -- ---------------------------------------------------------------------
  -- Billing. Created through the real functions while impersonating the
  -- owner, so the demo data goes through the same validation, numbering and
  -- snapshotting as production rather than being inserted behind them.
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', owner_user::text, true);

  -- A paid invoice for an earlier period.
  paid_invoice := public.create_draft_invoice(customer_nord, current_date - 60, current_date - 31, 14::smallint, 'Vielen Dank für Ihr Vertrauen.');
  perform public.add_invoice_line(paid_invoice, 'Unterhaltsreinigung Bürohaus Alster', 24, 'Std', 4200, 1900, null, schedule_weekly, object_alster);
  perform public.issue_invoice(paid_invoice, current_date - 30);
  perform public.mark_invoice_paid(paid_invoice, now() - interval '20 days');

  -- An open invoice built from the actual completed visits, which also
  -- demonstrates the duplicate-billing guard: these jobs are now consumed.
  open_invoice := public.create_draft_invoice(customer_nord, current_date - 30, current_date - 1, 14::smallint, null);
  for job_row in
    select job_id, scheduled_date, object_name, duration_minutes
    from public.list_billable_jobs(customer_nord, current_date - 30, current_date - 1)
  loop
    perform public.add_invoice_line(
      open_invoice,
      format('Unterhaltsreinigung %s am %s', job_row.object_name, to_char(job_row.scheduled_date, 'DD.MM.YYYY')),
      greatest(round(job_row.duration_minutes::numeric / 60, 2), 0.25), 'Std', 4200, 1900,
      job_row.job_id, schedule_weekly, object_alster);
  end loop;
  perform public.issue_invoice(open_invoice, current_date - 20);

  -- And a draft still being prepared.
  draft_invoice := public.create_draft_invoice(customer_sued, current_date - 30, current_date, 30::smallint, null);
  perform public.add_invoice_line(draft_invoice, 'Praxisreinigung nach Hygieneplan', 8, 'Std', 4800, 1900, null, null, object_sued);
  perform public.add_invoice_line(draft_invoice, 'Desinfektionsmittel', 4, 'Stk', 1250, 1900, null, null, object_sued);

  -- ---------------------------------------------------------------------
  -- Sales pipeline, walked through the real functions: a won deal that
  -- became a customer, and an open one still awaiting a decision.
  -- ---------------------------------------------------------------------
  won_lead := public.create_lead('Steuerkanzlei Lindemann', 'Herr Lindemann', 'lindemann@demo.test', '+49 40 998877',
                                 'Ballindamm 17', '20095', 'Hamburg', 'Empfehlung', 'Zwei Etagen, wöchentlich.');
  won_survey := public.schedule_site_survey(won_lead, null, 'Kanzlei Ballindamm', now() - interval '10 days', owner_member,
                                            'Ballindamm 17', '20095', 'Hamburg', 'Schlüsselkasten im Eingang, Code auf Anfrage.');
  perform public.add_survey_area(won_survey, 'Büroetage 3. OG', 180, 'Teppich', 2, 105, null, null);
  perform public.add_survey_area(won_survey, 'Sanitärbereiche', 24, 'Fliesen', 2, 40, 4300, null);
  perform public.complete_site_survey(won_survey, 'Aufzug vorhanden, Reinigung ab 18:00 Uhr möglich.');
  won_quote := public.create_quote_from_survey(won_survey, 'Unterhaltsreinigung Kanzlei Ballindamm', 30);
  perform public.send_quote(won_quote);
  perform public.accept_quote(won_quote, array[2, 5]::smallint[], '18:00', '20:00');

  open_lead := public.create_lead('Autohaus Wendt', 'Frau Wendt', 'wendt@demo.test', '+49 40 445566',
                                  'Stresemannstraße 200', '22769', 'Hamburg', 'Website', 'Showroom und Werkstatt.');
  perform public.set_lead_status(open_lead, 'CONTACTED');
  open_survey := public.schedule_site_survey(open_lead, null, 'Autohaus Showroom', now() - interval '2 days', office_member,
                                             'Stresemannstraße 200', '22769', 'Hamburg', 'Anmeldung an der Rezeption.');
  perform public.add_survey_area(open_survey, 'Showroom', 420, 'Feinsteinzeug', 3, 150, null, null);
  perform public.add_survey_area(open_survey, 'Kundenbereich und WC', 60, 'Fliesen', 3, 50, null, null);
  perform public.complete_site_survey(open_survey, 'Glasflächen sehr großflächig, Hubwagen erforderlich.');
  open_quote := public.create_quote_from_survey(open_survey, 'Showroom-Reinigung Autohaus Wendt', 21);
  -- Sent and awaiting a decision, so the demo shows a live pipeline.
  perform public.send_quote(open_quote);

  -- ---------------------------------------------------------------------
  -- One conversation between the cleaner and the office, opened and answered
  -- through the real messaging functions so the read marks, the unread count
  -- and the notification all come out as they would in production.
  -- ---------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', employee_user::text, true);
  -- The cleaner maintains their own contact details in the app; the office view
  -- reads the same profile row rather than keeping a second copy.
  perform public.update_my_contact_details('Olena', 'Kovalenko', '+49 151 22334455');
  demo_thread := public.start_message_thread(employee_member, 'Schlüssel Objekt Alsterpalais',
                                             'Guten Morgen, der Schlüssel für den Hintereingang klemmt. Können Sie das bitte prüfen?');
  perform set_config('request.jwt.claim.sub', office_user::text, true);
  perform public.send_message(demo_thread,
    'Guten Morgen Olena, danke für die Info. Der Hausmeister schaut sich das heute Nachmittag an.');

  perform set_config('request.jwt.claim.sub', '', true);

  raise notice 'Demo company created. Sign in with inhaber@demo.test / buero@demo.test / mitarbeiter@demo.test / kunde@demo.test, password DemoPasswort2026!';
end $$;
