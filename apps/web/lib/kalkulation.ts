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
export type CalculationFrequency = 'EINMALIG' | 'PRO_WOCHE' | 'PRO_MONAT';
export type CalculationStatus = 'ENTWURF' | 'FINAL' | 'VERWORFEN';
export type CostBasis = 'PRO_EINSATZ' | 'PRO_MONAT' | 'PRO_STUNDE' | 'PRO_QM';

export const unitLabels: Record<CalculationUnit, string> = {
  QM: 'm²',
  STUNDE: 'Stunde',
  STUECK: 'Stück',
  EINSATZ: 'Einsatz',
  PAUSCHAL: 'Pauschal',
};

export const frequencyLabels: Record<CalculationFrequency, string> = {
  EINMALIG: 'einmalig',
  PRO_WOCHE: 'pro Woche',
  PRO_MONAT: 'pro Monat',
};

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
  travel_cents_per_visit: number;
  setup_minutes_per_visit: number;
  other_cost_cents_per_month: number;
  visits_per_week: number;
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
  selling_price_cents_month: number;
  contribution_cents_month: number;
  margin_bp: number;
  markup_bp: number;
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
