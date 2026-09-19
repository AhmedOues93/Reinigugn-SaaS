'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';

/**
 * Kalkulation writes.
 *
 * Every action confirms an OWNER/OFFICE session and then calls a
 * security-definer function. No amount is ever computed here: the browser
 * sends assumptions, quantities and rates, and the database derives time, cost,
 * price and margin — so the figure on screen is the figure an Angebot will be
 * generated from.
 */

function failure(message: string): FormState {
  return { status: 'error', message };
}

function revalidateCalculation(id?: string) {
  revalidatePath('/dashboard/kalkulation');
  if (id) revalidatePath(`/dashboard/kalkulation/${id}`);
  revalidatePath('/dashboard/vertrieb/angebote');
}

/** Euro as typed by a person — "1.234,56" or "1234.56" — to integer cents. */
function parseEuroToCents(raw: string): number | null {
  const value = raw.replace(/\s|\./g, '').replace(',', '.');
  if (value === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}

/** A percentage as typed — "21", "21,5" — to basis points. */
function parsePercentToBp(raw: string): number | null {
  const value = raw.replace(/\s|%/g, '').replace(',', '.');
  if (value === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}

function parseNumber(raw: string): number | null {
  const value = raw.replace(/\s/g, '').replace(',', '.');
  if (value === '') return null;
  if (!/^\d+(\.\d{1,3})?$/.test(value)) return null;
  return Number(value);
}

// ---------------------------------------------------------------------------
// Company assumptions
// ---------------------------------------------------------------------------

export async function saveCalculationDefaults(_: FormState, formData: FormData): Promise<FormState> {
  const wage = parseEuroToCents(String(formData.get('wage') ?? ''));
  const ancillary = parsePercentToBp(String(formData.get('ancillary') ?? ''));
  const productive = parsePercentToBp(String(formData.get('productive') ?? ''));
  const overhead = parsePercentToBp(String(formData.get('overhead') ?? ''));
  const margin = parsePercentToBp(String(formData.get('margin') ?? ''));

  if (wage === null) return failure('Bitte gib einen gültigen Kalkulationslohn an.');
  if (ancillary === null || ancillary > 20000) return failure('Bitte gib gültige Lohnnebenkosten an.');
  if (productive === null || productive < 1000 || productive > 10000) {
    return failure('Der produktive Anteil muss zwischen 10 % und 100 % liegen.');
  }
  if (overhead === null || overhead > 20000) return failure('Bitte gib einen gültigen Gemeinkostenzuschlag an.');
  // A 100 % margin has no finite price, so the database caps the target at 90 %.
  if (margin === null || margin > 9000) return failure('Die Zielmarge muss unter 90 % liegen.');

  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('set_calculation_defaults', {
      p_wage_cents: wage,
      p_ancillary_bp: ancillary,
      p_productive_bp: productive,
      p_overhead_bp: overhead,
      p_target_margin_bp: margin,
    });
    if (error) return failure('Die Kalkulationsgrundlagen konnten nicht gespeichert werden.');
    revalidatePath('/dashboard/kalkulation/grundlagen');
    revalidateCalculation();
    return { status: 'success', message: 'Kalkulationsgrundlagen gespeichert.' };
  } catch {
    return failure('Die Kalkulationsgrundlagen konnten nicht gespeichert werden.');
  }
}

// ---------------------------------------------------------------------------
// Leistungskatalog
// ---------------------------------------------------------------------------

export async function saveCatalogItem(
  itemId: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = String(formData.get('name') ?? '').trim();
  const unit = String(formData.get('calculation_unit') ?? 'QM');
  const productivity = parseNumber(String(formData.get('productivity') ?? ''));
  const minutesPerUnit = parseNumber(String(formData.get('minutes_per_unit') ?? ''));
  const material = parseEuroToCents(String(formData.get('material') ?? ''));

  if (name.length < 2) return failure('Bitte gib einen Namen für die Leistung an.');
  if (!['QM', 'STUNDE', 'STUECK', 'EINSATZ', 'PAUSCHAL'].includes(unit)) {
    return failure('Bitte wähle eine gültige Kalkulationseinheit.');
  }
  if (material === null) return failure('Bitte gib gültige Materialkosten an.');
  if (unit === 'QM' && productivity === null) {
    return failure('Für eine m²-Leistung wird eine Richtleistung in m²/h benötigt.');
  }

  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('save_catalog_item', {
      p_id: itemId,
      p_name: name,
      p_category: String(formData.get('category') ?? '').trim() || null,
      p_unit: unit,
      p_productivity: productivity,
      p_minutes_per_unit: minutesPerUnit,
      p_material_cents: material,
      p_material_basis: String(formData.get('material_basis') ?? 'PRO_EINSATZ'),
      p_description: String(formData.get('description') ?? '').trim() || null,
      p_is_active: formData.get('is_active') !== 'false',
    });
    if (error) {
      return failure(
        error.message.includes('duplicate')
          ? 'Eine Leistung mit diesem Namen gibt es bereits.'
          : 'Die Leistung konnte nicht gespeichert werden.',
      );
    }
    revalidatePath('/dashboard/kalkulation/leistungskatalog');
    return { status: 'success', message: 'Leistung gespeichert.' };
  } catch {
    return failure('Die Leistung konnte nicht gespeichert werden.');
  }
}

// ---------------------------------------------------------------------------
// The calculation itself
// ---------------------------------------------------------------------------

export async function createCalculation(_: FormState, formData: FormData): Promise<FormState> {
  const title = String(formData.get('title') ?? '').trim();
  const customerId = String(formData.get('customer_id') ?? '').trim() || null;
  const surveyId = String(formData.get('site_survey_id') ?? '').trim() || null;
  const catalogItemId = String(formData.get('catalog_item_id') ?? '').trim() || null;

  if (title.length < 2) return failure('Bitte gib eine Bezeichnung für die Kalkulation an.');
  if (!customerId && !surveyId) return failure('Bitte wähle einen Kunden oder eine Besichtigung aus.');

  let newId: string;
  try {
    const { supabase } = await requireStaffCompany();
    const { data, error } = await supabase.rpc('create_calculation', {
      p_title: title,
      p_lead_id: null,
      p_customer_id: customerId,
      p_site_survey_id: surveyId,
      p_cleaning_object_id: String(formData.get('cleaning_object_id') ?? '').trim() || null,
      p_catalog_item_id: catalogItemId,
    });
    if (error || !data) return failure('Die Kalkulation konnte nicht angelegt werden.');
    newId = data as string;
  } catch {
    return failure('Die Kalkulation konnte nicht angelegt werden.');
  }
  revalidateCalculation(newId);
  redirect(`/dashboard/kalkulation/${newId}`);
}

export async function updateCalculation(
  calculationId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const has = (name: string) => formData.get(name) !== null;
  const euro = (name: string) => parseEuroToCents(String(formData.get(name) ?? ''));
  const percent = (name: string) => parsePercentToBp(String(formData.get(name) ?? ''));

  const wage = has('wage') ? euro('wage') : null;
  const ancillary = has('ancillary') ? percent('ancillary') : null;
  const productive = has('productive') ? percent('productive') : null;
  const overhead = has('overhead') ? percent('overhead') : null;
  const margin = has('margin') ? percent('margin') : null;
  const travel = has('travel') ? euro('travel') : null;
  const setup = has('setup_minutes') ? parseNumber(String(formData.get('setup_minutes') ?? '')) : null;
  const otherMonthly = has('other_monthly') ? euro('other_monthly') : null;
  const visits = has('visits_per_week') ? parseNumber(String(formData.get('visits_per_week') ?? '')) : null;

  for (const [label, value] of [
    ['Kalkulationslohn', wage],
    ['Lohnnebenkosten', ancillary],
    ['produktiven Anteil', productive],
    ['Gemeinkostenzuschlag', overhead],
    ['Zielmarge', margin],
    ['Fahrtkosten', travel],
    ['sonstigen Kosten', otherMonthly],
  ] as const) {
    if (has(String(label)) && value === null) return failure(`Bitte gib einen gültigen Wert für ${label} an.`);
  }
  if (margin !== null && margin > 9000) return failure('Die Zielmarge muss unter 90 % liegen.');
  if (productive !== null && (productive < 1000 || productive > 10000)) {
    return failure('Der produktive Anteil muss zwischen 10 % und 100 % liegen.');
  }

  // An explicit selling price is allowed to depart from the calculation, but
  // never silently: the reason is stored with it.
  const overrideRaw = String(formData.get('price_override') ?? '').trim();
  const overrideReason = String(formData.get('price_override_reason') ?? '').trim();
  let priceOverride: number | null = null;
  if (has('price_override') && overrideRaw !== '') {
    priceOverride = parseEuroToCents(overrideRaw);
    if (priceOverride === null) return failure('Bitte gib einen gültigen Verkaufspreis an.');
    if (overrideReason.length < 3) {
      return failure('Bitte begründe kurz, warum der Preis von der Kalkulation abweicht.');
    }
  }

  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('update_calculation', {
      p_calculation_id: calculationId,
      p_title: String(formData.get('title') ?? '').trim() || null,
      p_wage_cents: wage,
      p_ancillary_bp: ancillary,
      p_productive_bp: productive,
      p_overhead_bp: overhead,
      p_target_margin_bp: margin,
      p_travel_cents_per_visit: travel,
      p_setup_minutes_per_visit: setup,
      p_other_cost_cents_per_month: otherMonthly,
      p_visits_per_week: visits,
      p_price_override_cents_month: priceOverride,
      p_price_override_reason: priceOverride === null ? null : overrideReason,
      p_notes: String(formData.get('notes') ?? '').trim() || null,
    });
    if (error) {
      return failure(
        error.message.includes('draft')
          ? 'Diese Kalkulation ist festgeschrieben und kann nicht mehr geändert werden.'
          : 'Die Kalkulation konnte nicht gespeichert werden.',
      );
    }
    revalidateCalculation(calculationId);
    return { status: 'success', message: 'Kalkulation aktualisiert.' };
  } catch {
    return failure('Die Kalkulation konnte nicht gespeichert werden.');
  }
}

export async function saveCalculationLine(
  calculationId: string,
  lineId: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const areaName = String(formData.get('area_name') ?? '').trim();
  const serviceName = String(formData.get('service_name') ?? '').trim();
  const unit = String(formData.get('calculation_unit') ?? 'QM');
  const quantity = parseNumber(String(formData.get('quantity') ?? ''));
  const frequency = String(formData.get('frequency') ?? 'PRO_WOCHE');
  const frequencyCount = parseNumber(String(formData.get('frequency_count') ?? '1')) ?? 1;
  const productivity = parseNumber(String(formData.get('productivity') ?? ''));
  const minutesPerUnit = parseNumber(String(formData.get('minutes_per_unit') ?? ''));
  const minutesOverride = parseNumber(String(formData.get('minutes_override') ?? ''));
  const overrideReason = String(formData.get('override_reason') ?? '').trim();

  if (areaName.length < 1) return failure('Bitte gib den Bereich oder Raum an.');
  if (serviceName.length < 2) return failure('Bitte gib die Leistung an.');
  if (quantity === null) return failure('Bitte gib eine gültige Menge an.');
  if (!['EINMALIG', 'PRO_WOCHE', 'PRO_MONAT'].includes(frequency)) {
    return failure('Bitte wähle einen gültigen Turnus.');
  }
  if (unit === 'QM' && productivity === null && minutesOverride === null) {
    return failure('Bitte gib eine Richtleistung in m²/h an oder trage die Zeit direkt ein.');
  }
  // A Richtleistung is an average and the office has seen the building — but a
  // departure from it has to be attributable, or a typo is indistinguishable
  // from judgement.
  if (minutesOverride !== null && overrideReason.length < 3) {
    return failure('Bitte begründe kurz, warum die Zeit von der Richtleistung abweicht.');
  }

  const material = parseEuroToCents(String(formData.get('material') ?? ''));
  const machine = parseEuroToCents(String(formData.get('machine') ?? ''));
  const other = parseEuroToCents(String(formData.get('other') ?? ''));
  if (material === null || machine === null || other === null) {
    return failure('Bitte gib gültige Kostenbeträge an.');
  }

  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('save_calculation_line', {
      p_id: lineId,
      p_calculation_id: calculationId,
      p_area_name: areaName,
      p_service_name: serviceName,
      p_unit: unit,
      p_quantity: quantity,
      p_frequency: frequency,
      p_frequency_count: frequencyCount,
      p_area_sqm: parseNumber(String(formData.get('area_sqm') ?? '')),
      p_catalog_item_id: String(formData.get('catalog_item_id') ?? '').trim() || null,
      p_productivity: productivity,
      p_minutes_per_unit: minutesPerUnit,
      p_minutes_override: minutesOverride,
      p_override_reason: minutesOverride === null ? null : overrideReason,
      p_material_cents: material,
      p_material_basis: String(formData.get('material_basis') ?? 'PRO_EINSATZ'),
      p_machine_cents: machine,
      p_machine_basis: String(formData.get('machine_basis') ?? 'PRO_EINSATZ'),
      p_other_cents: other,
      p_other_basis: String(formData.get('other_basis') ?? 'PRO_EINSATZ'),
      p_scope_note: String(formData.get('scope_note') ?? '').trim() || null,
      p_service_weekdays: null,
    });
    if (error) {
      return failure(
        error.message.includes('draft') || error.message.includes('finalised')
          ? 'Diese Kalkulation ist festgeschrieben und kann nicht mehr geändert werden.'
          : 'Die Position konnte nicht gespeichert werden.',
      );
    }
    revalidateCalculation(calculationId);
    return { status: 'success', message: 'Position gespeichert.' };
  } catch {
    return failure('Die Position konnte nicht gespeichert werden.');
  }
}

export async function removeCalculationLine(
  calculationId: string,
  lineId: string,
): Promise<void> {
  const { supabase } = await requireStaffCompany();
  const { error } = await supabase.rpc('remove_calculation_line', { p_line_id: lineId });
  if (error) throw new Error('Die Position konnte nicht entfernt werden.');
  revalidateCalculation(calculationId);
}

export async function finaliseCalculation(
  calculationId: string,
  _: FormState,
  __: FormData,
): Promise<FormState> {
  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('finalise_calculation', { p_calculation_id: calculationId });
    if (error) {
      return failure(
        error.message.includes('at least one position')
          ? 'Eine Kalkulation braucht mindestens eine Position.'
          : 'Die Kalkulation konnte nicht festgeschrieben werden.',
      );
    }
    revalidateCalculation(calculationId);
    return {
      status: 'success',
      message: 'Kalkulation festgeschrieben. Sie ist jetzt unveränderlich und kann ein Angebot tragen.',
    };
  } catch {
    return failure('Die Kalkulation konnte nicht festgeschrieben werden.');
  }
}

export async function reviseCalculation(calculationId: string): Promise<void> {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('revise_calculation', { p_calculation_id: calculationId });
  if (error || !data) throw new Error('Die Revision konnte nicht erstellt werden.');
  revalidateCalculation(calculationId);
  redirect(`/dashboard/kalkulation/${data as string}`);
}

/**
 * The Angebot. Generated from the frozen calculation, so nobody retypes a
 * price that was already agreed internally.
 */
export async function createQuoteFromCalculation(
  calculationId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const billingMode = String(formData.get('billing_mode') ?? 'MONATSPAUSCHALE');
  if (!['PAUSCHALE_PRO_EINSATZ', 'STUNDENSATZ', 'MONATSPAUSCHALE'].includes(billingMode)) {
    return failure('Bitte wähle eine gültige Abrechnungsart.');
  }
  const validDays = Number(String(formData.get('valid_days') ?? '30'));

  let quoteId: string;
  try {
    const { supabase } = await requireStaffCompany();
    const { data, error } = await supabase.rpc('create_quote_from_calculation', {
      p_calculation_id: calculationId,
      p_title: String(formData.get('title') ?? '').trim() || null,
      p_valid_days: Number.isFinite(validDays) ? validDays : 30,
      p_billing_mode: billingMode,
    });
    if (error || !data) {
      return failure(
        error?.message.includes('finalised')
          ? 'Nur eine festgeschriebene Kalkulation kann ein Angebot tragen.'
          : 'Das Angebot konnte nicht erstellt werden.',
      );
    }
    quoteId = data as string;
  } catch {
    return failure('Das Angebot konnte nicht erstellt werden.');
  }
  revalidateCalculation(calculationId);
  redirect(`/dashboard/vertrieb/angebote/${quoteId}`);
}
