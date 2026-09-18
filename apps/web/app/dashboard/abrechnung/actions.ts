'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';

function failure(message: string): FormState {
  return { status: 'error', message };
}

/**
 * Every billing action confirms an OWNER/OFFICE session and then calls a
 * security-definer function. Amounts are never sent from the browser: the client
 * supplies quantity, unit price and VAT rate, and the database computes net, VAT
 * and gross, so a displayed total can never diverge from the stored one.
 */
function revalidateBilling(invoiceId?: string) {
  revalidatePath('/dashboard/abrechnung');
  if (invoiceId) revalidatePath(`/dashboard/abrechnung/${invoiceId}`);
  revalidatePath('/portal/rechnungen');
}

export async function createDraftInvoice(_: FormState, formData: FormData): Promise<FormState> {
  const customerId = String(formData.get('customer_id') ?? '').trim();
  const periodStart = String(formData.get('service_period_start') ?? '');
  const periodEnd = String(formData.get('service_period_end') ?? '');
  const paymentTermsRaw = String(formData.get('payment_terms_days') ?? '').trim();
  const customerNote = String(formData.get('customer_note') ?? '').trim();

  if (!customerId) return failure('Bitte wähle einen Kunden aus.');
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(periodStart) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) ||
    periodEnd < periodStart
  ) {
    return failure('Bitte gib einen gültigen Leistungszeitraum an.');
  }
  if (paymentTermsRaw && (!/^\d+$/.test(paymentTermsRaw) || Number(paymentTermsRaw) > 365)) {
    return failure('Das Zahlungsziel muss zwischen 0 und 365 Tagen liegen.');
  }
  if (customerNote.length > 2000) return failure('Der Hinweistext ist zu lang.');

  let invoiceId: string;
  try {
    const { supabase } = await requireStaffCompany();
    const { data, error } = await supabase.rpc('create_draft_invoice', {
      p_customer_id: customerId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_payment_terms_days: paymentTermsRaw ? Number(paymentTermsRaw) : null,
      p_customer_note: customerNote || null,
    });
    if (error || !data) return failure('Der Rechnungsentwurf konnte nicht angelegt werden.');
    invoiceId = data as string;
  } catch {
    return failure('Der Rechnungsentwurf konnte nicht angelegt werden.');
  }

  revalidateBilling();
  redirect(`/dashboard/abrechnung/${invoiceId}`);
}

export async function addInvoiceLine(
  invoiceId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const description = String(formData.get('description') ?? '').trim();
  const quantity = Number(String(formData.get('quantity') ?? '').replace(',', '.'));
  const unit = String(formData.get('unit') ?? 'Stk').trim();
  const unitPriceEuros = Number(String(formData.get('unit_price') ?? '').replace(',', '.'));
  const vatPercent = Number(String(formData.get('vat_rate') ?? '19').replace(',', '.'));
  const jobId = String(formData.get('job_id') ?? '').trim() || null;
  const objectId = String(formData.get('cleaning_object_id') ?? '').trim() || null;
  const scheduleId = String(formData.get('service_schedule_id') ?? '').trim() || null;

  if (description.length < 1 || description.length > 500)
    return failure('Bitte gib eine Beschreibung an.');
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000)
    return failure('Bitte gib eine gültige Menge an.');
  if (!Number.isFinite(unitPriceEuros) || unitPriceEuros < 0 || unitPriceEuros > 1_000_000)
    return failure('Bitte gib einen gültigen Einzelpreis an.');
  if (!Number.isFinite(vatPercent) || vatPercent < 0 || vatPercent > 100)
    return failure('Bitte gib einen gültigen Umsatzsteuersatz an.');

  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('add_invoice_line', {
      p_invoice_id: invoiceId,
      p_description: description,
      p_quantity: quantity,
      p_unit: unit,
      p_unit_price_cents: Math.round(unitPriceEuros * 100),
      p_vat_rate_basis_points: Math.round(vatPercent * 100),
      p_job_id: jobId,
      p_service_schedule_id: scheduleId,
      p_cleaning_object_id: objectId,
    });
    if (error) {
      return failure(
        error.message.includes('already been billed')
          ? 'Dieser Einsatz wurde bereits abgerechnet.'
          : 'Die Position konnte nicht hinzugefügt werden.',
      );
    }
  } catch {
    return failure('Die Position konnte nicht hinzugefügt werden.');
  }

  revalidateBilling(invoiceId);
  return { status: 'success', message: 'Position hinzugefügt.' };
}

export async function removeInvoiceLine(invoiceId: string, lineId: string): Promise<void> {
  const { supabase } = await requireStaffCompany();
  const { error } = await supabase.rpc('remove_invoice_line', { p_line_id: lineId });
  if (error) throw new Error('Die Position konnte nicht entfernt werden.');
  revalidateBilling(invoiceId);
}

export async function issueInvoice(
  invoiceId: string,
  _: FormState,
  __: FormData,
): Promise<FormState> {
  try {
    const { supabase } = await requireStaffCompany();
    const { data, error } = await supabase.rpc('issue_invoice', { p_invoice_id: invoiceId });
    if (error) {
      return failure(
        error.message.includes('at least one line')
          ? 'Eine Rechnung braucht mindestens eine Position.'
          : 'Die Rechnung konnte nicht festgeschrieben werden.',
      );
    }
    revalidateBilling(invoiceId);
    return { status: 'success', message: `Rechnung ${data} wurde festgeschrieben.` };
  } catch {
    return failure('Die Rechnung konnte nicht festgeschrieben werden.');
  }
}

export async function markInvoicePaid(
  invoiceId: string,
  _: FormState,
  __: FormData,
): Promise<FormState> {
  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('mark_invoice_paid', { p_invoice_id: invoiceId });
    if (error) return failure('Die Rechnung konnte nicht als bezahlt markiert werden.');
    revalidateBilling(invoiceId);
    return { status: 'success', message: 'Rechnung als bezahlt markiert.' };
  } catch {
    return failure('Die Rechnung konnte nicht als bezahlt markiert werden.');
  }
}

/** Cancellation keeps the issued document and its lines; nothing is rewritten. */
export async function cancelInvoice(
  invoiceId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 3) return failure('Bitte gib einen Stornierungsgrund an.');
  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('cancel_invoice', {
      p_invoice_id: invoiceId,
      p_reason: reason,
    });
    if (error) return failure('Die Rechnung konnte nicht storniert werden.');
    revalidateBilling(invoiceId);
    return { status: 'success', message: 'Rechnung wurde storniert.' };
  } catch {
    return failure('Die Rechnung konnte nicht storniert werden.');
  }
}

export async function createCorrectionInvoice(
  invoiceId: string,
  _: FormState,
  __: FormData,
): Promise<FormState> {
  let correctionId: string;
  try {
    const { supabase } = await requireStaffCompany();
    const { data, error } = await supabase.rpc('create_correction_invoice', {
      p_invoice_id: invoiceId,
    });
    if (error || !data) return failure('Die Korrekturrechnung konnte nicht erstellt werden.');
    correctionId = data as string;
  } catch {
    return failure('Die Korrekturrechnung konnte nicht erstellt werden.');
  }
  revalidateBilling(invoiceId);
  redirect(`/dashboard/abrechnung/${correctionId}`);
}

export async function deleteDraftInvoice(invoiceId: string): Promise<void> {
  const { supabase } = await requireStaffCompany();
  const { error } = await supabase.rpc('delete_draft_invoice', { p_invoice_id: invoiceId });
  if (error) throw new Error('Der Entwurf konnte nicht gelöscht werden.');
  revalidateBilling();
  redirect('/dashboard/abrechnung');
}
