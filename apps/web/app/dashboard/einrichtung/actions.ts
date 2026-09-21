'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';
import { updateCompanyBranding } from '../settings/actions';

/**
 * First-run setup writes.
 *
 * Every step is optional and every value is editable later in Einstellungen —
 * the wizard exists to make a useful start easy, not to gate the application
 * behind a form.
 */

function failure(message: string): FormState {
  return { status: 'error', message };
}

function parseEuroToCents(raw: string): number | null {
  const value = raw.replace(/\s|\./g, '').replace(',', '.');
  if (value === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}

function parsePercentToBp(raw: string): number | null {
  const value = raw.replace(/\s|%/g, '').replace(',', '.');
  if (value === '') return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  return Math.round(Number(value) * 100);
}

function parseNumber(raw: string, fallback: number): number {
  const value = raw.replace(/\s/g, '').replace(',', '.');
  if (value === '' || !/^\d+(\.\d{1,2})?$/.test(value)) return fallback;
  return Number(value);
}

function parseInteger(raw: string, fallback: number): number {
  const value = raw.trim();
  if (!/^\d+$/.test(value)) return fallback;
  return Number(value);
}

async function markStep(step: string, finished = false) {
  const { supabase } = await requireStaffCompany();
  await supabase.rpc('complete_onboarding_step', { p_step: step, p_finished: finished });
  revalidatePath('/dashboard/einrichtung');
  revalidatePath('/dashboard');
}

/** Steps 1 and 2: who the company is, and what goes on its invoices. */
export async function saveCompanyProfile(
  nextStep: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const text = (name: string) => String(formData.get(name) ?? '').trim() || null;
  const vatRaw = String(formData.get('vat_rate') ?? '').trim();
  const vatBp = vatRaw === '' ? null : parsePercentToBp(vatRaw);
  if (vatRaw !== '' && (vatBp === null || vatBp > 10000)) {
    return failure('Bitte gib einen gültigen Umsatzsteuersatz an.');
  }

  const termsRaw = String(formData.get('payment_terms_days') ?? '').trim();
  if (termsRaw !== '' && (!/^\d+$/.test(termsRaw) || Number(termsRaw) > 365)) {
    return failure('Das Zahlungsziel muss zwischen 0 und 365 Tagen liegen.');
  }

  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('save_company_profile', {
      p_name: text('name'),
      p_legal_form: text('legal_form'),
      p_managing_director: text('managing_director'),
      p_street: text('street'),
      p_postal_code: text('postal_code'),
      p_city: text('city'),
      p_country: text('country'),
      p_phone: text('phone'),
      p_email: text('email'),
      p_website: text('website'),
      p_tax_number: text('tax_number'),
      p_vat_id: text('vat_id'),
      p_billing_email: text('billing_email'),
      p_iban: text('iban'),
      p_bic: text('bic'),
      p_payment_terms_days: termsRaw === '' ? null : Number(termsRaw),
      p_vat_rate_bp: vatBp,
    });
    if (error) {
      return failure(
        error.message.includes('Only the OWNER')
          ? 'Nur die Inhaberin oder der Inhaber kann die Firmendaten ändern.'
          : 'Die Firmendaten konnten nicht gespeichert werden.',
      );
    }
  } catch {
    return failure('Die Firmendaten konnten nicht gespeichert werden.');
  }

  await markStep(String(formData.get('step') ?? 'unternehmen'));
  revalidatePath('/dashboard/settings');
  if (nextStep) redirect(`/dashboard/einrichtung?schritt=${nextStep}`);
  return { status: 'success', message: 'Firmendaten gespeichert.' };
}

/**
 * Step 3: the costing assumptions.
 *
 * The productive share can be derived from days the office knows — holiday,
 * public holidays, sickness, training, daily travel — or set directly. Which
 * one applies is the caller's choice, and the database records it.
 */
export async function saveCostingDefaults(
  nextStep: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const wage = parseEuroToCents(String(formData.get('wage') ?? ''));
  const ancillary = parsePercentToBp(String(formData.get('ancillary') ?? ''));
  const overhead = parsePercentToBp(String(formData.get('overhead') ?? ''));
  const margin = parsePercentToBp(String(formData.get('margin') ?? ''));
  const minRate = parseEuroToCents(String(formData.get('min_hourly_rate') ?? ''));
  const material = parseEuroToCents(String(formData.get('material') ?? ''));
  const machine = parseEuroToCents(String(formData.get('machine') ?? ''));
  const travel = parseEuroToCents(String(formData.get('travel') ?? ''));

  if (wage === null) return failure('Bitte gib einen gültigen Bruttostundenlohn an.');
  if (ancillary === null || ancillary > 20000) return failure('Bitte gib gültige Arbeitgebernebenkosten an.');
  if (overhead === null || overhead > 20000) return failure('Bitte gib einen gültigen Gemeinkostenzuschlag an.');
  if (margin === null || margin > 9000) return failure('Die Zielmarge muss unter 90 % liegen.');
  if (minRate === null || material === null || machine === null || travel === null) {
    return failure('Bitte gib gültige Beträge an.');
  }

  // Only one of the two modes is sent; passing a percentage makes it manual.
  const manualMode = String(formData.get('productive_mode') ?? 'derived') === 'manual';
  let productiveBp: number | null = null;
  if (manualMode) {
    productiveBp = parsePercentToBp(String(formData.get('productive') ?? ''));
    if (productiveBp === null || productiveBp < 1000 || productiveBp > 10000) {
      return failure('Der produktive Anteil muss zwischen 10 % und 100 % liegen.');
    }
  }

  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('set_calculation_defaults_v2', {
      p_wage_cents: wage,
      p_ancillary_bp: ancillary,
      p_overhead_bp: overhead,
      p_target_margin_bp: margin,
      p_productive_bp: productiveBp,
      p_weekly_hours: parseNumber(String(formData.get('weekly_hours') ?? ''), 39),
      p_working_days_per_week: parseNumber(String(formData.get('working_days') ?? ''), 5),
      p_vacation_days: parseInteger(String(formData.get('vacation_days') ?? ''), 0),
      p_public_holidays: parseInteger(String(formData.get('public_holidays') ?? ''), 0),
      p_sick_days: parseInteger(String(formData.get('sick_days') ?? ''), 0),
      p_training_days: parseInteger(String(formData.get('training_days') ?? ''), 0),
      p_unproductive_minutes_per_day: parseNumber(String(formData.get('unproductive_minutes') ?? ''), 0),
      p_min_hourly_rate_cents: minRate,
      p_material_cents_per_visit: material,
      p_machine_cents_per_month: machine,
      p_travel_cents_per_visit: travel,
      p_setup_minutes_per_visit: parseNumber(String(formData.get('setup_minutes') ?? ''), 0),
    });
    if (error) return failure('Die Kalkulationsgrundlagen konnten nicht gespeichert werden.');
  } catch {
    return failure('Die Kalkulationsgrundlagen konnten nicht gespeichert werden.');
  }

  await markStep('kalkulation');
  revalidatePath('/dashboard/kalkulation/grundlagen');
  if (nextStep) redirect(`/dashboard/einrichtung?schritt=${nextStep}`);
  return { status: 'success', message: 'Kalkulationsgrundlagen gespeichert.' };
}

/** Step 4: which Reinigungsarten, which also seeds a starting catalogue. */
export async function saveServiceFocus(
  nextStep: string | null,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const focus = formData.getAll('focus').map(String).filter(Boolean);

  let seeded = 0;
  try {
    const { supabase } = await requireStaffCompany();
    const { data, error } = await supabase.rpc('set_service_focus', { p_focus: focus });
    if (error) return failure('Die Reinigungsschwerpunkte konnten nicht gespeichert werden.');
    seeded = (data as number) ?? 0;
  } catch {
    return failure('Die Reinigungsschwerpunkte konnten nicht gespeichert werden.');
  }

  await markStep('schwerpunkte');
  revalidatePath('/dashboard/kalkulation/leistungskatalog');
  if (nextStep) redirect(`/dashboard/einrichtung?schritt=${nextStep}`);
  return {
    status: 'success',
    message:
      seeded > 0
        ? `${seeded} Leistungen in den Katalog übernommen. Alle Werte sind bearbeitbar.`
        : 'Schwerpunkte gespeichert.',
  };
}

/** Step 5: save branding before advancing; Weiter is never local-only. */
export async function saveOnboardingBranding(
  nextStep: string | null,
  state: FormState,
  formData: FormData,
): Promise<FormState> {
  const result = await updateCompanyBranding(state, formData);
  if (result.status !== 'success') return result;
  await markStep('branding');
  if (nextStep) redirect(`/dashboard/einrichtung?schritt=${nextStep}`);
  return result;
}

/** Step 6: done. The wizard does not reappear. */
export async function finishOnboarding(): Promise<void> {
  await markStep('abschluss', true);
  redirect('/dashboard');
}

/** Leaving early. Progress is kept; the wizard stays reachable from Einstellungen. */
export async function skipOnboarding(): Promise<void> {
  await markStep('uebersprungen', true);
  redirect('/dashboard');
}
