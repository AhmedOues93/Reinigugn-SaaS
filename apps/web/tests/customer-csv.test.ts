import { describe, expect, it } from 'vitest';
import { parseCustomerImportCsv } from '@/lib/import/customer-csv';

describe('customer CSV import', () => {
  it('parses German semicolon CSV with customer and object data', () => {
    const rows = parseCustomerImportCsv(
      'Kunde;Kundennummer;E-Mail;Objekt;Objektstrasse;Objekt-PLZ;Objekt-Ort\n' +
      '"Mainblick Büro GmbH";K-0042;rechnung@example.de;"Mainblick 3. OG";"Mainzer Landstr. 120";60327;Frankfurt\n',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      customerName: 'Mainblick Büro GmbH',
      customerNumber: 'K-0042',
      objectName: 'Mainblick 3. OG',
      objectPostalCode: '60327',
    });
  });

  it('parses quoted commas when comma is the delimiter', () => {
    const rows = parseCustomerImportCsv(
      'Kunde,Ort,Objekt\n"Firma, Nord",Hamburg,"Büro, EG"\n',
    );
    expect(rows[0].customerName).toBe('Firma, Nord');
    expect(rows[0].objectName).toBe('Büro, EG');
  });

  it('rejects invalid DATEV debtor accounts', () => {
    expect(() => parseCustomerImportCsv(
      'Kunde;DATEV-Debitorenkonto\nKunde GmbH;ABC\n',
    )).toThrow(/Debitorenkonto/);
  });
});
