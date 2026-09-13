'use server';
import { revalidatePath } from 'next/cache';
import { type FormState } from '@/lib/actions';
import { requireOwnerCompany } from '@/lib/auth';

export async function updateCompanySettings(_: FormState, formData: FormData): Promise<FormState> {
  const value = Object.fromEntries(formData); const name = String(value.name ?? '').trim(); const language = String(value.default_language ?? 'de');
  if (name.length < 2 || name.length > 120) return { status: 'error', message: 'Bitte gib einen gültigen Firmennamen ein.' };
  if (!['de', 'en', 'fr', 'ar', 'tr', 'ro', 'pl'].includes(language)) return { status: 'error', message: 'Bitte wähle eine gültige Standardsprache.' };
  const paymentTerms = String(value.default_payment_terms_days ?? ''); if (paymentTerms && (!/^\d+$/.test(paymentTerms) || Number(paymentTerms) > 365)) return { status: 'error', message: 'Das Zahlungsziel muss zwischen 0 und 365 Tagen liegen.' };
  try { const { supabase } = await requireOwnerCompany(); const { error } = await supabase.rpc('update_my_company_master_data', { p_name: name, p_legal_form: String(value.legal_form ?? ''), p_street: String(value.street ?? ''), p_postal_code: String(value.postal_code ?? ''), p_city: String(value.city ?? ''), p_country: String(value.country ?? 'Deutschland'), p_phone: String(value.phone ?? ''), p_email: String(value.email ?? ''), p_website: String(value.website ?? ''), p_tax_number: String(value.tax_number ?? ''), p_vat_id: String(value.vat_id ?? ''), p_billing_email: String(value.billing_email ?? ''), p_iban: String(value.iban ?? ''), p_bic: String(value.bic ?? ''), p_payment_terms: paymentTerms ? Number(paymentTerms) : null, p_timezone: String(value.timezone ?? 'Europe/Berlin'), p_language: language }); if (error) return { status: 'error', message: 'Die Firmendaten konnten nicht gespeichert werden.' }; revalidatePath('/dashboard'); revalidatePath('/dashboard/settings'); return { status: 'success', message: 'Firmendaten gespeichert.' }; } catch { return { status: 'error', message: 'Nur Inhaber duerfen Firmendaten bearbeiten.' }; }
}
