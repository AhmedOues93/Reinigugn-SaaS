import { requireStaffCompany } from '@/lib/auth';
import { csvTemplateResponse } from '@/lib/import/template';

export async function GET() {
  await requireStaffCompany();
  return csvTemplateResponse(
    'ReinPlan-Mitarbeiter-Vorlage.csv',
    [
      'Vorname', 'Nachname', 'E-Mail', 'Telefon', 'Personalnummer',
      'Wochenstunden', 'Lohngruppe', 'Stundenlohn', 'Eintritt', 'Beschäftigung', 'Notizen',
    ],
    [
      'Anna', 'Beispiel', 'anna.beispiel@example.de', '', 'MA-001',
      '30', 'RG 2', '14,50', '01.03.2026', 'Teilzeit', '',
    ],
  );
}
