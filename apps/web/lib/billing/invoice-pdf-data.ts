import { requireStaffCompany } from '@/lib/auth';
import { getCompanyBranding } from '@/lib/data/branding';
import { getInvoice } from '@/lib/data/billing';
import { getPortalInvoice } from '@/lib/data/portal-invoices';
import { portalBranding } from '@/lib/data/portal';
import { fetchLogo, invoiceFileName, renderInvoicePdf, type InvoicePdfInput } from '@/lib/billing/invoice-pdf';

type Rendered = { bytes: Uint8Array; fileName: string; invoiceNumber: string };

/** Staff side: any issued, paid or cancelled invoice of the own company. Drafts have no document. */
export async function renderStaffInvoicePdf(id: string): Promise<Rendered | null> {
  const { supabase, company } = await requireStaffCompany();
  const invoice = await getInvoice(id);
  if (!invoice || invoice.status === 'DRAFT' || !invoice.invoice_number) return null;

  let correctsInvoiceNumber: string | null = null;
  if (invoice.corrects_invoice_id) {
    const { data } = await supabase.from('invoices').select('invoice_number').eq('id', invoice.corrects_invoice_id).eq('company_id', company.id).maybeSingle();
    correctsInvoiceNumber = data?.invoice_number ?? null;
  }
  const branding = await getCompanyBranding(company.id);
  const input: InvoicePdfInput = {
    invoiceNumber: invoice.invoice_number,
    status: invoice.status,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    servicePeriodStart: invoice.service_period_start,
    servicePeriodEnd: invoice.service_period_end,
    currency: invoice.currency,
    netTotalCents: invoice.net_total_cents,
    vatTotalCents: invoice.vat_total_cents,
    grossTotalCents: invoice.gross_total_cents,
    customerNote: invoice.customer_note,
    cancelledAt: invoice.cancelled_at,
    correctsInvoiceNumber,
    customer: invoice.customer_snapshot as Record<string, unknown> | null,
    company: invoice.company_snapshot as Record<string, unknown> | null,
    lines: invoice.lines,
    logo: await fetchLogo(branding?.logoUrl ?? null),
  };
  return {
    bytes: await renderInvoicePdf(input),
    fileName: invoiceFileName(invoice.invoice_number, Boolean(correctsInvoiceNumber)),
    invoiceNumber: invoice.invoice_number,
  };
}

/** Portal side: only the signed-in customer's own non-draft invoices, via the RLS-safe RPC. */
export async function renderPortalInvoicePdf(id: string): Promise<Rendered | null> {
  const invoice = await getPortalInvoice(id);
  if (!invoice) return null;
  const branding = await portalBranding();
  const input: InvoicePdfInput = {
    invoiceNumber: invoice.invoice_number,
    status: invoice.status,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    servicePeriodStart: invoice.service_period_start,
    servicePeriodEnd: invoice.service_period_end,
    currency: invoice.currency,
    netTotalCents: invoice.net_total_cents,
    vatTotalCents: invoice.vat_total_cents,
    grossTotalCents: invoice.gross_total_cents,
    customerNote: invoice.customer_note,
    cancelledAt: invoice.cancelled_at,
    customer: invoice.customer_snapshot,
    company: invoice.company_snapshot,
    lines: invoice.lines ?? [],
    logo: await fetchLogo(branding?.logoUrl ?? null),
  };
  return { bytes: await renderInvoicePdf(input), fileName: invoiceFileName(invoice.invoice_number), invoiceNumber: invoice.invoice_number };
}

export function pdfResponse(rendered: Rendered, disposition: 'attachment' | 'inline' = 'attachment') {
  return new Response(Buffer.from(rendered.bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${disposition}; filename="${rendered.fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
