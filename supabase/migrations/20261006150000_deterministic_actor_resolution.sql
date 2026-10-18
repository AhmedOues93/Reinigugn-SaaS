-- Fuenf Funktionen entschieden nicht, in welchem Betrieb jemand handelt.
--
-- Jede von ihnen loest "wer ruft hier auf" in eine Mitgliedschaft auf und
-- endet mit `limit 1` ohne `order by`:
--
--   current_employee_member   Zeiterfassung: in welchen Einsatz wird gestempelt
--   billing_actor             Rechnungen: in welchem Betrieb entsteht sie
--   sales_actor               Leads, Angebote, Kalkulationen
--   messaging_actor           Nachrichten
--   phase7_current_member     Reklamationen und Qualitaetskontrolle
--
-- Solange eine Person Mitglied genau eines Betriebs ist, gibt es eine Zeile
-- und es faellt nicht auf. Mehrere Mitgliedschaften sind aber erlaubt:
-- `company_members` ist nur *je Betrieb* eindeutig (`unique (company_id,
-- profile_id)`). Und sie kommen vor -- eine Buerokraft, die zwei
-- Reinigungsbetriebe betreut, oder eine Inhaberin, die einen zweiten Betrieb
-- fuehrt.
--
-- Dann darf PostgreSQL jede der Zeilen liefern, und welche es tut, haengt am
-- Ausfuehrungsplan: Datenmenge, Statistiken, Version. Dieselbe Anfrage kann
-- morgen anders ausgehen.
--
-- Die Folge ist meist nicht eine stille Falschbuchung, sondern eine
-- unverstaendliche Fehlermeldung: `create_draft_invoice` sucht die Kundin
-- unter `company_id = actor.company_id` und meldet "Customer not found in
-- this company", obwohl die Kundin sichtbar in der Liste steht.
-- `ensure_time_entry_integrity` weist eine Zeiterfassung ab, weil Einsatz und
-- Mitgliedschaft zu verschiedenen Betrieben gehoeren. Wer das meldet,
-- bekommt "bei mir geht es" zurueck, weil es beim naechsten Mal klappt.
--
-- Geaendert wird hier ausschliesslich die Reihenfolge. Rollenfilter,
-- Statusfilter, Rueckgabetyp und Rechte bleiben Zeichen fuer Zeichen wie
-- bisher -- insbesondere bleibt `phase7_current_member` ohne Rollenfilter,
-- weil ihre Aufrufer die Rolle selbst pruefen.
--
-- Die Regel ist dieselbe wie in `current_company_member`, damit es im
-- Projekt eine Regel gibt und nicht sechs: Rollen mit mehr Verantwortung
-- zuerst, dann die aeltere Mitgliedschaft, dann die Kennung. Die Kennung ist
-- noetig, weil zwei Mitgliedschaften in derselben Transaktion entstehen
-- koennen und dann denselben Zeitstempel tragen.
--
-- Bekannte Grenze, hier bewusst nicht geaendert: wer in zwei Betrieben
-- arbeitet, handelt immer im hoeher priorisierten -- wechseln laesst sich
-- nicht. Eine Betriebsauswahl waere eine neue Funktion. Dokumentiert in
-- docs/runbook.md.

create or replace function public.current_employee_member()
returns public.company_members
language sql stable security definer set search_path = public as $$
  select member.* from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid() and member.status = 'ACTIVE' and member.role = 'EMPLOYEE'
  order by member.created_at, member.id
  limit 1;
$$;

create or replace function public.billing_actor()
returns public.company_members language sql stable security definer set search_path = public as $$
  select member.* from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid() and member.role in ('OWNER', 'OFFICE') and member.status = 'ACTIVE'
  order by
    case member.role when 'OWNER' then 0 when 'OFFICE' then 1 else 2 end,
    member.created_at,
    member.id
  limit 1;
$$;

create or replace function public.sales_actor()
returns public.company_members language sql stable security definer set search_path = public as $$
  select m.* from public.company_members m
  join public.profiles p on p.id = m.profile_id
  where p.auth_user_id = auth.uid() and m.role in ('OWNER', 'OFFICE') and m.status = 'ACTIVE'
  order by
    case m.role when 'OWNER' then 0 when 'OFFICE' then 1 else 2 end,
    m.created_at,
    m.id
  limit 1;
$$;

create or replace function public.messaging_actor()
returns public.company_members language sql stable security definer set search_path = public as $$
  select m.* from public.company_members m
  join public.profiles p on p.id = m.profile_id
  where p.auth_user_id = auth.uid() and m.status = 'ACTIVE' and m.role in ('OWNER', 'OFFICE', 'EMPLOYEE')
  order by
    case m.role when 'OWNER' then 0 when 'OFFICE' then 1 else 2 end,
    m.created_at,
    m.id
  limit 1;
$$;

create or replace function public.phase7_current_member()
returns public.company_members language sql stable security definer set search_path = public as $$
  select member.* from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid() and member.status = 'ACTIVE'
  order by
    case member.role when 'OWNER' then 0 when 'OFFICE' then 1 when 'EMPLOYEE' then 2 else 3 end,
    member.created_at,
    member.id
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Und ein Recht, das es nicht braucht
-- ---------------------------------------------------------------------------
--
-- `current_company_member()` war an `authenticated` vergeben. Keine
-- RLS-Richtlinie ruft sie auf -- nachgesehen in pg_policy -- und alle sieben
-- aufrufenden Funktionen sind `security definer`, laufen also als Eigentuemer
-- und brauchen das Recht der Aufruferin nicht:
--
--   auto_assign_schedule_employee, list_schedule_coverage,
--   plan_window_automatically, release_payroll_period,
--   reopen_payroll_period, schedule_candidate_diagnostics,
--   set_company_datev_settings
--
-- Ein Leck war es nicht: sie gibt die eigene Mitgliedschaft zurueck, und die
-- darf die Person ueber RLS ohnehin lesen. Aber `security definer` umgeht RLS,
-- und eine solche Funktion ohne Grund aus dem Browser erreichbar zu lassen
-- ist genau die Nachlaessigkeit, aus der spaeter ein Leck wird. Sie ist ein
-- Baustein, kein Dienst.
--
-- `phase7_current_member()` bleibt bewusst vergeben: drei Richtlinien rufen
-- sie auf ("employees read operational complaints", "employees read
-- operational complaint updates", "employees read scoped complaint photos").
-- Ohne das Recht sehen Mitarbeiterinnen ihre Reklamationen nicht mehr.

revoke execute on function public.current_company_member() from authenticated;
