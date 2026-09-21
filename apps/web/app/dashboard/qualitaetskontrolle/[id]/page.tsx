import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink, ShieldCheck, TriangleAlert } from 'lucide-react';
import { BackLink, Badge, ButtonLink, DataRow, PageHeader, Section } from '@/components/ui';
import { JobPhotoGallery } from '@/components/job-photo-gallery';
import { JobPhotoUpload } from '@/components/job-photo-upload';
import { getQualityInspection } from '@/lib/data/complaints';
import { listOperationalPhotos } from '@/lib/data/operational-photos';
import { formatDate, formatDateTime } from '@/lib/format';
import { deleteOperationalPhoto, uploadOperationalPhoto } from '../../reklamationen/actions';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function QualityInspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [locale, inspection, photos] = await Promise.all([
    currentLocale(),
    getQualityInspection(id),
    listOperationalPhotos('QUALITY_INSPECTION', id),
  ]);
  if (!inspection) notFound();

  const object = first(inspection.cleaning_objects as never) as { id?: string; name?: string; customer_id?: string } | null;
  const job = first(inspection.jobs as never) as { id?: string; title?: string; scheduled_date?: string } | null;
  const inspectorMember = first(inspection.company_members as never) as {
    profiles?: { first_name?: string | null; last_name?: string | null } | { first_name?: string | null; last_name?: string | null }[] | null;
  } | null;
  const profile = first(inspectorMember?.profiles ?? null);
  const inspector = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || t(locale, 'emp.messages.office');
  const criteria = Array.isArray(inspection.criteria) ? inspection.criteria : [];

  return (
    <div className="mx-auto max-w-5xl">
      <BackLink href="/dashboard/qualitaetskontrolle">{t(locale, 'quality.title')}</BackLink>
      <PageHeader
        title={object?.name ?? t(locale, 'quality.title')}
        description={job?.title ?? t(locale, 'quality.objectInspection')}
        meta={
          <>
            <Badge tone={inspection.result === 'PASS' ? 'success' : 'danger'}>
              {inspection.result === 'PASS' ? t(locale, 'quality.passed') : t(locale, 'quality.failed')}
            </Badge>
            {inspection.score != null && <Badge tone="neutral">{inspection.score}/100</Badge>}
            {inspection.follow_up_required && <Badge tone="warning">{t(locale, 'quality.followUpRequired')}</Badge>}
          </>
        }
        actions={
          inspection.follow_up_required && object?.id ? (
            <ButtonLink
              href={`/dashboard/reklamationen/neu?kunde=${encodeURIComponent(object.customer_id ?? '')}&objekt=${encodeURIComponent(object.id)}&auftrag=${encodeURIComponent(job?.id ?? '')}&titel=${encodeURIComponent(t(locale, 'quality.detail.followUpComplaintTitle'))}`}
              variant="outline"
            >
              <TriangleAlert className="size-4" />
              {t(locale, 'quality.detail.createComplaint')}
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Section title={t(locale, 'quality.detail.result')}>
            <div className="rounded-xl border border-border/80 bg-card px-5 shadow-card">
              <dl className="divide-y divide-border/70">
                <DataRow label={t(locale, 'quality.inspectedAt')} value={formatDate(locale, inspection.inspected_at)} />
                <DataRow label={t(locale, 'quality.detail.recordedBy')} value={inspector} />
                <DataRow
                  label={t(locale, 'quality.score')}
                  value={inspection.score != null ? t(locale, 'quality.detail.pointsOf100', { score: inspection.score }) : t(locale, 'quality.detail.noScore')}
                />
                <DataRow label={t(locale, 'quality.followUp')} value={inspection.follow_up_required ? t(locale, 'quality.detail.required') : t(locale, 'quality.detail.notRequired')} />
              </dl>
            </div>
          </Section>

          {(criteria.length > 0 || inspection.notes) && (
            <Section title={t(locale, 'quality.detail.documentation')}>
              <div className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
                {criteria.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold">{t(locale, 'quality.criteria')}</p>
                    <ul className="mt-3 space-y-2">
                      {criteria.map((criterion, index) => (
                        <li key={index} className="flex gap-2 text-sm leading-6">
                          <ShieldCheck className="mt-1 size-4 shrink-0 text-primary" />
                          <span>{String(criterion)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {inspection.notes && (
                  <div className={criteria.length > 0 ? 'mt-5 border-t border-border pt-5' : ''}>
                    <p className="text-sm font-semibold">{t(locale, 'quality.notes')}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{inspection.notes}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          <Section title={t(locale, 'quality.detail.photos')}>
            <div className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
              <JobPhotoUpload
                action={uploadOperationalPhoto.bind(null, 'QUALITY_INSPECTION', id)}
                checklistItems={[]}
                locale={locale}
              />
              <div className="mt-5">
                <JobPhotoGallery
                  photos={photos}
                  deletablePhotoIds={photos.map((photo) => photo.id)}
                  deleteAction={deleteOperationalPhoto}
                  locale={locale}
                />
              </div>
            </div>
          </Section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
            <h2 className="font-semibold">{t(locale, 'quality.detail.link')}</h2>
            <dl className="mt-3 divide-y divide-border/70">
              <DataRow label={t(locale, 'quality.object')} value={object?.name ?? '—'} />
              <DataRow label={t(locale, 'quality.job')} value={job?.title ?? t(locale, 'quality.detail.notLinked')} />
              {job?.scheduled_date && <DataRow label={t(locale, 'quality.detail.jobDate')} value={formatDate(locale, job.scheduled_date)} />}
              <DataRow label={t(locale, 'quality.detail.created')} value={formatDateTime(locale, inspection.created_at)} />
            </dl>
            {job?.id && (
              <Link
                href={`/dashboard/auftraege/${job.id}`}
                className="mt-4 inline-flex min-h-touch items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                {t(locale, 'quality.detail.openJob')}
                <ExternalLink className="size-4" />
              </Link>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
