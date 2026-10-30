import { clean, columnMap, parseCents, parseCsvTable, parseDate, parseGermanNumber } from '@/lib/import/csv';

export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'MINIJOB' | 'OTHER';

export type EmployeeImportRow = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  employeeNumber: string | null;
  weeklyHours: number | null;
  wageGroup: string | null;
  hourlyWageCents: number | null;
  employmentStartDate: string | null;
  employmentType: EmploymentType | null;
  notes: string | null;
};

const aliases = {
  firstName: ['vorname', 'first_name', 'firstname'],
  lastName: ['nachname', 'name', 'last_name', 'lastname'],
  email: ['email', 'e_mail'],
  phone: ['telefon', 'phone', 'mobil'],
  employeeNumber: ['personalnummer', 'mitarbeiternummer', 'employee_number'],
  weeklyHours: ['wochenstunden', 'stunden_woche', 'weekly_hours'],
  wageGroup: ['lohngruppe', 'wage_group'],
  hourlyWageCents: ['stundenlohn', 'hourly_wage', 'lohn'],
  employmentStartDate: ['eintritt', 'eintrittsdatum', 'start', 'employment_start_date'],
  employmentType: ['beschaeftigung', 'beschaeftigungsart', 'employment_type', 'vertragsart'],
  notes: ['notizen', 'notiz', 'bemerkung', 'notes'],
} as const satisfies Record<keyof EmployeeImportRow, readonly string[]>;

/** Die ueblichen deutschen Worte fuer die vier Beschaeftigungsarten. */
const employmentTypes: Record<string, EmploymentType> = {
  vollzeit: 'FULL_TIME',
  full_time: 'FULL_TIME',
  fulltime: 'FULL_TIME',
  teilzeit: 'PART_TIME',
  part_time: 'PART_TIME',
  parttime: 'PART_TIME',
  minijob: 'MINIJOB',
  'geringfuegig': 'MINIJOB',
  aushilfe: 'MINIJOB',
  sonstige: 'OTHER',
  sonstiges: 'OTHER',
  other: 'OTHER',
};

/**
 * Mitarbeiterinnen aus einer Lohn- oder Personalliste.
 *
 * E-Mail ist Pflicht und nicht wegzulassen: ein Konto ohne Adresse kann nicht
 * eingeladen werden, und ein Mitglied ohne Zugang ist in diesem Produkt kein
 * Mitglied, sondern eine Zeile, die niemandem auffaellt.
 *
 * Der Stundenlohn wird gelesen, aber hier nur weitergegeben. Was damit
 * geschieht, entscheidet `set_employee_master_data`.
 */
export function parseEmployeeImportCsv(input: string): EmployeeImportRow[] {
  const table = parseCsvTable(input);
  const indexes = columnMap(table.headers, aliases);

  if (indexes.lastName < 0) throw new Error('Die CSV-Datei braucht eine Spalte "Nachname".');
  // Der Vorname ist Pflicht, weil die Einladung ihn verlangt. Das hier zu
  // melden ist freundlicher, als es die Datenbank Zeile fuer Zeile tun zu
  // lassen.
  if (indexes.firstName < 0) throw new Error('Die CSV-Datei braucht eine Spalte "Vorname".');
  if (indexes.email < 0) throw new Error('Die CSV-Datei braucht eine Spalte "E-Mail".');

  const seen = new Set<string>();

  return table.rows.map((values, rowIndex) => {
    const line = table.lineNumber(rowIndex);
    const value = (key: keyof EmployeeImportRow) =>
      indexes[key] >= 0 ? clean(values[indexes[key]]) : null;

    const lastName = value('lastName');
    if (!lastName) throw new Error(`Zeile ${line}: Nachname fehlt.`);
    const firstName = value('firstName');
    if (!firstName) throw new Error(`Zeile ${line}: Vorname fehlt.`);
    const email = value('email')?.toLowerCase() ?? null;
    if (!email) throw new Error(`Zeile ${line}: E-Mail-Adresse fehlt.`);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error(`Zeile ${line}: "${email}" ist keine E-Mail-Adresse.`);
    }
    // Zweimal dieselbe Adresse hiesse zwei Einladungen fuer eine Person, und
    // die Datenbank weist die zweite ohnehin ab -- besser vorher und mit
    // Zeilennummer.
    if (seen.has(email)) throw new Error(`Zeile ${line}: "${email}" kommt zweimal in der Datei vor.`);
    seen.add(email);

    const weeklyHours = parseGermanNumber(value('weeklyHours'));
    if (weeklyHours === undefined) throw new Error(`Zeile ${line}: Wochenstunden sind keine Zahl.`);
    if (weeklyHours !== null && (weeklyHours < 0 || weeklyHours > 168)) {
      throw new Error(`Zeile ${line}: Wochenstunden müssen zwischen 0 und 168 liegen.`);
    }

    const hourlyWageCents = parseCents(value('hourlyWageCents'));
    if (hourlyWageCents === undefined) throw new Error(`Zeile ${line}: Stundenlohn ist kein Betrag.`);
    if (hourlyWageCents !== null && (hourlyWageCents < 0 || hourlyWageCents > 100_000_00)) {
      throw new Error(`Zeile ${line}: Stundenlohn liegt außerhalb des Zulässigen.`);
    }

    const startDate = parseDate(value('employmentStartDate'));
    if (startDate === undefined) {
      throw new Error(`Zeile ${line}: Eintrittsdatum ist kein Datum (TT.MM.JJJJ oder JJJJ-MM-TT).`);
    }

    const typeRaw = value('employmentType');
    const employmentType = typeRaw
      ? employmentTypes[typeRaw.toLowerCase().replace(/ü/g, 'ue').replace(/[^a-z_]/g, '')] ?? null
      : null;
    if (typeRaw && employmentType === null) {
      throw new Error(`Zeile ${line}: "${typeRaw}" ist keine bekannte Beschäftigungsart.`);
    }

    return {
      firstName,
      lastName,
      email,
      phone: value('phone'),
      employeeNumber: value('employeeNumber'),
      weeklyHours,
      wageGroup: value('wageGroup'),
      hourlyWageCents,
      employmentStartDate: startDate,
      employmentType,
      notes: value('notes'),
    };
  });
}
