import Link from 'next/link';
import { Badge, Section, type Tone } from '@/components/ui';
import { listComplaints } from '@/lib/data/complaints';
import { formatDate } from '@/lib/format';

const statusLabel: Record<string, string> = {
  OPEN: 'Offen',
  IN_PROGRESS: 'In Bearbeitung',
  RESOLVED: 'Gelöst',
  CLOSED: 'Geschlossen',
};
const statusTone: Record<string, Tone> = {
  OPEN: 'info',
  IN_PROGRESS: 'warning',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};
const priorityLabel: Record<string, string> = {
  LOW: 'Niedrig',
  NORMAL: 'Normal',
  HIGH: 'Hoch',
  URGENT: 'Dringend',
};
const priorityTone: Record<string, Tone> = {
  LOW: 'neutral',
  NORMAL: 'neutral',
  HIGH: 'warning',
  URGENT: 'danger',
};

/** The last few complaints for one customer or object, as a titled region. */
export async function ComplaintHistory({
  customerId,
  objectId,
}: {
  customerId?: string;
  objectId?: string;
}) {
  const complaints = await listComplaints({ customerId, objectId });
  const recent = complaints.slice(0, 5);

  return (
    <Section
      title="Reklamationen"
      action={
        complaints.length > recent.length && (
          <Link
            href="/dashboard/reklamationen"
            className="text-sm font-medium text-primary hover:underline"
          >
            Alle {complaints.length}
          </Link>
        )
      }
    >
      {recent.length === 0 ? (
        <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-5 text-sm text-muted-foreground">
          Keine Reklamationen erfasst.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
          {recent.map((complaint) => (
            <li key={complaint.id} className="border-b border-border/70 last:border-0">
              <Link
                href={`/dashboard/reklamationen/${complaint.id}`}
                className="group flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-primary-soft/40"
              >
                <span className="min-w-0 flex-1">
                  <span className="break-anywhere block text-sm font-medium text-foreground group-hover:text-primary">
                    {complaint.title}
                  </span>
                  <span className="mt-0.5 block text-xs tabular-nums text-muted-foreground">
                    {formatDate('de', complaint.created_at)}
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  {complaint.priority !== 'NORMAL' && complaint.priority !== 'LOW' && (
                    <Badge tone={priorityTone[complaint.priority]}>
                      {priorityLabel[complaint.priority]}
                    </Badge>
                  )}
                  <Badge tone={statusTone[complaint.status]}>{statusLabel[complaint.status]}</Badge>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
