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
