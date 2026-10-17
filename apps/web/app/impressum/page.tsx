import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/marketing/legal-page';

export const metadata: Metadata = { title: 'Impressum – ReinPlan' };

/**
 * Angaben nach § 5 DDG (vormals § 5 TMG). Die Felder sind bewusst leer
 * gelassen: sie sind gesetzlich vorgeschrieben und dürfen nicht erfunden
 * werden. Der Betreiber trägt hier seine eigenen Daten ein.
 */
export default function ImpressumPage() {
  return (
    <LegalPage title="Impressum" intro="Angaben gemäß § 5 DDG." pending>
      <LegalSection heading="Anbieter">
        <p>
          Firmenname, Rechtsform
          <br />
          Straße und Hausnummer
          <br />
          PLZ und Ort
        </p>
      </LegalSection>

      <LegalSection heading="Vertreten durch">
        <p>Name der vertretungsberechtigten Person</p>
      </LegalSection>

      <LegalSection heading="Kontakt">
        <p>
          Telefon: —
          <br />
          E-Mail: —
        </p>
      </LegalSection>

      <LegalSection heading="Registereintrag">
        <p>
          Registergericht: —
          <br />
          Registernummer: —
        </p>
      </LegalSection>

      <LegalSection heading="Umsatzsteuer-Identifikationsnummer">
        <p>USt-IdNr. gemäß § 27 a UStG: —</p>
      </LegalSection>

      <LegalSection heading="Verbraucherstreitbeilegung">
        <p>
          Hinweis nach § 36 VSBG zur Teilnahme oder Nichtteilnahme an einem Streitbeilegungsverfahren vor einer
          Verbraucherschlichtungsstelle: noch zu ergänzen.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
