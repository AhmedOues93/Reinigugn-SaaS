-- Legacy survey quotes are constructed from hourly quote lines.
-- Make that commercial term explicit on the quote so acceptance can carry it
-- unchanged into the Leistungsplan instead of guessing from a line later.
create or replace function public.create_quote_from_survey(
  p_survey_id uuid,
  p_title text,
  p_valid_days integer default 30
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
  survey public.site_surveys;
  company public.companies;
  area public.survey_areas;
  new_quote uuid;
  rate bigint;
  hours numeric;
  next_position smallint := 0;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;

  select * into survey
  from public.site_surveys
  where id = p_survey_id and company_id = actor.company_id;
  if survey.id is null then raise exception 'Survey not found'; end if;

  select * into company from public.companies where id = actor.company_id;

  insert into public.quotes (
    company_id, lead_id, customer_id, site_survey_id, title, valid_until,
    billing_mode, acceptance_policy, order_type, created_by
  )
  values (
    actor.company_id, survey.lead_id, survey.customer_id, survey.id, trim(p_title),
    current_date + greatest(least(coalesce(p_valid_days, 30), 365), 1),
    'STUNDENSATZ',
    'KEINE_ABNAHME_ERFORDERLICH',
    'DAUERAUFTRAG',
    actor.id
  )
  returning id into new_quote;

  for area in
    select * from public.survey_areas
    where site_survey_id = survey.id
    order by position
  loop
    rate := coalesce(area.hourly_rate_cents, company.default_hourly_rate_cents);
    if rate is null then
      raise exception 'No hourly rate for area "%": set one on the area or as the company default', area.name;
    end if;

    hours := round(area.minutes_per_service::numeric / 60, 3);
    next_position := next_position + 1;

    insert into public.quote_lines (
      company_id, quote_id, position, description, quantity, unit,
      unit_price_cents, vat_rate_basis_points, recurrence, survey_area_id
    )
    values (
      actor.company_id, new_quote, next_position,
      area.name || coalesce(' · ' || area.area_sqm::text || ' m²', ''),
      greatest(hours, 0.001), 'Std', rate, 1900,
      case
        when area.services_per_week >= 1 then 'WEEKLY'::public.quote_line_recurrence
        else 'MONTHLY'::public.quote_line_recurrence
      end,
      area.id
    );
  end loop;

  if survey.lead_id is not null then
    update public.leads
    set status = 'QUOTED'
    where id = survey.lead_id and status <> 'WON';
  end if;

  return new_quote;
end;
$$;

revoke all on function public.create_quote_from_survey(uuid, text, integer) from public, anon;
grant execute on function public.create_quote_from_survey(uuid, text, integer) to authenticated;