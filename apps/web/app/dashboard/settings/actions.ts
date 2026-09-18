'use server';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { type FormState } from '@/lib/actions';
import { isLocale } from '@/lib/i18n';
import { requireOwnerCompany } from '@/lib/auth';

export async function updateCompanySettings(_: FormState, formData: FormData): Promise<FormState> {
  const value = Object.fromEntries(formData); const name = String(value.name ?? '').trim(); const language = String(value.default_language ?? 'de');
  if (name.length < 2 || name.length > 120) return { status: 'error', message: 'Bitte gib einen gültigen Firmennamen ein.' };
  if (!isLocale(language)) return { status: 'error', message: 'Bitte wähle eine gültige Standardsprache.' };
  const paymentTerms = String(value.default_payment_terms_days ?? ''); if (paymentTerms && (!/^\d+$/.test(paymentTerms) || Number(paymentTerms) > 365)) return { status: 'error', message: 'Das Zahlungsziel muss zwischen 0 und 365 Tagen liegen.' };
  try { const { supabase } = await requireOwnerCompany(); const { error } = await supabase.rpc('update_my_company_master_data', { p_name: name, p_legal_form: String(value.legal_form ?? ''), p_street: String(value.street ?? ''), p_postal_code: String(value.postal_code ?? ''), p_city: String(value.city ?? ''), p_country: String(value.country ?? 'Deutschland'), p_phone: String(value.phone ?? ''), p_email: String(value.email ?? ''), p_website: String(value.website ?? ''), p_tax_number: String(value.tax_number ?? ''), p_vat_id: String(value.vat_id ?? ''), p_billing_email: String(value.billing_email ?? ''), p_iban: String(value.iban ?? ''), p_bic: String(value.bic ?? ''), p_payment_terms: paymentTerms ? Number(paymentTerms) : null, p_timezone: String(value.timezone ?? 'Europe/Berlin'), p_language: language }); if (error) return { status: 'error', message: 'Die Firmendaten konnten nicht gespeichert werden.' }; const rateRaw = String(value.default_hourly_rate ?? '').replace(',', '.').trim();
    if (rateRaw) {
      const parsed = Number(rateRaw);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1_000_000) return { status: 'error', message: 'Bitte gib einen gültigen Stundensatz an.' };
      // `companies` grants UPDATE on name and slug only, so this goes through
      // the owner-gated function rather than a direct column write.
      const { error: rateError } = await supabase.rpc('set_company_default_hourly_rate', { p_cents: Math.round(parsed * 100) });
      if (rateError) return { status: 'error', message: 'Der Stundensatz konnte nicht gespeichert werden.' };
    }
    revalidatePath('/dashboard'); revalidatePath('/dashboard/settings'); return { status: 'success', message: 'Firmendaten gespeichert.' }; } catch { return { status: 'error', message: 'Nur Inhaber duerfen Firmendaten bearbeiten.' }; }
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
      if (uploadError) return { status: 'error', message: 'Das Logo konnte nicht hochgeladen werden.' };
    }

    const { error } = await supabase.rpc('set_company_branding', { p_storage_path: storagePath, p_brand_color: brandColor });
    if (error) {
      if (storagePath) await supabase.storage.from('company-branding').remove([storagePath]);
      return { status: 'error', message: 'Das Branding konnte nicht gespeichert werden.' };
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
