-- Objektrentabilitaet: was ein Objekt eingebracht hat und was es gekostet hat.
--
-- Die Frage, die ein Betrieb am haeufigsten nicht beantworten kann. Dass ein
-- Objekt Verlust macht, merkt man sonst erst, wenn das Jahr vorbei ist.
--
-- Drei Entscheidungen, die den Unterschied zwischen einer Zahl und einer
-- Behauptung machen:
--
-- 1. Zugeordnet wird nach dem Tag der Leistung, nicht nach dem Rechnungsdatum.
--    Eine Rechnung vom 3. Februar fuer Januar gehoert in den Januar, sonst
--    stehen Erloes und Kosten in verschiedenen Monaten und jede Marge ist
--    falsch.
--
-- 2. Gekostet wird mit dem Stundenlohn der Person, die da war, plus den
--    hinterlegten Lohnnebenkosten. Ein Durchschnitt ueber alle wuerde genau
--    das verwischen, was man wissen will: welches Objekt die teure Kraft
--    bindet.
--
-- 3. Wo kein Stundenlohn hinterlegt ist, wird nichts geschaetzt. Die Minuten
--    stehen getrennt daneben, und die Marge ist null -- nicht null Euro,
--    sondern unbekannt. Eine ausgedachte Marge wird zur Grundlage einer
--    Kuendigung.

create or replace function public.object_profitability(p_from date, p_to date)
returns table (
  object_id uuid,
  object_name text,
  customer_name text,
  visits integer,
  worked_minutes bigint,
  minutes_without_rate bigint,
  revenue_cents bigint,
  labour_cost_cents bigint,
  margin_cents bigint,
  margin_bp integer
)
language sql stable security definer set search_path = public as $$
  with actor as (
    select member.company_id
    from public.company_members member
    join public.profiles profile on profile.id = member.profile_id
    where profile.auth_user_id = auth.uid()
      and member.status = 'ACTIVE'
      and member.role in ('OWNER', 'OFFICE')
    limit 1
  ),
  settings as (
    select
      actor.company_id,
      coalesce(defaults.wage_cents_per_hour, 0) as fallback_wage_cents,
      coalesce(defaults.ancillary_rate_bp, 0) as ancillary_bp
    from actor
    left join public.company_calculation_defaults defaults on defaults.company_id = actor.company_id
  ),
  objects as (
    select object.id, object.name, customer.name as customer_name
    from settings
    join public.cleaning_objects object on object.company_id = settings.company_id
    join public.customers customer on customer.id = object.customer_id
  ),
  -- Erloes: jede Rechnungszeile, die auf dieses Objekt zeigt und nicht
  -- storniert ist. Datiert wird nach dem Einsatz, sonst nach dem Beginn des
  -- Leistungszeitraums -- eine Monatspauschale hat keinen einzelnen Einsatz.
  revenue as (
    select
      line.cleaning_object_id as object_id,
      sum(line.net_amount_cents)::bigint as cents
    from settings
    join public.invoice_lines line on line.company_id = settings.company_id
    join public.invoices invoice on invoice.id = line.invoice_id
    left join public.jobs job on job.id = line.job_id
    where line.cleaning_object_id is not null
      and line.invoice_status <> 'CANCELLED'
      and coalesce(job.scheduled_date, invoice.service_period_start) between p_from and p_to
    group by line.cleaning_object_id
  ),
  -- Kosten: erfasste Zeit mal Stundenlohn der Person, plus Lohnnebenkosten.
  effort as (
    select
      job.cleaning_object_id as object_id,
      count(distinct job.id)::integer as visits,
      sum(entry.duration_minutes)::bigint as minutes,
      sum(case when coalesce(detail.hourly_wage_cents, settings.fallback_wage_cents) = 0
               then entry.duration_minutes else 0 end)::bigint as minutes_without_rate,
      sum(
        entry.duration_minutes::numeric / 60
        * coalesce(detail.hourly_wage_cents, settings.fallback_wage_cents)
        * (1 + settings.ancillary_bp::numeric / 10000)
      ) as cost
    from settings
    join public.job_time_entries entry on entry.company_id = settings.company_id
    join public.jobs job on job.id = entry.job_id
    join public.company_members member on member.id = entry.member_id
    left join public.employee_details detail
      on detail.profile_id = member.profile_id and detail.company_id = member.company_id
    where entry.finished_at is not null
      and (entry.started_at at time zone 'Europe/Berlin')::date between p_from and p_to
    group by job.cleaning_object_id
  )
  select
    objects.id,
    objects.name,
    objects.customer_name,
    coalesce(effort.visits, 0),
    coalesce(effort.minutes, 0),
    coalesce(effort.minutes_without_rate, 0),
    coalesce(revenue.cents, 0),
    -- Fehlt fuer irgendeine Minute ein Satz, ist die Summe keine Kostenangabe.
    case when coalesce(effort.minutes_without_rate, 0) > 0 then null
         else round(coalesce(effort.cost, 0))::bigint end,
    case when coalesce(effort.minutes_without_rate, 0) > 0 then null
         else (coalesce(revenue.cents, 0) - round(coalesce(effort.cost, 0)))::bigint end,
    case
      when coalesce(effort.minutes_without_rate, 0) > 0 then null
      when coalesce(revenue.cents, 0) = 0 then null
      else round(
        (coalesce(revenue.cents, 0) - coalesce(effort.cost, 0)) / coalesce(revenue.cents, 0)::numeric * 10000
      )::integer
    end
  from objects
  left join revenue on revenue.object_id = objects.id
  left join effort on effort.object_id = objects.id
  -- Objekte ohne Erloes und ohne Arbeit im Zeitraum sind keine Zeile wert.
  where coalesce(revenue.cents, 0) <> 0 or coalesce(effort.minutes, 0) > 0
  order by coalesce(revenue.cents, 0) - coalesce(effort.cost, 0), objects.name;
$$;

revoke all on function public.object_profitability(date, date) from public, anon;
grant execute on function public.object_profitability(date, date) to authenticated;
