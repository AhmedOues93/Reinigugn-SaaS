import Link from 'next/link';
import { Card } from '@/components/ui';
import { listComplaints } from '@/lib/data/complaints';

const status: Record<string, string> = { OPEN: 'Offen', IN_PROGRESS: 'In Bearbeitung', RESOLVED: 'Geloest', CLOSED: 'Geschlossen' };
const priority: Record<string, string> = { LOW: 'Niedrig', NORMAL: 'Normal', HIGH: 'Hoch', URGENT: 'Dringend' };
export async function ComplaintHistory({ customerId, objectId }: { customerId?: string; objectId?: string }) {
  const complaints = await listComplaints({ customerId, objectId }); const recent = complaints.slice(0, 5);
  return <Card className="mt-5 overflow-hidden"><div className="border-b p-5"><h2 className="font-semibold">Reklamationsverlauf</h2><p className="mt-1 text-sm text-slate-600">Aktuelle und letzte Reklamationen.</p></div>{recent.length === 0 ? <p className="p-5 text-sm text-slate-600">Keine Reklamationen vorhanden.</p> : <div className="divide-y">{recent.map((complaint) => <Link className="block p-5 hover:bg-slate-50" href={`/dashboard/reklamationen/${complaint.id}`} key={complaint.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{complaint.title}</p><p className="mt-1 text-xs text-slate-500">{new Intl.DateTimeFormat('de-DE').format(new Date(complaint.created_at))}</p></div><div className="flex gap-2"><span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium">{priority[complaint.priority]}</span><span className="rounded bg-teal-50 px-2 py-1 text-xs font-medium text-teal-800">{status[complaint.status]}</span></div></div></Link>)}</div>}</Card>;
}
