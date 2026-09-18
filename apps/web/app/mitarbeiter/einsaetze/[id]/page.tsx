import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, MapPin, Navigation } from 'lucide-react';
import { Badge, Card, EmptyState } from '@/components/ui';
import { JobChecklist } from '@/components/job-checklist';
import { JobPhotoGallery } from '@/components/job-photo-gallery';
import { JobPhotoUpload } from '@/components/job-photo-upload';
import { JobTimeControl } from '@/components/job-time-control';
import { SiteDetails } from '@/components/employee/site-details';
import { employeeLocale, requireEmployee } from '@/lib/data/employee';
import { getMyAssignedJob } from '@/lib/data/jobs';
import { listMyJobPhotos } from '@/lib/data/job-photos';
import { formatDate, formatTimeRange } from '@/lib/format';
import { t } from '@/lib/i18n';
import { completeMyChecklistItem, deleteMyJobPhoto, startMyJob, stopMyJob, uploadMyJobPhoto } from '../../actions';

function first<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function EmployeeJobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { membership } = await requireEmployee();
  const { id } = await params;
  const [locale, job, photos] = await Promise.all([employeeLocale(), getMyAssignedJob(id), listMyJobPhotos(id)]);
  if (!job) notFound();

  const customer = first(job.customers);
  const object = first(job.cleaning_objects);
  const entry = job.job_time_entries[0];
  const running = Boolean(entry && !entry.finished_at);
  const checklist = first(job.job_checklists);
  const items = checklist?.job_checklist_items ?? [];
  const incompleteRequiredItems = items.filter((item) => item.is_required && !item.completed_at).length;
  const editable = ['PLANNED', 'CONFIRMED', 'IN_PROGRESS'].includes(job.status);
  const address = [object?.street, [object?.postal_code, object?.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  return (
    <>
      <Link
        href="/mitarbeiter/einsaetze"
        className="mb-3 inline-flex min-h-touch items-center gap-1 text-sm font-medium text-muted-foreground"
      >
        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t(locale, 'common.back')}
      </Link>

      {/* What, where and when — the three things needed before starting. */}
      <div className="mb-4">
        <h1 className="text-balance text-xl font-semibold tracking-tight">{object?.name || job.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{customer?.name}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {running ? (
            <Badge tone="warning">{t(locale, 'emp.job.running')}</Badge>
          ) : job.status === 'COMPLETED' ? (
            <Badge tone="success">{t(locale, 'emp.job.done')}</Badge>
          ) : (
            <Badge tone="neutral">{t(locale, `status.${job.status}`)}</Badge>
          )}
          <span className="text-sm tabular-nums text-muted-foreground">
            {formatDate(locale, job.scheduled_date, 'long')} · {formatTimeRange(locale, job.planned_start_at, job.planned_end_at)}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {/* The time control is first: it is the action a cleaner opens this for. */}
        <JobTimeControl
          action={(running ? stopMyJob : startMyJob).bind(null, job.id)}
          running={running}
          startedAt={entry?.started_at}
          finishedAt={entry?.finished_at}
          durationMinutes={entry?.duration_minutes}
          incompleteRequiredItems={incompleteRequiredItems}
          locale={locale}
        />

        {address && (
          <Card className="p-4">
            <p className="flex items-start gap-2 text-sm">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="break-anywhere">{address}</span>
            </p>
            <a
              href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex min-h-touch w-full items-center justify-center gap-2 rounded-md border border-input bg-card text-sm font-semibold hover:bg-muted"
            >
              <Navigation className="size-4" aria-hidden="true" />
              {t(locale, 'emp.job.navigate')}
            </a>
          </Card>
        )}

        {job.employee_instructions && (
          <Card className="border-warning/30 bg-warning-soft p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-warning">{t(locale, 'emp.job.instructions')}</p>
            <p className="break-anywhere mt-1.5 whitespace-pre-wrap text-sm">{job.employee_instructions}</p>
          </Card>
        )}

        {object && <SiteDetails site={object} locale={locale} />}

        {items.length > 0 ? (
          <JobChecklist items={items} completeItem={completeMyChecklistItem} locale={locale} />
        ) : (
          <EmptyState title={t(locale, 'emp.job.noChecklist')} />
        )}

        {editable && (
          <JobPhotoUpload
            action={uploadMyJobPhoto.bind(null, job.id)}
            checklistItems={items.map((item) => ({ id: item.id, title: item.title }))}
            locale={locale}
          />
        )}

        <JobPhotoGallery
          photos={photos}
          canDelete={(photo) => photo.member_id === membership.id && editable}
          deleteAction={deleteMyJobPhoto}
        />
      </div>
    </>
  );
}
