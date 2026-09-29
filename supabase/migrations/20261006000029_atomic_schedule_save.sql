-- Einen wiederkehrenden Plan in EINER Transaktion speichern.
--
-- Bisher lief das Speichern als bis zu acht einzelne Schreibvorgaenge aus der
-- Anwendung: Plan anlegen/aendern, alle Regeln deaktivieren, alle
-- Teamzuweisungen loeschen, Regeln neu schreiben, Zuweisungen setzen,
-- automatisch zuweisen, Einsaetze erzeugen. Jeder Schritt war seine eigene
-- Transaktion, also konnte die Folge mittendrin stehenbleiben:
--
--   * Regeln deaktiviert und Team geloescht, dann scheitert eine Regel
--     -> der Plan steht aktiv da, ohne Wochentag und ohne Team.
--   * Bei automatischer Teamplanung ohne passenden Mitarbeiter meldete die
--     Oberflaeche einen Fehler, obwohl der Plan bereits auf aktiv gesetzt und
--     sein bisheriges Team geloescht war -- ein aktiver Plan, den niemand
--     faehrt.
--
-- Hier geschieht alles in einer Transaktion. Schlaegt irgendetwas fehl, bleibt
-- der Plan unveraendert, wie er war.

create or replace function public.save_service_schedule(
  p_schedule_id uuid,
  p_customer_id uuid,
  p_cleaning_object_id uuid,
  p_checklist_template_id uuid,
  p_name text,
  p_description text,
  p_valid_from date,
  p_valid_until date,
  p_acceptance_policy public.acceptance_policy,
  p_billing_mode public.billing_mode,
  p_assignment_mode text,
  p_is_active boolean,
  p_member_ids uuid[],
  p_rules jsonb,
  p_generate_until date
)
returns table (schedule_id uuid, assigned_member uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  target_id uuid := p_schedule_id;
  mode text := case when upper(coalesce(p_assignment_mode, 'AUTO')) = 'MANUAL' then 'MANUAL' else 'AUTO' end;
  policy public.acceptance_policy := p_acceptance_policy;
  billing public.billing_mode := p_billing_mode;
  rule jsonb;
  rule_id uuid;
  touched uuid[] := '{}';
  chosen uuid;
  member_id uuid;
begin
  select member.* into actor
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid()
    and member.role in ('OWNER','OFFICE')
    and member.status = 'ACTIVE'
  limit 1;

  if actor.id is null then raise exception 'Planning requires OWNER or OFFICE'; end if;

  if p_valid_until is not null and p_valid_until < p_valid_from then
    raise exception 'Der Gueltigkeitszeitraum endet vor seinem Beginn.';
  end if;

  if jsonb_typeof(coalesce(p_rules, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid rule payload';
  end if;

  -- Kunde und Objekt muessen zum eigenen Betrieb gehoeren. Der Mandant kommt
  -- aus dem Handelnden, nie aus der Anfrage.
  if not exists (
    select 1 from public.customers
    where id = p_customer_id and company_id = actor.company_id
  ) then raise exception 'Customer not found in this company'; end if;

  if not exists (
    select 1 from public.cleaning_objects
    where id = p_cleaning_object_id
      and company_id = actor.company_id
      and customer_id = p_customer_id
  ) then raise exception 'Objekt gehoert nicht zu diesem Kunden'; end if;

  -- Ein angenommenes Angebot ist eine Vereinbarung: seine Abnahme- und
  -- Abrechnungsbedingungen gelten, egal was das Formular schickt. Das stand
  -- vorher in der Anwendung und liess sich damit umgehen.
  if target_id is not null then
    select quote.acceptance_policy, quote.billing_mode into policy, billing
    from public.quotes quote
    where quote.company_id = actor.company_id
      and quote.created_schedule_id = target_id
      and quote.status = 'ACCEPTED'
    limit 1;
    if not found then
      policy := p_acceptance_policy;
      billing := p_billing_mode;
    end if;
  end if;

  if target_id is null then
    insert into public.service_schedules (
      company_id, customer_id, cleaning_object_id, checklist_template_id, name, description,
      valid_from, valid_until, acceptance_policy, billing_mode, assignment_mode, is_active)
    values (
      actor.company_id, p_customer_id, p_cleaning_object_id, p_checklist_template_id,
      trim(p_name), nullif(trim(coalesce(p_description, '')), ''),
      p_valid_from, p_valid_until, policy, billing, mode, coalesce(p_is_active, false))
    returning id into target_id;
  else
    update public.service_schedules set
      customer_id = p_customer_id,
      cleaning_object_id = p_cleaning_object_id,
      checklist_template_id = p_checklist_template_id,
      name = trim(p_name),
      description = nullif(trim(coalesce(p_description, '')), ''),
      valid_from = p_valid_from,
      valid_until = p_valid_until,
      acceptance_policy = policy,
      billing_mode = billing,
      assignment_mode = mode,
      is_active = coalesce(p_is_active, false)
    where id = target_id and company_id = actor.company_id;

    if not found then raise exception 'Schedule not found'; end if;
  end if;

  -- Regeln: was das Formular schickt, gilt. Alles andere wird stillgelegt statt
  -- geloescht, weil bereits erzeugte Einsaetze auf ihre Regel zeigen.
  for rule in select * from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb))
  loop
    rule_id := nullif(rule->>'id', '')::uuid;

    if rule_id is not null then
      update public.schedule_rules set
        weekday = (rule->>'weekday')::smallint,
        planned_start_time = (rule->>'planned_start_time')::time,
        planned_end_time = (rule->>'planned_end_time')::time,
        is_active = true
      where id = rule_id and service_schedule_id = target_id;
      if not found then raise exception 'Eine Planregel gehoert nicht zu diesem Plan.'; end if;
    else
      -- schedule_rules ist auf (Plan, Wochentag, von, bis) eindeutig. Schickt
      -- das Formular dieselbe Regel ohne ihre id erneut -- etwa weil ein
      -- stillgelegter Wochentag wieder angehakt wird --, wird die vorhandene
      -- Regel wiederbelebt statt eine zweite anzulegen. Ein blankes insert
      -- scheiterte hier, und bereits erzeugte Einsaetze zeigen ohnehin auf
      -- genau diese Zeile.
      insert into public.schedule_rules (
        service_schedule_id, weekday, planned_start_time, planned_end_time, is_active)
      values (
        target_id, (rule->>'weekday')::smallint,
        (rule->>'planned_start_time')::time, (rule->>'planned_end_time')::time, true)
      on conflict (service_schedule_id, weekday, planned_start_time, planned_end_time)
      do update set is_active = true
      returning id into rule_id;
    end if;

    touched := touched || rule_id;
  end loop;

  update public.schedule_rules
  set is_active = false
  where service_schedule_id = target_id
    and not (id = any(touched));

  delete from public.service_schedule_assignments where service_schedule_id = target_id;

  if mode = 'MANUAL' then
    foreach member_id in array coalesce(p_member_ids, array[]::uuid[])
    loop
      insert into public.service_schedule_assignments (company_id, service_schedule_id, member_id)
      values (actor.company_id, target_id, member_id)
      on conflict (service_schedule_id, member_id) do nothing;
    end loop;
  else
    chosen := public.auto_assign_schedule_employee(target_id);

    -- Ein aktiver Plan ohne Team ist der Zustand, den es nicht geben darf:
    -- die Oberflaeche meldete einen Fehler, und der Plan lief trotzdem los.
    -- Die Ausnahme nimmt alles oben Geschriebene zurueck.
    if chosen is null and coalesce(p_is_active, false) then
      raise exception 'Kein passender Mitarbeiter mit freien Wochenstunden gefunden. Bitte Wochen-Sollstunden pruefen oder manuell zuweisen.';
    end if;
  end if;

  if coalesce(p_is_active, false) and p_generate_until is not null then
    perform public.generate_jobs_for_schedule(target_id, p_generate_until);
  end if;

  schedule_id := target_id;
  assigned_member := chosen;
  return next;
end;
$$;

revoke all on function public.save_service_schedule(
  uuid, uuid, uuid, uuid, text, text, date, date,
  public.acceptance_policy, public.billing_mode, text, boolean, uuid[], jsonb, date
) from public, anon;
grant execute on function public.save_service_schedule(
  uuid, uuid, uuid, uuid, text, text, date, date,
  public.acceptance_policy, public.billing_mode, text, boolean, uuid[], jsonb, date
) to authenticated;
