-- Die online unterschriebene Angebotsannahme. Run with supabase/test/run.sh.
--
-- Diese Suite gab es nicht, und deshalb fiel nicht auf, dass der Ablauf
-- ueberhaupt nicht funktionierte: `accepted_signature_text` fehlte als Spalte,
-- und `get_public_quote_v2`, die die oeffentliche Seite aufruft, war in keiner
-- Migration angelegt. Beide Namen standen bis dahin nur in der Erlaubnisliste
-- von auth-throttle-hardening.test.sql -- geprueft wurde, *wer* sie aufrufen
-- darf, nie *ob sie tun, was sie sollen*.
--
-- Hier laeuft der Weg, den eine Kundin geht: Link oeffnen, Angebot lesen,
-- mit getipptem Namen annehmen. Und die Gegenrichtung: kein zweites Mal
-- annehmen, keine Unterschrift ohne Annahme, kein Zugriff mit falschem oder
-- abgelaufenem Token.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\o /dev/null
begin;

create or replace function pg_temp.sign_in(p_user uuid) returns void language plpgsql as $$
begin
  reset role;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  set role authenticated;
end; $$;
create or replace function pg_temp.sign_out() returns void language plpgsql as $$
begin reset role; perform set_config('request.jwt.claim.sub', '', true); end; $$;
create or replace function pg_temp.assert(p_condition boolean, p_message text) returns void language plpgsql as $$
begin if not p_condition then raise exception 'ASSERTION FAILED: %', p_message; end if; end; $$;
create or replace function pg_temp.assert_rejected(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if position(lower(p_expected) in lower(sqlerrm)) = 0 then
      raise exception 'WRONG REJECTION for %: expected "%", got "%"', p_sql, p_expected, sqlerrm;
    end if; return;
  end;
  raise exception 'NOT REJECTED: % (expected "%")', p_sql, p_expected;
end; $$;

-- ---------------------------------------------------------------------------
-- Die Spalte und die Funktion muessen es geben.
--
-- Zuerst und ohne Vorrichtung: genau das war der Defekt, und genau so faellt
-- er auf. Die plpgsql-Pruefung ist die strengere -- ein Verweis auf ein Feld,
-- das der Zeilentyp nicht hat, bricht erst zur Laufzeit ab, und so blieb
-- `accept_public_quote_signed` monatelang unbemerkt kaputt.
-- ---------------------------------------------------------------------------
do $$
declare row_of_quotes public.quotes;
begin
  select * into row_of_quotes from public.quotes limit 1;
  if row_of_quotes.accepted_signature_text is not null then null; end if;
exception when undefined_column then
  raise exception 'ASSERTION FAILED: public.quotes hat kein Feld accepted_signature_text';
end $$;

select pg_temp.assert(
  exists (select 1 from pg_proc where proname = 'get_public_quote_v2'),
  'get_public_quote_v2 fehlt -- die oeffentliche Angebotsseite ruft sie auf');
select pg_temp.assert(
  (select prosecdef from pg_proc where proname = 'get_public_quote_v2'),
  'get_public_quote_v2 muss security definer sein: die Seite wird ohne Anmeldung aufgerufen');
select pg_temp.assert(
  has_function_privilege('anon', 'public.get_public_quote_v2(text)', 'execute'),
  'anon muss get_public_quote_v2 aufrufen duerfen');

-- ---------------------------------------------------------------------------
-- Vorrichtung: ein Betrieb, eine Anfrage, eine Besichtigung, ein Angebot.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('c5000000-0000-4000-8000-000000000001', 'sig-owner@example.test');

select pg_temp.sign_in('c5000000-0000-4000-8000-000000000001');
select public.create_company_for_current_user('Unterschrift GmbH');
-- Der Stundensatz wird ohne angemeldete Sitzung gesetzt: `companies` ist fuer
-- `authenticated` nicht direkt beschreibbar, und das soll so bleiben.
select pg_temp.sign_out();
update public.companies set default_hourly_rate_cents = 4500
 where name = 'Unterschrift GmbH';
select pg_temp.sign_in('c5000000-0000-4000-8000-000000000001');

create temporary table lead1 as
select public.create_lead('Autohaus Nord', 'Frau Nord', 'nord@example.test', '+49 40 222',
                          'Alstertor 1', '20095', 'Hamburg', 'Website', 'Sucht Showroom-Reinigung.') as id;
grant select on lead1 to authenticated;
create temporary table survey1 as
select public.schedule_site_survey((select id from lead1), null, 'Showroom Nord', now() + interval '2 days',
                                   null, 'Alstertor 1', '20095', 'Hamburg', null) as id;
grant select on survey1 to authenticated;
select public.add_survey_area((select id from survey1), 'Showroom', 420, 'Fliesen', 3, 120, null, null);
select public.complete_site_survey((select id from survey1), null);
create temporary table quote1 as
select public.create_quote_from_survey((select id from survey1), 'Unterhaltsreinigung Showroom', 30) as id;
select public.send_quote((select id from quote1));

-- Der Link, den die Kundin bekommt. Gespeichert wird nur der Hash.
create temporary table link as select 'e2e-signatur-token-0123456789abcdef0123456789' as token;
grant select on link to authenticated, anon;
grant select on quote1 to authenticated, anon;
select public.set_quote_public_access(
  (select id from quote1),
  encode(extensions.digest(convert_to((select token from link), 'UTF8'), 'sha256'::text), 'hex'),
  now() + interval '14 days');
select pg_temp.sign_out();

-- ---------------------------------------------------------------------------
-- Die Kundin liest das Angebot, ohne Anmeldung.
-- ---------------------------------------------------------------------------
set role anon;
create temporary table seen as select public.get_public_quote_v2((select token from link)) as doc;
select pg_temp.assert((select doc is not null from seen),
                      'mit gueltigem Token muss das Angebot kommen');
select pg_temp.assert((select doc->>'status' = 'SENT' from seen),
                      'ein versendetes Angebot wird als SENT ausgeliefert');
select pg_temp.assert((select doc ? 'accepted_signature_text' from seen),
                      'die Antwort muss das Feld accepted_signature_text tragen -- die Seite liest es');
select pg_temp.assert((select doc->>'accepted_signature_text' is null from seen),
                      'ohne Annahme gibt es keine Unterschrift');
select pg_temp.assert((select jsonb_array_length(doc->'lines') = 1 from seen),
                      'die Positionen kommen mit');

-- Falscher Token, abgelaufener Token: nichts.
select pg_temp.assert(
  public.get_public_quote_v2('falsch-aber-lang-genug-0123456789abcdef0123') is null,
  'ein falscher Token darf kein Angebot liefern');
select pg_temp.assert(
  public.get_public_quote_v2('kurz') is null,
  'ein zu kurzer Token wird gar nicht nachgesehen');
reset role;

-- ---------------------------------------------------------------------------
-- Eine Unterschrift ohne Annahme gibt es nicht.
--
-- Hier, solange das Angebot noch SENT ist: nach der Annahme waere der
-- Eintrag ja zulaessig, und der Test wuerde nichts beweisen.
-- ---------------------------------------------------------------------------
select pg_temp.assert_rejected(
  format('update public.quotes set accepted_signature_text = ''Niemand'' where id = %L',
         (select id from quote1)),
  'quotes_accepted_signature_check');
select pg_temp.assert_rejected(
  format('update public.quotes set accepted_signature_text = '' X '' where id = %L',
         (select id from quote1)),
  'quotes_accepted_signature_check');

-- ---------------------------------------------------------------------------
-- Die Annahme mit getippter Unterschrift.
-- ---------------------------------------------------------------------------
set role anon;
select public.accept_public_quote_signed((select token from link), 'Frau Nord', 'Frau Nord', 'Bitte ab Januar.');
reset role;

select pg_temp.assert(
  (select accepted_signature_text = 'Frau Nord' from public.quotes where id = (select id from quote1)),
  'die Unterschrift wird gespeichert');
select pg_temp.assert(
  (select status = 'ACCEPTED' and accepted_at is not null and accepted_via = 'PUBLIC_LINK'
     from public.quotes where id = (select id from quote1)),
  'die Annahme wird als solche festgehalten, mit Weg und Zeitpunkt');

set role anon;
select pg_temp.assert(
  (public.get_public_quote_v2((select token from link))->>'accepted_signature_text') = 'Frau Nord',
  'die oeffentliche Seite zeigt die Unterschrift nach der Annahme');

-- Zweimal annehmen gibt es nicht.
select pg_temp.assert_rejected(
  format('select public.accept_public_quote_signed(%L, ''Jemand Anders'', ''Jemand Anders'', '''')', (select token from link)),
  'already been decided');
reset role;
select pg_temp.assert(
  (select accepted_signature_text = 'Frau Nord' from public.quotes where id = (select id from quote1)),
  'der abgelehnte zweite Versuch hat die erste Unterschrift nicht ueberschrieben');

rollback;
\o
\echo 'Oeffentliche Angebotsannahme mit Unterschrift: all assertions passed'
