import Link from 'next/link';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { listActiveEmployeeOptions, listJobs, type JobStatusFilter } from '@/lib/data/jobs';
import { listCustomerOptions } from '@/lib/data/customers';
import { listCleaningObjectOptions } from '@/lib/data/cleaning-objects';
import { Button, Card } from '@/components/ui';
import { JobStatusBadge, formatJobTime } from '@/components/job-badges';
import { listAffectedAssignments } from '@/lib/data/absences';

type Qüry = { week?: string; customer?: string; object?: string; employee?: string; status?: string };

function monday(value?: string) { const date = value ? new Date(`${value}T12:00:00`) : new Date(); const day = date.getDay() || 7; date.setDate(date.getDate() - day + 1); return date; }
function dateKey(date: Date) { return date.toISOString().slice(0, 10); }
function status(value?: string): JobStatusFilter { return value === 'PLANNED' || value === 'CONFIRMED' || value === 'CANCELLED' ? value : 'all'; }
function search(query: Qüry, week: string) { const params = new URLSearchParams(); params.set('week', week); if (query.customer) params.set('customer', query.customer); if (query.object) params.set('object', query.object); if (query.employee) params.set('employee', query.employee); if (query.status && query.status !== 'all') params.set('status', query.status); return params.toString(); }

export default async function PlanningPage({ searchParams }: { searchParams: Promise<Qüry> }) {
  const query = await searchParams;
  const currentStatus = status(query.status);
  const start = monday(query.week);
  const days = Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date; });
  const end = days[6]!;
  const [jobs, customers, objects, employees, affectedAssignments] = await Promise.all([
    listJobs({ from: dateKey(start), to: dateKey(end), customerId: query.customer, objectId: query.object, memberId: query.employee, status: currentStatus }),
    listCustomerOptions(),
    listCleaningObjectOptions(),
    listActiveEmployeeOptions(),
    listAffectedAssignments(dateKey(start), dateKey(end)),
  ]);
  const previous = new Date(start); previous.setDate(start.getDate() - 7);
  const next = new Date(start); next.setDate(start.getDate() + 7);
  return <div className="mx-auto max-w-7xl">
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="text-2xl font-semibold">Planung</h1><p className="mt-2 text-slate-600">Wochenansicht aller geplanten Reinigungseinsätze.</p></div><div className="flex gap-2"><Link href="/dashboard/planung/plaene"><Button variant="outline">Wiederkehrende Pläne</Button></Link><Link href="/dashboard/auftraege/neu"><Button><Plus className="mr-2 size-4" />Auftrag</Button></Link></div></div>
    {affectedAssignments.length > 0 && <Card className="mb-5 border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-medium">{affectedAssignments.length} Einsatz{affectedAssignments.length === 1 ? '' : 'e'} sind durch Urlaub oder Krankheit betroffen.</p><p className="mt-1">Die Zuweisungen wurden nicht entfernt. Legen Sie bei Bedarf unter „Urlaub & Krankheit“ eine Vertretung fest.</p></Card>}
    <Card className="mb-5 p-4"><form className="grid gap-3 md:grid-cols-2 xl:grid-cols-5"><input type="hidden" name="week" value={dateKey(start)} /><select className="min-h-touch rounded-md border bg-white px-3 text-sm" name="customer" defaultValue={query.customer ?? ''}><option value="">Alle Kunden</option>{customers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className="min-h-touch rounded-md border bg-white px-3 text-sm" name="object" defaultValue={query.object ?? ''}><option value="">Alle Objekte</option>{objects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select className="min-h-touch rounded-md border bg-white px-3 text-sm" name="employee" defaultValue={query.employee ?? ''}><option value="">Alle Mitarbeiter</option>{employees.map((item) => { const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles; return <option key={item.id} value={item.id}>{[profile?.first_name, profile?.last_name].filter(Boolean).join(' ')}</option>; })}</select><select className="min-h-touch rounded-md border bg-white px-3 text-sm" name="status" defaultValue={currentStatus}><option value="all">Alle Status</option><option value="PLANNED">Geplant</option><option value="CONFIRMED">Bestätigt</option><option value="CANCELLED">Storniert</option></select><Button type="submit" variant="outline">Filtern</Button></form></Card>
    <div className="mb-5 flex items-center justify-between"><Link href={`/dashboard/planung?${search(query, dateKey(previous))}`}><Button variant="outline"><ChevronLeft className="size-4" /></Button></Link><Link href="/dashboard/planung"><Button variant="outline">Heute</Button></Link><Link href={`/dashboard/planung?${search(query, dateKey(next))}`}><Button variant="outline"><ChevronRight className="size-4" /></Button></Link></div>
    <div className="grid gap-3 lg:grid-cols-7">{days.map((day) => { const key = dateKey(day); const dayJobs = jobs.filter((job) => job.scheduled_date === key); return <Card key={key} className="min-h-44 p-3"><p className="text-sm font-semibold">{new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }).format(day)}</p><div className="mt-3 space-y-2">{dayJobs.length === 0 ? <p className="text-xs text-slate-400">Keine Einsätze</p> : dayJobs.map((job) => { const object = Array.isArray(job.cleaning_objects) ? job.cleaning_objects[0] : job.cleaning_objects; const customer = Array.isArray(job.customers) ? job.customers[0] : job.customers; const affected = affectedAssignments.some((assignment) => assignment.jobId === job.id); return <Link key={job.id} href={`/dashboard/auftraege/${job.id}`} className={`block rounded border-l-2 p-2 hover:bg-primary-soft ${affected ? 'border-amber-500 bg-amber-50' : 'border-primary bg-slate-50'}`}><p className="text-xs font-medium">{formatJobTime(job.planned_start_at, job.planned_end_at)}</p><p className="mt-1 text-sm font-semibold">{object?.name || job.title}</p><p className="mt-1 text-xs text-slate-600">{customer?.name}</p>{affected && <p className="mt-1 text-xs font-medium text-amber-800">Abwesenheit beachten</p>}<div className="mt-2"><JobStatusBadge status={job.status} /></div></Link>; })}</div></Card>; })}</div>
  </div>;
}
