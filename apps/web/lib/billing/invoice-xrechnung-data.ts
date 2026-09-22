import { getInvoice } from '@/lib/data/billing';
import {
  renderXRechnung,
  validateXRechnung,
  xrechnungFileName,
  type XRechnungInput,
} from '@/lib/billing/xrechnung';

type Invoice = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;

export function invoiceToXRechnungInput(invoice: Invoice): XRechnungInput | null {
  if (
    invoice.status === 'DRAFT' ||
    invoice.status === 'CANCELLED' ||
    !invoice.invoice_number ||
    !invoice.issue_date ||
    !invoice.due_date
  ) {
    return null;
  }

  return {
    invoiceNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    servicePeriodStart: invoice.service_period_start,
    servicePeriodEnd: invoice.service_period_end,
    currency: invoice.currency,
    buyerReference: invoice.buyer_reference ?? null,
    netTotalCents: invoice.net_total_cents,
    vatTotalCents: invoice.vat_total_cents,
    grossTotalCents: invoice.gross_total_cents,
    customer: invoice.customer_snapshot as Record<string, unknown> | null,
    company: invoice.company_snapshot as Record<string, unknown> | null,
    lines: invoice.lines.map((line) => ({
      position: line.position,
      description: line.description,
      quantity: Number(line.quantity),
      unit: line.unit,
      unit_price_cents: line.unit_price_cents,
      vat_rate_basis_points: line.vat_rate_basis_points,
      net_amount_cents: line.net_amount_cents,
      vat_amount_cents: line.vat_amount_cents,
    })),
  };
}

export function xrechnungReadiness(invoice: Invoice): { ready: boolean; errors: string[] } {
  const input = invoiceToXRechnungInput(invoice);
  if (!input) return { ready: false, errors: ['Nur ausgestellte, nicht stornierte Rechnungen koennen als XRechnung exportiert werden.'] };
  const errors = validateXRechnung(input);
  return { ready: errors.length === 0, errors };
}

export async function renderStaffXRechnung(id: string) {
  const invoice = await getInvoice(id);
  if (!invoice) return null;
  const input = invoiceToXRechnungInput(invoice);
  if (!input) return null;
  const errors = validateXRechnung(input);
  if (errors.length) return { errors, xml: null, fileName: null };
  return {
    errors: [],
    xml: renderXRechnung(input),
    fileName: xrechnungFileName(input.invoiceNumber),
  };
}
