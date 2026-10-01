import { requireStaffCompany } from '@/lib/auth';
import { csvTemplateResponse } from '@/lib/import/template';

export async function GET() {
  await requireStaffCompany();
  return csvTemplateResponse(
    'ReinPlan-Objekte-Vorlage.csv',
    [
      'Kunde', 'Kundennummer', 'Objekt', 'Objektnummer', 'Straße', 'PLZ', 'Ort',
      'Fläche', 'Ansprechpartner', 'Kontakt-Telefon', 'Zugang', 'Notizen',
    ],
    [
      'Beispiel GmbH', '', 'Treppenhaus Haus B', '', 'Musterstr. 1', '60311', 'Frankfurt am Main',
      '420,5', 'Frau Meier', '', 'Schlüssel im Büro', '',
    ],
  );
}
