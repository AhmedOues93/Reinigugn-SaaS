-- Phase 12: the front of the cleaning-company workflow.
--
--   Lead -> Besichtigung (site survey) -> Kalkulation -> Angebot (quote)
--     -> acceptance -> customer + object + recurring plan
--
-- This closes the gap before the operational half that already exists. Nothing
-- is rebuilt: acceptance converts into the existing `customers`,
-- `cleaning_objects`, `service_schedules` and `schedule_rules` tables, so a won
-- quote lands directly in the planning the rest of the product already runs on.
--
-- Money is integer minor units and every amount is computed by a trigger from
-- quantity, unit price and VAT rate, exactly as for invoices. A client never
-- sends a total.

create type public.lead_status as enum ('NEW', 'CONTACTED', 'SURVEY_BOOKED', 'QUOTED', 'WON', 'LOST');
create type public.survey_status as enum ('PLANNED', 'COMPLETED', 'CANCELLED');
create type public.quote_status as enum ('DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED');
create type public.quote_line_recurrence as enum ('ONE_OFF', 'WEEKLY', 'MONTHLY');

-- The rate a calculation falls back to when an area carries no explicit price.
alter table public.companies add column if not exists default_hourly_rate_cents bigint;
alter table public.companies drop constraint if exists companies_hourly_rate_check;
alter table public.companies add constraint companies_hourly_rate_check
  check (default_hourly_rate_cents is null or default_hourly_rate_cents between 0 and 100000000);

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  status public.lead_status not null default 'NEW',

  organisation text not null check (char_length(trim(organisation)) between 2 and 160),
  contact_person text,
  email text,
  phone text,
  street text,
  postal_code text,
  city text,
  source text,
  notes text check (notes is null or char_length(notes) <= 4000),

  -- Set once the lead is won, so the pipeline keeps its provenance.
  converted_customer_id uuid references public.customers(id) on delete set null,
  lost_reason text,

  created_by uuid not null references public.company_members(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint leads_email_check check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint leads_lost_reason_check check ((status = 'LOST') = (lost_reason is not null)),
  constraint leads_converted_check check (status = 'WON' or converted_customer_id is null)
);

create index leads_company_status_idx on public.leads(company_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- Besichtigung
-- ---------------------------------------------------------------------------
create table public.site_surveys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  -- A survey belongs to a lead (new business) or to an existing customer
  -- (an additional site), never to both and never to neither.
  lead_id uuid references public.leads(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,

  status public.survey_status not null default 'PLANNED',
  scheduled_at timestamptz not null,
  conducted_by uuid references public.company_members(id) on delete set null,

  site_name text not null check (char_length(trim(site_name)) between 2 and 160),
  street text,
  postal_code text,
  city text,
  access_notes text check (access_notes is null or char_length(access_notes) <= 4000),
  findings text check (findings is null or char_length(findings) <= 4000),
  completed_at timestamptz,

  created_by uuid not null references public.company_members(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint site_surveys_owner_check check (num_nonnulls(lead_id, customer_id) = 1),
  constraint site_surveys_completed_check check ((status = 'COMPLETED') = (completed_at is not null))
);

create index site_surveys_company_idx on public.site_surveys(company_id, scheduled_at desc);
create index site_surveys_lead_idx on public.site_surveys(lead_id);

/*
 * The Kalkulation. One row per area measured on site. `minutes_per_service` is
 * what the surveyor judges the area takes; the suggested price is derived from
 * it and the hourly rate, never typed twice.
 */
create table public.survey_areas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  site_survey_id uuid not null references public.site_surveys(id) on delete cascade,
  position smallint not null default 1,

  name text not null check (char_length(trim(name)) between 1 and 160),
  area_sqm numeric(10, 2) check (area_sqm is null or (area_sqm > 0 and area_sqm <= 1000000)),
  floor_type text,
  services_per_week numeric(4, 2) not null default 1 check (services_per_week > 0 and services_per_week <= 21),
  minutes_per_service integer not null check (minutes_per_service > 0 and minutes_per_service <= 10000),
  hourly_rate_cents bigint check (hourly_rate_cents is null or hourly_rate_cents between 0 and 100000000),
  notes text check (notes is null or char_length(notes) <= 2000),

  created_at timestamptz not null default now()
);

create index survey_areas_survey_idx on public.survey_areas(site_survey_id, position);

-- ---------------------------------------------------------------------------
-- Angebot
-- ---------------------------------------------------------------------------
create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  lead_id uuid references public.leads(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  site_survey_id uuid references public.site_surveys(id) on delete set null,

  quote_number text,
  status public.quote_status not null default 'DRAFT',

  title text not null check (char_length(trim(title)) between 2 and 160),
  intro text check (intro is null or char_length(intro) <= 4000),

  -- Snapshots taken when the quote is sent, so a sent offer keeps showing the
  -- terms it was sent with.
  recipient_snapshot jsonb,
  company_snapshot jsonb,

  sent_at timestamptz,
  valid_until date,
  accepted_at timestamptz,
  declined_at timestamptz,
  decline_reason text,

  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  net_total_cents bigint not null default 0,
  vat_total_cents bigint not null default 0,
  gross_total_cents bigint not null default 0,
  -- Recurring portion, so the office can see the monthly value at a glance.
  recurring_net_monthly_cents bigint not null default 0,

  -- Filled by acceptance, which is what makes the pipeline traceable end to end.
  created_customer_id uuid references public.customers(id) on delete set null,
  created_object_id uuid references public.cleaning_objects(id) on delete set null,
  created_schedule_id uuid references public.service_schedules(id) on delete set null,

  created_by uuid not null references public.company_members(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint quotes_owner_check check (num_nonnulls(lead_id, customer_id) >= 1),
  constraint quotes_number_when_sent check ((status = 'DRAFT') = (quote_number is null)),
  constraint quotes_sent_at_check check ((status = 'DRAFT') = (sent_at is null)),
  constraint quotes_accept_check check ((status = 'ACCEPTED') = (accepted_at is not null)),
  constraint quotes_decline_check check ((status = 'DECLINED') = (declined_at is not null))
);

create unique index quotes_company_number_idx on public.quotes(company_id, quote_number) where quote_number is not null;
create index quotes_company_status_idx on public.quotes(company_id, status, created_at desc);

create table public.quote_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  position smallint not null default 1,

  description text not null check (char_length(trim(description)) between 1 and 500),
  quantity numeric(12, 3) not null check (quantity > 0 and quantity <= 1000000),
  unit text not null default 'Std' check (char_length(trim(unit)) between 1 and 20),
  unit_price_cents bigint not null check (unit_price_cents >= 0 and unit_price_cents <= 100000000),
  vat_rate_basis_points integer not null default 1900 check (vat_rate_basis_points between 0 and 10000),
  recurrence public.quote_line_recurrence not null default 'ONE_OFF',

  net_amount_cents bigint not null default 0,
  vat_amount_cents bigint not null default 0,
  gross_amount_cents bigint not null default 0,

  survey_area_id uuid references public.survey_areas(id) on delete set null,
  quote_status public.quote_status not null default 'DRAFT',

  created_at timestamptz not null default now()
);

create index quote_lines_quote_idx on public.quote_lines(quote_id, position);

create table public.quote_number_counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  year smallint not null,
  last_number integer not null default 0,
  primary key (company_id, year)
);

create trigger leads_set_updated_at before update on public.leads
  for each row execute procedure public.set_updated_at();
create trigger site_surveys_set_updated_at before update on public.site_surveys
  for each row execute procedure public.set_updated_at();
create trigger quotes_set_updated_at before update on public.quotes
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Deterministic amounts, mirroring the invoice rules exactly
-- ---------------------------------------------------------------------------
create or replace function public.compute_quote_line_amounts()
returns trigger language plpgsql set search_path = public as $$
begin
  new.net_amount_cents := round(new.quantity * new.unit_price_cents);
  new.vat_amount_cents := round(new.net_amount_cents::numeric * new.vat_rate_basis_points / 10000);
  new.gross_amount_cents := new.net_amount_cents + new.vat_amount_cents;
  return new;
end;
$$;

create trigger quote_lines_compute_amounts
  before insert or update on public.quote_lines
  for each row execute procedure public.compute_quote_line_amounts();

create or replace function public.refresh_quote_totals()
returns trigger language plpgsql security definer set search_path = public as $$
declare target uuid := coalesce(new.quote_id, old.quote_id);
begin
  update public.quotes q set
    net_total_cents = coalesce(t.net, 0),
    vat_total_cents = coalesce(t.vat, 0),
    gross_total_cents = coalesce(t.gross, 0),
    recurring_net_monthly_cents = coalesce(t.monthly, 0)
  from (
    select
      sum(l.net_amount_cents) as net,
      sum(l.vat_amount_cents) as vat,
      sum(l.gross_amount_cents) as gross,
      -- A weekly line is counted at the usual 4.33 weeks per month.
      sum(case l.recurrence
            when 'WEEKLY' then round(l.net_amount_cents * 13.0 / 3.0)
            when 'MONTHLY' then l.net_amount_cents
            else 0 end) as monthly
    from public.quote_lines l where l.quote_id = target
  ) t
  where q.id = target;
  return null;
end;
$$;

create trigger quote_lines_refresh_totals
  after insert or update or delete on public.quote_lines
  for each row execute procedure public.refresh_quote_totals();

create or replace function public.ensure_quote_line_integrity()
returns trigger language plpgsql security definer set search_path = public as $$
declare parent public.quotes;
begin
  select * into parent from public.quotes where id = new.quote_id;
  if parent.id is null then raise exception 'Quote not found'; end if;
  if parent.company_id <> new.company_id then raise exception 'Quote line belongs to another company'; end if;
  new.quote_status := parent.status;
  if new.survey_area_id is not null and not exists (
    select 1 from public.survey_areas a where a.id = new.survey_area_id and a.company_id = parent.company_id
  ) then raise exception 'Survey area belongs to another company'; end if;
  return new;
end;
$$;

create trigger quote_lines_integrity
  before insert or update on public.quote_lines
  for each row execute procedure public.ensure_quote_line_integrity();

create or replace function public.sync_quote_line_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    update public.quote_lines set quote_status = new.status where quote_id = new.id;
  end if;
  return null;
end;
$$;

create trigger quotes_sync_line_status
  after update on public.quotes
  for each row execute procedure public.sync_quote_line_status();

/*
 * A sent quote is a commitment to a price, so its figures and terms are frozen
 * the moment it leaves the building. Only the outcome may still change.
 */
create or replace function public.guard_sent_quote()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'DRAFT' then raise exception 'A sent quote cannot be deleted'; end if;
    return old;
  end if;
  if old.status = 'DRAFT' then return new; end if;

  if new.quote_number is distinct from old.quote_number
    or new.company_id is distinct from old.company_id
    or new.title is distinct from old.title
    or new.intro is distinct from old.intro
    or new.sent_at is distinct from old.sent_at
    or new.valid_until is distinct from old.valid_until
    or new.currency is distinct from old.currency
    or new.net_total_cents is distinct from old.net_total_cents
    or new.vat_total_cents is distinct from old.vat_total_cents
    or new.gross_total_cents is distinct from old.gross_total_cents
    or new.recipient_snapshot is distinct from old.recipient_snapshot
    or new.company_snapshot is distinct from old.company_snapshot
  then
    raise exception 'A sent quote is immutable; decline it and issue a new one instead';
  end if;

  if old.status in ('ACCEPTED', 'DECLINED') and new.status <> old.status then
    raise exception 'A decided quote cannot change its outcome';
  end if;
  return new;
end;
$$;

create trigger quotes_guard_sent
  before update or delete on public.quotes
  for each row execute procedure public.guard_sent_quote();

create or replace function public.guard_sent_quote_lines()
returns trigger language plpgsql set search_path = public as $$
declare parent_status public.quote_status;
begin
  select status into parent_status from public.quotes where id = coalesce(new.quote_id, old.quote_id);
  if tg_op = 'UPDATE' and new.quote_status is distinct from old.quote_status
    and new.net_amount_cents = old.net_amount_cents and new.description = old.description then
    return new;
  end if;
  if parent_status is not null and parent_status <> 'DRAFT' then
    raise exception 'Lines of a sent quote cannot be changed';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger quote_lines_guard_sent
  before insert or update or delete on public.quote_lines
  for each row execute procedure public.guard_sent_quote_lines();

-- ---------------------------------------------------------------------------
-- Row level security: sales is OWNER/OFFICE only.
-- ---------------------------------------------------------------------------
alter table public.leads enable row level security;
alter table public.site_surveys enable row level security;
alter table public.survey_areas enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_lines enable row level security;
alter table public.quote_number_counters enable row level security;

create policy "staff read leads" on public.leads
for select to authenticated using (public.is_company_staff(company_id));
create policy "staff read surveys" on public.site_surveys
for select to authenticated using (public.is_company_staff(company_id));
create policy "staff read survey areas" on public.survey_areas
for select to authenticated using (public.is_company_staff(company_id));
create policy "staff read quotes" on public.quotes
for select to authenticated using (public.is_company_staff(company_id));
create policy "staff read quote lines" on public.quote_lines
for select to authenticated using (public.is_company_staff(company_id));

-- No policy mentions EMPLOYEE or CUSTOMER, so neither role can read a single
-- row: a cleaner cannot see a margin and a portal customer cannot see a pipeline.
revoke all on public.leads, public.site_surveys, public.survey_areas, public.quotes, public.quote_lines, public.quote_number_counters from anon, authenticated;
grant select on public.leads, public.site_surveys, public.survey_areas, public.quotes, public.quote_lines to authenticated;

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------
create or replace function public.sales_actor()
returns public.company_members language sql stable security definer set search_path = public as $$
  select m.* from public.company_members m
  join public.profiles p on p.id = m.profile_id
  where p.auth_user_id = auth.uid() and m.role in ('OWNER', 'OFFICE') and m.status = 'ACTIVE'
  limit 1;
$$;

create or replace function public.create_lead(
  p_organisation text, p_contact_person text, p_email text, p_phone text,
  p_street text, p_postal_code text, p_city text, p_source text, p_notes text
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; new_id uuid;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;
  insert into public.leads (company_id, organisation, contact_person, email, phone, street, postal_code, city, source, notes, created_by)
  values (actor.company_id, trim(p_organisation), nullif(trim(p_contact_person), ''), nullif(trim(p_email), ''),
          nullif(trim(p_phone), ''), nullif(trim(p_street), ''), nullif(trim(p_postal_code), ''),
          nullif(trim(p_city), ''), nullif(trim(p_source), ''), nullif(trim(p_notes), ''), actor.id)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.set_lead_status(p_lead_id uuid, p_status public.lead_status, p_lost_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members; target public.leads;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;
  select * into target from public.leads where id = p_lead_id and company_id = actor.company_id for update;
  if target.id is null then raise exception 'Lead not found'; end if;
  if p_status = 'WON' then raise exception 'A lead is won by accepting its quote, not directly'; end if;
  if p_status = 'LOST' and char_length(trim(coalesce(p_lost_reason, ''))) < 3 then
    raise exception 'A reason is required when a lead is lost';
  end if;
  update public.leads set status = p_status,
    lost_reason = case when p_status = 'LOST' then trim(p_lost_reason) else null end
  where id = target.id;
end;
$$;

create or replace function public.schedule_site_survey(
  p_lead_id uuid, p_customer_id uuid, p_site_name text, p_scheduled_at timestamptz,
  p_conducted_by uuid, p_street text, p_postal_code text, p_city text, p_access_notes text
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; new_id uuid;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;
  if num_nonnulls(p_lead_id, p_customer_id) <> 1 then raise exception 'A survey belongs to exactly one lead or customer'; end if;
  -- Both candidate owners are re-checked against the actor's own company.
  if p_lead_id is not null and not exists (select 1 from public.leads where id = p_lead_id and company_id = actor.company_id) then
    raise exception 'Lead not found';
  end if;
  if p_customer_id is not null and not exists (select 1 from public.customers where id = p_customer_id and company_id = actor.company_id) then
    raise exception 'Customer not found';
  end if;
  if p_conducted_by is not null and not exists (
    select 1 from public.company_members where id = p_conducted_by and company_id = actor.company_id and status = 'ACTIVE'
  ) then raise exception 'Surveyor is not an active member of this company'; end if;

  insert into public.site_surveys (company_id, lead_id, customer_id, site_name, scheduled_at, conducted_by, street, postal_code, city, access_notes, created_by)
  values (actor.company_id, p_lead_id, p_customer_id, trim(p_site_name), p_scheduled_at, p_conducted_by,
          nullif(trim(p_street), ''), nullif(trim(p_postal_code), ''), nullif(trim(p_city), ''), nullif(trim(p_access_notes), ''), actor.id)
  returning id into new_id;

  if p_lead_id is not null then
    update public.leads set status = 'SURVEY_BOOKED' where id = p_lead_id and status in ('NEW', 'CONTACTED');
  end if;
  return new_id;
end;
$$;

create or replace function public.add_survey_area(
  p_survey_id uuid, p_name text, p_area_sqm numeric, p_floor_type text,
  p_services_per_week numeric, p_minutes_per_service integer, p_hourly_rate_cents bigint, p_notes text
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; survey public.site_surveys; next_position smallint; new_id uuid;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;
  select * into survey from public.site_surveys where id = p_survey_id and company_id = actor.company_id;
  if survey.id is null then raise exception 'Survey not found'; end if;
  if survey.status = 'CANCELLED' then raise exception 'A cancelled survey cannot be measured'; end if;
  select coalesce(max(position), 0) + 1 into next_position from public.survey_areas where site_survey_id = survey.id;
  insert into public.survey_areas (company_id, site_survey_id, position, name, area_sqm, floor_type, services_per_week, minutes_per_service, hourly_rate_cents, notes)
  values (actor.company_id, survey.id, next_position, trim(p_name), p_area_sqm, nullif(trim(p_floor_type), ''),
          coalesce(p_services_per_week, 1), p_minutes_per_service, p_hourly_rate_cents, nullif(trim(p_notes), ''))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.remove_survey_area(p_area_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;
  delete from public.survey_areas where id = p_area_id and company_id = actor.company_id;
end;
$$;

create or replace function public.complete_site_survey(p_survey_id uuid, p_findings text)
returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members; survey public.site_surveys;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;
  select * into survey from public.site_surveys where id = p_survey_id and company_id = actor.company_id for update;
  if survey.id is null then raise exception 'Survey not found'; end if;
  if survey.status <> 'PLANNED' then raise exception 'Only a planned survey can be completed'; end if;
  update public.site_surveys set status = 'COMPLETED', completed_at = now(), findings = nullif(trim(p_findings), '')
  where id = survey.id;
end;
$$;

/*
 * The Kalkulation itself: every measured area becomes a priced, recurring quote
 * line. Minutes and the hourly rate are the inputs; the amount is derived, so a
 * quote can always be traced back to what was measured on site.
 */
create or replace function public.create_quote_from_survey(p_survey_id uuid, p_title text, p_valid_days integer default 30)
returns uuid language plpgsql security definer set search_path = public as $$
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
  select * into survey from public.site_surveys where id = p_survey_id and company_id = actor.company_id;
  if survey.id is null then raise exception 'Survey not found'; end if;
  select * into company from public.companies where id = actor.company_id;

  insert into public.quotes (company_id, lead_id, customer_id, site_survey_id, title, valid_until, created_by)
  values (actor.company_id, survey.lead_id, survey.customer_id, survey.id, trim(p_title),
          current_date + greatest(least(coalesce(p_valid_days, 30), 365), 1), actor.id)
  returning id into new_quote;

  for area in select * from public.survey_areas where site_survey_id = survey.id order by position loop
    rate := coalesce(area.hourly_rate_cents, company.default_hourly_rate_cents);
    if rate is null then
      raise exception 'No hourly rate for area "%": set one on the area or as the company default', area.name;
    end if;
    hours := round(area.minutes_per_service::numeric / 60, 3);
    next_position := next_position + 1;
    insert into public.quote_lines (company_id, quote_id, position, description, quantity, unit, unit_price_cents, vat_rate_basis_points, recurrence, survey_area_id)
    values (actor.company_id, new_quote, next_position,
            area.name || coalesce(' · ' || area.area_sqm::text || ' m²', ''),
            greatest(hours, 0.001), 'Std', rate, 1900,
            case when area.services_per_week >= 1 then 'WEEKLY'::public.quote_line_recurrence else 'MONTHLY'::public.quote_line_recurrence end,
            area.id);
  end loop;

  if survey.lead_id is not null then
    update public.leads set status = 'QUOTED' where id = survey.lead_id and status <> 'WON';
  end if;
  return new_quote;
end;
$$;

create or replace function public.add_quote_line(
  p_quote_id uuid, p_description text, p_quantity numeric, p_unit text,
  p_unit_price_cents bigint, p_vat_rate_basis_points integer, p_recurrence public.quote_line_recurrence
) returns uuid language plpgsql security definer set search_path = public as $$
declare actor public.company_members; quote public.quotes; next_position smallint; new_id uuid;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;
  select * into quote from public.quotes where id = p_quote_id and company_id = actor.company_id for update;
  if quote.id is null then raise exception 'Quote not found'; end if;
  if quote.status <> 'DRAFT' then raise exception 'Only a draft quote can be edited'; end if;
  select coalesce(max(position), 0) + 1 into next_position from public.quote_lines where quote_id = quote.id;
  insert into public.quote_lines (company_id, quote_id, position, description, quantity, unit, unit_price_cents, vat_rate_basis_points, recurrence)
  values (actor.company_id, quote.id, next_position, trim(p_description), p_quantity,
          coalesce(nullif(trim(p_unit), ''), 'Std'), p_unit_price_cents, coalesce(p_vat_rate_basis_points, 1900),
          coalesce(p_recurrence, 'ONE_OFF'))
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.remove_quote_line(p_line_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members; parent_status public.quote_status;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;
  select q.status into parent_status from public.quote_lines l join public.quotes q on q.id = l.quote_id
  where l.id = p_line_id and l.company_id = actor.company_id;
  if parent_status is null then raise exception 'Quote line not found'; end if;
  if parent_status <> 'DRAFT' then raise exception 'Only a draft quote can be edited'; end if;
  delete from public.quote_lines where id = p_line_id and company_id = actor.company_id;
end;
$$;

create or replace function public.send_quote(p_quote_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  actor public.company_members; quote public.quotes; company public.companies;
  lead_row public.leads; customer_row public.customers;
  send_year smallint := extract(year from current_date)::smallint;
  next_number integer; formatted text;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;
  select * into quote from public.quotes where id = p_quote_id and company_id = actor.company_id for update;
  if quote.id is null then raise exception 'Quote not found'; end if;
  if quote.status <> 'DRAFT' then raise exception 'Only a draft quote can be sent'; end if;
  if not exists (select 1 from public.quote_lines where quote_id = quote.id) then
    raise exception 'A quote needs at least one line';
  end if;

  select * into company from public.companies where id = actor.company_id;
  if quote.lead_id is not null then select * into lead_row from public.leads where id = quote.lead_id; end if;
  if quote.customer_id is not null then select * into customer_row from public.customers where id = quote.customer_id; end if;

  insert into public.quote_number_counters (company_id, year, last_number)
  values (actor.company_id, send_year, 0) on conflict (company_id, year) do nothing;
  select last_number + 1 into next_number from public.quote_number_counters
  where company_id = actor.company_id and year = send_year for update;
  update public.quote_number_counters set last_number = next_number
  where company_id = actor.company_id and year = send_year;
  formatted := format('AN-%s-%s', send_year, lpad(next_number::text, 4, '0'));

  update public.quotes set
    status = 'SENT', quote_number = formatted, sent_at = now(),
    recipient_snapshot = jsonb_build_object(
      'name', coalesce(customer_row.name, lead_row.organisation),
      'contact_person', coalesce(customer_row.contact_person, lead_row.contact_person),
      'email', coalesce(customer_row.email, lead_row.email),
      'street', coalesce(customer_row.billing_address, lead_row.street),
      'postal_code', coalesce(customer_row.postal_code, lead_row.postal_code),
      'city', coalesce(customer_row.city, lead_row.city)
    ),
    company_snapshot = jsonb_build_object(
      'name', company.name, 'legal_form', company.legal_form, 'street', company.street,
      'postal_code', company.postal_code, 'city', company.city, 'country', company.country,
      'phone', company.phone, 'email', company.email, 'website', company.website,
      'tax_number', company.tax_number, 'vat_id', company.vat_id
    )
  where id = quote.id;
  return formatted;
end;
$$;

create or replace function public.decline_quote(p_quote_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare actor public.company_members; quote public.quotes;
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'A reason is required'; end if;
  select * into quote from public.quotes where id = p_quote_id and company_id = actor.company_id for update;
  if quote.id is null then raise exception 'Quote not found'; end if;
  if quote.status <> 'SENT' then raise exception 'Only a sent quote can be declined'; end if;
  update public.quotes set status = 'DECLINED', declined_at = now(), decline_reason = trim(p_reason) where id = quote.id;
  if quote.lead_id is not null then
    update public.leads set status = 'LOST', lost_reason = trim(p_reason) where id = quote.lead_id and status <> 'WON';
  end if;
end;
$$;

/*
 * Acceptance is the hinge of the whole workflow. In one transaction it turns a
 * sent quote into the operational records the rest of the product already runs
 * on: a customer, a cleaning object and — when the quote has recurring lines —
 * a weekly service schedule with its rules. Nothing here is a new parallel
 * concept; it writes the existing tables.
 */
create or replace function public.accept_quote(
  p_quote_id uuid,
  p_weekdays smallint[] default null,
  p_start_time time default '08:00',
  p_end_time time default '10:00'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  actor public.company_members;
  quote public.quotes;
  survey public.site_surveys;
  lead_row public.leads;
  target_customer uuid;
  new_object uuid;
  new_schedule uuid;
  recurring_lines integer;
  weekday smallint;
  days smallint[] := coalesce(p_weekdays, array[1]::smallint[]);
begin
  select * into actor from public.sales_actor();
  if actor.id is null then raise exception 'Sales requires OWNER or OFFICE'; end if;
  select * into quote from public.quotes where id = p_quote_id and company_id = actor.company_id for update;
  if quote.id is null then raise exception 'Quote not found'; end if;
  if quote.status <> 'SENT' then raise exception 'Only a sent quote can be accepted'; end if;
  if p_end_time <= p_start_time then raise exception 'Invalid service window'; end if;
  if array_length(days, 1) is null then raise exception 'At least one weekday is required'; end if;
  foreach weekday in array days loop
    if weekday < 1 or weekday > 7 then raise exception 'Invalid weekday'; end if;
  end loop;

  if quote.site_survey_id is not null then
    select * into survey from public.site_surveys where id = quote.site_survey_id;
  end if;

  -- 1. The customer: an existing one, or created from the lead.
  if quote.customer_id is not null then
    target_customer := quote.customer_id;
  else
    select * into lead_row from public.leads where id = quote.lead_id for update;
    if lead_row.id is null then raise exception 'Quote has neither a customer nor a lead'; end if;
    if lead_row.converted_customer_id is not null then
      target_customer := lead_row.converted_customer_id;
    else
      insert into public.customers (company_id, name, contact_person, email, phone, billing_address, postal_code, city)
      values (actor.company_id, lead_row.organisation, lead_row.contact_person, lead_row.email, lead_row.phone,
              lead_row.street, lead_row.postal_code, lead_row.city)
      returning id into target_customer;
    end if;
    update public.leads set status = 'WON', converted_customer_id = target_customer, lost_reason = null
    where id = lead_row.id;
  end if;

  -- 2. The site, from the survey when there is one.
  insert into public.cleaning_objects (company_id, customer_id, name, street, postal_code, city, access_instructions)
  values (actor.company_id, target_customer,
          coalesce(survey.site_name, quote.title),
          survey.street, survey.postal_code, survey.city, survey.access_notes)
  returning id into new_object;

  -- 3. The recurring plan, only when the quote actually contains recurring work.
  select count(*) into recurring_lines from public.quote_lines
  where quote_id = quote.id and recurrence <> 'ONE_OFF';

  if recurring_lines > 0 then
    insert into public.service_schedules (company_id, customer_id, cleaning_object_id, name, valid_from, is_active, billing_description, billing_unit_price_cents, billing_vat_rate_basis_points)
    select actor.company_id, target_customer, new_object, quote.title, current_date, true,
           quote.title,
           -- The agreed rate carried into billing, so the first invoice does not
           -- have to re-derive what was sold.
           (select l.unit_price_cents from public.quote_lines l where l.quote_id = quote.id and l.recurrence <> 'ONE_OFF' order by l.position limit 1),
           (select l.vat_rate_basis_points from public.quote_lines l where l.quote_id = quote.id and l.recurrence <> 'ONE_OFF' order by l.position limit 1)
    returning id into new_schedule;

    foreach weekday in array days loop
      insert into public.schedule_rules (service_schedule_id, weekday, planned_start_time, planned_end_time, is_active)
      values (new_schedule, weekday, p_start_time, p_end_time, true);
    end loop;
  end if;

  update public.quotes set
    status = 'ACCEPTED', accepted_at = now(),
    created_customer_id = target_customer, created_object_id = new_object, created_schedule_id = new_schedule
  where id = quote.id;

  return target_customer;
end;
$$;

-- Reporting helpers the dashboard uses.
create or replace function public.list_sales_pipeline()
returns table (status public.lead_status, lead_count bigint, quoted_gross_cents bigint)
language sql stable security definer set search_path = public as $$
  select l.status, count(*)::bigint,
         coalesce(sum((select max(q.gross_total_cents) from public.quotes q where q.lead_id = l.id and q.status in ('SENT', 'ACCEPTED'))), 0)::bigint
  from public.sales_actor() a
  join public.leads l on l.company_id = a.company_id
  group by l.status;
$$;

revoke all on function
  public.sales_actor(), public.create_lead(text, text, text, text, text, text, text, text, text),
  public.set_lead_status(uuid, public.lead_status, text),
  public.schedule_site_survey(uuid, uuid, text, timestamptz, uuid, text, text, text, text),
  public.add_survey_area(uuid, text, numeric, text, numeric, integer, bigint, text),
  public.remove_survey_area(uuid), public.complete_site_survey(uuid, text),
  public.create_quote_from_survey(uuid, text, integer),
  public.add_quote_line(uuid, text, numeric, text, bigint, integer, public.quote_line_recurrence),
  public.remove_quote_line(uuid), public.send_quote(uuid), public.decline_quote(uuid, text),
  public.accept_quote(uuid, smallint[], time, time), public.list_sales_pipeline(),
  public.compute_quote_line_amounts(), public.refresh_quote_totals(), public.ensure_quote_line_integrity(),
  public.sync_quote_line_status(), public.guard_sent_quote(), public.guard_sent_quote_lines()
from public, anon;

grant execute on function
  public.create_lead(text, text, text, text, text, text, text, text, text),
  public.set_lead_status(uuid, public.lead_status, text),
  public.schedule_site_survey(uuid, uuid, text, timestamptz, uuid, text, text, text, text),
  public.add_survey_area(uuid, text, numeric, text, numeric, integer, bigint, text),
  public.remove_survey_area(uuid), public.complete_site_survey(uuid, text),
  public.create_quote_from_survey(uuid, text, integer),
  public.add_quote_line(uuid, text, numeric, text, bigint, integer, public.quote_line_recurrence),
  public.remove_quote_line(uuid), public.send_quote(uuid), public.decline_quote(uuid, text),
  public.accept_quote(uuid, smallint[], time, time), public.list_sales_pipeline()
to authenticated;

-- The hourly rate is owner-only master data. `companies` grants UPDATE on name
-- and slug only, so this goes through a security-definer function like every
-- other company field rather than by widening the column grant.
create or replace function public.set_company_default_hourly_rate(p_cents bigint)
returns void language plpgsql security definer set search_path = public as $$
declare owned_company uuid;
begin
  select m.company_id into owned_company from public.company_members m
  join public.profiles p on p.id = m.profile_id
  where p.auth_user_id = auth.uid() and m.role = 'OWNER' and m.status = 'ACTIVE' limit 1;
  if owned_company is null then raise exception 'Owner role required'; end if;
  if p_cents is not null and (p_cents < 0 or p_cents > 100000000) then raise exception 'Invalid hourly rate'; end if;
  update public.companies set default_hourly_rate_cents = p_cents where id = owned_company;
end;
$$;

revoke all on function public.set_company_default_hourly_rate(bigint) from public, anon;
grant execute on function public.set_company_default_hourly_rate(bigint) to authenticated;
