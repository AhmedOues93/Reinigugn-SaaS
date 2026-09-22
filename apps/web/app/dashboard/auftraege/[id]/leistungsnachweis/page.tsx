import { notFound } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { getServiceRecord, hasStoredServiceRecord } from '@/lib/data/service-record';
import { ServiceRecordView } from '@/components/service-record-view';
import { ServiceAcceptancePanel } from '@/components/billing/service-acceptance-panel';
import { DocumentPrintStyles } from '@/components/document-print-styles';
import { PrintButton } from '@/components/billing/print-button';
import { BackLink, ButtonLink } from '@/components/ui';
import { requireStaffCompany } from '@/lib/auth';
import { listServiceRecordEvents } from '@/lib/data/billing';
import { currentLocale } from '@/lib/i18n-server';
import { resolveServiceDispute, revokeServiceAcceptance } from '../../../leistungsnachweise/actions';

export default async function ServiceRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [record, stored, locale, events] = await Promise.all([
    getServiceRecord(id),
    hasStoredServiceRecord(id),
    currentLocale(),
    listServiceRecordEvents(id),
  ]);
  if (!record || !stored) notFound();
  // Hand-off to billing: is this visit already on a live invoice?
  const { supabase, company, membership } = await requireStaffCompany();
  const [{ data: job }, { data: acceptanceRow }] = await Promise.all([
    supabase
      .from('jobs')
      .select('customer_id, invoice_lines(invoice_id, invoice_status)')
      .eq('company_id', company.id)
      .eq('id', id)
      .maybeSingle(),
    supabase.rpc('get_service_record', { p_job_id: id }),
  ]);
  const line = (job?.invoice_lines ?? []).find((entry) => entry.invoice_status !== 'CANCELLED');

  type AcceptanceRow = {
    status: 'ERFASST' | 'ABNAHME_AUSSTEHEND' | 'ABGENOMMEN' | 'PROBLEM_GEMELDET';
    acceptance_policy: 'KEINE_ABNAHME_ERFORDERLICH' | 'VOR_ORT_UNTERSCHRIFT' | 'PORTAL_ABNAHME';
    acceptance_method: 'KEINE' | 'VOR_ORT_UNTERSCHRIFT' | 'PORTAL_BESTAETIGUNG' | 'BUERO_FREIGABE' | null;
    accepted_at: string | null;
    accepted_by_name: string | null;
    signature_storage_path: string | null;
  };
  const acceptance = (Array.isArray(acceptanceRow) ? acceptanceRow[0] : acceptanceRow) as AcceptanceRow | null;

  // The signature bucket is private, like every other. Sign it per request.
  let signatureUrl: string | null = null;
  if (acceptance?.signature_storage_path) {
    const { data } = await supabase.storage
      .from('service-signatures')
      .createSignedUrl(acceptance.signature_storage_path, 900);
    signatureUrl = data?.signedUrl ?? null;
  }

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
                href={`/dashboard/abrechnung/neu?kunde=${job.customer_id}&einsatz=${job.id}`}
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

      {acceptance && (
        <ServiceAcceptancePanel
          policy={acceptance.acceptance_policy}
          status={acceptance.status}
          method={acceptance.acceptance_method}
          acceptedAt={acceptance.accepted_at}
          acceptedByName={acceptance.accepted_by_name}
          signatureUrl={signatureUrl}
          events={events}
          resolveAction={resolveServiceDispute.bind(null, id)}
          revokeAction={revokeServiceAcceptance.bind(null, id)}
          canRevoke={membership?.role === 'OWNER'}
          invoiced={Boolean(line)}
        />
      )}
    </div>
  );
}
