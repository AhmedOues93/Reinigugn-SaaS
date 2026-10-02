'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { type FormState } from '@/lib/actions';
import { requireStaffCompany } from '@/lib/auth';
import { renderStaffInvoicePdf } from '@/lib/billing/invoice-pdf-data';
import { renderStaffXRechnung } from '@/lib/billing/invoice-xrechnung-data';
import { getBillableJob, getInvoice, listBillableJobs, listInvoicePayments } from '@/lib/data/billing';
import { sendMail } from '@/lib/mail/transport';
import { formatDate, formatMoney } from '@/lib/format';
import { randomUUID } from 'node:crypto';

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
  const buyerReference = String(formData.get('buyer_reference') ?? '').trim();
  const sourceJobId = String(formData.get('source_job_id') ?? '').trim() || null;

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
  if (buyerReference.length > 200) return failure('Die Käuferreferenz ist zu lang.');

  const sourceJob = sourceJobId ? await getBillableJob(sourceJobId) : null;
  if (sourceJobId && (!sourceJob || sourceJob.customer_id !== customerId)) {
    return failure('Der ausgewählte Einsatz ist nicht mehr abrechenbar.');
  }
  if (sourceJob && sourceJob.suggested_unit_price_cents == null) {
    return failure('Für diesen Einsatz ist kein vereinbarter Abrechnungspreis hinterlegt.');
  }

  let invoiceId: string;
  try {
    const { supabase } = await requireStaffCompany();
    const { data, error } = await supabase.rpc('create_draft_invoice', {
      p_customer_id: customerId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_payment_terms_days: paymentTermsRaw ? Number(paymentTermsRaw) : null,
      p_customer_note: customerNote || null,
      p_buyer_reference: buyerReference || null,
    });
    if (error || !data) return failure('Der Rechnungsentwurf konnte nicht angelegt werden.');
    invoiceId = data as string;

    if (sourceJob) {
      const { error: lineError } = await supabase.rpc('add_invoice_line', {
        p_invoice_id: invoiceId,
        p_description: [
          sourceJob.title,
          sourceJob.title.includes(sourceJob.object_name) ? null : sourceJob.object_name,
          formatDate('de', sourceJob.scheduled_date),
        ].filter(Boolean).join(' · ').slice(0, 500),
        p_quantity: sourceJob.suggested_quantity,
        p_unit: sourceJob.suggested_unit,
        p_unit_price_cents: sourceJob.suggested_unit_price_cents!,
        p_vat_rate_basis_points: sourceJob.suggested_vat_rate_basis_points ?? 1900,
        p_job_id: sourceJob.job_id,
        p_service_schedule_id: sourceJob.service_schedule_id,
        p_cleaning_object_id: sourceJob.object_id,
      });
      if (lineError) {
        await supabase.rpc('delete_draft_invoice', { p_invoice_id: invoiceId });
        return failure('Die erledigte Leistung konnte nicht automatisch in die Rechnung übernommen werden.');
      }
    }
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
          : 'Die Leistung konnte nicht hinzugefügt werden.',
      );
    }
  } catch {
    return failure('Die Leistung konnte nicht hinzugefügt werden.');
  }

  revalidateBilling(invoiceId);
  return { status: 'success', message: 'Leistung hinzugefügt.' };
}

export async function removeInvoiceLine(invoiceId: string, lineId: string): Promise<void> {
  const { supabase } = await requireStaffCompany();
  const { error } = await supabase.rpc('remove_invoice_line', { p_line_id: lineId });
  if (error) throw new Error('Die Leistung konnte nicht entfernt werden.');
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
          ? 'Eine Rechnung braucht mindestens eine Leistung.'
          : 'Die Rechnung konnte nicht ausgestellt werden.',
      );
    }
    revalidateBilling(invoiceId);
    return { status: 'success', message: `Rechnung ${data} wurde ausgestellt.` };
  } catch {
    return failure('Die Rechnung konnte nicht ausgestellt werden.');
  }
}

const PAYMENT_METHODS = ['BANK_TRANSFER', 'CASH', 'CARD', 'DIRECT_DEBIT', 'OTHER'] as const;

/**
 * Records a payment against an issued invoice, which settles it once the
 * payments reach the total. Reconciliation is manual and says so: somebody read
 * a bank statement and is entering what they saw. Nothing here detects a
 * transfer, and nothing pretends to.
 *
 * The amount is optional and defaults, in the database, to whatever is still
 * outstanding — so the ordinary case, one transfer for the whole invoice, is a
 * date and a button.
 */
export async function markInvoicePaid(
  invoiceId: string,
  _: FormState,
  formData: FormData,
): Promise<FormState> {
  const paidOn = String(formData.get('paid_on') ?? '').trim();
  const method = String(formData.get('method') ?? 'BANK_TRANSFER').trim();
  const reference = String(formData.get('reference') ?? '').trim();
  const amountRaw = String(formData.get('amount') ?? '').trim();
  const idempotencyKey = String(formData.get('idempotency_key') ?? '').trim() || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return failure('Bitte gib ein gültiges Zahlungsdatum an.');
  if (paidOn > new Date().toISOString().slice(0, 10)) {
    return failure('Das Zahlungsdatum darf nicht in der Zukunft liegen.');
  }
  if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
    return failure('Bitte wähle eine gültige Zahlungsart.');
  }
  if (reference.length > 200) return failure('Der Verwendungszweck ist zu lang.');

  // Entered in euro, sent in cents. Parsing here keeps a comma-formatted
  // amount from arriving at the database as something it cannot read.
  let amountCents: number | null = null;
  if (amountRaw) {
    const normalised = amountRaw.replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return failure('Bitte gib einen gültigen Betrag an.');
    amountCents = Math.round(Number(normalised) * 100);
    if (amountCents <= 0) return failure('Der Betrag muss größer als 0 sein.');
  }

  try {
    const { supabase } = await requireStaffCompany();
    const { error } = await supabase.rpc('record_invoice_payment', {
      p_invoice_id: invoiceId,
      p_paid_on: paidOn,
      p_method: method,
      p_reference: reference || null,
      p_amount_cents: amountCents,
      p_note: null,
      p_idempotency_key: idempotencyKey,
    });
    if (error) {
      // The database's refusals are the authoritative ones; say what it said
      // rather than a generic failure the office cannot act on.
      if (error.message.includes('already settled')) {
        return failure('Diese Rechnung ist bereits vollständig bezahlt.');
      }
      if (error.message.includes('remaining on this invoice')) {
        return failure('Der Betrag ist höher als der offene Restbetrag dieser Rechnung.');
      }
      if (error.message.includes('predate the invoice')) {
        return failure('Das Zahlungsdatum liegt vor dem Rechnungsdatum.');
      }
      if (error.message.includes('cancelled invoice')) {
        return failure('Eine stornierte Rechnung kann nicht bezahlt werden.');
      }
      if (error.message.includes('draft invoice')) {
        return failure('Ein Entwurf muss erst ausgestellt werden.');
      }
      return failure('Die Zahlung konnte nicht verbucht werden.');
    }
    revalidateBilling(invoiceId);
    return { status: 'success', message: 'Zahlungseingang verbucht.' };
  } catch {
    return failure('Die Zahlung konnte nicht verbucht werden.');
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

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function recordDelivery(
  invoiceId: string,
  kind: 'INVOICE' | 'REMINDER',
  channel: 'EMAIL' | 'MANUAL',
  recipient: string | null,
  status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | 'MANUAL',
  detail: string | null,
  provider: 'resend' | 'smtp' | null = null,
  providerMessageId: string | null = null,
  idempotencyKey: string | null = null,
  reminderLevel: number | null = null,
  reminderFeeCents = 0,
  reminderInterestCents = 0,
) {
  const { supabase } = await requireStaffCompany();
  const { error } = await supabase.rpc('record_invoice_delivery_v2', {
    p_invoice_id: invoiceId,
    p_kind: kind,
    p_channel: channel,
    p_recipient: recipient,
    p_status: status,
    p_detail: detail,
    p_provider: provider,
    p_provider_message_id: providerMessageId,
    p_idempotency_key: idempotencyKey,
    p_reminder_level: reminderLevel,
    p_reminder_fee_cents: reminderFeeCents,
    p_reminder_interest_cents: reminderInterestCents,
  });
  return error;
}

function parseOptionalEuroCents(value: FormDataEntryValue | null) {
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const normalized = raw.replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}

/**
 * Sends the issued invoice as a PDF attachment and logs the real outcome.
 * If no mail provider is configured, nothing is claimed: the attempt is logged
 * as NOT_CONFIGURED and the invoice is not marked as sent.
 */
export async function sendInvoiceEmail(invoiceId: string, _: FormState, formData: FormData): Promise<FormState> {
  return deliverByEmail(invoiceId, 'INVOICE', formData);
}

export async function sendPaymentReminder(invoiceId: string, _: FormState, formData: FormData): Promise<FormState> {
  return deliverByEmail(invoiceId, 'REMINDER', formData);
}

async function deliverByEmail(invoiceId: string, kind: 'INVOICE' | 'REMINDER', formData: FormData): Promise<FormState> {
  const recipient = String(formData.get('recipient') ?? '').trim();
  if (!emailPattern.test(recipient) || recipient.length > 320) return failure('Bitte gib eine gültige E-Mail-Adresse an.');

  const requestedLevel = Number(String(formData.get('reminder_level') ?? '0'));
  const reminderFeeCents = parseOptionalEuroCents(formData.get('reminder_fee'));
  const reminderInterestCents = parseOptionalEuroCents(formData.get('reminder_interest'));
  if (kind === 'REMINDER' && (reminderFeeCents == null || reminderInterestCents == null)) {
    return failure('Bitte prüfe Mahngebühr und Verzugszinsen.');
  }

  const invoice = await getInvoice(invoiceId);
  if (!invoice || invoice.status === 'DRAFT' || invoice.status === 'CANCELLED' || !invoice.invoice_number) {
    return failure('Nur ausgestellte, nicht stornierte Rechnungen können versendet werden.');
  }
  if (kind === 'REMINDER' && invoice.displayStatus !== 'OVERDUE') return failure('Eine Mahnung ist erst nach Fälligkeit möglich.');
  if (kind === 'REMINDER') {
    const expectedLevel = invoice.reminder_count + 1;
    if (expectedLevel > 3) return failure('Alle drei Mahnstufen wurden bereits dokumentiert.');
    if (requestedLevel !== expectedLevel) return failure('Die Mahnstufe ist nicht mehr aktuell. Bitte lade die Rechnung neu.');
  }

  const [rendered, xrechnung] = await Promise.all([
    renderStaffInvoicePdf(invoiceId),
    kind === 'INVOICE' ? renderStaffXRechnung(invoiceId) : Promise.resolve(null),
  ]);
  if (!rendered) return failure('Das PDF konnte nicht erzeugt werden.');

  /*
   * Eine Rechnung ohne ihre E-Rechnung geht nicht raus.
   *
   * Vorher wurde das XML nur angehaengt, wenn es sich erzeugen liess — sonst
   * ging dieselbe Mail stillschweigend mit dem PDF allein hinaus und wurde als
   * versendet protokolliert. Das Buero glaubte, eine gesetzeskonforme
   * E-Rechnung verschickt zu haben, und erfuhr das Gegenteil erst vom Kunden.
   *
   * Die fehlenden Angaben stehen in der Meldung, damit sie ergaenzt werden
   * koennen; die ausgestellte Rechnung selbst bleibt unberuehrt.
   */
  if (kind === 'INVOICE' && (!xrechnung?.xml || !xrechnung.fileName)) {
    const missing = xrechnung?.errors?.length ? ` Es fehlt: ${xrechnung.errors.join(' ')}` : '';
    return failure(
      `Nicht gesendet: Die E-Rechnung (XRechnung) konnte nicht erzeugt werden, und eine Rechnung ohne sie ist in Deutschland nicht zulässig.${missing}`,
    );
  }

  const company = (invoice.company_snapshot ?? {}) as Record<string, string | null>;
  const payments = kind === 'REMINDER' ? await listInvoicePayments(invoiceId) : [];
  const paidCents = payments.reduce((sum, payment) => sum + payment.amount_cents, 0);
  const outstandingCents = Math.max(0, invoice.gross_total_cents - paidCents);
  const amount = formatMoney('de', kind === 'REMINDER' ? outstandingCents : invoice.gross_total_cents, invoice.currency);
  const due = invoice.due_date ? formatDate('de', invoice.due_date) : '';
  const dunningTotalCents = outstandingCents + (reminderFeeCents ?? 0) + (reminderInterestCents ?? 0);
  const reminderExtras = [
    (reminderFeeCents ?? 0) > 0 ? `Mahngebühr: ${formatMoney('de', reminderFeeCents ?? 0, invoice.currency)}` : null,
    (reminderInterestCents ?? 0) > 0 ? `Verzugszinsen: ${formatMoney('de', reminderInterestCents ?? 0, invoice.currency)}` : null,
  ].filter(Boolean).join('\n');
  const subject =
    kind === 'INVOICE'
      ? `Rechnung ${invoice.invoice_number} von ${company.name ?? ''}`.trim()
      : `${requestedLevel}. Mahnung zu Rechnung ${invoice.invoice_number}`;
  const text =
    kind === 'INVOICE'
      ? `Guten Tag,\n\nanbei erhalten Sie die Rechnung ${invoice.invoice_number} über ${amount}, zahlbar bis ${due}.\nSie finden die Rechnung außerdem jederzeit in Ihrem Kundenportal.\n\nMit freundlichen Grüßen\n${company.name ?? ''}`
      : `Guten Tag,\n\ndie Rechnung ${invoice.invoice_number} mit einem offenen Betrag von ${amount} war am ${due} fällig.\n${reminderExtras ? `${reminderExtras}\nGesamtforderung: ${formatMoney('de', dunningTotalCents, invoice.currency)}\n` : ''}Bitte begleichen Sie den offenen Betrag. Sollte sich Ihre Zahlung mit dieser Mahnung überschnitten haben, betrachten Sie sie bitte als gegenstandslos.\n\nMit freundlichen Grüßen\n${company.name ?? ''}`;

  /*
   * One key identifies this attempt end to end. The browser supplies it with
   * the form, so a double-clicked button, a replayed server action and a
   * user-initiated retry of the same failed send all carry the same value:
   * Resend refuses to deliver twice, and `record_invoice_delivery` returns the
   * row it already wrote instead of counting a second reminder. A fresh page
   * load produces a new key, which is what a deliberate second send is.
   */
  const submitted = String(formData.get('idempotency_key') ?? '').trim();
  const idempotencyKey = /^[A-Za-z0-9_-]{8,100}$/.test(submitted) ? submitted : randomUUID();

  const result = await sendMail({
    to: recipient,
    subject,
    text,
    replyTo: company.email,
    attachments: [
      { filename: rendered.fileName, content: rendered.bytes, contentType: 'application/pdf' },
      ...(xrechnung?.xml && xrechnung.fileName
        ? [{ filename: xrechnung.fileName, content: Buffer.from(xrechnung.xml, 'utf8'), contentType: 'application/xml' }]
        : []),
    ],
    idempotencyKey,
  });

  const error = await recordDelivery(
    invoiceId,
    kind,
    'EMAIL',
    recipient,
    result.status,
    result.detail,
    result.provider,
    result.providerMessageId,
    // Only a delivered message is worth de-duplicating: a failure must stay
    // retryable, and a retry that succeeds must be recorded.
    result.status === 'SENT' ? idempotencyKey : null,
    kind === 'REMINDER' ? requestedLevel : null,
    kind === 'REMINDER' ? reminderFeeCents ?? 0 : 0,
    kind === 'REMINDER' ? reminderInterestCents ?? 0 : 0,
  );
  revalidateBilling(invoiceId);
  if (error) return failure('Der Versand konnte nicht protokolliert werden.');
  if (result.status === 'SENT') return { status: 'success', message: kind === 'INVOICE' ? `Rechnung an ${recipient} gesendet.` : `${requestedLevel}. Mahnung an ${recipient} gesendet.` };
  if (result.status === 'NOT_CONFIGURED') {
    return failure('Nicht gesendet: Es ist kein E-Mail-Versand eingerichtet. Laden Sie das PDF herunter und vermerken Sie den Versand manuell.');
  }
  return failure('Nicht gesendet: Der Mailserver hat die Nachricht abgelehnt. Details stehen im Versandverlauf.');
}

/** Records a delivery made outside the app (post, own mail client, handed over). */
export async function recordManualDelivery(invoiceId: string, _: FormState, formData: FormData): Promise<FormState> {
  const kind = String(formData.get('kind') ?? 'INVOICE') === 'REMINDER' ? 'REMINDER' : 'INVOICE';
  const method = String(formData.get('method') ?? 'EXTERNAL_EMAIL');
  const methodLabel: Record<string, string> = {
    EXTERNAL_EMAIL: 'Extern per E-Mail',
    POST: 'Per Post',
    PERSONAL: 'Persönlich übergeben',
    OTHER: 'Sonstiger Weg',
  };
  const note = String(formData.get('note') ?? '').trim().slice(0, 400);
  const detail = [methodLabel[method] ?? methodLabel.OTHER, note].filter(Boolean).join(' · ');
  const reminderLevel = kind === 'REMINDER' ? Number(String(formData.get('reminder_level') ?? '0')) : null;
  const error = await recordDelivery(
    invoiceId,
    kind,
    'MANUAL',
    null,
    'MANUAL',
    detail,
    null,
    null,
    null,
    reminderLevel,
    0,
    0,
  );
  revalidateBilling(invoiceId);
  if (error) {
    return failure(
      error.message.includes('overdue')
        ? 'Eine Mahnung ist erst nach Fälligkeit möglich.'
        : 'Der Versand konnte nicht vermerkt werden.',
    );
  }
  return { status: 'success', message: kind === 'INVOICE' ? 'Versand vermerkt.' : `${reminderLevel}. Mahnung vermerkt.` };
}

/**
 * Adds every completed, not yet billed visit in the service period as one line
 * each — the normal month-end case — using the agreed plan rate where known.
 */
export async function addAllBillableJobs(invoiceId: string, _: FormState, __: FormData): Promise<FormState> {
  const invoice = await getInvoice(invoiceId);
  if (!invoice || invoice.status !== 'DRAFT') return failure('Leistungen können nur einem Entwurf hinzugefügt werden.');
  const jobs = await listBillableJobs(invoice.customer_id, invoice.service_period_start, invoice.service_period_end);
  const priced = jobs.filter((job) => job.suggested_unit_price_cents != null);
  if (jobs.length === 0) return failure('Im Leistungszeitraum gibt es keine abrechenbaren Einsätze.');
  if (priced.length === 0) {
    return failure('Für diese Einsaetze ist kein Preis im Leistungsplan hinterlegt. Bitte prüfe zuerst die vereinbarten Preise.');
  }

  const { supabase } = await requireStaffCompany();
  let added = 0;
  for (const job of priced) {
    // Quantity and unit come from the contract's billing mode, decided in the
    // database. This used to multiply the agreed price by the hours the
    // cleaners recorded, always — so a plan sold at 48 € per visit invoiced
    // 120 € whenever the visit ran two and a half hours. Recorded time is
    // operational and payroll evidence; only an explicitly hourly contract
    // lets it set what the customer is charged.
    const { error } = await supabase.rpc('add_invoice_line', {
      p_invoice_id: invoiceId,
      p_description: [job.title, job.title.includes(job.object_name) ? null : job.object_name, formatDate('de', job.scheduled_date)].filter(Boolean).join(' · ').slice(0, 500),
      p_quantity: job.suggested_quantity,
      p_unit: job.suggested_unit,
      p_unit_price_cents: job.suggested_unit_price_cents!,
      p_vat_rate_basis_points: job.suggested_vat_rate_basis_points ?? 1900,
      p_job_id: job.job_id,
      p_service_schedule_id: job.service_schedule_id,
      p_cleaning_object_id: job.object_id,
    });
    if (!error) added += 1;
  }
  revalidateBilling(invoiceId);
  const skipped = jobs.length - added;
  return {
    status: added > 0 ? 'success' : 'error',
    message:
      added > 0
        ? `${added} Einsätze übernommen${skipped ? `, ${skipped} ohne hinterlegten Preis bitte einzeln erfassen` : ''}.`
        : 'Es konnten keine Einsätze übernommen werden.',
  };
}
