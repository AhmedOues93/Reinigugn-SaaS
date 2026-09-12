import { notFound, redirect } from 'next/navigation';
import { Card } from '@/components/ui';
import { getCurrentCompany } from '@/lib/auth';
import { getMyAssignedJob } from '@/lib/data/jobs';
import { formatJobTime } from '@/components/job-badges';
import { JobTimeControl } from '@/components/job-time-control';
import { startMyJob, stopMyJob } from '../actions';

export default async function MyJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { membership } = await getCurrentCompany(); if (!membership) redirect('/onboarding'); if (membership.role !== 'EMPLOYEE') redirect('/dashboard');
  const job = await getMyAssignedJob((await params).id); if (!job) notFound();
  const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers; const object = Array.isArray(job.cleaning_objects) ? job.cleaning_objects[0] : job.cleaning_objects;
  const entry = job.job_time_entries[0]; const running = Boolean(entry && !entry.finished_at);
  return <div className="mx-auto max-w-xl"><h1 className="text-2xl font-semibold">{job.title}</h1><p className="mt-2 text-slate-600">{customer?.name} · {object?.name}</p><div className="mt-6 space-y-4"><Card className="p-5"><dl className="space-y-4 text-sm"><div><dt className="text-slate-500">Adresse</dt><dd className="mt-1 font-medium">{object?.street}, {object?.postal_code} {object?.city}</dd></div><div><dt className="text-slate-500">Geplante Zeit</dt><dd className="mt-1 font-medium">{formatJobTime(job.planned_start_at, job.planned_end_at)}</dd></div>{job.employee_instructions && <div><dt className="text-slate-500">Arbeitsanweisung</dt><dd className="mt-1 whitespace-pre-wrap">{job.employee_instructions}</dd></div>}</dl></Card><JobTimeControl action={(running ? stopMyJob : startMyJob).bind(null, job.id)} running={running} startedAt={entry?.started_at} finishedAt={entry?.finished_at} durationMinutes={entry?.duration_minutes} /></div></div>;
}
