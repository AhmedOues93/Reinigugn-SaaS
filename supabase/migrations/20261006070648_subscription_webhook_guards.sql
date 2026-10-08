-- Privileged billing writes are atomic and never available to browser roles.
alter table public.company_subscriptions
  add column if not exists stripe_event_created bigint not null default 0,
  add column if not exists checkout_key uuid,
  add column if not exists checkout_plan public.reinplan_subscription_plan,
  add column if not exists checkout_expires_at timestamptz;
grant select, insert, update on public.company_subscriptions to service_role;
grant select, insert on public.stripe_webhook_events to service_role;

create or replace function public.reserve_reinplan_checkout(p_company_id uuid, p_plan public.reinplan_subscription_plan)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare s public.company_subscriptions; slots integer; cap integer;
begin
  select * into strict s from public.company_subscriptions where company_id=p_company_id for update;
  if s.stripe_subscription_id is not null and s.status <> 'CANCELED' then
    raise exception 'Bitte verwalten Sie Ihr bestehendes Abo im Zahlungsportal.';
  end if;
  if s.checkout_expires_at > now() then
    if s.checkout_plan <> p_plan then
      raise exception 'Ein Checkout für einen anderen Tarif ist bereits offen. Bitte schließen Sie ihn ab oder warten Sie 60 Minuten.';
    end if;
  else
    s.checkout_key := gen_random_uuid();
    s.checkout_plan := p_plan;
    s.checkout_expires_at := date_trunc('second',now()) + interval '60 minutes';
    update public.company_subscriptions set checkout_key=s.checkout_key,checkout_plan=s.checkout_plan,checkout_expires_at=s.checkout_expires_at where company_id=p_company_id;
  end if;
  cap := case p_plan when 'START' then 5 when 'BETRIEB' then 25 else 75 end;
  select count(*) into slots from public.company_members where company_id=p_company_id and role='EMPLOYEE' and status in ('ACTIVE','INVITED');
  if slots>cap then raise exception 'Zu viele aktive oder eingeladene Mitarbeitende für diesen Tarif.'; end if;
  return jsonb_build_object('key',s.checkout_key,'expires_at',extract(epoch from s.checkout_expires_at)::bigint);
end $$;
revoke all on function public.reserve_reinplan_checkout(uuid,public.reinplan_subscription_plan) from public,anon,authenticated;
grant execute on function public.reserve_reinplan_checkout(uuid,public.reinplan_subscription_plan) to service_role;

create or replace function public.record_reinplan_subscription_event(
 p_event_id text,p_event_type text,p_created bigint,p_company_id uuid,
 p_subscription_id text,p_customer_id text,p_price_id text,
 p_plan public.reinplan_subscription_plan,p_status public.reinplan_subscription_status,
 p_cancel boolean,p_period_end timestamptz)
returns boolean language plpgsql security invoker set search_path=public as $$
declare s public.company_subscriptions;
begin
 select * into strict s from public.company_subscriptions where company_id=p_company_id for update;
 insert into public.stripe_webhook_events(event_id,event_type) values(p_event_id,p_event_type) on conflict do nothing;
 if not found then return false; end if;
 if p_created<s.stripe_event_created then return false; end if;
 -- A delayed event for a former subscription cannot overwrite its replacement.
 if s.stripe_subscription_id is not null and s.stripe_subscription_id<>p_subscription_id and s.status<>'CANCELED' then
   raise exception 'Subscription conflict';
 end if;
 if s.stripe_customer_id is not null and s.stripe_customer_id<>p_customer_id then raise exception 'Customer conflict'; end if;
 update public.company_subscriptions set plan=p_plan,status=p_status,
 stripe_subscription_id=p_subscription_id,stripe_customer_id=p_customer_id,stripe_price_id=p_price_id,
 cancel_at_period_end=p_cancel,current_period_ends_at=p_period_end,stripe_event_created=p_created
 where company_id=p_company_id;
 return true;
end $$;
revoke all on function public.record_reinplan_subscription_event(text,text,bigint,uuid,text,text,text,public.reinplan_subscription_plan,public.reinplan_subscription_status,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.record_reinplan_subscription_event(text,text,bigint,uuid,text,text,text,public.reinplan_subscription_plan,public.reinplan_subscription_status,boolean,timestamptz) to service_role;

-- Serialize employee reservations, including moves between companies.
create or replace function public.enforce_reinplan_employee_limit()
returns trigger language plpgsql security definer set search_path=public as $$
declare selected_plan public.reinplan_subscription_plan; employee_limit integer; used_slots integer;
begin
 if new.role<>'EMPLOYEE' or new.status not in ('ACTIVE','INVITED') then return new; end if;
 if tg_op='UPDATE' and old.company_id=new.company_id and old.role='EMPLOYEE' and old.status in ('ACTIVE','INVITED') then return new; end if;
 select case when checkout_expires_at>now() then checkout_plan else plan end into selected_plan from public.company_subscriptions where company_id=new.company_id for update;
 employee_limit:=case coalesce(selected_plan,'UNTERNEHMEN') when 'START' then 5 when 'BETRIEB' then 25 else 75 end;
 select count(*) into used_slots from public.company_members where company_id=new.company_id and role='EMPLOYEE' and status in ('ACTIVE','INVITED');
 if used_slots>=employee_limit then raise exception 'Employee limit reached for the selected ReinPlan plan'; end if;
 return new;
end $$;
drop trigger if exists company_members_reinplan_employee_limit on public.company_members;
create trigger company_members_reinplan_employee_limit before insert or update of role,status,company_id on public.company_members for each row execute function public.enforce_reinplan_employee_limit();
revoke all on function public.enforce_reinplan_employee_limit() from public,anon,authenticated;
