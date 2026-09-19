import { MessageSquareWarning, Plus } from 'lucide-react';
import { Badge, ButtonLink, EmptyState, PageHeader, type Tone } from '@/components/ui';
import { DataTable } from '@/components/data-table';
import { listComplaints } from '@/lib/data/complaints';
import { berlinDateKey } from '@/lib/date';
import { formatDate } from '@/lib/format';

const status: Record<string, string> = { OPEN: 'Offen', IN_PROGRESS: 'In Bearbeitung', RESOLVED: 'Gelöst', CLOSED: 'Geschlossen' };
const statusTone: Record<string, Tone> = { OPEN: 'info', IN_PROGRESS: 'warning', RESOLVED: 'success', CLOSED: 'neutral' };
const priority: Record<string, string> = { LOW: 'Niedrig', NORMAL: 'Normal', HIGH: 'Hoch', URGENT: 'Dringend' };
const priorityTone: Record<string, Tone> = { LOW: 'neutral', NORMAL: 'neutral', HIGH: 'warning', URGENT: 'danger' };

function first<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type Complaint = Awaited<ReturnType<typeof listComplaints>>[number];

export default async function ComplaintsPage() {
  const complaints = await listComplaints();
  const today = berlinDateKey();
  const overdue = (complaint: Complaint) => Boolean(complaint.due_date && complaint.due_date < today && !['RESOLVED', 'CLOSED'].includes(complaint.status));

  return (
    <>
      <PageHeader
        title="Reklamationen"
        description="Beschwerden von Kunden und aus dem Portal – mit Frist, Priorität und Verlauf."
        actions={
          <ButtonLink href="/dashboard/reklamationen/neu">
            <Plus className="size-4" aria-hidden="true" />
            Reklamation erfassen
          </ButtonLink>
        }
      />
      <DataTable<Complaint>
        caption="Reklamationen"
        rows={complaints}
        rowKey={(complaint) => complaint.id}
        rowHref={(complaint) => `/dashboard/reklamationen/${complaint.id}`}
        columns={[
          { key: 'title', header: 'Vorgang', mobile: 'title', cell: (complaint) => complaint.title },
          {
            key: 'site',
            header: 'Kunde / Objekt',
            mobile: 'subtitle',
            cell: (complaint) => {
              const customer = first(complaint.customers as never) as { name?: string } | null;
              const object = first(complaint.cleaning_objects as never) as { name?: string } | null;
              return [customer?.name, object?.name].filter(Boolean).join(' – ') || '—';
            },
          },
          { key: 'priority', header: 'Priorität', cell: (complaint) => <Badge tone={priorityTone[complaint.priority]}>{priority[complaint.priority]}</Badge> },
          {
            key: 'due',
            header: 'Frist',
            cell: (complaint) =>
              complaint.due_date ? (
                <span className={overdue(complaint) ? 'font-semibold tabular-nums text-danger' : 'tabular-nums'}>{formatDate('de', complaint.due_date)}</span>
              ) : (
                '—'
              ),
          },
          {
            key: 'status',
            header: 'Status',
            mobile: 'status',
            cell: (complaint) =>
              overdue(complaint) ? <Badge tone="danger">Überfällig</Badge> : <Badge tone={statusTone[complaint.status]}>{status[complaint.status]}</Badge>,
          },
        ]}
        empty={<EmptyState icon={<MessageSquareWarning />} title="Keine Reklamationen" body="Neue Vorgänge erfassen Sie hier oder Ihre Kunden über das Portal." />}
      />
    </>
  );
}
