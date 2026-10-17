import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Download } from 'lucide-react';
import { buttonVariants } from '@/components/ui';
import { InvoiceStatusBadge } from '@/components/billing/invoice-status-badge';
import {
  InvoiceDocument,
  type InvoiceDocumentData,
} from '@/components/billing/invoice-document';
import { DocumentPrintStyles } from '@/components/document-print-styles';
import { portalBranding, portalLocale } from '@/lib/data/portal';
import { getPortalInvoice } from '@/lib/data/portal-invoices';
import { t } from '@/lib/i18n';
import { berlinDateKey } from '@/lib/date';

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
      <DocumentPrintStyles />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          href="/portal/rechnungen"
          className="-ms-2 inline-flex min-h-touch items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t(locale, 'portal.invoice.allTitle')}
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <InvoiceStatusBadge status={invoice.status === 'ISSUED' && invoice.due_date < berlinDateKey() ? 'OVERDUE' : invoice.status} locale={locale} />
          <a href={`/portal/rechnungen/${invoice.id}/pdf`} className={buttonVariants()}>
            <Download className="size-4" aria-hidden="true" />
            {t(locale, 'portal.invoice.download')}
          </a>
        </div>
      </div>
      <InvoiceDocument data={data} locale={locale} logoUrl={branding?.logoUrl ?? null} />
    </>
  );
}
