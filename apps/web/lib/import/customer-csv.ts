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

function clean(value: string | undefined) {
  const result = value?.trim() ?? '';
  return result || null;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[ä]/g, 'ae')
    .replace(/[ö]/g, 'oe')
    .replace(/[ü]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseLine(line: string, delimiter: string) {
  const values: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function detectDelimiter(header: string) {
  const semicolon = (header.match(/;/g) ?? []).length;
  const comma = (header.match(/,/g) ?? []).length;
  return semicolon >= comma ? ';' : ',';
}

const aliases: Record<string, string[]> = {
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
};

function findIndex(headers: string[], key: keyof typeof aliases) {
  const accepted = new Set(aliases[key]);
  return headers.findIndex((header) => accepted.has(header));
}

export function parseCustomerImportCsv(input: string): CustomerImportRow[] {
  const normalized = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.trim());
  if (lines.length < 2) throw new Error('Die CSV-Datei enthält keine Datenzeilen.');

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseLine(lines[0], delimiter).map(normalizeHeader);
  const indexes = Object.fromEntries(
    (Object.keys(aliases) as (keyof typeof aliases)[]).map((key) => [key, findIndex(headers, key)]),
  ) as Record<keyof typeof aliases, number>;

  if (indexes.customerName < 0) {
    throw new Error('Die CSV-Datei braucht eine Spalte "Kunde" oder "Kundenname".');
  }

  return lines.slice(1).map((line, rowIndex) => {
    const values = parseLine(line, delimiter);
    const value = (key: keyof typeof aliases) => indexes[key] >= 0 ? clean(values[indexes[key]]) : null;
    const customerName = value('customerName');
    if (!customerName) throw new Error(`Zeile ${rowIndex + 2}: Kundenname fehlt.`);

    const debtor = value('datevDebtorAccount');
    if (debtor && !/^\d{4,11}$/.test(debtor)) {
      throw new Error(`Zeile ${rowIndex + 2}: DATEV-Debitorenkonto ist ungültig.`);
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
