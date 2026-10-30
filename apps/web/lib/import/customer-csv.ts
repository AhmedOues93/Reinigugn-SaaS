import { clean, columnMap, parseCsvTable } from '@/lib/import/csv';

export type CustomerImportRow = {
  customerName: string;
  customerNumber: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: string | null;
  postalCode: string | null;
  city: string | null;
  datevDebtorAccount: string | null;
  objectName: string | null;
  objectNumber: string | null;
  objectStreet: string | null;
  objectPostalCode: string | null;
  objectCity: string | null;
};

const aliases = {
  customerName: ['kunde', 'kundenname', 'name', 'customer', 'customer_name'],
  customerNumber: ['kundennummer', 'kunden_nr', 'customer_number'],
  email: ['email', 'e_mail'],
  phone: ['telefon', 'phone'],
  billingAddress: ['rechnungsadresse', 'adresse', 'billing_address'],
  postalCode: ['plz', 'postleitzahl', 'postal_code'],
  city: ['ort', 'stadt', 'city'],
  datevDebtorAccount: ['datev_debitorenkonto', 'debitorenkonto', 'datev_debtor_account'],
  objectName: ['objekt', 'objektname', 'object', 'object_name'],
  objectNumber: ['objektnummer', 'objekt_nr', 'object_number'],
  objectStreet: ['objektstrasse', 'objekt_strasse', 'object_street'],
  objectPostalCode: ['objekt_plz', 'object_postal_code'],
  objectCity: ['objekt_ort', 'object_city'],
} as const satisfies Record<keyof CustomerImportRow, readonly string[]>;

export function parseCustomerImportCsv(input: string): CustomerImportRow[] {
  const table = parseCsvTable(input);
  const indexes = columnMap(table.headers, aliases);

  if (indexes.customerName < 0) {
    throw new Error('Die CSV-Datei braucht eine Spalte "Kunde" oder "Kundenname".');
  }

  return table.rows.map((values, rowIndex) => {
    const line = table.lineNumber(rowIndex);
    const value = (key: keyof CustomerImportRow) =>
      indexes[key] >= 0 ? clean(values[indexes[key]]) : null;
    const customerName = value('customerName');
    if (!customerName) throw new Error(`Zeile ${line}: Kundenname fehlt.`);

    const debtor = value('datevDebtorAccount');
    if (debtor && !/^\d{4,11}$/.test(debtor)) {
      throw new Error(`Zeile ${line}: DATEV-Debitorenkonto ist ungültig.`);
    }

    return {
      customerName,
      customerNumber: value('customerNumber'),
      email: value('email'),
      phone: value('phone'),
      billingAddress: value('billingAddress'),
      postalCode: value('postalCode'),
      city: value('city'),
      datevDebtorAccount: debtor,
      objectName: value('objectName'),
      objectNumber: value('objectNumber'),
      objectStreet: value('objectStreet'),
      objectPostalCode: value('objectPostalCode'),
      objectCity: value('objectCity'),
    };
  });
}
