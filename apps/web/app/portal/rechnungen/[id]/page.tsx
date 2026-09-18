import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import {
  InvoiceDocument,
  InvoicePrintStyles,
  type InvoiceDocumentData,
} from '@/components/billing/invoice-document';
import { PrintButton } from '@/components/billing/print-button';
import { portalBranding, portalLocale } from '@/lib/data/portal';
import { getPortalInvoice } from '@/lib/data/portal-invoices';
import { t } from '@/lib/i18n';

export default async function PortalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [locale, invoice, branding] = await Promise.all([
    portalLocale(),
    getPortalInvoice(id),
    portalBranding(),
  ]);
  if (!invoice) notFound();

  const data: InvoiceDocumentData = {
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
  };

  return (
    <>
      <InvoicePrintStyles />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/portal/rechnungen"
          className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-slate-600"
        >
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t(locale, 'common.back')}
        </Link>
        <PrintButton locale={locale} />
      </div>
      <InvoiceDocument data={data} locale={locale} logoUrl={branding?.logoUrl ?? null} />
    </>
  );
}
