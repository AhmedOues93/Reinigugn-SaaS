import { notFound } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { getServiceRecord } from '@/lib/data/service-record';
import { ServiceRecordView } from '@/components/service-record-view';
import { BackLink, ButtonLink } from '@/components/ui';
import { requireStaffCompany } from '@/lib/auth';

export default async function ServiceRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getServiceRecord(id);
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
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackLink href={`/dashboard/auftraege/${id}`}>Zurück zum Auftrag</BackLink>
        {record.job.status === 'COMPLETED' && job && (
          <div className="mb-3">
            {line ? (
              <ButtonLink href={`/dashboard/abrechnung/${line.invoice_id}`} variant="outline" size="sm">
                <Receipt className="size-4" aria-hidden="true" />
                Zur Rechnung
              </ButtonLink>
            ) : (
              <ButtonLink href={`/dashboard/abrechnung/neu?kunde=${job.customer_id}`} size="sm">
                <Receipt className="size-4" aria-hidden="true" />
                Abrechnen
              </ButtonLink>
            )}
          </div>
        )}
      </div>
      <ServiceRecordView record={record} />
    </div>
  );
}
