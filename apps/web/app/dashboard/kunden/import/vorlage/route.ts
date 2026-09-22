import { requireStaffCompany } from '@/lib/auth';

export async function GET() {
  await requireStaffCompany();
  const header = [
    'Kunde',
    'Kundennummer',
    'E-Mail',
    'Telefon',
    'Rechnungsadresse',
    'PLZ',
    'Ort',
    'DATEV-Debitorenkonto',
    'Objekt',
    'Objektnummer',
    'Objektstrasse',
    'Objekt-PLZ',
    'Objekt-Ort',
  ].join(';');

  const example = [
    'Beispiel GmbH',
    '',
    'rechnung@beispiel.de',
    '',
    'Musterstr. 1',
    '60311',
    'Frankfurt am Main',
    '',
    'Büro Zentrale',
    '',
    'Musterstr. 1',
    '60311',
    'Frankfurt am Main',
  ].map((value) => `"${value.replaceAll('"', '""')}"`).join(';');

  return new Response('\uFEFF' + header + '\r\n' + example + '\r\n', {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ReinPlan-Kunden-Objekte-Vorlage.csv"',
      'Cache-Control': 'private, no-store',
    },
  });
}
