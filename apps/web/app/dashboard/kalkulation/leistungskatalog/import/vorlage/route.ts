import { requireStaffCompany } from '@/lib/auth';
import { csvTemplateResponse } from '@/lib/import/template';

export async function GET() {
  await requireStaffCompany();
  return csvTemplateResponse(
    'ReinPlan-Leistungskatalog-Vorlage.csv',
    ['Leistung', 'Kategorie', 'Einheit', 'Leistung pro Stunde', 'Minuten pro Einheit', 'Material', 'Materialbasis', 'Beschreibung'],
    ['Unterhaltsreinigung Büro', 'Unterhaltsreinigung', 'qm', '250', '', '0,80', 'pro Einsatz', ''],
  );
}
