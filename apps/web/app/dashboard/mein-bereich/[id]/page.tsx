import { notFound, redirect } from 'next/navigation';
import { Card } from '@/components/ui';
import { getCurrentCompany } from '@/lib/auth';
import { getMyAssignedJob } from '@/lib/data/jobs';
import { listMyJobPhotos } from '@/lib/data/job-photos';
import { formatJobTime } from '@/components/job-badges';
import { JobTimeControl } from '@/components/job-time-control';
import { JobChecklist } from '@/components/job-checklist';
import { JobPhotoGallery } from '@/components/job-photo-gallery';
import { JobPhotoUpload } from '@/components/job-photo-upload';
import { completeMyChecklistItem, deleteMyJobPhoto, startMyJob, stopMyJob, uploadMyJobPhoto } from '../actions';

export default async function MyJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { membership } = await getCurrentCompany(); if (!membership) redirect('/onboarding'); if (membership.role !== 'EMPLOYEE') redirect('/dashboard');
  const { id } = await params; const [job, photos] = await Promise.all([getMyAssignedJob(id), listMyJobPhotos(id)]); if (!job) notFound();
  const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers; const object = Array.isArray(job.cleaning_objects) ? job.cleaning_objects[0] : job.cleaning_objects;
  const entry = job.job_time_entries[0]; const running = Boolean(entry && !entry.finished_at); const checklist = Array.isArray(job.job_checklists) ? job.job_checklists[0] : job.job_checklists; const items = checklist?.job_checklist_items ?? []; const incompleteRequiredItems = items.filter((item) => item.is_required && !item.completed_at).length;
  return <div className="mx-auto max-w-xl"><h1 className="text-2xl font-semibold">{job.title}</h1><p className="mt-2 text-slate-600">{customer?.name} · {object?.name}</p><div className="mt-6 space-y-4"><Card className="p-5"><dl className="space-y-4 text-sm"><div><dt className="text-slate-500">Adresse</dt><dd className="mt-1 font-medium">{object?.street}, {object?.postal_code} {object?.city}</dd></div><div><dt className="text-slate-500">Geplante Zeit</dt><dd className="mt-1 font-medium">{formatJobTime(job.planned_start_at, job.planned_end_at)}</dd></div>{job.employee_instructions && <div><dt className="text-slate-500">Arbeitsanweisung</dt><dd className="mt-1 whitespace-pre-wrap">{job.employee_instructions}</dd></div>}</dl></Card><JobChecklist items={items} completeItem={completeMyChecklistItem} /><JobPhotoUpload action={uploadMyJobPhoto.bind(null, job.id)} checklistItems={items.map((item) => ({ id: item.id, title: item.title }))} /><JobPhotoGallery photos={photos} canDelete={(photo) => photo.member_id === membership.id && ['PLANNED', 'CONFIRMED', 'IN_PROGRESS'].includes(job.status)} deleteAction={deleteMyJobPhoto} /><JobTimeControl action={(running ? stopMyJob : startMyJob).bind(null, job.id)} running={running} startedAt={entry?.started_at} finishedAt={entry?.finished_at} durationMinutes={entry?.duration_minutes} incompleteRequiredItems={incompleteRequiredItems} /></div></div>;
}
