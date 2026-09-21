import { Plus, ShieldCheck } from 'lucide-react';
import { Badge, ButtonLink, Card, EmptyState, PageHeader } from '@/components/ui';
import { DataTable } from '@/components/data-table';
import { QualityInspectionForm } from '@/components/quality-inspection-form';
import { listComplaintFormOptions, listQualityInspections } from '@/lib/data/complaints';
import { formatDate } from '@/lib/format';
import { createQualityInspection } from '../reklamationen/actions';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

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
  const [locale, inspections, options] = await Promise.all([
    currentLocale(),
    listQualityInspections(),
    listComplaintFormOptions(),
  ]);

  return (
    <div>
      <PageHeader
        title={t(locale, 'quality.title')}
        description={t(locale, 'quality.description')}
        actions={
          <ButtonLink href="/dashboard/qualitaetskontrolle?neu=1">
            <Plus className="size-4" aria-hidden="true" />
            {t(locale, 'quality.new')}
          </ButtonLink>
        }
      />

      {neu === '1' && (
        <Card className="mb-6 p-5 sm:p-6">
          <QualityInspectionForm
            objects={options.objects}
            jobs={options.jobs}
            action={createQualityInspection}
            locale={locale}
          />
        </Card>
      )}

      <DataTable<Inspection>
        caption={t(locale, 'quality.caption')}
        rows={inspections}
        rowKey={(inspection) => inspection.id}
        rowHref={(inspection) => `/dashboard/qualitaetskontrolle/${inspection.id}`}
        columns={[
          {
            key: 'object',
            header: t(locale, 'quality.object'),
            mobile: 'title',
            cell: (inspection) => {
              const object = first(inspection.cleaning_objects as { name?: string } | { name?: string }[] | null);
              return object?.name ?? t(locale, 'quality.object');
            },
          },
          {
            key: 'job',
            header: t(locale, 'quality.job'),
            mobile: 'subtitle',
            cell: (inspection) => {
              const job = first(inspection.jobs as { title?: string } | { title?: string }[] | null);
              return job?.title ?? t(locale, 'quality.objectInspection');
            },
          },
          {
            key: 'date',
            header: t(locale, 'quality.inspectedAt'),
            cell: (inspection) => formatDate(locale, inspection.inspected_at),
          },
          {
            key: 'score',
            header: t(locale, 'quality.score'),
            align: 'end',
            cell: (inspection) => (inspection.score != null ? `${inspection.score}/100` : '—'),
          },
          {
            key: 'result',
            header: t(locale, 'quality.result'),
            mobile: 'status',
            cell: (inspection) => (
              <span className="inline-flex flex-wrap justify-end gap-1">
                <Badge tone={inspection.result === 'PASS' ? 'success' : 'danger'}>
                  {inspection.result === 'PASS' ? t(locale, 'quality.passed') : t(locale, 'quality.failed')}
                </Badge>
                {inspection.follow_up_required && <Badge tone="warning">{t(locale, 'quality.followUp')}</Badge>}
              </span>
            ),
          },
        ]}
        empty={
          <EmptyState
            icon={<ShieldCheck />}
            title={t(locale, 'quality.emptyTitle')}
            body={t(locale, 'quality.emptyBody')}
          />
        }
      />
    </div>
  );
}
