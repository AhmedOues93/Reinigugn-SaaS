import { requireStaffCompany } from '@/lib/auth';
import type {
  Calculation,
  CalculationDefaults,
  CalculationLine,
  CalculationListRow,
  CalculationStatus,
  CatalogItem,
  LeistungsverzeichnisRow,
} from '@/lib/kalkulation';

// Re-exported so server components can keep importing the domain from one
// place; client components import it from '@/lib/kalkulation' directly.
export * from '@/lib/kalkulation';

/**
 * The Kalkulation domain, read side.
 *
 * Every number here is computed by the database and stored on the row, so a
 * screen can never disagree with what an Angebot was generated from. Nothing in
 * this module recomputes a total; it reads one.
 */

export async function listCalculations(status?: CalculationStatus): Promise<CalculationListRow[]> {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('list_calculations', { p_status: status ?? null });
  if (error) throw new Error('Kalkulationen konnten nicht geladen werden.');
  return (data ?? []) as CalculationListRow[];
}

export async function getCalculation(id: string) {
  const { supabase, company } = await requireStaffCompany();
  const [{ data: calc, error }, { data: lines }] = await Promise.all([
    supabase.from('calculations').select('*').eq('company_id', company.id).eq('id', id).maybeSingle(),
    supabase.from('calculation_lines').select('*').eq('calculation_id', id).order('position'),
  ]);
  if (error) throw new Error('Kalkulation konnte nicht geladen werden.');
  if (!calc) return null;
  return { ...(calc as Calculation), lines: (lines ?? []) as CalculationLine[] };
}

export async function listCatalogItems(includeArchived = false): Promise<CatalogItem[]> {
  const { supabase, company } = await requireStaffCompany();
  let query = supabase
    .from('service_catalog_items')
    .select('*')
    .eq('company_id', company.id)
    .order('category', { nullsFirst: false })
    .order('name');
  if (!includeArchived) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw new Error('Leistungskatalog konnte nicht geladen werden.');
  return (data ?? []) as CatalogItem[];
}

export async function getCalculationDefaults(): Promise<CalculationDefaults> {
  const { supabase, company } = await requireStaffCompany();
  const { data } = await supabase
    .from('company_calculation_defaults')
    .select('*')
    .eq('company_id', company.id)
    .maybeSingle();
  // Nothing configured yet is a real state, not an error: the assumptions
  // screen exists precisely so the office can fill it in. Zeroes make the
  // consequence visible rather than inventing a plausible-looking wage.
  //
  // The day model is the one exception. A working week has to be *some*
  // length for the arithmetic to mean anything, and 39 hours over 5 days is
  // the shape of the form, not a claim about this company's contracts — every
  // field is on screen and editable before anything is saved.
  return (
    (data as CalculationDefaults | null) ?? {
      wage_cents_per_hour: 0,
      ancillary_rate_bp: 0,
      productive_rate_bp: 10000,
      overhead_rate_bp: 0,
      target_margin_bp: 0,
      weekly_hours: 39,
      working_days_per_week: 5,
      vacation_days: 0,
      public_holidays: 0,
      sick_days: 0,
      training_days: 0,
      unproductive_minutes_per_day: 0,
      productive_rate_is_manual: true,
      min_hourly_rate_cents: 0,
      default_material_cents_per_visit: 0,
      default_machine_cents_per_month: 0,
      default_travel_cents_per_visit: 0,
      default_setup_minutes_per_visit: 0,
    }
  );
}

/**
 * What the customer is promised. Carries no cost, no wage assumption and no
 * margin — the internal side of the calculation must not travel with the
 * document that goes out of the building.
 */
export async function getLeistungsverzeichnis(calculationId: string): Promise<LeistungsverzeichnisRow[]> {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('get_leistungsverzeichnis', {
    p_calculation_id: calculationId,
  });
  if (error) throw new Error('Leistungsverzeichnis konnte nicht geladen werden.');
  return (data ?? []) as LeistungsverzeichnisRow[];
}

