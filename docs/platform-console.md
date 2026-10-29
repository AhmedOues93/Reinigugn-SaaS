# Plattform-Konsole und Zugangssperre

ReinPlan hat vier Ebenen:

| Ebene | Wer | Wo |
| --- | --- | --- |
| Plattform | Betreiber von ReinPlan | `/platform` |
| Büro | `OWNER`, `OFFICE` eines Betriebs | `/dashboard` |
| Team | `EMPLOYEE` | `/mitarbeiter` |
| Kundenportal | `CUSTOMER` | `/portal` |

Die Plattform-Konsole zeigt alle Betriebe mit Abo-Status, Test, Inhaberin,
Mitarbeitenden und Kunden, dazu den Monatsumsatz aus aktiven Abos. Dort
verlängert der Betreiber einen Test, schenkt freien Zugang, sperrt einen
Betrieb oder schaltet die Zugangssperre ein. Jede Änderung landet
unveränderlich im Protokoll (`platform_admin_actions`).

Was die Konsole **nicht** macht: Preise ändern und Zahlungen anzeigen. Das
bleibt in Stripe (Dashboard → Produkte, Zahlungen, Kunden). Jeder Betrieb mit
Stripe-Kunde hat in der Konsole einen direkten Link dorthin.

Die Konsole sieht keine Betriebsdaten (Kunden, Objekte, Rechnungen der
Betriebe), nur Namen, Inhaber-E-Mail und Anzahlen.

## Betreiber freischalten

Betreiber werden nur per SQL angelegt, nie über die App. Im Supabase-Dashboard
(SQL Editor), nachdem das eigene Konto registriert ist:

```sql
insert into public.platform_admins (auth_user_id, note)
select id, 'Inhaber ReinPlan' from auth.users where email = '<deine-email>';
```

Danach `/platform` öffnen (nach Login über `/admin/login`). Für alle anderen
Konten liefert die Seite 404. Empfohlen: Zwei-Faktor für dieses Konto
einrichten.

Entfernen:

```sql
delete from public.platform_admins
where auth_user_id = (select id from auth.users where email = '<email>');
```

## Die Zugangsregel

Eine Funktion entscheidet überall: `public.company_has_access(company_id)`.

1. Gesperrt (`suspended_at`) → kein Zugang. Gilt immer.
2. Zugangssperre aus → Zugang (Pilotbetrieb wie bisher).
3. Freier Zugang bis in die Zukunft → Zugang.
4. Test läuft (`trial_ends_at` in der Zukunft) → Zugang.
5. Abo `ACTIVE` oder `PAST_DUE` → Zugang. `PAST_DUE` arbeitet weiter, solange
   Stripe die Zahlung noch versucht.
6. Sonst kein Zugang.

Die Sperre ist nach dem Einspielen der Migration **aus**. Bestehende Betriebe
verlieren nichts. Die Konsole zeigt vor dem Einschalten, wie viele Betriebe
sofort gesperrt würden.

## Was ohne Zugang passiert

**App:** `getCurrentCompany()` prüft den Zugang einmal pro Anfrage. Ohne Zugang
geht es auf `/zugang-pausiert` mit einem Satz für die jeweilige Rolle. Offen
bleiben für Büro-Rollen nur `/dashboard/abo`, `/dashboard/sicherheit` und die
Export-Downloads (DATEV, Buchhaltung, Arbeitszeiten, Rechnungs-PDF/XRechnung).
Checkout, Stripe-Portal und Webhooks laufen ohne Mitgliedschaftsprüfung und
bleiben erreichbar.

Schlägt die Abfrage fehl (etwa wenn die Migration fehlt), bleibt der Zugang
offen und `reinplan.access_check_failed` steht im Log.

**Datenbank:** Auf jeder Betriebstabelle mit `company_id` liegen restriktive
Regeln `access_required_insert/update/delete`. Ohne Zugang ist Lesen
(und damit Export) erlaubt, Schreiben nicht, auch nicht an der App vorbei.
Ausnahmen: Mitgliedschaften, Einladungen, Abo, Protokolle, Zähler und
Benachrichtigungen. Security-definer-Funktionen umgehen RLS; diese Wege deckt
die App-Sperre ab.

Neue Betriebstabellen bekommen die Regel **nicht** automatisch. Bei neuen
Tabellen mit `company_id` die drei Regeln in der Migration mit anlegen.

## Reihenfolge für den Start

1. Migration `20261029000000` einspielen und sich als Betreiber eintragen.
2. Pilotbetrieben in der Konsole freien Zugang geben (mit Notiz).
3. Stripe einrichten (siehe `docs/stripe-billing.md`), im Testmodus prüfen,
   dann `REINPLAN_BILLING_ENABLED=true`.
4. In der Konsole prüfen, wen die Sperre träfe, dann einschalten.

Optional: `REINPLAN_SUPPORT_EMAIL` setzen, dann zeigt die Hinweisseite
gesperrten Betrieben einen Kontakt-Button.
