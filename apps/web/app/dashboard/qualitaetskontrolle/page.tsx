import { Plus, ShieldCheck } from 'lucide-react';
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui';
import { DataTable } from '@/components/data-table';
import { QualityInspectionForm } from '@/components/quality-inspection-form';
import { listComplaintFormOptions, listQualityInspections } from '@/lib/data/complaints';
import { formatDate } from '@/lib/format';
import { createQualityInspection } from '../reklamationen/actions';

function first<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

type Inspection = Awaited<ReturnType<typeof listQualityInspections>>[number];

export default async function QualityInspectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ neu?: string }>;
}) {
  const { neu } = await searchParams;
  const [inspections, options] = await Promise.all([
    listQualityInspections(),
    listComplaintFormOptions(),
  ]);

  return (
    <div>
      <PageHeader
        title="Qualitätskontrolle"
        description="Objektprüfungen dokumentieren, Abweichungen erkennen und Nacharbeit gezielt auslösen."
        actions={
          <ButtonLink href="/dashboard/qualitaetskontrolle?neu=1">
            <Plus className="size-4" aria-hidden="true" />
            Kontrolle erfassen
          </ButtonLink>
        }
      />

      {neu === '1' && (
        <Card className="mb-6 p-5 sm:p-6">
          <QualityInspectionForm
            objects={options.objects}
            jobs={options.jobs}
            action={createQualityInspection}
          />
        </Card>
      )}

      <DataTable<Inspection>
        caption="Qualitätskontrollen"
        rows={inspections}
        rowKey={(inspection) => inspection.id}
        rowHref={(inspection) => `/dashboard/qualitaetskontrolle/${inspection.id}`}
        columns={[
          {
            key: 'object',
            header: 'Objekt',
            mobile: 'title',
            cell: (inspection) => {
              const object = first(inspection.cleaning_objects as { name?: string } | { name?: string }[] | null);
              return object?.name ?? 'Objekt';
            },
          },
          {
            key: 'job',
            header: 'Einsatz',
            mobile: 'subtitle',
            cell: (inspection) => {
              const job = first(inspection.jobs as { title?: string } | { title?: string }[] | null);
              return job?.title ?? 'Objektkontrolle';
            },
          },
          {
            key: 'date',
            header: 'Prüfdatum',
            cell: (inspection) => formatDate('de', inspection.inspected_at),
          },
          {
            key: 'score',
            header: 'Bewertung',
            align: 'end',
            cell: (inspection) => (inspection.score != null ? `${inspection.score}/100` : '—'),
          },
          {
            key: 'result',
            header: 'Ergebnis',
            mobile: 'status',
            cell: (inspection) => (
              <span className="inline-flex flex-wrap justify-end gap-1">
                <Badge tone={inspection.result === 'PASS' ? 'success' : 'danger'}>
                  {inspection.result === 'PASS' ? 'Bestanden' : 'Nicht bestanden'}
                </Badge>
                {inspection.follow_up_required && <Badge tone="warning">Nacharbeit</Badge>}
              </span>
            ),
          },
        ]}
        empty={
          <EmptyState
            icon={<ShieldCheck />}
            title="Keine Qualitätskontrollen"
            body="Erfassen Sie Prüfungen direkt nach einer Objektbegehung."
          />
        }
      />
    </div>
  );
}
