/**
 * Das Gemeinsame an jedem CSV-Import.
 *
 * Eine Branchensoftware liefert, was sie liefert: Semikolon oder Komma,
 * Umlaute in Kopfzeilen, eine Byte-Order-Mark von Excel. Das hier einmal
 * auszuhalten ist billiger, als es in jedem Import erneut zu versuchen -- und
 * nur so gilt jede Korrektur fuer alle vier.
 */

/** Leer heisst nicht vorhanden. Ein leerer String waere ein Wert. */
export function clean(value: string | undefined): string | null {
  const result = value?.trim() ?? '';
  return result || null;
}

/**
 * Kopfzeilen vergleichbar machen.
 *
 * Umlaute werden umgeschrieben, nicht entfernt: aus "Straße" wird "strasse"
 * und nicht "strae", sonst trifft kein Alias mehr.
 */
export function normalizeHeader(value: string): string {
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

/** Eine Zeile zerlegen, mit Anfuehrungszeichen und verdoppelten darin. */
export function parseLine(line: string, delimiter: string): string[] {
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

/** Deutsche Programme schreiben Semikolon; bei Gleichstand ist das die bessere Wette. */
export function detectDelimiter(header: string): string {
  const semicolon = (header.match(/;/g) ?? []).length;
  const comma = (header.match(/,/g) ?? []).length;
  return semicolon >= comma ? ';' : ',';
}

export type CsvTable = {
  headers: string[];
  rows: string[][];
  /** Die Zeilennummer in der Datei, damit eine Fehlermeldung darauf zeigen kann. */
  lineNumber: (rowIndex: number) => number;
};

export function parseCsvTable(input: string): CsvTable {
  const normalized = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.trim());
  if (lines.length < 2) throw new Error('Die CSV-Datei enthält keine Datenzeilen.');

  const delimiter = detectDelimiter(lines[0]);
  return {
    headers: parseLine(lines[0], delimiter).map(normalizeHeader),
    rows: lines.slice(1).map((line) => parseLine(line, delimiter)),
    lineNumber: (rowIndex: number) => rowIndex + 2,
  };
}

/**
 * Eine Spalte nach ihren bekannten Schreibweisen suchen.
 *
 * Gibt -1, wenn keine passt. Ob das ein Fehler ist, entscheidet der Import:
 * ein fehlender Name ist einer, eine fehlende Telefonnummer nicht.
 */
export function columnIndex(headers: string[], aliases: readonly string[]): number {
  const accepted = new Set(aliases);
  return headers.findIndex((header) => accepted.has(header));
}

/** Die Spaltenzuordnung fuer einen ganzen Satz von Feldern. */
export function columnMap<K extends string>(
  headers: string[],
  aliases: Record<K, readonly string[]>,
): Record<K, number> {
  return Object.fromEntries(
    (Object.keys(aliases) as K[]).map((field) => [field, columnIndex(headers, aliases[field])]),
  ) as Record<K, number>;
}

/**
 * Eine deutsche Zahl lesen: "1.234,56" wie "1234.56".
 *
 * Gibt undefined zurueck, wenn es keine Zahl ist -- das unterscheidet ein
 * ungueltiges Feld von einem leeren, und nur eines davon ist ein Fehler.
 */
export function parseGermanNumber(value: string | null): number | null | undefined {
  if (value === null) return null;
  const normalized = value.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return undefined;
  return Number(normalized);
}

/** Ein Geldbetrag in Cent, aus "48", "48,00" oder "1.234,56". */
export function parseCents(value: string | null): number | null | undefined {
  const amount = parseGermanNumber(value);
  if (amount === null || amount === undefined) return amount;
  return Math.round(amount * 100);
}

/** Ja/nein in seinen ueblichen Schreibweisen. Unbekanntes ist undefined. */
export function parseBoolean(value: string | null): boolean | null | undefined {
  if (value === null) return null;
  const text = value.trim().toLowerCase();
  if (['ja', 'yes', 'true', '1', 'x', 'aktiv'].includes(text)) return true;
  if (['nein', 'no', 'false', '0', 'inaktiv'].includes(text)) return false;
  return undefined;
}

/** Ein Datum als ISO oder in deutscher Schreibweise. */
export function parseDate(value: string | null): string | null | undefined {
  if (value === null) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const german = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (german) {
    return `${german[3]}-${german[2]!.padStart(2, '0')}-${german[1]!.padStart(2, '0')}`;
  }
  return undefined;
}
