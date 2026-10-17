-- Zwei Dinge, die vor zahlenden Kunden fehlen: eine Bremse an der Anmeldung
-- und die Moeglichkeit, Zwei-Faktor fuer das Buero zu verlangen.
--
-- Ein Konto hier haelt Lohn- und Steuerdaten. Ein Passwort allein ist dafuer
-- zu wenig, und ein Anmeldeformular ohne Bremse laedt dazu ein, Passwoerter
-- durchzuprobieren.

-- ---------------------------------------------------------------------------
-- 1. Die Bremse
-- ---------------------------------------------------------------------------
--
-- Geschluesselt wird auf die aufrufende IP, nicht auf die E-Mail-Adresse. Das
-- ist der entscheidende Unterschied: eine Bremse pro E-Mail laesst sich
-- missbrauchen, um jemanden gezielt auszusperren -- man muss nur oft genug ein
-- falsches Passwort fuer seine Adresse schicken. Wer die IP-Bremse ausloest,
-- sperrt dagegen nur sich selbst aus.
--
-- Die Zeilen leben nur so lange wie ihr Zeitfenster. Eine IP ist ein
-- personenbezogenes Datum; sie hier Monate aufzubewahren waere nicht
-- verhaeltnismaessig, fuer ein paar Minuten Missbrauchsabwehr schon.

create table if not exists public.auth_throttle (
  scope text not null check (char_length(scope) between 1 and 40),
  bucket text not null check (char_length(bucket) between 1 and 100),
  window_start timestamptz not null default now(),
  attempts integer not null default 0,
  primary key (scope, bucket)
);

comment on table public.auth_throttle is
  'Kurzlebige Zaehler fuer die Anmeldebremse. Zeilen werden nach Ablauf ihres Fensters entfernt.';

alter table public.auth_throttle enable row level security;
-- Keine Richtlinie: gelesen und geschrieben wird ausschliesslich ueber die
-- Funktion unten, und die laeuft als security definer.
revoke all on public.auth_throttle from anon, authenticated;

/**
 * Einen Versuch zaehlen und sagen, ob er noch erlaubt ist.
 *
 * Muss von anon aufrufbar sein -- eine Anmeldung passiert vor der Anmeldung.
 * Genau deshalb ist der Schluessel die IP und nicht die E-Mail-Adresse.
 *
 * Gibt `allowed = false` zurueck, statt eine Ausnahme zu werfen: der Aufrufer
 * soll die Antwort gleich behandeln koennen wie ein falsches Passwort und
 * nicht zwischen "gesperrt" und "kaputt" unterscheiden muessen.
 */
create or replace function public.register_auth_attempt(
  p_scope text,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.auth_throttle;
  window_age interval := make_interval(secs => greatest(p_window_seconds, 1));
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Invalid throttle configuration';
  end if;

  -- Abgelaufene Zeilen verschwinden, nicht nur die eigene: so waechst die
  -- Tabelle nicht mit jeder IP, die einmal vorbeikam.
  delete from public.auth_throttle
  where window_start < now() - make_interval(secs => 3600);

  insert into public.auth_throttle (scope, bucket, window_start, attempts)
  values (p_scope, left(p_bucket, 100), now(), 1)
  on conflict (scope, bucket) do update
  set
    window_start = case
      when public.auth_throttle.window_start < now() - window_age then now()
      else public.auth_throttle.window_start
    end,
    attempts = case
      when public.auth_throttle.window_start < now() - window_age then 1
      else public.auth_throttle.attempts + 1
    end
  returning * into row;

  return query
  select
    row.attempts <= p_limit,
    greatest(0, p_window_seconds - extract(epoch from (now() - row.window_start))::integer);
end;
$$;

revoke all on function public.register_auth_attempt(text, text, integer, integer) from public;
grant execute on function public.register_auth_attempt(text, text, integer, integer) to anon, authenticated;

/** Eine gelungene Anmeldung loescht den Zaehler, statt ihn auslaufen zu lassen. */
create or replace function public.clear_auth_attempts(p_scope text, p_bucket text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.auth_throttle where scope = p_scope and bucket = left(p_bucket, 100);
$$;

revoke all on function public.clear_auth_attempts(text, text) from public;
grant execute on function public.clear_auth_attempts(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Zwei-Faktor fuer das Buero
-- ---------------------------------------------------------------------------
--
-- Die Faktoren selbst verwaltet Supabase Auth (auth.mfa_factors). Hier steht
-- nur, ob der Betrieb ihn von seinen Buero-Konten verlangt. Verpflichtend ist
-- er bewusst nicht von vornherein: ein bestehender Betrieb wuerde sich sonst
-- mit dem naechsten Einspielen selbst aussperren.

alter table public.companies
  add column if not exists require_staff_mfa boolean not null default false;

comment on column public.companies.require_staff_mfa is
  'Wenn true, muessen OWNER und OFFICE einen zweiten Faktor eingerichtet haben.';

/**
 * Den Zwang ein- oder ausschalten. Nur die Inhaberin: wer ihn abschalten darf,
 * entscheidet ueber die Sicherheit aller Buero-Konten.
 */
create or replace function public.set_require_staff_mfa(p_required boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.company_members;
begin
  select member.* into actor
  from public.company_members member
  join public.profiles profile on profile.id = member.profile_id
  where profile.auth_user_id = auth.uid()
    and member.role = 'OWNER'
    and member.status = 'ACTIVE'
  limit 1;

  if actor.id is null then
    raise exception 'Only the OWNER may change the two-factor requirement';
  end if;

  update public.companies
  set require_staff_mfa = coalesce(p_required, false)
  where id = actor.company_id;
end;
$$;

revoke all on function public.set_require_staff_mfa(boolean) from public, anon;
grant execute on function public.set_require_staff_mfa(boolean) to authenticated;
