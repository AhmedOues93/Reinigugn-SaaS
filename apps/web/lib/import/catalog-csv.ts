import { clean, columnMap, parseCents, parseCsvTable, parseGermanNumber } from '@/lib/import/csv';

export type CalculationUnit = 'QM' | 'STUNDE' | 'STUECK' | 'EINSATZ' | 'PAUSCHAL';
export type CostBasis = 'PRO_EINSATZ' | 'PRO_MONAT' | 'PRO_STUNDE' | 'PRO_QM';

export type CatalogImportRow = {
  name: string;
  category: string | null;
  unit: CalculationUnit;
  productivityPerHour: number | null;
  minutesPerUnit: number | null;
  materialCents: number;
  materialBasis: CostBasis;
  description: string | null;
};

const aliases = {
  name: ['leistung', 'name', 'bezeichnung', 'service'],
  category: ['kategorie', 'gruppe', 'category'],
  unit: ['einheit', 'kalkulationseinheit', 'unit'],
  productivityPerHour: ['leistung_pro_stunde', 'qm_pro_stunde', 'produktivitaet', 'productivity'],
  minutesPerUnit: ['minuten_pro_einheit', 'minuten', 'minutes_per_unit'],
  materialCents: ['material', 'materialkosten', 'material_cents'],
  materialBasis: ['materialbasis', 'material_basis', 'materialbezug'],
  description: ['beschreibung', 'description', 'bemerkung'],
} as const satisfies Record<keyof CatalogImportRow, readonly string[]>;

const units: Record<string, CalculationUnit> = {
  qm: 'QM', m2: 'QM', quadratmeter: 'QM', flaeche: 'QM',
  stunde: 'STUNDE', std: 'STUNDE', h: 'STUNDE', stunden: 'STUNDE',
  stueck: 'STUECK', stk: 'STUECK', st: 'STUECK',
  einsatz: 'EINSATZ',
  pauschal: 'PAUSCHAL', pauschale: 'PAUSCHAL',
};

const bases: Record<string, CostBasis> = {
  pro_einsatz: 'PRO_EINSATZ', einsatz: 'PRO_EINSATZ',
  pro_monat: 'PRO_MONAT', monat: 'PRO_MONAT', monatlich: 'PRO_MONAT',
  pro_stunde: 'PRO_STUNDE', stunde: 'PRO_STUNDE',
  pro_qm: 'PRO_QM', qm: 'PRO_QM',
};

function normalizeWord(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Den Leistungskatalog aus einer Preis- oder Leistungsliste.
 *
 * Die Einheit ist Pflicht und wird nicht geraten. Ob eine Leistung pro
 * Quadratmeter oder pro Einsatz kalkuliert wird, aendert jede Kalkulation, die
 * darauf aufbaut -- eine falsche Annahme hier zieht sich durch bis ins
 * Angebot.
 *
 * Material ohne Angabe ist null Cent, nicht unbekannt: der Katalog rechnet mit
 * dieser Zahl, und ein leeres Feld heisst in einer Preisliste "kein Material".
 */
export function parseCatalogImportCsv(input: string): CatalogImportRow[] {
  const table = parseCsvTable(input);
  const indexes = columnMap(table.headers, aliases);

  if (indexes.name < 0) throw new Error('Die CSV-Datei braucht eine Spalte "Leistung" oder "Bezeichnung".');
  if (indexes.unit < 0) throw new Error('Die CSV-Datei braucht eine Spalte "Einheit".');

  const seen = new Set<string>();

  return table.rows.map((values, rowIndex) => {
    const line = table.lineNumber(rowIndex);
    const value = (key: keyof CatalogImportRow) =>
      indexes[key] >= 0 ? clean(values[indexes[key]]) : null;

    const name = value('name');
    if (!name) throw new Error(`Zeile ${line}: Bezeichnung fehlt.`);
    if (name.length < 2) throw new Error(`Zeile ${line}: "${name}" ist als Bezeichnung zu kurz.`);
    const dedupe = name.toLocaleLowerCase('de-DE');
    if (seen.has(dedupe)) throw new Error(`Zeile ${line}: "${name}" kommt zweimal in der Datei vor.`);
    seen.add(dedupe);

    const unitRaw = value('unit');
    const unit = unitRaw ? units[normalizeWord(unitRaw)] : undefined;
    if (!unit) {
      throw new Error(
        `Zeile ${line}: "${unitRaw ?? ''}" ist keine bekannte Einheit (qm, Stunde, Stück, Einsatz, pauschal).`,
      );
    }

    const productivity = parseGermanNumber(value('productivityPerHour'));
    if (productivity === undefined) throw new Error(`Zeile ${line}: Leistung pro Stunde ist keine Zahl.`);
    if (productivity !== null && productivity < 0) {
      throw new Error(`Zeile ${line}: Leistung pro Stunde kann nicht negativ sein.`);
    }

    const minutes = parseGermanNumber(value('minutesPerUnit'));
    if (minutes === undefined) throw new Error(`Zeile ${line}: Minuten pro Einheit sind keine Zahl.`);
    if (minutes !== null && minutes < 0) {
      throw new Error(`Zeile ${line}: Minuten pro Einheit können nicht negativ sein.`);
    }

    const material = parseCents(value('materialCents'));
    if (material === undefined) throw new Error(`Zeile ${line}: Materialkosten sind kein Betrag.`);
    if (material !== null && material < 0) {
      throw new Error(`Zeile ${line}: Materialkosten können nicht negativ sein.`);
    }

    const basisRaw = value('materialBasis');
    const materialBasis = basisRaw ? bases[normalizeWord(basisRaw)] : 'PRO_EINSATZ';
    if (!materialBasis) {
      throw new Error(`Zeile ${line}: "${basisRaw}" ist kein bekannter Materialbezug.`);
    }

    return {
      name,
      category: value('category'),
      unit,
      productivityPerHour: productivity,
      minutesPerUnit: minutes,
      materialCents: material ?? 0,
      materialBasis,
      description: value('description'),
    };
  });
}
