import { requireStaffCompany } from '@/lib/auth';
import { csvTemplateResponse } from '@/lib/import/template';

export async function GET() {
  await requireStaffCompany();
  return csvTemplateResponse(
    'ReinPlan-Kunden-Objekte-Vorlage.csv',
    [
      'Kunde', 'Kundennummer', 'E-Mail', 'Telefon', 'Rechnungsadresse', 'PLZ', 'Ort',
      'DATEV-Debitorenkonto', 'Objekt', 'Objektnummer', 'Objektstra\u00dfe', 'Objekt-PLZ', 'Objekt-Ort',
    ],
    [
      'Beispiel GmbH', '', 'rechnung@beispiel.de', '', 'Musterstr. 1', '60311', 'Frankfurt am Main',
      '', 'B\u00fcro Zentrale', '', 'Musterstr. 1', '60311', 'Frankfurt am Main',
    ],
  );
}
