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

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function QualityInspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [inspection, photos] = await Promise.all([
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
  const inspector = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Büro';
  const criteria = Array.isArray(inspection.criteria) ? inspection.criteria : [];

  return (
    <div className="mx-auto max-w-5xl">
      <BackLink href="/dashboard/qualitaetskontrolle">Qualitätskontrolle</BackLink>
      <PageHeader
        title={object?.name ?? 'Qualitätskontrolle'}
        description={job?.title ?? 'Objektkontrolle'}
        meta={
          <>
            <Badge tone={inspection.result === 'PASS' ? 'success' : 'danger'}>
              {inspection.result === 'PASS' ? 'Bestanden' : 'Nicht bestanden'}
            </Badge>
            {inspection.score != null && <Badge tone="neutral">{inspection.score}/100</Badge>}
            {inspection.follow_up_required && <Badge tone="warning">Nacharbeit erforderlich</Badge>}
          </>
        }
        actions={
          inspection.follow_up_required && object?.id ? (
            <ButtonLink
              href={`/dashboard/reklamationen/neu?kunde=${encodeURIComponent(object.customer_id ?? '')}&objekt=${encodeURIComponent(object.id)}&auftrag=${encodeURIComponent(job?.id ?? '')}&titel=${encodeURIComponent('Nacharbeit Qualitätskontrolle')}`}
              variant="outline"
            >
              <TriangleAlert className="size-4" />
              Reklamation erfassen
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Section title="Prüfergebnis">
            <div className="rounded-xl border border-border/80 bg-card px-5 shadow-card">
              <dl className="divide-y divide-border/70">
                <DataRow label="Prüfdatum" value={formatDate('de', inspection.inspected_at)} />
                <DataRow label="Erfasst von" value={inspector} />
                <DataRow
                  label="Bewertung"
                  value={inspection.score != null ? `${inspection.score} von 100 Punkten` : 'Keine Punktzahl'}
                />
                <DataRow label="Nacharbeit" value={inspection.follow_up_required ? 'Erforderlich' : 'Nicht erforderlich'} />
              </dl>
            </div>
          </Section>

          {(criteria.length > 0 || inspection.notes) && (
            <Section title="Dokumentation">
              <div className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
                {criteria.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold">Prüfkriterien</p>
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
                    <p className="text-sm font-semibold">Notizen</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{inspection.notes}</p>
                  </div>
                )}
              </div>
            </Section>
          )}

          <Section title="Fotos">
            <div className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
              <JobPhotoUpload
                action={uploadOperationalPhoto.bind(null, 'QUALITY_INSPECTION', id)}
                checklistItems={[]}
              />
              <div className="mt-5">
                <JobPhotoGallery
                  photos={photos}
                  deletablePhotoIds={photos.map((photo) => photo.id)}
                  deleteAction={deleteOperationalPhoto}
                />
              </div>
            </div>
          </Section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
            <h2 className="font-semibold">Verknüpfung</h2>
            <dl className="mt-3 divide-y divide-border/70">
              <DataRow label="Objekt" value={object?.name ?? '—'} />
              <DataRow label="Einsatz" value={job?.title ?? 'Nicht verknüpft'} />
              {job?.scheduled_date && <DataRow label="Einsatzdatum" value={formatDate('de', job.scheduled_date)} />}
              <DataRow label="Erfasst" value={formatDateTime('de', inspection.created_at)} />
            </dl>
            {job?.id && (
              <Link
                href={`/dashboard/auftraege/${job.id}`}
                className="mt-4 inline-flex min-h-touch items-center gap-2 text-sm font-medium text-primary hover:underline"
              >
                Auftrag öffnen
                <ExternalLink className="size-4" />
              </Link>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
