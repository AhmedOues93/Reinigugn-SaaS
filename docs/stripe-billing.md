# ReinPlan Stripe Billing

ReinPlan verkauft drei monatliche Tarife. Der Zugang beginnt bei jeder neuen
Firma mit 30 Tagen kostenlos. Die Datenbank setzt diesen Testzeitraum selbst;
der Browser kann ihn nicht verlaengern.

| Tarif | Monatlich | Mitarbeitende |
| --- | ---: | ---: |
| Start | 69 EUR | 5 |
| Betrieb | 119 EUR | 25 |
| Unternehmen | 199 EUR | 75 |

## Einmal einrichten

1. In Stripe drei wiederkehrende monatliche EUR-Preise anlegen und die Price
   IDs als `STRIPE_PRICE_START`, `STRIPE_PRICE_BETRIEB` und
   `STRIPE_PRICE_UNTERNEHMEN` in der Hosting-Umgebung setzen.
2. `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` und
   `SUPABASE_SERVICE_ROLE_KEY` nur serverseitig setzen. Keiner dieser Werte
   darf mit `NEXT_PUBLIC_` beginnen.
3. Im Stripe Customer Portal Zahlungsmethode, Rechnungen und Kuendigung
   aktivieren.
4. Einen Stripe-Webhook auf
   `https://<deine-domain>/api/webhooks/stripe` anlegen und mindestens diese
   Events senden:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Die Supabase-Migration aus `supabase/migrations/` vor dem Deployment
   ausfuehren.

Der Checkout speichert die Zahlungsmethode sofort, berechnet aber erst zum
Ende des bereits laufenden 30-Tage-Tests. Stripe-Webhooks sind signiert und
idempotent: ein mehrfach zugestelltes Event aendert den Abo-Status nur einmal.

Der aktuelle Rollout bleibt im Pilotmodus: `REINPLAN_BILLING_ENABLED=false`
(Standard). Checkout und Portal melden 503, die Abo-Seite erklärt den Pilotzugang.
Es gibt noch keine produktweite Sperre nach Testende. Layouts sind keine
Autorisierungsgrenze: eine spätere Sperre muss auch Server Actions, API und direkte
Datenbankzugriffe abdecken und den Zugriff auf Zahlung/Konto/Exports erhalten.
Diese Aktivierung erfolgt erst nach einem vollständigen Pilotworkflow.

Die bereits live angewandte Basismigration ist `20261005091015`; die ältere lokale
Version `20261005084215` darf nicht erneut angewandt werden. Die Folgemigration
`20261006065733` ergänzt atomare Webhook-Verarbeitung und Checkout-Reservierungen.
Wiederholte Checkout-Anfragen desselben Tarifs verwenden eine gemeinsame Stripe
Idempotency-Key und feste Parameter. Ein anderer Tarif ist während der offenen
Checkout-Reservierung (60 Minuten) gesperrt. Stripe-Events werden mit Abo-Status
in einer Transaktion gespeichert; alte Event-Zeitstempel überschreiben keinen
neueren Status. Der gekaufte Tarif folgt der Price-ID, nicht der Metadaten-Angabe.

Stripe verlangt für Checkout ein Trial-Ende mindestens 48 Stunden in der Zukunft.
In den letzten 48 Stunden wartet die Tarifwahl deshalb bis zum Testende. Es wird
weder vorzeitig belastet noch der Test verlängert.

Vor Freischaltung in Stripe-Testmodus prüfen: erster Checkout, wiederholter
Checkout, Zahlung nach Testende, Kündigung zum Periodenende, fehlgeschlagene Zahlung,
Webhook-Retry und Rückkehr ohne erfolgreichen Checkout. Im Customer Portal zunächst
nur Zahlungen/Rechnungen/Kündigung aktivieren; Tarifwechsel bleiben aus, bis
Mitarbeiterlimits für Upgrades und Downgrades Ende-zu-Ende geprüft wurden.

Eine echte Stripe-Zahlung und ein vollständiger Pilotworkflow sind noch nicht
verifiziert. Die UI-Tarife sind 69/119/199 EUR netto monatlich (5/25/75 Mitarbeitende).
Die drei Stripe-Preise müssen dieselben Beträge, EUR, Monat und Steuerbehandlung
verwenden. Betriebsdaten-Rechnungen bleiben von ReinPlan-Aborechnungen getrennt.
