import { requireStaffCompany } from '@/lib/auth';
import { berlinDateKey } from '@/lib/date';

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
/** OVERDUE is derived from the due date, never stored, so it cannot go stale. */
export type DisplayInvoiceStatus = InvoiceStatus | 'OVERDUE';

export function displayInvoiceStatus(
  status: InvoiceStatus,
  dueDate: string | null,
  today = berlinDateKey(),
): DisplayInvoiceStatus {
  return status === 'ISSUED' && dueDate && dueDate < today ? 'OVERDUE' : status;
}

const listSelection =
  'id, invoice_number, status, issue_date, due_date, service_period_start, service_period_end, currency, net_total_cents, vat_total_cents, gross_total_cents, customer_id, sent_at, last_reminder_at, reminder_count, paid_at, customers(name)';

export async function listInvoices({ status, customerId }: { status?: DisplayInvoiceStatus | 'all'; customerId?: string } = {}) {
  const { supabase, company } = await requireStaffCompany();
  let query = supabase
    .from('invoices')
    .select(listSelection)
    .eq('company_id', company.id)
    .order('created_at', { ascending: false });
  if (status && status !== 'all' && status !== 'OVERDUE') query = query.eq('status', status);
  if (customerId) query = query.eq('customer_id', customerId);

  const { data, error } = await query;
  if (error) throw new Error('Rechnungen konnten nicht geladen werden.');

  const today = berlinDateKey();
  const invoices = (data ?? []).map((invoice) => ({
    ...invoice,
    customerName:
      (Array.isArray(invoice.customers) ? invoice.customers[0] : invoice.customers)?.name ?? '',
    displayStatus: displayInvoiceStatus(invoice.status as InvoiceStatus, invoice.due_date, today),
  }));
  return status === 'OVERDUE'
    ? invoices.filter((invoice) => invoice.displayStatus === 'OVERDUE')
    : invoices;
}

export async function getInvoice(id: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('invoices')
    .select(
      `${listSelection}, payment_terms_days, customer_note, internal_note, customer_snapshot, company_snapshot, cancelled_at, cancellation_reason, corrects_invoice_id,
       invoice_lines(id, position, description, quantity, unit, unit_price_cents, vat_rate_basis_points, net_amount_cents, vat_amount_cents, gross_amount_cents, job_id, cleaning_object_id)`,
    )
    .eq('company_id', company.id)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('Rechnung konnte nicht geladen werden.');
  if (!data) return null;

  const customer = Array.isArray(data.customers) ? data.customers[0] : data.customers;
  return {
    ...data,
    customerName: customer?.name ?? '',
    displayStatus: displayInvoiceStatus(data.status as InvoiceStatus, data.due_date),
    lines: [...(data.invoice_lines ?? [])].sort((a, b) => a.position - b.position),
  };
}

export type PaymentMethod = 'BANK_TRANSFER' | 'CASH' | 'CARD' | 'DIRECT_DEBIT' | 'OTHER';

export type InvoicePayment = {
  id: string;
  amount_cents: number;
  currency: string;
  paid_on: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
  /** MANUAL today. A bank import or a provider would set its own value here. */
  source: 'MANUAL' | 'BANK_IMPORT' | 'STRIPE';
  recorded_by_name: string;
  created_at: string;
};

/**
 * The audit trail behind a paid invoice: what arrived, when, how, and who said
 * so. Read through the function rather than the table so one query answers
 * "which colleague booked this" without a join the caller has to get right.
 */
export async function listInvoicePayments(invoiceId: string): Promise<InvoicePayment[]> {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('list_invoice_payments', { p_invoice_id: invoiceId });
  if (error) throw new Error('Die Zahlungen konnten nicht geladen werden.');
  return (data ?? []) as InvoicePayment[];
}

export type BillingMode = 'PAUSCHALE_PRO_EINSATZ' | 'STUNDENSATZ' | 'MONATSPAUSCHALE';
export type AcceptancePolicy = 'KEINE_ABNAHME_ERFORDERLICH' | 'VOR_ORT_UNTERSCHRIFT' | 'PORTAL_ABNAHME';
export type AcceptanceMethod = 'KEINE' | 'VOR_ORT_UNTERSCHRIFT' | 'PORTAL_BESTAETIGUNG' | 'BUERO_FREIGABE';
export type ServiceQueue =
  | 'BEREIT'
  | 'ABNAHME_AUSSTEHEND'
  | 'PROBLEM_GEMELDET'
  | 'MONATSPAUSCHALE'
  | 'ABGERECHNET';

export type ServiceRecordRow = {
  job_id: string;
  service_record_id: string;
  service_date: string;
  title: string;
  customer_id: string;
  customer_name: string;
  object_name: string;
  net_minutes: number;
  status: 'ERFASST' | 'ABNAHME_AUSSTEHEND' | 'ABGENOMMEN' | 'PROBLEM_GEMELDET';
  acceptance_policy: AcceptancePolicy;
  acceptance_method: AcceptanceMethod | null;
  accepted_at: string | null;
  accepted_by_name: string | null;
  billing_mode: BillingMode;
  invoice_id: string | null;
  invoice_number: string | null;
  queue: ServiceQueue;
  /** The contract asks the customer to accept in the portal, and none can. */
  portal_contact_missing: boolean;
};

/**
 * The billing queue: completed work, grouped by what has to happen to it next.
 * One list replaces hunting through jobs for the ones that are ready.
 */
export async function listServiceRecords(from: string, to: string): Promise<ServiceRecordRow[]> {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('list_service_records', { p_from: from, p_to: to });
  if (error) throw new Error('Leistungsnachweise konnten nicht geladen werden.');
  return (data ?? []) as ServiceRecordRow[];
}

export type AcceptanceConfigWarning = {
  service_schedule_id: string;
  schedule_name: string;
  customer_id: string;
  customer_name: string;
  acceptance_policy: AcceptancePolicy;
  pending_count: number;
};

/**
 * Contracts that ask the customer to accept in the portal where no portal
 * contact exists. Without this, those visits simply never become billable and
 * nobody finds out until the month is closed.
 */
export async function listAcceptanceConfigWarnings(): Promise<AcceptanceConfigWarning[]> {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('list_acceptance_config_warnings');
  if (error) return [];
  return (data ?? []) as AcceptanceConfigWarning[];
}

export type ServiceRecordEvent = {
  event: 'ERSTELLT' | 'UNTERSCHRIEBEN' | 'BESTAETIGT' | 'PROBLEM_GEMELDET' | 'PROBLEM_GEKLAERT' | 'FREIGABE_WIDERRUFEN';
  actor_name: string | null;
  note: string | null;
  created_at: string;
};

export async function listServiceRecordEvents(jobId: string): Promise<ServiceRecordEvent[]> {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('list_service_record_events', { p_job_id: jobId });
  if (error) return [];
  return (data ?? []) as ServiceRecordEvent[];
}

export type BillableJob = {
  job_id: string;
  scheduled_date: string;
  title: string;
  object_id: string;
  object_name: string;
  duration_minutes: number;
  service_schedule_id: string | null;
  suggested_unit_price_cents: number | null;
  suggested_vat_rate_basis_points: number | null;
  billing_mode: BillingMode;
  /** What to invoice, per the contract — not per the stopwatch. */
  suggested_quantity: number;
  suggested_unit: string;
};

/**
 * Completed visits of one customer that no live invoice already bills. This is
 * both the provenance link and the duplicate-billing guard in the UI; the
 * database enforces the same rule with a unique index.
 */
export async function listBillableJobs(
  customerId: string,
  from: string,
  to: string,
): Promise<BillableJob[]> {
  const { supabase } = await requireStaffCompany();
  const { data, error } = await supabase.rpc('list_billable_jobs', {
    p_customer_id: customerId,
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error('Abrechenbare Einsätze konnten nicht geladen werden.');
  return data ?? [];
}

export async function listBillingCustomers() {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('customers')
    .select('id, name, customer_number')
    .eq('company_id', company.id)
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error('Kunden konnten nicht geladen werden.');
  return data ?? [];
}

/** Totals for the billing overview, derived from the same rows the list shows. */
export async function getBillingSummary() {
  const invoices = await listInvoices();
  const sum = (predicate: (value: (typeof invoices)[number]) => boolean) =>
    invoices.filter(predicate).reduce((total, invoice) => total + invoice.gross_total_cents, 0);
  return {
    draftCount: invoices.filter((invoice) => invoice.displayStatus === 'DRAFT').length,
    overdueCount: invoices.filter((invoice) => invoice.displayStatus === 'OVERDUE').length,
    openCents: sum(
      (invoice) => invoice.displayStatus === 'ISSUED' || invoice.displayStatus === 'OVERDUE',
    ),
    overdueCents: sum((invoice) => invoice.displayStatus === 'OVERDUE'),
    paidCents: sum((invoice) => invoice.displayStatus === 'PAID'),
  };
}

export type InvoiceDelivery = {
  id: string;
  kind: 'INVOICE' | 'REMINDER';
  channel: 'EMAIL' | 'MANUAL';
  recipient: string | null;
  status: 'SENT' | 'FAILED' | 'NOT_CONFIGURED' | 'MANUAL';
  detail: string | null;
  created_at: string;
};

/** Every delivery attempt for one invoice, newest first. */
export async function listInvoiceDeliveries(invoiceId: string): Promise<InvoiceDelivery[]> {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('invoice_deliveries')
    .select('id, kind, channel, recipient, status, detail, created_at')
    .eq('company_id', company.id)
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });
  if (error) throw new Error('Versandverlauf konnte nicht geladen werden.');
  return (data ?? []) as InvoiceDelivery[];
}

/** The customer's billing e-mail on file right now (used as the default recipient). */
export async function getCustomerBillingEmail(customerId: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data } = await supabase.from('customers').select('email').eq('company_id', company.id).eq('id', customerId).maybeSingle();
  return data?.email ?? null;
}
