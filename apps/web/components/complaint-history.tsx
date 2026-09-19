import Link from 'next/link';
import { Badge, Card } from '@/components/ui';
import { listComplaints } from '@/lib/data/complaints';

const status: Record<string, string> = { OPEN: 'Offen', IN_PROGRESS: 'In Bearbeitung', RESOLVED: 'Gelöst', CLOSED: 'Geschlossen' };
const statusTone: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'> = { OPEN: 'info', IN_PROGRESS: 'warning', RESOLVED: 'success', CLOSED: 'neutral' };
const priority: Record<string, string> = { LOW: 'Niedrig', NORMAL: 'Normal', HIGH: 'Hoch', URGENT: 'Dringend' };
const priorityTone: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'> = { LOW: 'neutral', NORMAL: 'neutral', HIGH: 'warning', URGENT: 'danger' };
export async function ComplaintHistory({ customerId, objectId }: { customerId?: string; objectId?: string }) {
  const complaints = await listComplaints({ customerId, objectId }); const recent = complaints.slice(0, 5);
  return <Card className="mt-5 overflow-hidden"><div className="border-b p-5"><h2 className="font-semibold">Reklamationsverlauf</h2><p className="mt-1 text-sm text-muted-foreground">Aktuelle und letzte Reklamationen.</p></div>{recent.length === 0 ? <p className="p-5 text-sm text-muted-foreground">Keine Reklamationen vorhanden.</p> : <div className="divide-y">{recent.map((complaint) => <Link className="block p-5 hover:bg-muted" href={`/dashboard/reklamationen/${complaint.id}`} key={complaint.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{complaint.title}</p><p className="mt-1 text-xs text-muted-foreground">{new Intl.DateTimeFormat('de-DE').format(new Date(complaint.created_at))}</p></div><div className="flex gap-2"><Badge tone={priorityTone[complaint.priority]}>{priority[complaint.priority]}</Badge><Badge tone={statusTone[complaint.status]}>{status[complaint.status]}</Badge></div></div></Link>)}</div>}</Card>;
}
