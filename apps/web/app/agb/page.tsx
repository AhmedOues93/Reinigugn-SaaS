import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'AGB – ReinPlan' };

/**
 * Die Nutzungsbedingungen für die Software selbst — nicht zu verwechseln mit
 * den Muster-AGB, die dem Angebots-PDF beiliegen und die Reinigungsleistung
 * des Kunden betreffen (siehe `lib/sales/quote-pdf.ts`). Beide sind
 * Platzhalter und beide müssen vor Produktivbetrieb ersetzt werden.
 */
export default function AgbPage() {
  return (
    <LegalPage
      title="Allgemeine Geschäftsbedingungen"
      intro="Bedingungen für die Nutzung der Software ReinPlan."
      pending
    >
      <LegalSection heading="1. Geltungsbereich">
        <p>Diese Bedingungen regeln die Nutzung der Software durch den Kunden. Der verbindliche Text ist zu ergänzen.</p>
      </LegalSection>

      <LegalSection heading="2. Vertragsgegenstand">
        <p>Überlassung der Software zur Nutzung über das Internet für die Dauer des Vertrags.</p>
      </LegalSection>

      <LegalSection heading="3. Vergütung und Zahlung">
        <p>Höhe der Vergütung, Abrechnungszeitraum und Zahlungsziel sind festzulegen.</p>
      </LegalSection>

      <LegalSection heading="4. Laufzeit und Kündigung">
        <p>Laufzeit, Kündigungsfristen und Form der Kündigung sind festzulegen.</p>
      </LegalSection>

      <LegalSection heading="5. Verfügbarkeit">
        <p>Zugesagte Verfügbarkeit, Wartungsfenster und Reaktionszeiten sind festzulegen.</p>
      </LegalSection>

      <LegalSection heading="6. Datenschutz und Auftragsverarbeitung">
        <p>Es ist ein Vertrag zur Auftragsverarbeitung nach Art. 28 DSGVO zu schließen.</p>
      </LegalSection>

      <LegalSection heading="7. Haftung und Schlussbestimmungen">
        <p>Haftungsregelungen, Rechtswahl und Gerichtsstand sind vor Produktivbetrieb rechtlich zu prüfen.</p>
      </LegalSection>
    </LegalPage>
  );
}
