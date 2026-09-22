import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';
import { BackLink, PageHeader, Section } from '@/components/ui';
import { ComplaintForm } from '@/components/complaint-form';
import { ComplaintCustomerReply } from '@/components/complaint-customer-reply';
import { FollowUpJobForm } from '@/components/follow-up-job-form';
import { ComplaintPhotoSection } from '@/components/complaint-photo-section';
import { getComplaint, listComplaintFormOptions } from '@/lib/data/complaints';
import { listOperationalPhotos } from '@/lib/data/operational-photos';
import { formatDateTime } from '@/lib/format';
import {
  createFollowUpJob,
  deleteOperationalPhoto,
  replyToComplaintCustomer,
  updateComplaint,
  uploadOperationalPhoto,
} from '../actions';

function first<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type MemberLike = {
  role?: string | null;
  profiles:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null;
};

function person(value: unknown) {
  const member = first(value as MemberLike | MemberLike[] | null);
  const profile = first(member?.profiles ?? null);
  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
  if (fullName) return fullName;
  const roleLabel: Record<string, string> = {
    OWNER: 'Inhaber',
    OFFICE: 'Büro',
    EMPLOYEE: 'Mitarbeiter',
    CUSTOMER: 'Kunde',
  };
  return roleLabel[member?.role ?? ''] ?? 'Benutzer';
}

export default async function ComplaintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [record, options] = await Promise.all([getComplaint(id), listComplaintFormOptions()]);
  if (!record) notFound();
  const photos = await listOperationalPhotos('COMPLAINT', id);
  const { complaint } = record;
  const job = first(complaint.jobs as never) as { id?: string; title?: string; scheduled_date?: string } | null;
  const jobEmployees = record.jobAssignments.map((assignment) => person(assignment.company_members));
  const employees = record.employees.map((employee) => ({
    id: employee.id,
    name: person(employee),
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href="/dashboard/reklamationen">Reklamationen</BackLink>
      <PageHeader title={complaint.title} />

      <div className="mx-auto max-w-4xl space-y-5">
        <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
          <ComplaintForm
            complaint={complaint}
            options={options}
            action={updateComplaint.bind(null, id)}
            submitLabel="Änderungen speichern"
          />
        </section>

        <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-semibold">Antwort an den Kunden</h2>
          <p className="mt-1 text-sm text-muted-foreground">Die Antwort erscheint direkt im Kundenportal im Verlauf dieser Reklamation.</p>
          <div className="mt-4">
            <ComplaintCustomerReply action={replyToComplaintCustomer.bind(null, id)} />
          </div>
        </section>

        {job?.id ? (
          <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Zugehöriger Einsatz</h2>
                {job.scheduled_date ? <p className="mt-1 text-sm text-muted-foreground">{job.scheduled_date}</p> : null}
              </div>
              <Link className="inline-flex min-h-touch items-center gap-1.5 text-sm font-medium text-primary hover:underline" href={`/dashboard/auftraege/${job.id}`}>
                Einsatz öffnen
                <ExternalLink className="size-4" aria-hidden="true" />
              </Link>
            </div>
            <div className="mt-4 rounded-xl bg-subtle p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Eingesetzte Mitarbeiter</p>
              {jobEmployees.length > 0 ? (
                <p className="mt-1.5 font-medium">{jobEmployees.join(', ')}</p>
              ) : (
                <p className="mt-1.5 text-sm text-muted-foreground">Keine Zuordnung gefunden.</p>
              )}
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-border/80 bg-card shadow-card">
          {complaint.follow_up_job_id ? (
            <div className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Nacharbeit</h2>
              <Link
                className="mt-3 inline-flex min-h-touch items-center gap-2 text-sm font-medium text-primary hover:underline"
                href={`/dashboard/auftraege/${complaint.follow_up_job_id}`}
              >
                Nacharbeitsauftrag öffnen
                <ExternalLink className="size-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <details>
              <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold sm:px-6">
                Nacharbeit planen
                <span className="text-xs font-normal text-muted-foreground">optional</span>
              </summary>
              <div className="border-t border-border/80 p-5 sm:p-6">
                <FollowUpJobForm action={createFollowUpJob.bind(null, id)} employees={employees} />
              </div>
            </details>
          )}
        </section>

        <Section title="Fotos">
          <ComplaintPhotoSection
            photos={photos}
            uploadAction={uploadOperationalPhoto.bind(null, 'COMPLAINT', id)}
            deleteAction={deleteOperationalPhoto}
          />
        </Section>

        <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
          <h2 className="text-lg font-semibold">Verlauf</h2>
          {record.updates.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Noch keine Aktualisierungen.</p>
          ) : (
            <ol className="relative mt-4 space-y-5 border-s border-border ps-5">
              {record.updates.map((update) => (
                <li key={update.id} className="relative">
                  <span aria-hidden="true" className="absolute -start-[1.4rem] top-1.5 size-2 rounded-full bg-border ring-4 ring-background" />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{person(update.company_members)}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">{formatDateTime('de', update.created_at)}</p>
                  </div>
                  <p className="break-anywhere mt-1 text-sm leading-6 text-muted-foreground">{update.note}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
