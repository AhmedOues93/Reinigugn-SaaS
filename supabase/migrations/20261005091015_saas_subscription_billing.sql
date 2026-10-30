-- ReinPlan SaaS subscriptions
--
-- The operational invoices in this schema are invoices *our customers* send to
-- their customers. This table is deliberately separate: it is the licence the
-- cleaning company pays ReinPlan for. A browser can read its own company's
-- state, but Stripe/webhook writes never trust a browser request.

do $$
begin
  create type public.reinplan_subscription_plan as enum ('START', 'BETRIEB', 'UNTERNEHMEN');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.reinplan_subscription_status as enum (
    'TRIALING',
    'ACTIVE',
    'PAST_DUE',
    'PAUSED',
    'CANCELED',
    'UNPAID'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null unique references public.companies(id) on delete cascade,
  plan public.reinplan_subscription_plan,
  status public.reinplan_subscription_status not null default 'TRIALING',
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default (now() + interval '30 days'),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  cancel_at_period_end boolean not null default false,
  current_period_ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trial_ends_at > trial_started_at)
);

create index if not exists company_subscriptions_status_idx
  on public.company_subscriptions(status, trial_ends_at);

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  received_at timestamptz not null default now()
);

create or replace function public.touch_company_subscription()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists company_subscriptions_touch_updated_at on public.company_subscriptions;
create trigger company_subscriptions_touch_updated_at
  before update on public.company_subscriptions
  for each row execute procedure public.touch_company_subscription();

create or replace function public.create_company_subscription_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.company_subscriptions (company_id)
  values (new.id)
  on conflict (company_id) do nothing;
  return new;
end;
$$;

drop trigger if exists companies_create_subscription_trial on public.companies;
create trigger companies_create_subscription_trial
  after insert on public.companies
  for each row execute procedure public.create_company_subscription_trial();

revoke all on function public.touch_company_subscription() from public, anon, authenticated;
revoke all on function public.create_company_subscription_trial() from public, anon, authenticated;

insert into public.company_subscriptions (company_id)
select id from public.companies
on conflict (company_id) do nothing;

alter table public.company_subscriptions enable row level security;
alter table public.stripe_webhook_events enable row level security;

drop policy if exists "company members can read subscription" on public.company_subscriptions;
create policy "company members can read subscription"
  on public.company_subscriptions
  for select
  to authenticated
  using (public.is_company_member(company_id));

revoke all on public.company_subscriptions, public.stripe_webhook_events from anon, authenticated;
grant select on public.company_subscriptions to authenticated;

create or replace function public.enforce_reinplan_employee_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_plan public.reinplan_subscription_plan;
  employee_limit integer;
  used_slots integer;
begin
  if new.role <> 'EMPLOYEE' or new.status not in ('ACTIVE', 'INVITED') then
    return new;
  end if;

  if tg_op = 'UPDATE'
    and old.role = 'EMPLOYEE'
    and old.status in ('ACTIVE', 'INVITED') then
    return new;
  end if;

  select plan into selected_plan
  from public.company_subscriptions
  where company_id = new.company_id;

  employee_limit := case coalesce(selected_plan, 'UNTERNEHMEN'::public.reinplan_subscription_plan)
    when 'START' then 5
    when 'BETRIEB' then 25
    when 'UNTERNEHMEN' then 75
  end;

  select count(*) into used_slots
  from public.company_members
  where company_id = new.company_id
    and role = 'EMPLOYEE'
    and status in ('ACTIVE', 'INVITED');

  if used_slots >= employee_limit then
    raise exception 'Employee limit reached for the selected ReinPlan plan';
  end if;
  return new;
end;
$$;

drop trigger if exists company_members_reinplan_employee_limit on public.company_members;
create trigger company_members_reinplan_employee_limit
  before insert or update of role, status on public.company_members
  for each row execute procedure public.enforce_reinplan_employee_limit();

revoke all on function public.enforce_reinplan_employee_limit() from public, anon, authenticated;

