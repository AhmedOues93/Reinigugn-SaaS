-- Plattform-Konsole und Zugangssperre nach dem Testzeitraum.
--
-- Bisher gab es drei Ebenen: Buero (OWNER/OFFICE), Team (EMPLOYEE) und
-- Kundenportal (CUSTOMER). Es fehlte die Ebene des Betreibers von ReinPlan
-- selbst: wer sieht alle Betriebe, verlaengert einen Test, schenkt einem
-- Pilotkunden Zugang oder sperrt einen Betrieb, der nicht zahlt?
--
-- Diese Migration legt dafuer an:
--   * platform_admins          -- wer Betreiber ist (nur per SQL zu pflegen)
--   * platform_settings        -- ein Schalter: wird der Zugang erzwungen?
--   * platform_admin_actions   -- unveraenderliches Protokoll jeder Aenderung
--   * company_has_access()     -- die eine Regel, ob ein Betrieb arbeiten darf
--   * platform_*()             -- Funktionen der Konsole, nur fuer Betreiber
--   * restriktive Schreibregeln auf den Betriebstabellen
--
-- Die Sperre ist zunaechst AUS (enforce_access = false). Bestehende
-- Pilotbetriebe verlieren also durch das Einspielen nichts. Eingeschaltet wird
-- sie bewusst in der Konsole, nachdem Piloten freien Zugang erhalten haben und
-- die Online-Zahlung funktioniert. Eine Sperre einzelner Betriebe
-- (suspended_at) wirkt dagegen immer.

-- ---------------------------------------------------------------------------
-- Neue Felder am Abo
-- ---------------------------------------------------------------------------
alter table public.company_subscriptions
  add column if not exists comp_access_until timestamptz,
  add column if not exists comp_access_note text,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text;

-- ---------------------------------------------------------------------------
-- Betreiber
-- ---------------------------------------------------------------------------
create table if not exists public.platform_admins (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from public, anon, authenticated;

create table if not exists public.platform_settings (
  id boolean primary key default true check (id),
  enforce_access boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (id) values (true) on conflict (id) do nothing;
alter table public.platform_settings enable row level security;
revoke all on public.platform_settings from public, anon, authenticated;

create table if not exists public.platform_admin_actions (
  id uuid primary key default gen_random_uuid(),
  actor_auth_user_id uuid,
  actor_email text,
  company_id uuid references public.companies(id) on delete set null,
  company_name text,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists platform_admin_actions_time_idx
  on public.platform_admin_actions (occurred_at desc);
alter table public.platform_admin_actions enable row level security;
revoke all on public.platform_admin_actions from public, anon, authenticated;

create or replace function public.platform_admin_actions_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Das Plattform-Protokoll ist unveraenderlich.';
end $$;
create or replace trigger platform_admin_actions_no_update
  before update or delete on public.platform_admin_actions
  for each row execute function public.platform_admin_actions_immutable();
revoke all on function public.platform_admin_actions_immutable() from public, anon, authenticated;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null
    and exists (select 1 from public.platform_admins where auth_user_id = auth.uid());
$$;
revoke all on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Die eine Zugangsregel
-- ---------------------------------------------------------------------------
-- Gesperrt          -> nie.
-- Sperre aus        -> immer (Pilotbetrieb wie bisher).
-- Sonst Zugang bei: freiem Zugang, laufendem Testzeitraum, aktivem Abo oder
-- PAST_DUE (Stripe versucht die Zahlung noch; der Betrieb soll nicht mitten in
-- der Woche stehen bleiben, nur weil eine Karte abgelaufen ist).
create or replace function public.company_has_access(target_company_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((
    select case
      when s.suspended_at is not null then false
      when not coalesce((select enforce_access from public.platform_settings where id), false) then true
      when s.comp_access_until is not null and s.comp_access_until > now() then true
      when s.trial_ends_at > now() then true
      when s.status in ('ACTIVE', 'PAST_DUE') then true
      else false
    end
    from public.company_subscriptions s
    where s.company_id = target_company_id
  ), true);
$$;
revoke all on function public.company_has_access(uuid) from public, anon;
grant execute on function public.company_has_access(uuid) to authenticated, service_role;

-- Warum kein Zugang? Fuer die Hinweisseite; nur fuer Mitglieder des Betriebs.
create or replace function public.get_my_company_access(target_company_id uuid)
returns table (has_access boolean, reason text)
language plpgsql stable security definer set search_path = public
as $$
declare s public.company_subscriptions;
begin
  if not public.is_company_member(target_company_id) then
    raise exception 'Kein Zugriff auf diesen Betrieb.';
  end if;
  select * into s from public.company_subscriptions where company_id = target_company_id;
  has_access := public.company_has_access(target_company_id);
  reason := case
    when has_access then 'OK'
    when s.suspended_at is not null then 'SUSPENDED'
    when s.status in ('CANCELED', 'UNPAID', 'PAUSED') then 'SUBSCRIPTION_ENDED'
    else 'TRIAL_ENDED'
  end;
  return next;
end $$;
revoke all on function public.get_my_company_access(uuid) from public, anon;
grant execute on function public.get_my_company_access(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Funktionen der Konsole
-- ---------------------------------------------------------------------------
create or replace function public.platform_require_admin()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Nur fuer Plattform-Betreiber.' using errcode = '42501';
  end if;
end $$;
revoke all on function public.platform_require_admin() from public, anon, authenticated;

create or replace function public.platform_log(p_company_id uuid, p_action text, p_detail jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.platform_admin_actions (actor_auth_user_id, actor_email, company_id, company_name, action, detail)
  values (
    auth.uid(),
    (select email from auth.users where id = auth.uid()),
    p_company_id,
    (select name from public.companies where id = p_company_id),
    p_action,
    coalesce(p_detail, '{}'::jsonb)
  );
end $$;
revoke all on function public.platform_log(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.platform_list_companies()
returns table (
  company_id uuid,
  name text,
  created_at timestamptz,
  owner_email text,
  plan public.reinplan_subscription_plan,
  status public.reinplan_subscription_status,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean,
  stripe_customer_id text,
  comp_access_until timestamptz,
  comp_access_note text,
  suspended_at timestamptz,
  suspended_reason text,
  employee_count integer,
  office_count integer,
  customer_count integer,
  has_access boolean,
  would_have_access boolean
)
language plpgsql stable security definer set search_path = public
as $$
begin
  perform public.platform_require_admin();
  return query
  select
    c.id,
    c.name::text,
    c.created_at,
    (select u.email::text
       from public.company_members m
       join public.profiles p on p.id = m.profile_id
       join auth.users u on u.id = p.auth_user_id
      where m.company_id = c.id and m.role = 'OWNER' and m.status = 'ACTIVE'
      order by m.created_at
      limit 1),
    s.plan,
    s.status,
    s.trial_ends_at,
    s.current_period_ends_at,
    coalesce(s.cancel_at_period_end, false),
    s.stripe_customer_id,
    s.comp_access_until,
    s.comp_access_note,
    s.suspended_at,
    s.suspended_reason,
    (select count(*)::int from public.company_members m
      where m.company_id = c.id and m.role = 'EMPLOYEE' and m.status in ('ACTIVE', 'INVITED')),
    (select count(*)::int from public.company_members m
      where m.company_id = c.id and m.role in ('OWNER', 'OFFICE') and m.status = 'ACTIVE'),
    (select count(*)::int from public.customers k where k.company_id = c.id),
    public.company_has_access(c.id),
    -- Was gaelte, wenn die Sperre eingeschaltet waere: zeigt vor dem
    -- Einschalten, wen es treffen wuerde.
    case
      when s.company_id is null then true
      when s.suspended_at is not null then false
      when s.comp_access_until is not null and s.comp_access_until > now() then true
      when s.trial_ends_at > now() then true
      when s.status in ('ACTIVE', 'PAST_DUE') then true
      else false
    end
  from public.companies c
  left join public.company_subscriptions s on s.company_id = c.id
  order by c.created_at desc;
end $$;
revoke all on function public.platform_list_companies() from public, anon;
grant execute on function public.platform_list_companies() to authenticated;

create or replace function public.platform_get_settings()
returns table (enforce_access boolean, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.platform_require_admin();
  return query select ps.enforce_access, ps.updated_at from public.platform_settings ps where ps.id;
end $$;
revoke all on function public.platform_get_settings() from public, anon;
grant execute on function public.platform_get_settings() to authenticated;

create or replace function public.platform_set_enforce_access(p_enforce boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.platform_require_admin();
  if p_enforce is null then raise exception 'Bitte an oder aus waehlen.'; end if;
  update public.platform_settings set enforce_access = p_enforce, updated_at = now() where id;
  perform public.platform_log(null, case when p_enforce then 'ENFORCEMENT_ON' else 'ENFORCEMENT_OFF' end, '{}'::jsonb);
end $$;
revoke all on function public.platform_set_enforce_access(boolean) from public, anon;
grant execute on function public.platform_set_enforce_access(boolean) to authenticated;

create or replace function public.platform_set_trial_end(p_company_id uuid, p_trial_ends_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare s public.company_subscriptions;
begin
  perform public.platform_require_admin();
  select * into s from public.company_subscriptions where company_id = p_company_id for update;
  if not found then raise exception 'Betrieb nicht gefunden.'; end if;
  if p_trial_ends_at is null or p_trial_ends_at <= s.trial_started_at then
    raise exception 'Das Testende muss nach dem Teststart liegen.';
  end if;
  if p_trial_ends_at > now() + interval '2 years' then
    raise exception 'Fuer laengere Zeitraeume bitte freien Zugang vergeben.';
  end if;
  update public.company_subscriptions set trial_ends_at = p_trial_ends_at where company_id = p_company_id;
  perform public.platform_log(p_company_id, 'TRIAL_END_SET',
    jsonb_build_object('from', s.trial_ends_at, 'to', p_trial_ends_at));
end $$;
revoke all on function public.platform_set_trial_end(uuid, timestamptz) from public, anon;
grant execute on function public.platform_set_trial_end(uuid, timestamptz) to authenticated;

create or replace function public.platform_set_comp_access(p_company_id uuid, p_until timestamptz, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.company_subscriptions;
begin
  perform public.platform_require_admin();
  select * into s from public.company_subscriptions where company_id = p_company_id for update;
  if not found then raise exception 'Betrieb nicht gefunden.'; end if;
  if p_until is not null and p_until <= now() then
    raise exception 'Der freie Zugang muss in der Zukunft enden.';
  end if;
  update public.company_subscriptions
     set comp_access_until = p_until,
         comp_access_note = case when p_until is null then null else nullif(btrim(p_note), '') end
   where company_id = p_company_id;
  perform public.platform_log(p_company_id,
    case when p_until is null then 'COMP_ACCESS_REVOKED' else 'COMP_ACCESS_GRANTED' end,
    jsonb_build_object('from', s.comp_access_until, 'to', p_until, 'note', nullif(btrim(p_note), '')));
end $$;
revoke all on function public.platform_set_comp_access(uuid, timestamptz, text) from public, anon;
grant execute on function public.platform_set_comp_access(uuid, timestamptz, text) to authenticated;

create or replace function public.platform_set_suspended(p_company_id uuid, p_suspended boolean, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.platform_require_admin();
  if p_suspended is null then raise exception 'Bitte sperren oder freigeben waehlen.'; end if;
  if p_suspended and nullif(btrim(p_reason), '') is null then
    raise exception 'Bitte einen Grund fuer die Sperre angeben.';
  end if;
  update public.company_subscriptions
     set suspended_at = case when p_suspended then coalesce(suspended_at, now()) else null end,
         suspended_reason = case when p_suspended then btrim(p_reason) else null end
   where company_id = p_company_id;
  if not found then raise exception 'Betrieb nicht gefunden.'; end if;
  perform public.platform_log(p_company_id,
    case when p_suspended then 'SUSPENDED' else 'UNSUSPENDED' end,
    jsonb_build_object('reason', nullif(btrim(p_reason), '')));
end $$;
revoke all on function public.platform_set_suspended(uuid, boolean, text) from public, anon;
grant execute on function public.platform_set_suspended(uuid, boolean, text) to authenticated;

create or replace function public.platform_list_actions(p_limit integer default 30)
returns table (
  occurred_at timestamptz,
  actor_email text,
  company_name text,
  action text,
  detail jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.platform_require_admin();
  return query
  select a.occurred_at, a.actor_email, a.company_name, a.action, a.detail
    from public.platform_admin_actions a
   order by a.occurred_at desc
   limit least(greatest(coalesce(p_limit, 30), 1), 200);
end $$;
revoke all on function public.platform_list_actions(integer) from public, anon;
grant execute on function public.platform_list_actions(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Datenbankseitige Sperre: ohne Zugang nur noch lesen
-- ---------------------------------------------------------------------------
-- Restriktive Regeln werden mit den bestehenden (permissiven) Regeln UND-
-- verknuepft. Solange ein Betrieb Zugang hat, aendert sich also nichts. Ohne
-- Zugang bleiben Lesen und Export moeglich, Schreiben nicht -- auch nicht an
-- der App vorbei direkt gegen die API.
--
-- Ausgenommen sind Tabellen, die Anmeldung, Einladung, Abo und Protokolle
-- tragen, sowie Zaehler und Benachrichtigungen, die von Triggern geschrieben
-- werden. Security-definer-Funktionen umgehen RLS; die App-seitige Sperre
-- (lib/access.ts) deckt diese Wege ab.
--
-- Neue Betriebstabellen bekommen diese Regel NICHT automatisch.
do $$
declare t record;
begin
  perform set_config('client_min_messages', 'warning', true);
  for t in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and not a.attisdropped
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relrowsecurity
       and c.relname not in (
         'company_subscriptions',
         'company_members',
         'company_invitations',
         'audit_events',
         'in_app_notifications',
         'company_number_counters',
         'invoice_number_counters',
         'quote_number_counters',
         'time_entry_audit_logs',
         'job_assignment_changes',
         'service_record_events',
         'platform_admin_actions'
       )
  loop
    execute format('drop policy if exists access_required_insert on public.%I', t.relname);
    execute format('drop policy if exists access_required_update on public.%I', t.relname);
    execute format('drop policy if exists access_required_delete on public.%I', t.relname);
    execute format(
      'create policy access_required_insert on public.%I as restrictive for insert to authenticated with check (public.company_has_access(company_id))',
      t.relname);
    execute format(
      'create policy access_required_update on public.%I as restrictive for update to authenticated using (public.company_has_access(company_id)) with check (public.company_has_access(company_id))',
      t.relname);
    execute format(
      'create policy access_required_delete on public.%I as restrictive for delete to authenticated using (public.company_has_access(company_id))',
      t.relname);
  end loop;
end $$;
