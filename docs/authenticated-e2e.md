# Die angemeldete Oberfläche lokal prüfen

`apps/web/e2e/authenticated` prüft, was nur eine angemeldete Sitzung zeigt:
Rollenführung, Mandantentrennung, Zeiterfassung, Abrechnung, Kalkulation,
Kundenportal. Elf Spec-Dateien, 77 Fälle, über zwei Playwright-Projekte
(`desktop` und `mobile`) also 154 Testläufe.

Diese Suite **lief lange überhaupt nicht**. Ohne Zugangsdaten übersprang sich
jeder Fall, und Playwright beendet sich mit 0, wenn sich jeder Test
übersprungen hat — nachgemessen: 154 übersprungen, 0 ausgeführt, Exit 0. Ein
leerer Seed, ein vergessener Zugang oder eine Datenbank, die nicht hochkam,
sah damit wie ein erfolgreicher Testlauf aus.

Als die Suite zum ersten Mal wirklich lief, bestand sie nicht. Das ist keine
Zeitgrenze, die man hochsetzt, sondern eine Suite, die auseinandergelaufen ist,
während sie nie lief. Dieses Dokument beschreibt, wie man sie lokal laufen
lässt, und hält fest, welche Befunde abgearbeitet sind und welche offen.

## Lokal laufen lassen

Gebraucht werden Docker, die im Repository festgelegte Supabase-CLI und ein
PostgreSQL-Client.

```bash
# 1. Wegwerf-Stack hochfahren. Wendet die ganze Migrationshistorie an.
pnpm exec supabase start

# 2. Adressen und Schlüssel aus dem gerade gestarteten Stack lesen.
#    Nichts davon ist eingetragen: die Schlüssel eines lokalen Stacks sind
#    bei jeder CLI-Version andere.
pnpm exec supabase status -o json

# 3. Mandanten einspielen. Ohne Daten überspringen sich die meisten Specs
#    ("no job assigned to this employee in this environment").
psql "$DB_URL" -v ON_ERROR_STOP=1 \
  -c "set sauberwerk.seed_confirmed = 'local-development'" \
  -f supabase/seed/demo.sql

# 4. Anwendung gegen diesen Stack bauen und bedienen.
NEXT_PUBLIC_APP_ENV=local \
NEXT_PUBLIC_SUPABASE_URL=$API_URL \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$ANON_KEY \
  pnpm --filter @reinigung/web exec next build
# … danach `next start -p 3100` mit denselben Variablen.

# 5. Suite laufen lassen. Die vier Demo-Logins stehen offen im Seed, weil sie
#    nur in dieser Wegwerf-Datenbank existieren.
E2E_BASE_URL=http://127.0.0.1:3100 \
E2E_OWNER_EMAIL=inhaber@demo.test     E2E_OWNER_PASSWORD='DemoPasswort2026!' \
E2E_EMPLOYEE_EMAIL=mitarbeiter@demo.test E2E_EMPLOYEE_PASSWORD='DemoPasswort2026!' \
E2E_CUSTOMER_EMAIL=kunde@demo.test    E2E_CUSTOMER_PASSWORD='DemoPasswort2026!' \
E2E_RUN_ID=local-1 \
  pnpm --filter @reinigung/web exec playwright test e2e/authenticated
```

`THROTTLE_SIGNING_SECRET` bleibt dabei absichtlich leer. Mit Schlüssel zählt
die Anmeldebremse je Adresse — zehn Versuche in zehn Minuten — und die ganze
Suite kommt aus einer Adresse. Ohne ihn gilt `login:shared` mit 600 in 600
Sekunden. Was der Schlüssel bewirkt, prüft
`supabase/test/auth-throttle-hardening.test.sql`.

`E2E_ALLOW_PRODUCTION` wird nie gesetzt. Die Suite weigert sich gegen ein Ziel,
das wie Produktion aussieht oder sich selbst so meldet, und diese Weigerung
soll nicht aushebelbar sein.

## Was dabei nachgewiesen ist

Gegen den Wegwerf-Stack, nicht gegen `harness.sql`:

- Die Supabase-CLI wendet die ganze Migrationshistorie an — 128 Migrationen,
  ohne Fehler. Die SQL-Suiten gehen über `harness.sql`, der die von Supabase
  verwalteten Schemata nachstellt; dieser Weg ist ein anderer und war vorher
  ungeprüft.
- Der Seed legt einen vollständigen Mandanten an: 153 Einsätze, 137
  Zuweisungen, 133 Arbeitszeiten, drei Rechnungen, sieben Konten.
- GoTrue meldet die Konten des Seeds an (Passwort-Grant, HTTP 200).

## Befunde

### Abgearbeitet

| Spec | Befund | Entscheidung |
|---|---|---|
| `kalkulation.spec.ts` | `input[name=weekly_hours]` war vorhanden, aber `hidden`. Die Kalkulationsgrundlagen sind ein Assistent mit vier Schritten; nur der aktive Schritt ist sichtbar. Die Suite erwartete alle Felder auf einmal. | Die Schritte sind Absicht — vier Zahlenblöcke übereinander liest auf einem Telefon niemand. Die Suite lernt die Schritte (`openStep`). |
| `defaults-form.tsx` | Die Schrittknöpfe hatten unter 640 px **keinen** zugänglichen Namen: die Beschriftung ist dort ausgeblendet, damit vier Namen nicht über die Breite laufen. Für eine Vorleseanwendung oder eine Tastaturbedienung hieß der Knopf gar nichts. | App-Fehler. `aria-label` auf jedem Schritt, `aria-current="step"` auf dem aktiven, der sichtbare Text `aria-hidden`. |
| `kalkulation.spec.ts` | Der Katalog-Test prüfte die Liste, während der Knopf noch „Wird gespeichert“ zeigte. Nachgemessen: der Eintrag stand Sekunden später in der Datenbank, der Test war zu früh. | Test-Fehler. Auf das Ende des Speichervorgangs warten statt darauf zu hoffen — keine festen Wartezeiten, sondern eine Zusicherung auf den Knopf. |
| `billing.spec.ts` | Gesucht wurde „Position hinzufügen“ und „festschreiben“. Beides gibt es in der Abrechnung nicht: die Kalkulation sagt „Position“, die Abrechnung „Leistung“, und ausgestellt wird mit „Rechnung ausstellen“. Danach rief der Test `test.skip` auf, der halbe Ablauf sah also übersprungen aus statt falsch. | Test-Fehler. Echte Beschriftungen als Konstanten am Anfang der Datei, und der Positionseditor wird aufgeklappt, bevor darin gesucht wird. |
| `invoice-line-editor.tsx` | Menge, Einzelpreis und Steuersatz waren `type="number"`, der Platzhalter sagt „z. B. 45,00“. Ein `type=number`-Feld kennt nur den Punkt; wer „45,00“ eintippt, hat 4500 im Feld oder nichts — auf dem einen Bildschirm, auf dem Rechnungsbeträge entstehen. Die Serveraktion rechnet das Komma seit immer um. | App-Fehler. `type="number"` entfernt, `inputMode="decimal"` bleibt (Zifferntastatur mit Komma). Die Grenzen prüft die Serveraktion, wo sie ohnehin gelten müssen. |

### Abgearbeitet, zweiter Durchgang

| Spec / App | Befund | Entscheidung |
|---|---|---|
| `playwright.config.ts` | Vier Fälle in `office` und `master-data` fielen **ausschließlich** mit „Test timeout of 45000ms exceeded" durch, nicht an einer Zusicherung. Derselbe Fall braucht 37,5 s und besteht — die Grenze lag nur knapp darüber. | Grenze auf 120 s, `expect` auf 15 s. Ein angemeldeter Fall führt einen ganzen Arbeitsablauf aus; die Grenze soll einen hängenden Test beenden, nicht einen langsamen. |
| `office.spec.ts` | Der Test „an issued invoice offers no line editor" suchte „Position hinzufügen". Den Knopf gibt es in der Abrechnung **nicht** — so heißt er in der Kalkulation. Die Zusicherung war auf jeder Seite erfüllt, auch auf einem Entwurf: **der Test konnte nicht fehlschlagen.** | Umgeschrieben auf beide Richtungen: der Entwurf **muss** den Editor haben, die ausgestellte Rechnung **darf** ihn nicht haben. Erst dadurch weiß die zweite Zusicherung, wonach sie sucht. |
| `office.spec.ts` | Der Rundgang über 18 Seiten suchte nach „Application error" und „Unhandled Runtime Error" — den **englischen** Zeichenketten von Next.js. Die Anwendung hat eine eigene Fehlergrenze, und die sagt „Etwas ist schiefgelaufen". Eine kaputte Seite lief durch. | Die eigene Fehlerseite steht jetzt in der Liste. Zusätzlich nennt die Überschriftsprüfung den Pfad — ein Rundgang, der nur „element(s) not found" sagt, kostet den nächsten Leser einen Trace-Download. |
| **`quotes.accepted_signature_text`** | Die Spalte gab es in keiner Migration, obwohl `accept_public_quote_signed()` sie liest und schreibt und `getQuote()` sie auswählt. Nachgewiesen: `record "t" has no field "accepted_signature_text"`. **Drei Oberflächen waren kaputt:** `/dashboard/vertrieb/angebote/[id]`, das Angebots-PDF und `/dashboard/settings` (lädt das letzte Angebot für die Vorschau) — dort waren Passwort, Mailversand und Firmendaten unerreichbar. Online unterschreiben konnte niemand. | App-Fehler. Migration `20261018000000` legt die Spalte an, mit Prüfbedingung: eine Unterschrift ohne Annahme gibt es nicht. |
| **`get_public_quote_v2`** | `lib/data/public-quote.ts` ruft diese Funktion auf; im Repository gibt es sie in **keiner** Migration. `getPublicQuote()` gibt bei Fehler `null` zurück — die öffentliche Angebotsseite sah für **jeden** gültigen Link aus wie ein abgelaufener. | App-Fehler. In derselben Migration angelegt: wortgleich zu `get_public_quote`, plus `accepted_signature_text`. |
| `supabase/test/public-quote-signature.test.sql` | Beide Namen standen bis dahin nur in der Erlaubnisliste von `auth-throttle-hardening.test.sql` — geprüft wurde, *wer* sie aufrufen darf, nie *ob sie tun, was sie sollen*. | Neue Suite, die den Weg der Kundin fährt: Link öffnen, lesen, mit getipptem Namen annehmen; dazu die Gegenrichtung (kein zweites Mal, keine Unterschrift ohne Annahme, falscher und zu kurzer Token). Fällt ohne die Migration durch — nachgeprüft. |

### Abgearbeitet, dritter Durchgang: `field-app.spec.ts`

Alle sechs Fälle laufen jetzt wirklich — drei liefen vorher nie.

| Befund | Entscheidung |
|---|---|
| „a checklist item can be ticked" suchte `getByRole('checkbox')` und fand **nie** etwas. Die App rendert jeden Punkt als `<button aria-pressed>` mit einem Tippziel über die ganze Zeile. Nachgemessen auf einem Einsatz mit sechs Checklistenpunkten: 0 Treffer, der Fall übersprang sich. | Die App hat recht — für eine Hand im Handschuh ist der große Schalter richtig, ein 20-px-Kästchen wäre falsch. Geprüft wird jetzt über `aria-pressed`, also genau den Zustand, den auch eine Vorleseanwendung liest. |
| Start, Pause und Feierabend sind **zweistufig**: „Einsatz starten" öffnet „Einsatz jetzt starten? … Abbrechen \| Jetzt starten". Die Suite kannte das nicht, tippte den ersten Knopf und erwartete den laufenden Zustand. | Absicht der App (ein Streifer in der Hosentasche darf die Uhr nicht starten). Neuer Helfer `timeAction` bestätigt, wenn nachgefragt wird, und wartet auf das Ende der Buchung statt darauf zu hoffen. |
| Der Doppeltipp-Test tippte zweimal auf **„Einsatz starten"** — den Knopf, der nur die Rückfrage öffnet. Zweimal darauf kann nichts doppelt starten; die Stelle, an der es weh tut, ist „Jetzt starten". | Umgestellt. Nachgemessen: nach dem Doppeltipp auf die Bestätigung steht genau **eine** Zeitbuchung in der Datenbank. |
| `locator.count()` wartet nicht. Auf einer langsamen Maschine fragte der Test vor der Hydration, bekam 0 und übersprang sich mit „not in a startable state" — auf einem Einsatz, der sehr wohl startbar war. | Neuer Helfer `present()` in `fixtures.ts` wartet kurz auf das Erscheinen, bevor er Abwesenheit feststellt. Ein Überspringen aus Versehen kostet mehr als die Sekunden. |

Was dabei **kein** Befund war, und warum das hier steht: ein Lauf blieb 90
Sekunden auf „Wird gestartet …" stehen. Das sah nach einer hängenden
Serveraktion aus. Es war meine eigene Hinterlassenschaft — eine offene
Zeitbuchung aus einem vorherigen Versuch, wegen der `start_my_job` zu Recht
ablehnte. Aus sauberem Zustand läuft der Ablauf in 16 Sekunden durch, und die
Einsatzseite rendert in rund einer Sekunde.

### Offen

Diese Dateien sind noch nicht Fall für Fall gegen die heutige Anwendung
gehalten worden:

`master-data.spec.ts`, `onboarding.spec.ts`,
`portal-and-security.spec.ts`, `roles.spec.ts`, `sales-to-operations.spec.ts`,
`service-acceptance.spec.ts`, `workflows.spec.ts`.

Statisch geprüft sind sie: jedes Formularfeld und fast jede Beschriftung, die
sie ansprechen, existiert in der Anwendung. Was das nicht findet, ist genau
die Klasse von Fehlern, die dieser Durchgang gefunden hat — eine Zusicherung,
die immer zutrifft, und ein Überspringen, das wie ein Erfolg aussieht.

Ein bekanntes Muster dafür ist der Statusfilter: `?status=ISSUED` liefert
nichts, wenn die Liste auf den *angezeigten* Status filtert und eine
ausgestellte Rechnung nach Fälligkeit dort OVERDUE heißt. Zwei Tests
übersprangen sich deshalb stillschweigend auf einem Mandanten, der genau die
gesuchte Rechnung hatte.

Dazu zwei Dinge, die zur Suite gehören und erst mit ihr zurückkommen:

- **Der CI-Job.** `authenticated-e2e` (Wegwerf-Supabase pro Lauf) war
  eingerichtet und lief; er wurde zurückgenommen, weil die Suite nicht besteht
  und main nicht rot stehen soll. Er kommt zusammen mit der Reparatur wieder,
  grün — `git show 3405f6c` enthält ihn vollständig.
- **`tools/check-e2e-coverage.mjs`.** Verlangt, dass jede Spec-Datei über alle
  Projekte zusammen mindestens einen Test wirklich ausgeführt hat. Ohne diesen
  Riegel ist „alles übersprungen“ von „alles bestanden“ nicht zu
  unterscheiden. Ging mit dem Job zurück und kommt mit ihm wieder.
