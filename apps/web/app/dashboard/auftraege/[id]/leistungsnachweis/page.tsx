import { notFound } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { getServiceRecord } from '@/lib/data/service-record';
import { ServiceRecordView } from '@/components/service-record-view';
import { DocumentPrintStyles } from '@/components/document-print-styles';
import { PrintButton } from '@/components/billing/print-button';
import { BackLink, ButtonLink } from '@/components/ui';
import { requireStaffCompany } from '@/lib/auth';
import { currentLocale } from '@/lib/i18n-server';

export default async function ServiceRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [record, locale] = await Promise.all([getServiceRecord(id), currentLocale()]);
  if (!record) notFound();
  // Hand-off to billing: is this visit already on a live invoice?
  const { supabase, company } = await requireStaffCompany();
  const { data: job } = await supabase
    .from('jobs')
    .select('customer_id, invoice_lines(invoice_id, invoice_status)')
    .eq('company_id', company.id)
    .eq('id', id)
    .maybeSingle();
  const line = (job?.invoice_lines ?? []).find((entry) => entry.invoice_status !== 'CANCELLED');

  return (
    <div className="mx-auto max-w-[210mm]">
      <DocumentPrintStyles />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink href={`/dashboard/auftraege/${id}`}>Auftrag</BackLink>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {record.job.status === 'COMPLETED' &&
            job &&
            (line ? (
              <ButtonLink href={`/dashboard/abrechnung/${line.invoice_id}`} variant="outline">
                <Receipt className="size-4" aria-hidden="true" />
                Zur Rechnung
              </ButtonLink>
            ) : (
              <ButtonLink
                href={`/dashboard/abrechnung/neu?kunde=${job.customer_id}`}
                variant="outline"
              >
                <Receipt className="size-4" aria-hidden="true" />
                Abrechnen
              </ButtonLink>
            ))}
          <PrintButton locale={locale} label="Drucken" />
        </div>
      </div>
      <ServiceRecordView record={record} />
    </div>
  );
}
