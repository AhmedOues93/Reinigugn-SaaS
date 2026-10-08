# Betriebshandbuch

Was zu tun ist, bevor echte Kunden auf ReinPlan arbeiten, und was danach
regelmäßig zu tun ist. Jeder Abschnitt nennt den Befehl und das Kriterium,
an dem man erkennt, dass es geklappt hat.

Zwei Sätze vorweg, weil sie den Rest einordnen:

**Grüne CI heißt nicht produktionsbereit.** Die CI prüft die Migrationen
gegen eine leere Datenbank. Production ist keine leere Datenbank. Was dort
fehlt, sagt nur Production selbst — Abschnitt 1.

**Die Werkzeuge unter `supabase/tools/` lesen, sie ändern nichts.** Sie sind
gegen Production gefahrlos. Alles, was schreibt, steht hier als Befehl, den
ein Mensch eingibt, nachdem er den Befund gelesen hat.

---

## 1. Schema und Migrationshistorie abgleichen

Die Ausgangslage: im Repository liegen 118 Migrationen. Welche davon eine
gewachsene Datenbank kennt, weiß nur sie. Zusätzlich sind drei
Versionsnummern doppelt belegt (siehe Abschnitt 1.3), und einzelne
Änderungen wurden mit abweichenden Zeitstempeln eingespielt.

**Niemals blind `supabase db push` gegen diese Datenbank.** Die frühen
Migrationen sind nicht wiederholbar — sie enthalten `create type` und
`create table` ohne `if not exists`. Belegt mit:

```bash
PGHOST=/tmp PGPORT=55432 PGUSER=postgres supabase/tools/upgrade-path.sh replay
```

Der zweite Durchlauf bricht bei `20260911000000` mit
`type "company_role" already exists` ab. Das ist für eine linear einmal
angewandte Historie normal. Es heißt aber: steht eine Version nicht im Buch,
obwohl ihre Wirkung längst da ist, bricht ein Push ab.

### 1.1 Befund erheben

```bash
# Connection String: Supabase-Dashboard -> Settings -> Database ->
# Connection string -> URI. Nicht der Pooler (Port 6543), sondern 5432.
export TARGET="postgresql://postgres:<passwort>@db.<ref>.supabase.co:5432/postgres"

# Was steht im Buch, was nicht?
supabase/tools/migration-ledger.sh "$TARGET"

# Was fehlt tatsächlich im Schema? (Soll-Stand aus der vollen Historie)
supabase/tools/schema-drift.sh check "$TARGET"
```

`schema-drift.sh` vergleicht 2293 Zeilen Bestandsaufnahme: Tabellen,
Spalten samt Typ und `not null`, Enums samt Werten, Funktionen samt
Signatur und `security definer`, Rechte an `anon` und `authenticated`,
RLS-Status, Policies, Trigger, Indizes und Constraints. Der Soll-Stand liegt
in `supabase/tools/expected-schema.txt` und wird in CI gegen die Migrationen
geprüft, damit er nicht veraltet.

### 1.2 Entscheiden, dann handeln

Die beiden Befunde zusammen ergeben für jede Version einen von zwei Fällen:

| Buch | Schema | Was zu tun ist |
|---|---|---|
| fehlt | Wirkung **da** | Nur nachtragen: `npx supabase migration repair --status applied <version>`. **Nicht** einspielen — bricht ab. |
| fehlt | Wirkung **fehlt** | Einspielen. |
| da | Wirkung fehlt | Die Datei wurde übersprungen (doppelte Nummer, Abschnitt 1.3) oder jemand hat das Objekt gelöscht. Inhalt gezielt von Hand anwenden. |

Nach dem Nachtragen und vor dem Einspielen:

```bash
npx supabase link --project-ref <ref>
npx supabase migration list --linked   # muss jetzt zum Repository passen
npx supabase db push --dry-run         # lesen, was angewendet würde
npx supabase db push
supabase/tools/schema-drift.sh check "$TARGET"   # Kriterium: kein Unterschied
```

Dass der Nachtrag von einem älteren Stand aus durchläuft, ist geprüft:

```bash
# Stand vor Migration 22 aufbauen, dann 22 bis 41 nachrüsten
PGHOST=/tmp PGPORT=55432 PGUSER=postgres \
  supabase/tools/upgrade-path.sh tail 20261006000022
```

### 1.3 Die doppelten Versionsnummern

Drei Nummern sind doppelt belegt:

| Version | Dateien |
|---|---|
| `20260921000001` | `phase10_notification_type` + `fix_branding_upload_policy` |
| `20261005000000` | `pending_member_delete` + `phase25_quote_snapshot_details` |
| `20261006000026` | `manual_assignment_capacity` + `public_quote_signature_once` |

Die CLI führt im Buch *Versionen*, und die Version ist der Zahlenteil des
Dateinamens. Steht eine Nummer einmal drin, gilt sie als angewendet — und die
zweite Datei wird übersprungen. Welche von beiden, lässt sich hinterher nicht
mehr ablesen.

`20261006000041_resolve_duplicate_versions.sql` trägt den Inhalt aller sechs
Dateien noch einmal unter einer eindeutigen Nummer. Alle sechs bestehen
ausschließlich aus wiederholbaren Anweisungen, der Rumpf ist Zeichen für
Zeichen derselbe. Nach dieser Migration ist das Paar unabhängig davon
vorhanden, wie die CLI damals mit der Doppelnummer umgegangen ist.

Umbenennen oder zusammenlegen wäre falsch: eine angewendete Migration bekommt
keinen neuen Namen, sonst gilt sie plötzlich als fehlend.

---

## 2. Anmeldung absichern

### 2.1 Der verbindliche Riegel liegt bei Supabase Auth, nicht bei uns

Wer Passwörter durchprobieren will, ruft `/auth/v1/token` direkt auf — mit
dem Publishable Key, den jede Browserseite mitliefert. An unserem Code kommt
er nie vorbei. Eine Bremse in unserer Datenbank kann diesen Endpunkt nicht
schützen; sie sitzt vor unserem eigenen Formular.

**Im Dashboard einzustellen, und das ist ein Launch-Blocker:**

- Authentication → Rate Limits: Sign-in/Sign-up je Stunde und je IP begrenzen.
- Authentication → Attack Protection → CAPTCHA (hCaptcha oder Turnstile)
  einschalten. Das ist die einzige Maßnahme, die automatisiertes Raten
  wirklich stoppt. Der öffentliche Site-Key gehört als `NEXT_PUBLIC_TURNSTILE_SITE_KEY` ins
  Hosting (Build neu auslösen); die Formulare reichen den Token an Supabase Auth weiter.
  Der Secret-Key gehört nur in Supabase Auth, nicht in die Anwendung. Erst die App
  mit Site-Key ausrollen und prüfen, dann CAPTCHA in Supabase einschalten.
  Das betrifft auch Einladungen, Passwort-Reset und Kontoänderungen — solange das CAPTCHA an ist und die App ihn nicht
  mitsendet, schlägt jede Anmeldung fehl, also beides zusammen ausrollen.
- Authentication → Multi-Factor Authentication → TOTP einschalten. Ohne das
  antwortet `mfa.enroll` mit „MFA is not enabled" und `/dashboard/sicherheit`
  zeigt diese Meldung im Formular.

### 2.2 Die Bremse vor dem eigenen Formular

`20261006000035` hatte drei Fehler, jeder einzeln genug, um sie wirkungslos
zu machen: `clear_auth_attempts` war an `anon` vergeben (ein Aufruf vor jedem
Versuch, und der Zähler stand auf null), Grenze und Fenster kamen als
Parameter, und der Schlüssel kam ebenfalls von der Aufruferin.
`20261006000040` dreht alle drei um — Nachweis in
`supabase/test/auth-throttle-hardening.test.sql`, als Angriff geschrieben.

Damit die Bremse pro anmeldender Person statt pro Server-Ausgang zählt,
braucht sie einen Signierschlüssel. Supabase sieht an dieser Stelle unseren
Server, nicht den Browser; die Adresse muss also mitgeschickt werden, und
eine mitgeschickte Adresse ist so viel wert wie ihre Unterschrift.

```bash
# 1. Schlüssel erzeugen (mindestens 32 Zeichen)
openssl rand -hex 32

# 2. In die Datenbank (SQL Editor im Dashboard):
#    update public.auth_throttle_config set signing_secret = '<wert>', updated_at = now() where id;

# 3. Denselben Wert als Server-Umgebungsvariable:
#    THROTTLE_SIGNING_SECRET=<wert>
#    Ohne NEXT_PUBLIC_, damit er nicht in ein Browser-Bundle gerät.
```

Ohne Schlüssel funktioniert die Anwendung weiter: die Datenbank zählt dann
auf einem gemeinsamen Zähler mit weiter Grenze (600 Versuche in zehn
Minuten). Enger als nichts, und niemand wird ausgesperrt — aber es ist der
Rückfall, nicht der Zielzustand.

**Reihenfolge von Migration und Deployment:** sie ist unkritisch, und das ist
Absicht. Passen Signatur und Anwendung nicht zusammen — alte App gegen neue
Datenbank oder umgekehrt —, antwortet PostgREST mit „function not found", die
Anwendung schreibt das ins Log und lässt die Anmeldung durch. Eine kaputte
Bremse darf keine geschlossene Tür sein. Im Fenster zwischen `db push` und
dem App-Deployment bremst also nichts; es sollte kurz sein, und es ist der
zweite Grund, die Rate Limits bei Supabase Auth einzuschalten (Abschnitt
2.1), denn die gelten unabhängig davon.

---

## 3. E-Mail

Siehe `docs/production-email-setup.md` für Domain, SPF, DKIM und DMARC.

**Beim Prüfen gilt: ausschließlich an die eigene Testadresse senden.** Die
Datenbank enthält Kundenadressen; ein Testlauf, der sie anschreibt, ist nicht
zurückzuholen. Praktisch heißt das:

- Vor dem ersten echten Versand im Dashboard unter Authentication → Email
  Templates prüfen, dass die Absenderadresse stimmt.
- Für den Test einen eigenen Betrieb mit der Testadresse als Inhaberin
  anlegen und nur dort auslösen. Keine bestehende Rechnung erneut versenden —
  `record_invoice_delivery` schreibt einen Zustellnachweis, und der gehört
  zur Rechnung.
- Die drei Wege einzeln auslösen: Einladung (`/dashboard/mitarbeiter/neu`),
  Passwort-Reset (`/forgot-password`), Rechnungsversand. Jeder schreibt eine
  Zeile in `mail_events`; das ist das Kriterium, nicht der Posteingang
  allein.

---

## 4. Sicherung und Wiederherstellung

Eine Sicherung, die nie zurückgespielt wurde, ist keine Sicherung.

```bash
# Übung gegen eine lokale Datenbank -- baut die Historie auf, sichert,
# spielt in eine GETRENNTE Datenbank zurück und lässt dort alle
# SQL-Zusicherungen laufen. Kriterium: 29 Suiten grün.
PGHOST=/tmp PGPORT=55432 PGUSER=postgres supabase/tools/backup-restore.sh drill

# Echte Sicherung ziehen (lesend)
supabase/tools/backup-restore.sh dump "$TARGET" /sicher/reinplan-$(date +%F).dump

# Wiederherstellung prüfen -- NIE gegen Production
PGHOST=/tmp PGPORT=55432 PGUSER=postgres \
  supabase/tools/backup-restore.sh verify /sicher/reinplan-2026-10-02.dump
```

**Die Falle, die diese Übung beim ersten Lauf gefunden hat:** mit
`pg_dump --no-privileges` ist die Wiederherstellung unbrauchbar. Die GRANTs
an `anon` und `authenticated` sind nicht Beiwerk, sondern Teil des
Sicherheitsmodells; ohne sie antwortet jede Tabelle mit
`permission denied for table …`. Der Dump läuft darum mit `--no-owner`, aber
**mit** Rechten.

**Was `pg_dump` nicht mitnimmt und was darum eigene Wege braucht:**

- `auth.users` — die Konten selbst. Supabase sichert sie im eigenen Backup;
  ein `pg_dump` des `public`-Schemas enthält sie nicht. Eine
  Wiederherstellung ohne sie ergibt eine Datenbank voller Daten, in die
  niemand hineinkommt.
- Storage — Fotos, Logos, Unterschriften liegen als Objekte hinter einer API,
  nicht in `public`. Eigene Sicherung über die Storage-API oder S3-Zugang.
- Die Supabase-eigenen Schemata (`auth`, `storage`, `realtime`).

Deshalb ist der Ernstfall-Weg **Point-in-Time Recovery** im Supabase-Projekt
(Settings → Database → Backups; im freien Tarif nicht verfügbar — ein
Launch-Blocker, der Geld kostet und nicht Code). Der `pg_dump` ist die
zweite Leitung für die Fachdaten, nicht die erste.

**Regelmäßig:** einmal im Quartal eine Wiederherstellung üben und das
Ergebnis notieren. Eine Sicherung, die ein Jahr nicht zurückgespielt wurde,
ist eine Vermutung.

---

## 5. Nach jedem Deployment: Rauchtest

In dieser Reihenfolge, weil jeder Schritt auf dem vorigen aufbaut. Kriterium
steht dahinter.

| # | Schritt | Kriterium |
|---|---|---|
| 1 | `/admin/login` öffnen, anmelden | Dashboard lädt |
| 2 | Zehn Fehlversuche mit falschem Passwort | Ab dem elften die Bremsenmeldung, nicht „Passwort falsch". Kommt sie nicht: Migration 40 fehlt, oder `THROTTLE_SIGNING_SECRET` fehlt und der gemeinsame Zähler ist noch weit offen |
| 3 | `/dashboard/sicherheit`, App einrichten | QR-Code erscheint, Code wird angenommen |
| 4 | Abmelden, anmelden | Fragt nach dem Code; ohne Code kein Dashboard |
| 5 | `/forgot-password` mit der Testadresse | E-Mail kommt, Link führt zu `/reset-password` |
| 6 | `/dashboard/kunden/import` mit der Vorlage | Zeilen angelegt, zweiter Lauf legt nichts doppelt an |
| 7 | `/dashboard/mitarbeiter/import` | Einladungen angelegt, **keine** E-Mail versendet |
| 8 | `/dashboard/arbeitszeiten/monatsabschluss` | Freigabe sperrt; CSV zweimal exportiert ist zweimal gleich |
| 9 | `/dashboard/abrechnung/monatslauf` | Vorschau legt nichts an; Lauf erzeugt Entwürfe; zweiter Lauf erzeugt nichts |
| 10 | `/dashboard/protokoll` | Die Vorgänge aus 8 und 9 stehen drin, mit Namen |
| 11 | Einladung annehmen (Schritt 7, ein Konto) | Gelingt — prüft `digest()` unter dem Production-`search_path` |
| 12 | Jede Seite bei 320 px Breite | Kein seitliches Scrollen |

Schritt 11 ist kein Selbstzweck: die Einladungsfunktionen aus
`20260913000000` rufen `digest()` unqualifiziert bei `search_path = public`
auf. Lokal liegt pgcrypto in `public`, in Supabase in `extensions`. Wenn
Einladungen in Production funktionieren, ist der Punkt erledigt; wenn nicht,
ist das die Ursache.

---

## 6. Bekannte Grenzen im Verhalten

- **Portalkundin bei zwei Betrieben.** `company_members` ist nur je Betrieb
  eindeutig, eine Hausverwaltung kann also bei zwei ReinPlan-Betrieben Kundin
  sein. Das Portal zeigt dann die **ältere** Beziehung, und nur die; wechseln
  lässt sich nicht. Bis `20261006000042` war nicht einmal festgelegt, welche
  der beiden gezeigt wird — `limit 1` ohne `order by` durfte jede liefern, von
  Aufruf zu Aufruf verschieden. Jetzt ist die Wahl zugesichert. Eine
  Betriebsauswahl im Portal wäre eine neue Funktion und ist nicht gebaut.

## 7. Offen und ausdrücklich nicht erledigt

- **Point-in-Time Recovery** im Supabase-Projekt (kostenpflichtiger Tarif).
- **Fehler-Tracking** (Sentry o. ä.). Siehe `docs/production-readiness.md`.
- **Rechtstexte**: `/impressum`, `/datenschutz`, `/agb` enthalten
  Platzhalter. Die Felder sind gesetzlich vorgeschrieben und dürfen nicht
  erfunden werden; der Betreiber trägt seine eigenen Angaben ein. Die Seiten
  sind als „in Arbeit" gekennzeichnet, solange das nicht geschehen ist.
- **Auftragsverarbeitungsverträge** mit Supabase und dem Mail-Anbieter.


## Produktionskorrektur: Rechnungsstammdaten und Provider-Ereignisse

`production_invoice_and_mail_guards` ist eine gezielte, wiederholbare Migration.
Sie braucht keinen vollständigen `db push` der historischen Migrationen.

- `record_mail_event` ist nur für `service_role` aufrufbar. Der Resend-Webhook
  verwendet diesen serverseitigen Schlüssel bereits und prüft die Signatur zuerst.
- Neue Rechnungsausstellungen verlangen vollständige Verkäufer- und
  Käuferadresse sowie Steuernummer oder USt-IdNr. Geprüft werden die Snapshots
  des ausgestellten Dokuments. Die Ablehnung lässt den Entwurf bestehen und
  verbraucht keine Rechnungsnummer. Bestehende ausgestellte Rechnungen bleiben
  bezahlbar und stornierbar, auch wenn heutige Stammdaten unvollständig sind.
- Das Formular nennt fehlende Stammdaten und die Stelle, an der sie ergänzt werden.

Die SQL-Suite `production-guards.test.sql` prüft verweigerte Aufrufe als
`authenticated`, erfolgreichen und wiederholten Webhook als `service_role`,
fehlende Adressen/Steuerkennung, den direkten SQL-Schreibweg, Nummern ohne
Lücke und Zahlung nach späterer Stammdatenänderung.

CAPTCHA und `THROTTLE_SIGNING_SECRET` benötigen weiterhin echte
Hosting-/Supabase-Konfiguration. Ohne Site-Key bleibt CAPTCHA aus; ohne
Signierschlüssel bleibt der dokumentierte gemeinsame Throttle-Fallback aktiv.
Die App allein kann den direkten Auth-Endpunkt nicht absichern.
