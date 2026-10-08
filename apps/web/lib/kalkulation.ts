/**
 * The Kalkulation domain: types, labels and pure formatting.
 *
 * Deliberately free of any server import. `lib/data/kalkulation.ts` reaches
 * `next/headers` through the Supabase server client, so a client component
 * that imported these from there would drag server-only code into the browser
 * bundle and fail the build — the same trap `lib/sales-calc.ts` exists to
 * avoid.
 */

export type CalculationUnit = 'QM' | 'STUNDE' | 'STUECK' | 'EINSATZ' | 'PAUSCHAL';
export type CalculationFrequency =
  | 'EINMALIG'
  | 'PRO_WOCHE'
  | 'VIERZEHNTAEGIG'
  | 'PRO_MONAT'
  | 'VIERTELJAEHRLICH'
  | 'HALBJAEHRLICH'
  | 'JAEHRLICH';
export type CalculationStatus = 'ENTWURF' | 'FINAL' | 'VERWORFEN';
export type CostBasis = 'PRO_EINSATZ' | 'PRO_MONAT' | 'PRO_STUNDE' | 'PRO_QM';

export const unitLabels: Record<CalculationUnit, string> = {
  QM: 'm²',
  STUNDE: 'Stunde',
  STUECK: 'Stück',
  EINSATZ: 'Einsatz',
  PAUSCHAL: 'Pauschal',
};

/**
 * The Turnus values a cleaning contract actually uses, in the order an office
 * thinks about them: most frequent first, one-off last.
 *
 * A Glasreinigung is quarterly and a Grundreinigung half-yearly. Expressing
 * either as "0,33 pro Monat" is arithmetically fine and reads as a mistake on a
 * Leistungsverzeichnis, which is the document the customer keeps.
 */
export const frequencyLabels: Record<CalculationFrequency, string> = {
  PRO_WOCHE: 'pro Woche',
  VIERZEHNTAEGIG: '14-täglich',
  PRO_MONAT: 'pro Monat',
  VIERTELJAEHRLICH: 'vierteljährlich',
  HALBJAEHRLICH: 'halbjährlich',
  JAEHRLICH: 'jährlich',
  EINMALIG: 'einmalig',
};

/** Turnus values whose "Anzahl" is a real choice rather than always one. */
export const countableFrequencies: CalculationFrequency[] = ['PRO_WOCHE', 'PRO_MONAT'];

/** German weekday names, Monday first, indexed 1–7 as the database stores them. */
export const weekdayLabels: { value: number; label: string; short: string }[] = [
  { value: 1, label: 'Montag', short: 'Mo' },
  { value: 2, label: 'Dienstag', short: 'Di' },
  { value: 3, label: 'Mittwoch', short: 'Mi' },
  { value: 4, label: 'Donnerstag', short: 'Do' },
  { value: 5, label: 'Freitag', short: 'Fr' },
  { value: 6, label: 'Samstag', short: 'Sa' },
  { value: 7, label: 'Sonntag', short: 'So' },
];

export const costBasisLabels: Record<CostBasis, string> = {
  PRO_EINSATZ: 'je Einsatz',
  PRO_MONAT: 'je Monat',
  PRO_STUNDE: 'je Stunde',
  PRO_QM: 'je m²',
};

export type CatalogItem = {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  calculation_unit: CalculationUnit;
  default_productivity_per_hour: number | null;
  default_minutes_per_unit: number | null;
  default_material_cents: number;
  default_material_basis: CostBasis;
  is_active: boolean;
};

export type CalculationDefaults = {
  wage_cents_per_hour: number;
  ancillary_rate_bp: number;
  productive_rate_bp: number;
  overhead_rate_bp: number;
  target_margin_bp: number;
  // The day model behind the productive share. `productive_rate_is_manual`
  // says which of the two the company actually decided on.
  weekly_hours: number;
  working_days_per_week: number;
  vacation_days: number;
  public_holidays: number;
  sick_days: number;
  training_days: number;
  unproductive_minutes_per_day: number;
  productive_rate_is_manual: boolean;
  min_hourly_rate_cents: number;
  default_material_cents_per_visit: number;
  default_machine_cents_per_month: number;
  default_travel_cents_per_visit: number;
  default_setup_minutes_per_visit: number;
};

/**
 * The productive share, worked out from days rather than guessed — the same
 * arithmetic the database uses, so the wizard can show the result before it is
 * saved. The stored value always comes from the database; this only previews it.
 *
 *   Arbeitstage brutto  = Arbeitstage je Woche × 52
 *   Ausfalltage         = Urlaub + Feiertage + Krankheit + Schulung
 *   Tagesanteil         = 1 − (unproduktive Minuten ÷ Minuten je Arbeitstag)
 *   produktiver Anteil  = (Anwesenheitstage ÷ Arbeitstage brutto) × Tagesanteil
 */
export function deriveProductiveRateBp(input: {
  weekly_hours: number;
  working_days_per_week: number;
  vacation_days: number;
  public_holidays: number;
  sick_days: number;
  training_days: number;
  unproductive_minutes_per_day: number;
}) {
  // `??`, not `||`: the database coalesces nulls, and zero working days is a
  // real answer that has to reach the guard below rather than quietly becoming
  // five. A preview that disagrees with the stored value is worse than none.
  const workingDays = input.working_days_per_week ?? 5;
  const grossDays = workingDays * 52;
  if (grossDays <= 0) return 10000;

  const absent =
    input.vacation_days + input.public_holidays + input.sick_days + input.training_days;
  const yearShare = Math.max(grossDays - absent, 0) / grossDays;
  const minutesPerDay = ((input.weekly_hours ?? 39) / Math.max(workingDays, 0.1)) * 60;
  const dayShare =
    minutesPerDay <= 0 ? 1 : Math.max(1 - input.unproductive_minutes_per_day / minutesPerDay, 0);
  return Math.min(Math.max(Math.round(yearShare * dayShare * 10000), 1000), 10000);
}

/**
 * What a calculation is still missing, in the words an office uses.
 *
 * The database stores stable codes; an unknown code is shown as-is rather than
 * swallowed, so a future gap cannot silently disappear from the screen.
 */
export const incompleteReasonLabels: Record<string, string> = {
  KEINE_POSITIONEN: 'Es ist noch keine Leistung erfasst.',
  KEIN_LOHN: 'Es ist kein Kalkulationslohn hinterlegt — die Personalkosten sind deshalb null.',
  KEINE_ZEIT: 'Aus den Leistungen ergibt sich keine Arbeitszeit.',
  KEINE_ZIELMARGE: 'Es ist weder eine Zielmarge noch ein Verkaufspreis hinterlegt.',
  KEIN_PREIS: 'Es ergibt sich kein Verkaufspreis.',
};

export type CalculationLine = {
  id: string;
  position: number;
  area_name: string;
  area_sqm: number | null;
  catalog_item_id: string | null;
  service_name: string;
  scope_note: string | null;
  calculation_unit: CalculationUnit;
  quantity: number;
  frequency: CalculationFrequency;
  frequency_count: number;
  service_weekdays: number[] | null;
  productivity_per_hour: number | null;
  minutes_per_unit: number | null;
  minutes_override: number | null;
  override_reason: string | null;
  material_cents: number;
  material_basis: CostBasis;
  machine_cents: number;
  machine_basis: CostBasis;
  other_cents: number;
  other_basis: CostBasis;
  minutes_per_service: number;
  services_per_month: number;
  monthly_minutes: number;
  personnel_cost_cents_month: number;
  material_cost_cents_month: number;
  machine_cost_cents_month: number;
  other_cost_cents_month: number;
  total_cost_cents_month: number;
  proposed_price_cents_month: number;
  one_off_cost_cents: number;
  one_off_price_cents: number;
};

export type Calculation = {
  id: string;
  company_id: string;
  lead_id: string | null;
  customer_id: string | null;
  cleaning_object_id: string | null;
  site_survey_id: string | null;
  title: string;
  notes: string | null;
  status: CalculationStatus;
  version: number;
  supersedes_calculation_id: string | null;
  wage_cents_per_hour: number;
  ancillary_rate_bp: number;
  productive_rate_bp: number;
  overhead_rate_bp: number;
  target_margin_bp: number;
  // The personnel model this calculation was made under, snapshotted with
  // everything else so a calculation from March can explain itself in November.
  weekly_hours: number;
  working_days_per_week: number;
  vacation_days: number;
  public_holidays: number;
  sick_days: number;
  training_days: number;
  unproductive_minutes_per_day: number;
  productive_rate_is_manual: boolean;
  travel_cents_per_visit: number;
  setup_minutes_per_visit: number;
  other_cost_cents_per_month: number;
  visits_per_week: number;
  // Customer surcharges: revenue, deliberately not part of the cost side.
  surcharge_travel_cents_month: number;
  surcharge_small_order_cents_month: number;
  surcharge_offpeak_bp: number;
  surcharge_note: string | null;
  min_hourly_rate_cents: number;
  currency: string;
  personnel_cost_cents_per_hour: number;
  minutes_per_visit: number;
  monthly_minutes: number;
  personnel_cost_cents_month: number;
  material_cost_cents_month: number;
  machine_cost_cents_month: number;
  travel_cost_cents_month: number;
  other_cost_cents_month: number;
  total_cost_cents_month: number;
  total_cost_cents_visit: number;
  cost_cents_per_productive_hour: number;
  break_even_rate_cents_per_hour: number;
  one_off_minutes: number;
  one_off_cost_cents: number;
  one_off_price_cents: number;
  proposed_price_cents_month: number;
  price_override_cents_month: number | null;
  price_override_reason: string | null;
  base_price_cents_month: number;
  surcharge_cents_month: number;
  selling_price_cents_month: number;
  price_cents_per_productive_hour: number;
  min_price_cents_month: number;
  contribution_cents_month: number;
  margin_bp: number;
  markup_bp: number;
  incomplete_reasons: string[];
  finalised_at: string | null;
  created_at: string;
};

export type CalculationListRow = {
  id: string;
  title: string;
  status: CalculationStatus;
  version: number;
  customer_name: string | null;
  lead_name: string | null;
  monthly_minutes: number;
  total_cost_cents_month: number;
  selling_price_cents_month: number;
  contribution_cents_month: number;
  margin_bp: number;
  quote_id: string | null;
  quote_number: string | null;
  quote_status: string | null;
  created_at: string;
};

export type LeistungsverzeichnisRow = {
  line_position: number;
  area_name: string;
  area_sqm: number | null;
  service_name: string;
  scope_note: string | null;
  calculation_unit: CalculationUnit;
  quantity: number;
  frequency: CalculationFrequency;
  frequency_count: number;
  frequency_label: string;
};

/** Basis points as a readable percentage: 3000 → "30,0 %". */
export function formatBp(basisPoints: number) {
  return `${(basisPoints / 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
}

/** Minutes as "12 h 30", the way an office reads a timesheet. */
export function formatMinutes(minutes: number) {
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60)} h ${String(rounded % 60).padStart(2, '0')}`;
}
