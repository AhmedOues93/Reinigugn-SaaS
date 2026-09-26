import { notFound } from 'next/navigation';
import { InvoiceDocument, type InvoiceDocumentData } from '@/components/billing/invoice-document';
import { DocumentPrintStyles } from '@/components/document-print-styles';
import { PrintButton } from '@/components/billing/print-button';
import { BackLink } from '@/components/ui';
import { requireStaffCompany } from '@/lib/auth';
import { getCompanyBranding } from '@/lib/data/branding';
import { getInvoice } from '@/lib/data/billing';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

export default async function InvoiceDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { company } = await requireStaffCompany();
  const [locale, invoice, branding] = await Promise.all([
    currentLocale(),
    getInvoice(id),
    getCompanyBranding(company.id),
  ]);
  // A draft has no number and no snapshots, so it has no document yet.
  if (!invoice || invoice.status === 'DRAFT') notFound();

  const data: InvoiceDocumentData = {
    invoiceNumber: invoice.invoice_number!,
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
    buyerReference: invoice.buyer_reference,
    cancelledAt: invoice.cancelled_at,
    customer: invoice.customer_snapshot as InvoiceDocumentData['customer'],
    company: invoice.company_snapshot as InvoiceDocumentData['company'],
    lines: invoice.lines,
  };

  return (
    <div className="mx-auto max-w-[210mm]">
      <DocumentPrintStyles />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink href={`/dashboard/abrechnung/${invoice.id}`}>
          {t(locale, 'billing.invoice')}
        </BackLink>
        <PrintButton locale={locale} />
      </div>
      <InvoiceDocument data={data} locale={locale} logoUrl={branding?.logoUrl ?? null} />
    </div>
  );
}
