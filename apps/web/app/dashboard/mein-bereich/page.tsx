import { redirect } from 'next/navigation';
import { Card } from '@/components/ui';
import { getCurrentCompany } from '@/lib/auth';
import { addDays, berlinDateKey } from '@/lib/date';
import { listMyAssignedJobs } from '@/lib/data/jobs';
import { JobStatusBadge, formatJobTime } from '@/components/job-badges';

export default async function MyAreaPage() {
  const { membership, profile } = await getCurrentCompany();
  if (!membership) redirect('/onboarding');
  if (membership.role !== 'EMPLOYEE') redirect('/dashboard');
  const today = berlinDateKey();
  const jobs = await listMyAssignedJobs({ from: today, to: addDays(today, 14) });
  const company = membership.companies as unknown as { name: string } | null;
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'willkommen';
  return <div className="mx-auto max-w-3xl"><p className="text-sm font-medium text-teal-700">{company?.name}</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Willkommen, {name}</h1><p className="mt-2 text-slate-600">Ihre heutigen und kommenden Einsaetze.</p><div className="mt-6 space-y-3">{jobs.length === 0 ? <Card className="p-6"><h2 className="font-semibold">Keine kommenden Einsaetze</h2><p className="mt-2 text-sm text-slate-600">Sobald Sie eingeplant werden, erscheinen Ihre Auftraege hier.</p></Card> : jobs.map((job) => { const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers; const object = Array.isArray(job.cleaning_objects) ? job.cleaning_objects[0] : job.cleaning_objects; return <Card key={job.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-medium text-teal-700">{new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(`${job.scheduled_date}T12:00:00`))}</p><h2 className="mt-1 text-lg font-semibold">{object?.name || job.title}</h2><p className="mt-1 text-sm text-slate-600">{customer?.name} · {formatJobTime(job.planned_start_at, job.planned_end_at)}</p></div><JobStatusBadge status={job.status} /></div><p className="mt-4 text-sm text-slate-700">{object?.street}, {object?.postal_code} {object?.city}</p>{job.employee_instructions && <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm text-amber-950"><span className="font-medium">Anweisung: </span>{job.employee_instructions}</p>}</Card>; })}</div></div>;
}
