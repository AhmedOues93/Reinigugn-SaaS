# Push-Benachrichtigungen (noch nicht eingerichtet)

**Stand: nicht implementiert.** Dieses Dokument hält fest, was dafür von außen
gesetzt werden muss, damit niemand danach sucht und damit die Entscheidung
nachvollziehbar bleibt.

## Was heute schon funktioniert

In-App-Benachrichtigungen sind vollständig: `public.in_app_notifications` mit
acht Typen (Urlaub beantragt/genehmigt/abgelehnt, Krankmeldung, Zuweisung
geändert, Vertretung gesetzt, Reklamation angelegt/aktualisiert, Einsatz
zugewiesen, Einsatz beginnt bald, Einsatz überfällig, Nachricht erhalten). Sie
erscheinen, sobald jemand die App öffnet.

Genau das ist die Lücke: eine Reinigungskraft erfährt von einem kurzfristig
geänderten Einsatz erst, wenn sie nachsieht.

## Was fehlt

Drei Dinge, keines davon im Code vorhanden:

1. **Ein VAPID-Schlüsselpaar.** Einmalig erzeugt, nicht rotierbar ohne alle
   Abonnements zu verlieren:
   ```bash
   npx web-push generate-vapid-keys
   ```

2. **Drei Umgebungsvariablen** beim Hoster:

   | Variable | Inhalt | Sichtbarkeit |
   |---|---|---|
   | `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | öffentlicher Schlüssel | im Browser, bewusst öffentlich |
   | `VAPID_PRIVATE_KEY` | privater Schlüssel | **nur serverseitig** |
   | `VAPID_SUBJECT` | `mailto:` des Betreibers, von den Push-Diensten verlangt | serverseitig |

   Der private Schlüssel darf nie mit `NEXT_PUBLIC_` beginnen — Next.js backt
   jede so benannte Variable in das Browser-Bundle.

3. **Eine Tabelle für Abonnements** samt RLS: Endpunkt, Schlüssel, Gerät, und
   die Mitgliedschaft, zu der es gehört. Ein Abonnement gehört zu einem Gerät,
   nicht zu einem Konto — dieselbe Person hat Telefon und Tablet, und ein
   abgemeldetes Gerät muss sein Abonnement verlieren, sonst bekommt der nächste
   Benutzer desselben Telefons fremde Benachrichtigungen.

## Worauf dabei zu achten ist

- **iOS** liefert Web-Push erst ab iOS 16.4 und **nur**, wenn die App über
  „Zum Home-Bildschirm" installiert wurde. Im Safari-Tab gibt es keine
  Benachrichtigung. Die Mitarbeiter-App ist bereits installierbar
  (`/mitarbeiter/manifest.webmanifest`, eigenes Icon), die Voraussetzung ist
  also erfüllt — die Installation muss aber im Onboarding erklärt werden.
- **Ein abgelaufenes Abonnement** antwortet mit 404 oder 410. Es muss dann
  gelöscht werden, sonst wächst die Tabelle mit Karteileichen und jeder Versand
  wartet auf Zustellungen, die nie gelingen.
- **Der Dienstweg ist nicht garantiert.** Push ist eine Bequemlichkeit, keine
  Zustellung. Was rechtlich oder betrieblich ankommen muss (eine geänderte
  Zuweisung, eine Krankmeldung), braucht weiterhin den Weg über die App und
  gegebenenfalls E-Mail.
- **Keine Inhalte in die Benachrichtigung.** Sie erscheint auf einem
  gesperrten Bildschirm, den auch andere sehen. „Neuer Einsatz morgen" ist in
  Ordnung, der Name der Kundin nicht.

## Warum es noch nicht gebaut ist

Ohne Schlüsselpaar lässt sich nichts davon testen, und ein Push-Versand, der nie
gegen einen echten Push-Dienst gelaufen ist, ist eine Behauptung. Sobald die
drei Variablen gesetzt sind, ist der Rest überschaubar: Tabelle, Abonnement im
Service Worker (`public/employee-sw.js` existiert bereits), und ein Versand an
den Stellen, die heute schon `in_app_notifications` schreiben.
