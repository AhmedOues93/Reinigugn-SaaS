-- Sicherheitskorrektur zu 20261006000035. Die Anmeldebremse von damals hat
-- nichts gebremst, und das ist schlimmer als keine Bremse: sie hat den
-- Eindruck von Schutz erzeugt.
--
-- Drei Fehler, jeder einzeln ausreichend, um sie wirkungslos zu machen:
--
--   1. `clear_auth_attempts` war an `anon` vergeben. Ein Aufruf vor jedem
--      Versuch -- mit dem oeffentlichen Publishable Key, den jede Browserseite
--      mitliefert -- und der Zaehler stand wieder auf null.
--
--   2. Grenze und Fenster kamen als Parameter von der Aufruferin.
--      `p_limit => 2147483647` war immer erlaubt.
--
--   3. Der Schluessel kam ebenfalls von der Aufruferin. Bei jedem Versuch ein
--      anderer Wert, und kein Zaehler stieg je; oder der Wert einer anderen
--      Person, und die kam selbst nicht mehr herein.
--
-- Diese Migration dreht alle drei um. Die Richtlinie liegt jetzt in der
-- Datenbank, der Schluessel wird entweder aus den Kopfzeilen des Requests
-- gelesen oder muss unterschrieben sein, und Zuruecksetzen geht nur mit
-- derselben Unterschrift.
--
-- Was diese Bremse ausdruecklich NICHT ist: der Schutz der Anmeldung. Wer
-- Passwoerter durchprobieren will, ruft `/auth/v1/token` bei Supabase Auth
-- direkt auf und kommt an unserem Code nie vorbei. Der verbindliche Riegel
-- sind die Rate Limits und das CAPTCHA von Supabase Auth; sie stehen in
-- docs/runbook.md mit den genauen Einstellungen. Diese Bremse sitzt vor dem
-- eigenen Anmeldeformular -- eine Schicht dahinter, kein Ersatz.

-- ---------------------------------------------------------------------------
-- 1. Die Richtlinie gehoert in die Datenbank
-- ---------------------------------------------------------------------------

create table if not exists public.auth_throttle_policies (
  scope text primary key check (char_length(scope) between 1 and 40),
  max_attempts integer not null check (max_attempts between 1 and 100000),
  window_seconds integer not null check (window_seconds between 10 and 86400),
  note text
);

comment on table public.auth_throttle_policies is
  'Grenzen der Anmeldebremse. Serverseitig, damit die Aufruferin sie nicht waehlen kann.';

alter table public.auth_throttle_policies enable row level security;
revoke all on public.auth_throttle_policies from anon, authenticated;

insert into public.auth_throttle_policies (scope, max_attempts, window_seconds, note) values
  ('login', 10, 600, 'Zehn Versuche in zehn Minuten. Wer sein Passwort sucht, kommt damit aus.'),
  ('password-reset', 5, 900, 'Passwort-Mails sind teuer und laut.'),
  -- Ohne hinterlegtes Geheimnis teilen alle Aufrufe desselben Ausgangs einen
  -- Zaehler. Bei Vercel ist das die Egress-Adresse, also der ganze Betrieb.
  -- Die Grenze ist darum weit: sie soll eine Schleife stoppen, nicht den
  -- Montagmorgen.
  ('login:shared', 600, 600, 'Gemeinsamer Zaehler, wenn kein Signierschluessel hinterlegt ist.'),
  ('password-reset:shared', 120, 900, 'Gemeinsamer Zaehler fuer Passwort-Mails.')
on conflict (scope) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Der Signierschluessel
-- ---------------------------------------------------------------------------
--
-- Nur die eigene Anwendung kennt die Adresse der Person, die sich gerade
-- anmeldet -- Supabase sieht an dieser Stelle den Server, nicht den Browser.
-- Sie muss die Adresse also mitschicken, und eine mitgeschickte Adresse ist
-- so viel wert wie ihre Unterschrift.
--
-- Der Schluessel wird nicht hier gesetzt und gehoert nicht ins Repository. Wie
-- er gesetzt wird, steht in docs/runbook.md. Fehlt er, faellt die Bremse auf
-- den gemeinsamen Zaehler zurueck -- enger, aber nie aussperrend.

create table if not exists public.auth_throttle_config (
  id boolean primary key default true check (id),
  signing_secret text check (signing_secret is null or char_length(signing_secret) >= 32),
  updated_at timestamptz not null default now()
);

alter table public.auth_throttle_config enable row level security;
revoke all on public.auth_throttle_config from anon, authenticated;

insert into public.auth_throttle_config (id) values (true) on conflict (id) do nothing;

comment on table public.auth_throttle_config is
  'Signierschluessel der Anmeldebremse. Keine Richtlinie, keine Rechte: nur security-definer-Funktionen lesen hier.';

-- ---------------------------------------------------------------------------
-- 3. Welcher Schluessel wirklich gilt
-- ---------------------------------------------------------------------------

/**
 * Die Adresse der Aufruferin aus den Kopfzeilen des Requests.
 *
 * PostgREST stellt sie als `request.headers` bereit. `cf-connecting-ip` wird
 * von der Kante gesetzt und ueberschreibt, was die Aufruferin behauptet;
 * darum zuerst. Bei `x-forwarded-for` ist der *letzte* Eintrag der von der
 * Kante angehaengte -- die vorderen kann die Aufruferin frei erfinden.
 */
create or replace function public.request_source_address()
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  headers json;
  chain text;
  parts text[];
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  if headers is null then return null; end if;

  if coalesce(headers->>'cf-connecting-ip', '') <> '' then
    return left(headers->>'cf-connecting-ip', 100);
  end if;
  if coalesce(headers->>'x-real-ip', '') <> '' then
    return left(headers->>'x-real-ip', 100);
  end if;

  chain := coalesce(headers->>'x-forwarded-for', '');
  if chain = '' then return null; end if;
  parts := string_to_array(chain, ',');
  return left(btrim(parts[array_length(parts, 1)]), 100);
end;
$$;

revoke all on function public.request_source_address() from public, anon, authenticated;

/**
 * Der Schluessel, unter dem gezaehlt wird, und die Richtlinie dazu.
 *
 * Die Reihenfolge ist die ganze Sicherheitsentscheidung:
 *
 *   1. Ist `p_bucket` korrekt unterschrieben, gilt er. Nur die eigene
 *      Anwendung kann unterschreiben, also kann nur sie den Schluessel
 *      waehlen -- und sie waehlt die echte Adresse der anmeldenden Person.
 *   2. Sonst die Adresse aus den Kopfzeilen. Die kann die Aufruferin nicht
 *      faelschen, also sperrt sie damit nur sich selbst aus.
 *   3. Sonst ein gemeinsamer Zaehler mit weiter Grenze.
 *
 * Ein unterschriebener Schluessel wird gehasht gespeichert. Eine IP-Adresse
 * ist ein personenbezogenes Datum; fuer die Abwehr braucht es nur die
 * Unterscheidbarkeit, nicht den Wert.
 */
create or replace function public.resolve_auth_throttle_key(p_scope text, p_bucket text, p_proof text)
returns table (storage_key text, policy_scope text)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  secret text;
  expected text;
  address text;
begin
  select signing_secret into secret from public.auth_throttle_config where id;

  if secret is not null and coalesce(p_bucket, '') <> '' and coalesce(p_proof, '') <> '' then
    expected := encode(
      hmac(convert_to(p_scope || ':' || p_bucket, 'UTF8'), convert_to(secret, 'UTF8'), 'sha256'),
      'hex'
    );
    -- Zeichenweiser Vergleich in konstanter Zeit ist hier nicht noetig: die
    -- Antwort verraet nur, ob ein Zaehler gilt, nicht ob der Schluessel stimmt.
    if expected = p_proof then
      return query select
        encode(digest(convert_to('signed:' || p_bucket, 'UTF8'), 'sha256'::text), 'hex'),
        p_scope;
      return;
    end if;
  end if;

  address := public.request_source_address();
  if address is not null then
    return query select
      encode(digest(convert_to('edge:' || address, 'UTF8'), 'sha256'::text), 'hex'),
      p_scope;
    return;
  end if;

  return query select 'shared'::text, p_scope || ':shared';
end;
$$;

revoke all on function public.resolve_auth_throttle_key(text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Die Bremse selbst
-- ---------------------------------------------------------------------------
--
-- Die alte Signatur verschwindet. Sie stehen zu lassen hiesse, den Weg mit
-- frei waehlbarer Grenze offen zu lassen -- `create or replace` loest ueber
-- die Argumentliste auf und haette eine zweite Ueberladung ergeben.

drop function if exists public.register_auth_attempt(text, text, integer, integer);
drop function if exists public.clear_auth_attempts(text, text);

create or replace function public.register_auth_attempt(
  p_scope text,
  p_bucket text default null,
  p_proof text default null
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  resolved record;
  policy public.auth_throttle_policies;
  counter public.auth_throttle;
  window_age interval;
begin
  select * into resolved from public.resolve_auth_throttle_key(p_scope, p_bucket, p_proof);

  select * into policy from public.auth_throttle_policies where scope = resolved.policy_scope;
  if policy.scope is null then
    -- Ein unbekannter Vorgang ist ein Programmierfehler, kein Freifahrtschein.
    raise exception 'Unknown throttle scope: %', p_scope;
  end if;
  window_age := make_interval(secs => policy.window_seconds);

  -- Abgelaufene Zeilen verschwinden, nicht nur die eigene: so waechst die
  -- Tabelle nicht mit jeder Adresse, die einmal vorbeikam.
  delete from public.auth_throttle where window_start < now() - interval '1 hour';

  insert into public.auth_throttle (scope, bucket, window_start, attempts)
  values (resolved.policy_scope, resolved.storage_key, now(), 1)
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
  returning * into counter;

  return query
  select
    counter.attempts <= policy.max_attempts,
    greatest(0, policy.window_seconds - extract(epoch from (now() - counter.window_start))::integer);
end;
$$;

revoke all on function public.register_auth_attempt(text, text, text) from public;
grant execute on function public.register_auth_attempt(text, text, text) to anon, authenticated;

/**
 * Nach einer gelungenen Anmeldung soll der Zaehler nicht nachwirken.
 *
 * Zwei Riegel, weil genau hier der Fehler von 35 sass:
 *
 *   * Nur `authenticated`. Wer zurueckstellen will, muss drin sein -- und wer
 *     drin ist, braucht nicht mehr zu raten.
 *   * Nur mit gueltiger Unterschrift, wenn ein Schluessel hinterlegt ist. Ohne
 *     Unterschrift wird der Zaehler der eigenen Adresse zurueckgestellt und
 *     kein anderer.
 *
 * Der gemeinsame Zaehler wird nie zurueckgestellt: sonst reicht eine einzige
 * gelungene Anmeldung, um die Bremse fuer alle zu loesen.
 */
create or replace function public.clear_auth_attempts(
  p_scope text,
  p_bucket text default null,
  p_proof text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  resolved record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into resolved from public.resolve_auth_throttle_key(p_scope, p_bucket, p_proof);
  if resolved.storage_key = 'shared' then return; end if;

  delete from public.auth_throttle
  where scope = resolved.policy_scope and bucket = resolved.storage_key;
end;
$$;

revoke all on function public.clear_auth_attempts(text, text, text) from public, anon;
grant execute on function public.clear_auth_attempts(text, text, text) to authenticated;

-- Die Zaehlertabelle bleibt zu wie bisher; hier nur noch einmal ausdruecklich,
-- weil 35 denselben Satz enthielt und er trotzdem umgangen werden konnte.
revoke all on public.auth_throttle from anon, authenticated;
