import { clean, columnMap, parseCsvTable, parseGermanNumber } from '@/lib/import/csv';

export type ObjectImportRow = {
  customerName: string | null;
  customerNumber: string | null;
  objectName: string;
  objectNumber: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  areaSqm: number | null;
  contactPerson: string | null;
  contactPhone: string | null;
  accessInstructions: string | null;
  notes: string | null;
};

const aliases = {
  customerName: ['kunde', 'kundenname', 'customer', 'customer_name'],
  customerNumber: ['kundennummer', 'kunden_nr', 'customer_number'],
  objectName: ['objekt', 'objektname', 'name', 'object', 'object_name'],
  objectNumber: ['objektnummer', 'objekt_nr', 'object_number'],
  street: ['strasse', 'objektstrasse', 'adresse', 'street'],
  postalCode: ['plz', 'objekt_plz', 'postleitzahl', 'postal_code'],
  city: ['ort', 'objekt_ort', 'stadt', 'city'],
  areaSqm: ['flaeche', 'qm', 'quadratmeter', 'area', 'area_sqm'],
  contactPerson: ['ansprechpartner', 'kontakt', 'contact_person'],
  contactPhone: ['kontakt_telefon', 'telefon', 'contact_phone'],
  accessInstructions: ['zugang', 'schluessel', 'zutritt', 'access_instructions'],
  notes: ['notizen', 'notiz', 'bemerkung', 'notes'],
} as const satisfies Record<keyof ObjectImportRow, readonly string[]>;

/**
 * Objekte zu Kunden, die es schon gibt.
 *
 * Der Kundenimport bringt ein Objekt pro Kundenzeile mit -- fuer den ersten
 * Bestand genuegt das. Was fehlte, ist der Fall, der danach kommt: ein Kunde
 * mit vierzig Objekten, die nachgetragen werden.
 *
 * Zugeordnet wird ueber die Kundennummer, sonst ueber den Namen. Die Nummer
 * zuerst, weil zwei Kunden gleich heissen koennen und keine zwei dieselbe
 * Nummer haben. Welcher Kunde gemeint ist, entscheidet der Import, nicht diese
 * Datei -- hier wird nur gelesen.
 */
export function parseObjectImportCsv(input: string): ObjectImportRow[] {
  const table = parseCsvTable(input);
  const indexes = columnMap(table.headers, aliases);

  if (indexes.objectName < 0) {
    throw new Error('Die CSV-Datei braucht eine Spalte "Objekt" oder "Objektname".');
  }
  if (indexes.customerName < 0 && indexes.customerNumber < 0) {
    throw new Error('Die CSV-Datei braucht eine Spalte "Kunde" oder "Kundennummer".');
  }

  return table.rows.map((values, rowIndex) => {
    const line = table.lineNumber(rowIndex);
    const value = (key: keyof ObjectImportRow) =>
      indexes[key] >= 0 ? clean(values[indexes[key]]) : null;

    const objectName = value('objectName');
    if (!objectName) throw new Error(`Zeile ${line}: Objektname fehlt.`);
    const customerName = value('customerName');
    const customerNumber = value('customerNumber');
    if (!customerName && !customerNumber) {
      throw new Error(`Zeile ${line}: Weder Kunde noch Kundennummer angegeben.`);
    }

    const areaSqm = parseGermanNumber(value('areaSqm'));
    if (areaSqm === undefined) throw new Error(`Zeile ${line}: Fläche ist keine Zahl.`);
    if (areaSqm !== null && (areaSqm < 0 || areaSqm > 10_000_000)) {
      throw new Error(`Zeile ${line}: Fläche liegt außerhalb des Zulässigen.`);
    }

    return {
      customerName,
      customerNumber,
      objectName,
      objectNumber: value('objectNumber'),
      street: value('street'),
      postalCode: value('postalCode'),
      city: value('city'),
      areaSqm,
      contactPerson: value('contactPerson'),
      contactPhone: value('contactPhone'),
      accessInstructions: value('accessInstructions'),
      notes: value('notes'),
    };
  });
}
