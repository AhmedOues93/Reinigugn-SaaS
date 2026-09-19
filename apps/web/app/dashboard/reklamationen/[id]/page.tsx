import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { BackLink, PageHeader, Section } from '@/components/ui';
import { ComplaintForm } from '@/components/complaint-form';
import { FollowUpJobForm } from '@/components/follow-up-job-form';
import { JobPhotoGallery } from '@/components/job-photo-gallery';
import { JobPhotoUpload } from '@/components/job-photo-upload';
import { getComplaint, listComplaintFormOptions } from '@/lib/data/complaints';
import { listOperationalPhotos } from '@/lib/data/operational-photos';
import { formatDateTime } from '@/lib/format';
import {
  createFollowUpJob,
  deleteOperationalPhoto,
  updateComplaint,
  uploadOperationalPhoto,
} from '../actions';

function first<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type MemberLike = {
  profiles:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null;
};

function person(value: unknown) {
  const member = first(value as MemberLike | MemberLike[] | null);
  const profile = first(member?.profiles ?? null);
  return [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Mitarbeiter';
}

export default async function ComplaintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [record, options] = await Promise.all([getComplaint(id), listComplaintFormOptions()]);
  if (!record) notFound();
  const photos = await listOperationalPhotos('COMPLAINT', id);
  const { complaint } = record;
  const job = first(complaint.jobs as never) as { id?: string; title?: string } | null;
  const employees = record.employees.map((employee) => ({
    id: employee.id,
    name: person(employee),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href="/dashboard/reklamationen">Reklamationen</BackLink>
      <PageHeader title={complaint.title} />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <div className="rounded-xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
            <ComplaintForm
              complaint={complaint}
              options={options}
              action={updateComplaint.bind(null, id)}
              submitLabel="Änderungen speichern"
            />
          </div>

          <Section title="Fotos">
            <JobPhotoUpload
              action={uploadOperationalPhoto.bind(null, 'COMPLAINT', id)}
              checklistItems={[]}
            />
            <JobPhotoGallery
              photos={photos}
              deletablePhotoIds={photos.map((photo) => photo.id)}
              deleteAction={deleteOperationalPhoto}
            />
            {job?.id && (
              <p className="mt-3 text-sm text-muted-foreground">
                Weitere auftragsbezogene Fotos liegen im{' '}
                <Link
                  className="font-medium text-primary hover:underline"
                  href={`/dashboard/auftraege/${job.id}`}
                >
                  Auftrag
                </Link>
                .
              </p>
            )}
          </Section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
            <h2 className="mb-3 text-[15px] font-semibold">Nacharbeit</h2>
            {complaint.follow_up_job_id ? (
              <Link
                className="inline-flex min-h-touch items-center gap-2 text-sm font-medium text-primary hover:underline md:min-h-9"
                href={`/dashboard/auftraege/${complaint.follow_up_job_id}`}
              >
                Nacharbeitsauftrag öffnen
                <ExternalLink className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <FollowUpJobForm action={createFollowUpJob.bind(null, id)} employees={employees} />
            )}
          </section>

          <section>
            <h2 className="mb-3 text-[15px] font-semibold">Verlauf</h2>
            {record.updates.length === 0 ? (
              <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-5 text-sm text-muted-foreground">
                Noch keine operativen Aktualisierungen.
              </p>
            ) : (
              /* A complaint is a sequence of events, so the trail reads as one. */
              <ol className="relative space-y-5 border-s border-border ps-5">
                {record.updates.map((update) => (
                  <li key={update.id} className="relative">
                    <span
                      aria-hidden="true"
                      className="absolute -start-[1.4rem] top-1.5 size-2 rounded-full bg-border ring-4 ring-background"
                    />
                    <p className="text-sm font-medium text-foreground">
                      {person(update.company_members)}
                    </p>
                    <p className="break-anywhere mt-0.5 text-sm leading-6 text-muted-foreground">
                      {update.note}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground/80">
                      {formatDateTime('de', update.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
