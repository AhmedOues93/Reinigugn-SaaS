import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, MapPin } from 'lucide-react';
import { Card } from '@/components/ui';
import { JobChecklist } from '@/components/job-checklist';
import { JobPhotoGallery } from '@/components/job-photo-gallery';
import { JobPhotoUpload } from '@/components/job-photo-upload';
import { JobTimeControl } from '@/components/job-time-control';
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

  return (
    <>
      <Link
        href="/mitarbeiter/einsaetze"
        className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-slate-600"
      >
        <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        {t(locale, 'common.back')}
      </Link>

      <h1 className="text-xl font-semibold tracking-tight">{object?.name || job.title}</h1>
      <p className="mt-1 text-sm text-slate-600">{customer?.name}</p>

      <div className="mt-4 space-y-4">
        <Card className="p-5">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="text-slate-500">{t(locale, 'common.date')}</dt>
              <dd className="mt-1 font-medium">{formatDate(locale, job.scheduled_date, 'long')}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t(locale, 'emp.job.plannedTime')}</dt>
              <dd className="mt-1 font-medium">{formatTimeRange(locale, job.planned_start_at, job.planned_end_at)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t(locale, 'common.address')}</dt>
              <dd className="mt-1 flex items-start gap-1.5 font-medium">
                <MapPin className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span>
                  {object?.street}, {object?.postal_code} {object?.city}
                </span>
              </dd>
            </div>
            {job.employee_instructions && (
              <div>
                <dt className="text-slate-500">{t(locale, 'emp.job.instructions')}</dt>
                <dd className="mt-1 whitespace-pre-wrap rounded-md bg-amber-50 p-3 text-amber-950">{job.employee_instructions}</dd>
              </div>
            )}
          </dl>
        </Card>

        <JobTimeControl
          action={(running ? stopMyJob : startMyJob).bind(null, job.id)}
          running={running}
          startedAt={entry?.started_at}
          finishedAt={entry?.finished_at}
          durationMinutes={entry?.duration_minutes}
          incompleteRequiredItems={incompleteRequiredItems}
          locale={locale}
        />

        <JobChecklist items={items} completeItem={completeMyChecklistItem} locale={locale} />

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
