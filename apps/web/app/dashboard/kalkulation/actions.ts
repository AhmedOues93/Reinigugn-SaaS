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

/**
 * The company's costing assumptions.
 *
 * The productive share arrives one of two ways: as a percentage somebody typed,
 * or as the days it is derived from. Exactly one is sent, and the database
 * records which — a derived share that silently became manual is a number
 * nobody can audit later.
 */
export async function saveCalculationDefaults(_: FormState, formData: FormData): Promise<FormState> {
  const wage = parseEuroToCents(String(formData.get('wage') ?? ''));
  const ancillary = parsePercentToBp(String(formData.get('ancillary') ?? ''));
  const overhead = parsePercentToBp(String(formData.get('overhead') ?? ''));
  const margin = parsePercentToBp(String(formData.get('margin') ?? ''));
  const minRate = parseEuroToCents(String(formData.get('min_hourly_rate') ?? ''));
  const material = parseEuroToCents(String(formData.get('material') ?? ''));
  const machine = parseEuroToCents(String(formData.get('machine') ?? ''));
  const travel = parseEuroToCents(String(formData.get('travel') ?? ''));

  if (wage === null) return failure('Bitte gib einen gültigen Kalkulationslohn an.');
  if (ancillary === null || ancillary > 20000) return failure('Bitte gib gültige Lohnnebenkosten an.');
  if (overhead === null || overhead > 20000) return failure('Bitte gib einen gültigen Gemeinkostenzuschlag an.');
  // A 100 % margin has no finite price, so the database caps the target at 90 %.
  if (margin === null || margin > 9000) return failure('Die Zielmarge muss unter 90 % liegen.');
  if (minRate === null || material === null || machine === null || travel === null) {
    return failure('Bitte gib gültige Beträge an.');
  }

  const manual = String(formData.get('productive_mode') ?? 'derived') === 'manual';
  let productive: number | null = null;
  if (manual) {
    productive = parsePercentToBp(String(formData.get('productive') ?? ''));
    if (productive === null || productive < 1000 || productive > 10000) {
      return failure('Der produktive Anteil muss zwischen 10 % und 100 % liegen.');
    }
  }

  const day = (name: string, fallback: number) => {
    const value = parseNumber(String(formData.get(name) ?? ''));
    return value === null ? fallback : value;
  };

  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('set_calculation_defaults_v2', {
      p_wage_cents: wage,
      p_ancillary_bp: ancillary,
      p_overhead_bp: overhead,
      p_target_margin_bp: margin,
      p_productive_bp: productive,
      p_weekly_hours: day('weekly_hours', 39),
      p_working_days_per_week: day('working_days', 5),
      p_vacation_days: Math.round(day('vacation_days', 0)),
      p_public_holidays: Math.round(day('public_holidays', 0)),
      p_sick_days: Math.round(day('sick_days', 0)),
      p_training_days: Math.round(day('training_days', 0)),
      p_unproductive_minutes_per_day: day('unproductive_minutes', 0),
      p_min_hourly_rate_cents: minRate,
      p_material_cents_per_visit: material,
      p_machine_cents_per_month: machine,
      p_travel_cents_per_visit: travel,
      p_setup_minutes_per_visit: day('setup_minutes', 0),
    });
    if (error) return failure('Die Kalkulationsgrundlagen konnten nicht gespeichert werden.');
    revalidatePath('/dashboard/kalkulation/grundlagen');
    revalidatePath('/dashboard/einrichtung');
    revalidateCalculation();
    return {
      status: 'success',
      message: 'Kalkulationsgrundlagen gespeichert. Bestehende Kalkulationen bleiben unverändert.',
    };
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
  const customerMode = String(formData.get('customer_mode') ?? 'EXISTING');
  const customerId = String(formData.get('customer_id') ?? '').trim() || null;
  const surveyId = String(formData.get('site_survey_id') ?? '').trim() || null;
  const catalogItemId = String(formData.get('catalog_item_id') ?? '').trim() || null;

  if (title.length < 2) return failure('Bitte gib eine Bezeichnung für das Angebot an.');
  if (!surveyId && customerMode === 'EXISTING' && !customerId) return failure('Bitte wähle einen Kunden aus.');

  let newId: string;
  try {
    const { supabase } = await requireStaffCompany();
    let leadId: string | null = null;

    if (!surveyId && customerMode === 'NEW') {
      const organisation = String(formData.get('organisation') ?? '').trim();
      if (organisation.length < 2) return failure('Bitte gib einen Firmen- oder Kundennamen an.');

      const cleaningType = String(formData.get('cleaning_type') ?? '').trim();
      const frequency = String(formData.get('frequency') ?? '').trim();
      const desiredStart = String(formData.get('desired_start') ?? '').trim();
      const { data: createdLead, error: leadError } = await supabase.rpc('create_lead_v2', {
        p_organisation: organisation,
        p_contact_person: String(formData.get('contact_person') ?? '').trim(),
        p_email: String(formData.get('email') ?? '').trim(),
        p_phone: String(formData.get('phone') ?? '').trim(),
        p_street: String(formData.get('street') ?? '').trim(),
        p_postal_code: String(formData.get('postal_code') ?? '').trim(),
        p_city: String(formData.get('city') ?? '').trim(),
        p_source: String(formData.get('source_detail') ?? '').trim() || 'Direktangebot',
        p_notes: String(formData.get('notes') ?? '').trim() || null,
        p_customer_id: null,
        p_cleaning_object_id: null,
        p_cleaning_type: cleaningType || null,
        p_desired_start: desiredStart || null,
        p_frequency: frequency || null,
        p_preferred_time: null,
      });
      if (leadError || !createdLead) return failure('Der Interessent konnte nicht gespeichert werden.');
      leadId = createdLead as string;
    }

    const { data, error } = await supabase.rpc('create_calculation', {
      p_title: title,
      p_lead_id: leadId,
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

  // Customer surcharges. Revenue, not cost — the company's own travel expense
  // is `travel`, above, and the two must never be filled from the same figure.
  const surchargeTravel = has('surcharge_travel') ? euro('surcharge_travel') : null;
  const surchargeSmallOrder = has('surcharge_small_order') ? euro('surcharge_small_order') : null;
  const surchargeOffpeak = has('surcharge_offpeak') ? percent('surcharge_offpeak') : null;
  const minRate = has('min_hourly_rate') ? euro('min_hourly_rate') : null;
  if (surchargeTravel === null && has('surcharge_travel')) return failure('Bitte gib eine gültige Anfahrtspauschale an.');
  if (surchargeSmallOrder === null && has('surcharge_small_order')) {
    return failure('Bitte gib einen gültigen Kleinauftragszuschlag an.');
  }
  if (surchargeOffpeak !== null && surchargeOffpeak > 10000) {
    return failure('Der Zuschlag für Nacht-, Sonn- und Feiertagsarbeit muss unter 100 % liegen.');
  }

  // The personnel day model. Sending any of it re-derives the productive share
  // in the database; sending the percentage instead overrides it. Only one of
  // the two is ever present in the form.
  const dayModelMode = String(formData.get('productive_mode') ?? '');
  const sendDayModel = dayModelMode === 'derived';
  const day = (name: string) =>
    sendDayModel && has(name) ? parseNumber(String(formData.get(name) ?? '')) : null;

  // The field name, not the German label: `has('Kalkulationslohn')` is never
  // true, so this loop silently passed every malformed amount straight through
  // to a `coalesce(null, …)` that left the value unchanged — a typo looked
  // exactly like a successful save.
  for (const [field, label, value] of [
    ['wage', 'Kalkulationslohn', wage],
    ['ancillary', 'Lohnnebenkosten', ancillary],
    ['productive', 'produktiven Anteil', productive],
    ['overhead', 'Gemeinkostenzuschlag', overhead],
    ['margin', 'Zielmarge', margin],
    ['travel', 'Fahrtkosten', travel],
    ['other_monthly', 'sonstigen Kosten', otherMonthly],
  ] as const) {
    if (has(field) && value === null) return failure(`Bitte gib einen gültigen Wert für ${label} an.`);
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
      p_productive_bp: sendDayModel ? null : productive,
      p_overhead_bp: overhead,
      p_target_margin_bp: margin,
      p_travel_cents_per_visit: travel,
      p_setup_minutes_per_visit: setup,
      p_other_cost_cents_per_month: otherMonthly,
      p_visits_per_week: visits,
      p_price_override_cents_month: priceOverride,
      p_price_override_reason: priceOverride === null ? null : overrideReason,
      p_notes: String(formData.get('notes') ?? '').trim() || null,
      // Exactly one of these two arrives: a percentage set by hand, or the days
      // it is derived from. Sending both would make the winner a matter of
      // which branch the database happens to check first.
      p_weekly_hours: day('weekly_hours'),
      p_working_days_per_week: day('working_days'),
      p_vacation_days: day('vacation_days'),
      p_public_holidays: day('public_holidays'),
      p_sick_days: day('sick_days'),
      p_training_days: day('training_days'),
      p_unproductive_minutes_per_day: day('unproductive_minutes'),
      p_surcharge_travel_cents_month: surchargeTravel,
      p_surcharge_small_order_cents_month: surchargeSmallOrder,
      p_surcharge_offpeak_bp: surchargeOffpeak,
      p_surcharge_note: String(formData.get('surcharge_note') ?? '').trim() || null,
      p_min_hourly_rate_cents: minRate,
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
  // Weekdays are planning detail, not arithmetic, so an empty selection is a
  // legitimate answer and is stored as "not specified" rather than "never".
  const weekdays = formData
    .getAll('service_weekdays')
    .map((value) => Number(String(value)))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7);
  const productivity = parseNumber(String(formData.get('productivity') ?? ''));
  const minutesPerUnit = parseNumber(String(formData.get('minutes_per_unit') ?? ''));
  const minutesOverride = parseNumber(String(formData.get('minutes_override') ?? ''));
  const overrideReason = String(formData.get('override_reason') ?? '').trim();

  if (areaName.length < 1) return failure('Bitte gib den Bereich oder Raum an.');
  if (serviceName.length < 2) return failure('Bitte gib die Leistung an.');
  if (quantity === null) return failure('Bitte gib eine gültige Menge an.');
  if (
    ![
      'EINMALIG',
      'PRO_WOCHE',
      'VIERZEHNTAEGIG',
      'PRO_MONAT',
      'VIERTELJAEHRLICH',
      'HALBJAEHRLICH',
      'JAEHRLICH',
    ].includes(frequency)
  ) {
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
      p_service_weekdays: weekdays.length > 0 ? weekdays : null,
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
