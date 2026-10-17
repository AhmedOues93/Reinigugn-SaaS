import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'Datenschutzerklärung – ReinPlan' };

/**
 * Die Datenschutzerklärung muss die tatsächliche Verarbeitung beschreiben
 * (Hosting, Auth, Speicher, E-Mail-Versand) und gehört rechtlich geprüft.
 * Die Abschnitte nennen die Punkte, die abgedeckt sein müssen.
 */
export default function DatenschutzPage() {
  return (
    <LegalPage
      title="Datenschutzerklärung"
      intro="Informationen zur Verarbeitung personenbezogener Daten nach Art. 13 und 14 DSGVO."
      pending
    >
      <LegalSection heading="Verantwortlicher">
        <p>Name und Kontaktdaten des Verantwortlichen sowie gegebenenfalls des Datenschutzbeauftragten: noch zu ergänzen.</p>
      </LegalSection>

      <LegalSection heading="Verarbeitete Daten und Zwecke">
        <p>
          Beim Betrieb der Anwendung werden Bestands- und Nutzungsdaten verarbeitet, unter anderem Konto- und
          Kontaktdaten, Auftrags- und Objektdaten, Arbeitszeiten sowie Rechnungsdaten. Die konkreten Zwecke und
          Rechtsgrundlagen sind zu ergänzen.
        </p>
      </LegalSection>

      <LegalSection heading="Auftragsverarbeiter und Hosting">
        <p>
          Welche Dienste diese Anwendung technisch anspricht, steht fest und ist hier benannt. Was
          offen bleibt, sind die Angaben, die nur der Betreiber machen kann: der tatsächlich
          gewählte Anbieter, der Verarbeitungsort, die Vertragsgrundlage und die Grundlage
          etwaiger Drittlandübermittlungen. Sie dürfen nicht erfunden werden.
        </p>
        <ul className="list-disc space-y-1 ps-5">
          <li>
            <strong className="text-foreground">Supabase</strong> — Datenbank, Authentifizierung
            und Dateispeicher (Fotos, Logos, Unterschriften). Verarbeitungsort und Vertrag: —
          </li>
          <li>
            <strong className="text-foreground">Hosting der Anwendung</strong> — Auslieferung der
            Seiten und serverseitige Verarbeitung. Anbieter, Verarbeitungsort und Vertrag: —
          </li>
          <li>
            <strong className="text-foreground">E-Mail-Versand</strong> — Einladungen,
            Passwort-Links, Rechnungs- und Abnahme-E-Mails. Anbieter, Verarbeitungsort und
            Vertrag: —
          </li>
        </ul>
        <p>
          Ein Auftragsverarbeitungsvertrag nach Art. 28 DSGVO ist mit jedem dieser Anbieter
          erforderlich.
        </p>
      </LegalSection>

      <LegalSection heading="Speicherdauer">
        <p>
          Aufbewahrungsfristen ergeben sich unter anderem aus handels- und steuerrechtlichen Pflichten sowie aus
          Nachweispflichten zur Arbeitszeit. Die Fristen sind konkret anzugeben.
        </p>
      </LegalSection>

      <LegalSection heading="Ihre Rechte">
        <p>
          Betroffene haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung,
          Datenübertragbarkeit und Widerspruch sowie ein Beschwerderecht bei einer Aufsichtsbehörde. Kontaktweg und
          zuständige Aufsichtsbehörde sind zu ergänzen.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
