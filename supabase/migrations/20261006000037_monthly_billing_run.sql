-- Der Monatslauf: aus einem Monat erledigter Arbeit je Kunde ein
-- Rechnungsentwurf, statt einzeln hundert Mal zu klicken.
--
-- Was hier bewusst *nicht* passiert:
--
--   * Es wird nichts gestellt. Der Lauf erzeugt Entwuerfe; das Ausstellen
--     bleibt ein eigener Schritt mit eigener Nummer. Eine Rechnung, die ein
--     Automat ausstellt, bekommt niemand mehr zurueck.
--   * Eine bereits gestellte Rechnung wird nicht angefasst. Nur Entwuerfe
--     derselben Periode werden ergaenzt.
--   * Zweimal laufen heisst nicht zweimal abrechnen. Der Einsatz haengt an der
--     Rechnungszeile, die Monatspauschale an Plan und Periode; beides wird
--     vorher geprueft.
--   * Was keinen Preis hat, wird nicht geraten. Es wird gemeldet.

-- ---------------------------------------------------------------------------
-- Monatspauschalen, getrennt gefragt
-- ---------------------------------------------------------------------------
--
-- `list_billable_jobs` laesst sie bewusst aus: ihre Einsaetze sind der Beweis,
-- dass der Monat geleistet wurde, und keine Rechnungszeilen. Abgerechnet wird
-- die Pauschale -- aber nur, wenn es diesen Beweis gibt. Einen Monat zu
-- stellen, in dem nachweislich niemand da war, waere die eine Art Fehler, die
-- ein Kunde nicht verzeiht.

create or replace function public.list_billable_retainers(p_customer_id uuid, p_month date)
returns table (
  service_schedule_id uuid,
  schedule_name text,
  object_id uuid,
  object_name text,
  unit_price_cents bigint,
  vat_rate_basis_points integer,
  visits integer
)
language sql stable security definer set search_path = public as $$
  with bounds as (
    select
      date_trunc('month', p_month)::date as first_day,
      (date_trunc('month', p_month) + interval '1 month - 1 day')::date as last_day
  )
  select
    schedule.id,
    schedule.name,
    object.id,
    object.name,
    schedule.billing_unit_price_cents,
    schedule.billing_vat_rate_basis_points,
    evidence.visits
  from public.billing_actor() actor
  cross join bounds
  join public.service_schedules schedule
    on schedule.company_id = actor.company_id and schedule.customer_id = p_customer_id
  join public.cleaning_objects object on object.id = schedule.cleaning_object_id
  cross join lateral (
    select count(*)::integer as visits
    from public.jobs job
    join public.service_records record on record.job_id = job.id
    where job.service_schedule_id = schedule.id
      and job.status = 'COMPLETED'
      and job.scheduled_date between bounds.first_day and bounds.last_day
      and record.status in ('ERFASST', 'ABGENOMMEN')
  ) evidence
  where schedule.is_active
    and schedule.billing_mode = 'MONATSPAUSCHALE'
    and schedule.valid_from <= bounds.last_day
    and (schedule.valid_until is null or schedule.valid_until >= bounds.first_day)
    and evidence.visits > 0
    -- Dieselbe Periode nicht zweimal. Die Zeile haengt am Plan, und die
    -- Periode steht auf der Rechnung.
    and not exists (
      select 1
      from public.invoice_lines line
      join public.invoices invoice on invoice.id = line.invoice_id
      where line.service_schedule_id = schedule.id
        and line.invoice_status <> 'CANCELLED'
        and invoice.service_period_start <= bounds.last_day
        and invoice.service_period_end >= bounds.first_day
    )
  order by object.name;
$$;

revoke all on function public.list_billable_retainers(uuid, date) from public, anon;
grant execute on function public.list_billable_retainers(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Der Lauf
-- ---------------------------------------------------------------------------
--
-- Gibt eine Zeile pro Kunde zurueck, mit Ergebnis und Grund -- auch fuer die
-- Kunden, bei denen nichts passiert ist. Eine stille Zeile waere hier das
-- Schlimmste: niemand merkt, dass ein Objekt seit drei Monaten nicht
-- abgerechnet wird.
--
-- `p_dry_run` schreibt nichts und liefert dieselbe Aufstellung. Das Buero soll
-- sehen, was der Lauf tun wuerde, bevor er es tut.

create or replace function public.run_monthly_billing(p_month date, p_dry_run boolean default true)
returns table (
  customer_id uuid,
  customer_name text,
  invoice_id uuid,
  outcome text,
  lines_added integer,
  skipped_without_price integer,
  net_total_cents bigint,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  first_day date := date_trunc('month', p_month)::date;
  last_day date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  customer record;
  visit record;
  retainer record;
  target_invoice uuid;
  existing_draft uuid;
  added integer;
  skipped integer;
  total bigint;
  note text;
  result text;
begin
  select * into actor from public.billing_actor();
  if actor.id is null then raise exception 'Billing requires OWNER or OFFICE'; end if;
  -- Ein Monat, der noch laeuft, ist nicht abzurechnen: die letzten Einsaetze
  -- fehlen, und der Kunde bekommt zwei Rechnungen fuer denselben Monat.
  if last_day >= (now() at time zone 'Europe/Berlin')::date then
    raise exception 'Der Monat % ist noch nicht abgeschlossen', to_char(first_day, 'MM/YYYY');
  end if;

  for customer in
    select c.id, c.name
    from public.customers c
    where c.company_id = actor.company_id and c.is_active
    order by c.name
  loop
    added := 0;
    skipped := 0;
    total := 0;
    note := null;
    target_invoice := null;

    -- Ein Entwurf fuer genau diese Periode wird ergaenzt, nicht verdoppelt.
    -- Gestellte Rechnungen bleiben unberuehrt -- sie sind keine Entwuerfe.
    select invoice.id into target_invoice
    from public.invoices invoice
    where invoice.company_id = actor.company_id
      and invoice.customer_id = customer.id
      and invoice.status = 'DRAFT'
      and invoice.service_period_start = first_day
      and invoice.service_period_end = last_day
    order by invoice.created_at
    limit 1;
    existing_draft := target_invoice;

    for visit in
      select * from public.list_billable_jobs(customer.id, first_day, last_day)
    loop
      if visit.suggested_unit_price_cents is null or visit.suggested_unit_price_cents <= 0 then
        skipped := skipped + 1;
        continue;
      end if;

      if not p_dry_run then
        if target_invoice is null then
          target_invoice := public.create_draft_invoice(customer.id, first_day, last_day);
        end if;
        perform public.add_invoice_line(
          target_invoice,
          left(
            to_char(visit.scheduled_date, 'DD.MM.YYYY') || ' · ' || visit.object_name
            || case when visit.title is null or visit.title = visit.object_name then '' else ' · ' || visit.title end,
            500
          ),
          visit.suggested_quantity,
          visit.suggested_unit,
          visit.suggested_unit_price_cents,
          coalesce(visit.suggested_vat_rate_basis_points, 1900),
          visit.job_id,
          visit.service_schedule_id,
          visit.object_id
        );
      end if;
      added := added + 1;
      total := total + round(visit.suggested_quantity * visit.suggested_unit_price_cents);
    end loop;

    for retainer in
      select * from public.list_billable_retainers(customer.id, first_day)
    loop
      if retainer.unit_price_cents is null or retainer.unit_price_cents <= 0 then
        skipped := skipped + 1;
        continue;
      end if;

      if not p_dry_run then
        if target_invoice is null then
          target_invoice := public.create_draft_invoice(customer.id, first_day, last_day);
        end if;
        perform public.add_invoice_line(
          target_invoice,
          left(
            to_char(first_day, 'MM/YYYY') || ' · ' || retainer.object_name || ' · Monatspauschale',
            500
          ),
          1,
          'Monat',
          retainer.unit_price_cents,
          coalesce(retainer.vat_rate_basis_points, 1900),
          null,
          retainer.service_schedule_id,
          retainer.object_id
        );
      end if;
      added := added + 1;
      total := total + retainer.unit_price_cents;
    end loop;

    if added = 0 and skipped = 0 then
      result := 'NOTHING_TO_BILL';
      note := 'Keine abgerechneten Leistungen in diesem Monat.';
    elsif added = 0 then
      result := 'NO_PRICE';
      note := skipped || ' Leistung(en) ohne hinterlegten Preis. Bitte den Vertrag im Objekt pruefen.';
    else
      result := case
        when p_dry_run and existing_draft is null then 'WOULD_CREATE'
        when p_dry_run then 'WOULD_EXTEND'
        when existing_draft is null then 'CREATED'
        else 'EXTENDED'
      end;
      if skipped > 0 then
        note := skipped || ' weitere Leistung(en) ohne hinterlegten Preis uebergangen.';
      end if;
    end if;

    return query select customer.id, customer.name, target_invoice, result, added, skipped, total, note;
  end loop;
end;
$$;

revoke all on function public.run_monthly_billing(date, boolean) from public, anon;
grant execute on function public.run_monthly_billing(date, boolean) to authenticated;
