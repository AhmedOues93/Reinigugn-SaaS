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

### Offen

Diese Dateien sind noch nicht gegen die heutige Anwendung gehalten worden.
Sie laufen, aber es ist nicht geprüft, ob jeder Fall das misst, was sein Name
behauptet:

`field-app.spec.ts`, `master-data.spec.ts`, `office.spec.ts`,
`onboarding.spec.ts`, `portal-and-security.spec.ts`, `roles.spec.ts`,
`sales-to-operations.spec.ts`, `service-acceptance.spec.ts`,
`workflows.spec.ts`.

Dazu zwei Dinge, die zur Suite gehören und erst mit ihr zurückkommen:

- **Der CI-Job.** `authenticated-e2e` (Wegwerf-Supabase pro Lauf) war
  eingerichtet und lief; er wurde zurückgenommen, weil die Suite nicht besteht
  und main nicht rot stehen soll. Er kommt zusammen mit der Reparatur wieder,
  grün — `git show 3405f6c` enthält ihn vollständig.
- **`tools/check-e2e-coverage.mjs`.** Verlangt, dass jede Spec-Datei über alle
  Projekte zusammen mindestens einen Test wirklich ausgeführt hat. Ohne diesen
  Riegel ist „alles übersprungen“ von „alles bestanden“ nicht zu
  unterscheiden. Ging mit dem Job zurück und kommt mit ihm wieder.
