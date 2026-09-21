'use server';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { type FormState } from '@/lib/actions';
import { isLocale } from '@/lib/i18n';
import { requireOwnerCompany } from '@/lib/auth';
import { sendMail } from '@/lib/mail/transport';

function databaseFailure(prefix: string, error: { message?: string | null; code?: string | null }) {
  // A generic "could not save" turns an actionable schema/RPC problem into a
  // support ticket with no clue. PostgREST errors are safe to show here: this
  // action is owner-only and the message identifies the failed operation.
  const detail = error.message?.trim() || error.code || 'Unbekannter Datenbankfehler';
  return { status: 'error' as const, message: `${prefix} ${detail}` };
}

export async function updateCompanySettings(_: FormState, formData: FormData): Promise<FormState> {
  const value = Object.fromEntries(formData); const name = String(value.name ?? '').trim(); const language = String(value.default_language ?? 'de');
  if (name.length < 2 || name.length > 120) return { status: 'error', message: 'Bitte gib einen gültigen Firmennamen ein.' };
  if (!isLocale(language)) return { status: 'error', message: 'Bitte wähle eine gültige Standardsprache.' };
  const paymentTerms = String(value.default_payment_terms_days ?? ''); if (paymentTerms && (!/^\d+$/.test(paymentTerms) || Number(paymentTerms) > 365)) return { status: 'error', message: 'Das Zahlungsziel muss zwischen 0 und 365 Tagen liegen.' };
  try { const { supabase } = await requireOwnerCompany(); const { error } = await supabase.rpc('update_my_company_master_data', { p_name: name, p_legal_form: String(value.legal_form ?? ''), p_street: String(value.street ?? ''), p_postal_code: String(value.postal_code ?? ''), p_city: String(value.city ?? ''), p_country: String(value.country ?? 'Deutschland'), p_phone: String(value.phone ?? ''), p_email: String(value.email ?? ''), p_website: String(value.website ?? ''), p_tax_number: String(value.tax_number ?? ''), p_vat_id: String(value.vat_id ?? ''), p_billing_email: String(value.billing_email ?? ''), p_iban: String(value.iban ?? ''), p_bic: String(value.bic ?? ''), p_payment_terms: paymentTerms ? Number(paymentTerms) : null, p_timezone: String(value.timezone ?? 'Europe/Berlin'), p_language: language }); if (error) return databaseFailure('Die Kern-Firmendaten wurden nicht gespeichert:', error); const rateRaw = String(value.default_hourly_rate ?? '').replace(',', '.').trim();
    if (rateRaw) {
      const parsed = Number(rateRaw);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) return { status: 'error', message: 'Bitte gib einen gültigen Stundensatz an.' };
      // `companies` grants UPDATE on name and slug only, so this goes through
      // the owner-gated function rather than a direct column write.
      const { error: rateError } = await supabase.rpc('set_company_default_hourly_rate', { p_cents: Math.round(parsed * 100) });
      if (rateError) return databaseFailure('Die Kern-Firmendaten wurden gespeichert, der Standard-Stundensatz jedoch nicht:', rateError);
    }

    // Phase 21 added three fields that `update_my_company_master_data` does not
    // know about. They go through the owner-gated profile function rather than
    // widening an RPC that the rest of the application already depends on.
    const vatRaw = String(value.vat_rate ?? '').replace(',', '.').trim();
    let vatBp: number | null = null;
    if (vatRaw) {
      const parsedVat = Number(vatRaw);
      if (!Number.isFinite(parsedVat) || parsedVat < 0 || parsedVat > 100) {
        return { status: 'error', message: 'Bitte gib einen gültigen Umsatzsteuersatz an.' };
      }
      vatBp = Math.round(parsedVat * 100);
    }
    const director = String(value.managing_director ?? '').trim();
    const clearsDirector = !director && String(value.managing_director_was_set ?? '') === 'true';
    const clearsVatRate = !vatRaw && String(value.vat_rate_was_set ?? '') === 'true';

    // The currently deployed profile RPC intentionally coalesces null values,
    // which makes a blank field look saved while retaining the old value. Do
    // not pretend a destructive edit worked. A future explicit-clear RPC can
    // replace this guard without weakening the owner/RLS boundary.
    if (clearsDirector || clearsVatRate) {
      const cleared = [clearsDirector && 'Geschäftsführung', clearsVatRate && 'Umsatzsteuersatz']
        .filter(Boolean)
        .join(' und ');
      return {
        status: 'error',
        message: `Die Kern-Firmendaten wurden gespeichert. ${cleared} wurde nicht entfernt, weil die aktuelle Datenbankfunktion leere Werte bewusst beibehält.`,
      };
    }

    if (director || vatBp !== null) {
      const { error: profileError } = await supabase.rpc('save_company_profile', {
        p_managing_director: director || null,
        p_vat_rate_bp: vatBp,
      });
      if (profileError) {
        return databaseFailure(
          'Die Kern-Firmendaten wurden gespeichert, Geschäftsführung oder Umsatzsteuersatz jedoch nicht:',
          profileError,
        );
      }
    }

    // Changing the focus adds matching catalogue entries and never overwrites
    // one that already exists, so this is safe to repeat.
    const focus = formData.getAll('focus').map(String).filter(Boolean);
    const { error: focusError } = await supabase.rpc('set_service_focus', { p_focus: focus });
    if (focusError) return databaseFailure('Die Kern-Firmendaten wurden gespeichert, die Reinigungsschwerpunkte jedoch nicht:', focusError);

    revalidatePath('/dashboard'); revalidatePath('/dashboard/settings'); revalidatePath('/dashboard/kalkulation/leistungskatalog'); return { status: 'success', message: 'Firmendaten gespeichert.' }; } catch (error) {
    if (error instanceof Error && error.message) return { status: 'error', message: error.message };
    return { status: 'error', message: 'Nur Inhaber dürfen Firmendaten bearbeiten.' };
  }
}

const brandingMimeTypes: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

/**
 * Upload or replace the company logo. The storage path is built from the
 * company resolved server-side; the RPC re-checks it and deletes the previous
 * object so an orphaned logo is never left behind.
 */
export async function updateCompanyBranding(_: FormState, formData: FormData): Promise<FormState> {
  const brandColorInput = String(formData.get('brand_color') ?? '').trim();
  const brandColor = /^#[0-9a-fA-F]{6}$/.test(brandColorInput) ? brandColorInput : null;
  const file = formData.get('logo');
  const hasFile = file instanceof File && file.size > 0;

  if (hasFile) {
    if (!(file.type in brandingMimeTypes)) return { status: 'error', message: 'Bitte wähle ein PNG, JPG, WebP oder SVG aus.' };
    if (file.size > 2 * 1024 * 1024) return { status: 'error', message: 'Das Logo darf höchstens 2 MB groß sein.' };
  }

  try {
    const { supabase, company } = await requireOwnerCompany();
    let storagePath: string | null = null;

    if (hasFile) {
      storagePath = `${company.id}/logo/${randomUUID()}.${brandingMimeTypes[file.type]}`;
      const { error: uploadError } = await supabase.storage
        .from('company-branding')
        .upload(storagePath, file, { contentType: file.type, upsert: false });
      if (uploadError) return { status: 'error', message: `Das Logo konnte nicht hochgeladen werden: ${uploadError.message}` };
    }

    const { error } = await supabase.rpc('set_company_branding', { p_storage_path: storagePath, p_brand_color: brandColor });
    if (error) {
      if (storagePath) await supabase.storage.from('company-branding').remove([storagePath]);
      return { status: 'error', message: `Das Branding konnte nicht gespeichert werden: ${error.message}` };
    }

    revalidatePath('/dashboard', 'layout');
    revalidatePath('/mitarbeiter', 'layout');
    revalidatePath('/portal', 'layout');
    return { status: 'success', message: 'Branding gespeichert.' };
  } catch {
    return { status: 'error', message: 'Nur Inhaber dürfen das Branding bearbeiten.' };
  }
}

export async function removeCompanyLogo(_: FormState, __: FormData): Promise<FormState> {
  try {
    const { supabase } = await requireOwnerCompany();
    const { error } = await supabase.rpc('clear_company_logo');
    if (error) return { status: 'error', message: 'Das Logo konnte nicht entfernt werden.' };
    revalidatePath('/dashboard', 'layout');
    revalidatePath('/mitarbeiter', 'layout');
    revalidatePath('/portal', 'layout');
    return { status: 'success', message: 'Logo entfernt.' };
  } catch {
    return { status: 'error', message: 'Nur Inhaber dürfen das Branding bearbeiten.' };
  }
}


export async function sendOwnerTestEmail(_: FormState, __: FormData): Promise<FormState> {
  try {
    const { supabase, company } = await requireOwnerCompany();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return { status: 'error', message: 'Für dieses Konto ist keine Anmelde-E-Mail verfügbar.' };

    const result = await sendMail({
      to: user.email,
      subject: 'ReinPlan E-Mail-Test · ' + company.name,
      text:
        'Hallo,\n\n' +
        'der E-Mail-Versand für ' + company.name + ' funktioniert.\n\n' +
        'Diese Testnachricht wurde aus ReinPlan gesendet.\n',
      idempotencyKey: 'mail-health-' + company.id + '-' + new Date().toISOString().slice(0, 13),
    });

    if (result.status !== 'SENT') {
      return { status: 'error', message: result.detail };
    }

    return {
      status: 'success',
      message: 'Test-E-Mail wurde an ' + user.email + ' gesendet. ' + result.detail,
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Die Test-E-Mail konnte nicht gesendet werden.',
    };
  }
}
