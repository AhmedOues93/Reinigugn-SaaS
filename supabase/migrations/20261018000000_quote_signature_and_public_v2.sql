-- Die online unterschriebene Angebotsannahme war nur halb eingebaut.
--
-- Nachgemessen an einer vollstaendig migrierten Datenbank: zwei Dinge, auf die
-- der Code zugreift, gab es nicht.
--
-- 1. Die Spalte `quotes.accepted_signature_text`.
--
--    `accept_public_quote_signed()` liest und schreibt sie, und `getQuote()`
--    im Web waehlt sie aus. Angelegt hat sie keine Migration. Nachgewiesen:
--
--      do $$ declare t public.quotes; begin
--        select * into t from public.quotes limit 1;
--        if t.accepted_signature_text is null then null; end if; end $$;
--      ERROR: record "t" has no field "accepted_signature_text"
--
--    Folgen, alle drei im Betrieb sichtbar:
--      * `accept_public_quote_signed()` bricht ab, sobald der Token stimmt --
--        eine Kundin kann ein Angebot online nicht unterschreiben.
--      * /dashboard/vertrieb/angebote/[id] zeigt die Fehlerseite, weil
--        `getQuote()` mit "column quotes.accepted_signature_text does not
--        exist" (SQLSTATE 42703) abbricht.
--      * /dashboard/settings zeigt dieselbe Fehlerseite: die Seite laedt das
--        letzte Angebot fuer die Vorschau des Erscheinungsbildes. Passwort,
--        Mailversand und Firmendaten waren damit unerreichbar.
--
-- 2. Die Funktion `get_public_quote_v2(text)`.
--
--    `lib/data/public-quote.ts` ruft sie auf; im Repository gibt es sie in
--    keiner Migration, nur diesen Aufruf. `getPublicQuote()` gibt bei einem
--    Fehler null zurueck -- die oeffentliche Angebotsseite sah fuer *jeden*
--    gueltigen Link aus wie ein abgelaufener.
--
-- Beides wird hier nachgezogen, nicht aus dem Code entfernt: die Unterschrift
-- ist der Nachweis der Annahme, und ohne sie waere die Online-Annahme ein
-- Klick ohne Beleg.

alter table public.quotes
  add column if not exists accepted_signature_text text;

comment on column public.quotes.accepted_signature_text is
  'Der getippte Name, mit dem online angenommen wurde. Nachweis der Annahme, nicht Deko.';

-- Eine Unterschrift ohne Annahme gibt es nicht, und ein Roman ist keine
-- Unterschrift. Die Laenge ist dieselbe Groessenordnung wie accepted_by_name.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.quotes'::regclass and conname = 'quotes_accepted_signature_check'
  ) then
    alter table public.quotes
      add constraint quotes_accepted_signature_check
      check (
        accepted_signature_text is null
        or (accepted_at is not null and char_length(btrim(accepted_signature_text)) between 2 and 200)
      );
  end if;
end $$;

/**
 * Das oeffentliche Angebot, mit der Unterschrift.
 *
 * Wortgleich zu get_public_quote(), nur um `accepted_signature_text` erweitert
 * -- genau das, was der Aufruf im Web erwartet. Die aeltere Fassung bleibt
 * stehen: sie kann noch von einem Stand im Umlauf aufgerufen werden, und sie
 * ist nicht falsch, nur unvollstaendig.
 *
 * `security definer`, weil die Seite ohne Anmeldung aufgerufen wird. Der
 * Zugriff haengt allein am Token: er muss stimmen, darf nicht abgelaufen sein,
 * und das Angebot muss versendet oder entschieden sein. Ein Entwurf ist ueber
 * diesen Weg nicht erreichbar.
 */
create or replace function public.get_public_quote_v2(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  target public.quotes;
  result jsonb;
begin
  if p_token is null or length(p_token) < 32 or length(p_token) > 256 then
    return null;
  end if;

  select * into target
  from public.quotes
  where public_token_hash = encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'::text), 'hex')
    and public_access_expires_at > now()
    and status in ('SENT', 'ACCEPTED', 'DECLINED')
  limit 1;

  if target.id is null then return null; end if;

  select jsonb_build_object(
    'id', target.id,
    'quote_number', target.quote_number,
    'status', target.status,
    'title', target.title,
    'intro', target.intro,
    'recipient_snapshot', target.recipient_snapshot,
    'company_snapshot', target.company_snapshot,
    'sent_at', target.sent_at,
    'created_at', target.created_at,
    'valid_until', target.valid_until,
    'currency', target.currency,
    'billing_mode', target.billing_mode,
    'acceptance_policy', target.acceptance_policy,
    'order_type', target.order_type,
    'service_start', target.service_start,
    'service_end', target.service_end,
    'termination_notice', target.termination_notice,
    'net_total_cents', target.net_total_cents,
    'vat_total_cents', target.vat_total_cents,
    'gross_total_cents', target.gross_total_cents,
    'recurring_net_monthly_cents', target.recurring_net_monthly_cents,
    'accepted_at', target.accepted_at,
    'accepted_by_name', target.accepted_by_name,
    'acceptance_note', target.acceptance_note,
    'accepted_signature_text', target.accepted_signature_text,
    'decline_reason', target.decline_reason,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'position', line.position,
        'description', line.description,
        'quantity', line.quantity,
        'unit', line.unit,
        'unit_price_cents', line.unit_price_cents,
        'vat_rate_basis_points', line.vat_rate_basis_points,
        'recurrence', line.recurrence,
        'net_amount_cents', line.net_amount_cents,
        'vat_amount_cents', line.vat_amount_cents,
        'gross_amount_cents', line.gross_amount_cents
      ) order by line.position)
      from public.quote_lines line
      where line.quote_id = target.id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- Dieselben Rechte wie bei der ersten Fassung: die Seite steht ohne Anmeldung
-- offen, der Token ist der ganze Zugang.
revoke all on function public.get_public_quote_v2(text) from public;
grant execute on function public.get_public_quote_v2(text) to anon, authenticated, service_role;
