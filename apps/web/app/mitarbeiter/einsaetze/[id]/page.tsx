import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, KeyRound, MapPin, Navigation, Phone, Sparkles, TriangleAlert, User } from 'lucide-react';
import { Badge, EmptyState } from '@/components/ui';
import { OfflineJobChecklist } from '@/components/employee/offline-checklist';
import { JobPhotoGallery } from '@/components/job-photo-gallery';
import { JobPhotoUpload } from '@/components/job-photo-upload';
import { JobTimeControl } from '@/components/job-time-control';
import { employeeLocale, requireEmployee } from '@/lib/data/employee';
import { getMyAssignedJob } from '@/lib/data/jobs';
import { listMyJobPhotos } from '@/lib/data/job-photos';
import { formatDate, formatTimeRange } from '@/lib/format';
import { t } from '@/lib/i18n';
import {
  completeMyChecklistItem,
  deleteMyJobPhoto,
  pauseMyJob,
  resumeMyJob,
  startMyJob,
  stopMyJob,
  uploadMyJobPhoto,
} from '../../actions';

function first<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/**
 * One visit, ordered by what happens on site: get in, clock in, work through
 * the checklist, document with photos. Access instructions are never hidden
 * behind a toggle — they are what the cleaner needs at the door.
 */
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
  const breaks = (entry?.job_time_breaks ?? []) as { started_at: string; ended_at: string | null }[];

  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
      <div className="space-y-4">
        <Link
          href="/mitarbeiter/einsaetze"
          className="-ms-2 inline-flex min-h-touch items-center gap-1 rounded-lg px-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="size-5 rtl:rotate-180" aria-hidden="true" />
          {t(locale, 'common.back')}
        </Link>

        {/* What, when, where. */}
        <header>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold tabular-nums text-primary">
              {formatTimeRange(locale, job.planned_start_at, job.planned_end_at)}
            </span>
            <span className="text-sm text-muted-foreground">{formatDate(locale, job.scheduled_date, 'long')}</span>
            {job.status === 'COMPLETED' && <Badge tone="success">{t(locale, 'emp.job.done')}</Badge>}
          </div>
          <h1 className="mt-1.5 text-balance text-[1.6rem] font-semibold leading-tight">{object?.name || job.title}</h1>
          <p className="mt-0.5 text-[15px] text-muted-foreground">{customer?.name}</p>
        </header>

        <JobTimeControl
          startAction={startMyJob.bind(null, job.id)}
          stopAction={stopMyJob.bind(null, job.id)}
          pauseAction={pauseMyJob.bind(null, job.id)}
          resumeAction={resumeMyJob.bind(null, job.id)}
          running={running}
          startedAt={entry?.started_at}
          finishedAt={entry?.finished_at}
          durationMinutes={entry?.duration_minutes}
          breaks={breaks}
          incompleteRequiredItems={incompleteRequiredItems}
          canStart={editable}
          locale={locale}
        />

        {job.employee_instructions && (
          <section className="flex gap-3 rounded-2xl border border-warning/25 bg-warning-soft p-4">
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-warning">{t(locale, 'emp.job.instructions')}</h2>
              <p className="break-anywhere mt-1 whitespace-pre-wrap text-[15px] leading-6 text-foreground">{job.employee_instructions}</p>
            </div>
          </section>
        )}

        {/* On site: address, access, contact — always visible. */}
        <section aria-labelledby="site-title" className="overflow-hidden rounded-3xl border border-border/80 bg-card shadow-card">
          <h2 id="site-title" className="px-5 pt-5 text-lg font-semibold">
            {t(locale, 'emp.job.site')}
          </h2>
          <ul className="divide-y divide-border/70">
            {address && (
              <li className="flex items-center gap-3 px-5 py-4">
                <MapPin className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="break-anywhere min-w-0 flex-1 text-[15px]">{address}</span>
                <a
                  href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t(locale, 'emp.job.navigate')}
                  className="grid size-touch shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  <Navigation className="size-5" aria-hidden="true" />
                </a>
              </li>
            )}
            {object?.access_instructions && (
              <li className="flex gap-3 px-5 py-4">
                <KeyRound className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t(locale, 'emp.job.access')}</p>
                  <p className="break-anywhere mt-0.5 whitespace-pre-wrap text-[15px] leading-6">{object.access_instructions}</p>
                </div>
              </li>
            )}
            {(object?.contact_person || object?.contact_phone) && (
              <li className="flex items-center gap-3 px-5 py-4">
                <User className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground">{t(locale, 'emp.job.contact')}</p>
                  <p className="text-[15px] font-medium">{object.contact_person ?? object.contact_phone}</p>
                </div>
                {object.contact_phone && (
                  <a
                    href={`tel:${object.contact_phone.replace(/\s/g, '')}`}
                    aria-label={`${t(locale, 'emp.job.call')}: ${object.contact_phone}`}
                    className="grid size-touch shrink-0 place-items-center rounded-xl bg-primary-soft text-primary transition-colors hover:bg-primary/15"
                  >
                    <Phone className="size-5" aria-hidden="true" />
                  </a>
                )}
              </li>
            )}
            {object?.cleaning_instructions && (
              <li className="flex gap-3 px-5 py-4">
                <Sparkles className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{t(locale, 'emp.job.cleaningNotes')}</p>
                  <p className="break-anywhere mt-0.5 whitespace-pre-wrap text-[15px] leading-6">{object.cleaning_instructions}</p>
                </div>
              </li>
            )}
          </ul>
        </section>
      </div>

      <div className="space-y-4 lg:pt-14">
        {items.length > 0 ? (
          <OfflineJobChecklist items={items} completeItem={completeMyChecklistItem} locale={locale} />
        ) : (
          <EmptyState title={t(locale, 'emp.job.noChecklist')} className="rounded-3xl py-8" />
        )}

        <section aria-labelledby="photos-title" className="space-y-4 rounded-3xl border border-border/80 bg-card p-5 shadow-card">
          <h2 id="photos-title" className="text-lg font-semibold">
            {t(locale, 'emp.job.photos')}
          </h2>
          {editable && (
            <JobPhotoUpload
              action={uploadMyJobPhoto.bind(null, job.id)}
              checklistItems={items.map((item) => ({ id: item.id, title: item.title }))}
              locale={locale}
            />
          )}
          <JobPhotoGallery
            photos={photos}
            deletablePhotoIds={editable ? photos.filter((photo) => photo.member_id === membership.id).map((photo) => photo.id) : []}
            deleteAction={deleteMyJobPhoto}
            locale={locale}
          />
        </section>
      </div>
    </div>
  );
}
