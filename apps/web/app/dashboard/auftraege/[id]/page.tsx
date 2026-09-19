import { notFound } from 'next/navigation';
import { Building2, ClipboardCheck, MapPin, Pencil, User } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { getServiceRecord, type ServiceRecord } from '@/lib/data/service-record';
import {
  BackLink,
  ButtonLink,
  DataRow,
  EmptyState,
  Notice,
  PageHeader,
  Section,
} from '@/components/ui';
import { DataTable, type Column } from '@/components/data-table';
import { JobStatusBadge } from '@/components/job-badges';
import { JobPhotoGallery } from '@/components/job-photo-gallery';
import { formatDate, formatDateTime, formatTimeRange } from '@/lib/format';
import { deleteOperationalJobPhoto } from '../actions';

type TimeEntry = ServiceRecord['timeEntries'][number];

function duration(minutes: number | null) {
  if (minutes == null) return 'Läuft';
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string }>;
}) {
  const { id } = await params;
  const { success } = await searchParams;
  const record = await getServiceRecord(id);
  if (!record) notFound();

  const completedItems = record.checklistItems.filter((item) => item.completedAt).length;
  const totalItems = record.checklistItems.length;
  const address = [
    record.job.object?.street,
    record.job.object?.postal_code,
    record.job.object?.city,
  ]
    .filter(Boolean)
    .join(', ');
  const workedMinutes = record.timeEntries.reduce(
    (total, entry) => total + (entry.durationMinutes ?? 0),
    0,
  );

  const columns: Column<TimeEntry>[] = [
    { key: 'name', header: 'Mitarbeiter', mobile: 'title', cell: (entry) => entry.name },
    { key: 'start', header: 'Start', cell: (entry) => formatDateTime('de', entry.startedAt) },
    {
      key: 'end',
      header: 'Ende',
      cell: (entry) =>
        entry.finishedAt ? (
          formatDateTime('de', entry.finishedAt)
        ) : (
          <span className="text-primary">Läuft</span>
        ),
    },
    {
      key: 'duration',
      header: 'Dauer',
      align: 'end',
      cell: (entry) => duration(entry.durationMinutes),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <BackLink href="/dashboard/auftraege">Aufträge</BackLink>
      {success && (
        <Notice tone="success" className="mb-5">
          {success}
        </Notice>
      )}

      <PageHeader
        title={record.job.title}
        meta={
          <>
            <JobStatusBadge status={record.job.status} />
            <span className="text-sm text-muted-foreground">
              {formatDate('de', record.job.scheduled_date, 'long')}
            </span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {formatTimeRange('de', record.job.planned_start_at, record.job.planned_end_at)}
            </span>
          </>
        }
        actions={
          <>
            <ButtonLink
              href={`/dashboard/auftraege/${record.job.id}/leistungsnachweis`}
              variant="outline"
            >
              <ClipboardCheck className="size-4" aria-hidden="true" />
              Leistungsnachweis
            </ButtonLink>
            <ButtonLink href={`/dashboard/auftraege/${record.job.id}/bearbeiten`}>
              <Pencil className="size-4" aria-hidden="true" />
              Bearbeiten
            </ButtonLink>
          </>
        }
      />

      <div className="grid items-start gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
            <h2 className="mb-4 text-[15px] font-semibold">Kunde &amp; Objekt</h2>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-sm">
                <User className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="break-anywhere min-w-0">
                  {record.job.customer?.name ?? (
                    <span className="text-muted-foreground">Kein Kunde hinterlegt</span>
                  )}
                </span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <Building2
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="break-anywhere min-w-0">
                  {record.job.object?.name ?? (
                    <span className="text-muted-foreground">Kein Objekt hinterlegt</span>
                  )}
                </span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <MapPin
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="break-anywhere min-w-0">
                  {address || (
                    <span className="text-muted-foreground">Keine Adresse hinterlegt</span>
                  )}
                </span>
              </li>
            </ul>
          </section>

          <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
            <h2 className="mb-1 text-[15px] font-semibold">Eingeteilt</h2>
            {record.assignments.length === 0 ? (
              <p className="mt-3 text-sm font-medium text-danger">Niemand eingeteilt</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm">
                {record.assignments.map((assignment) => (
                  <li key={assignment.id} className="break-anywhere font-medium text-foreground">
                    {assignment.name}
                  </li>
                ))}
              </ul>
            )}
            <dl className="mt-5 divide-y divide-border/70 border-t border-border/70">
              <DataRow
                label="Erfasste Zeit"
                value={workedMinutes ? duration(workedMinutes) : '—'}
              />
              <DataRow
                label="Checkliste"
                value={totalItems === 0 ? 'Keine hinterlegt' : `${completedItems} / ${totalItems}`}
              />
            </dl>
            {totalItems > 0 && (
              <div
                className="mt-3 h-1 overflow-hidden rounded-full bg-muted"
                role="img"
                aria-label={`${completedItems} von ${totalItems} Punkten erledigt`}
              >
                <div
                  className={cn(
                    'h-full transition-all',
                    completedItems === totalItems ? 'bg-success' : 'bg-primary',
                  )}
                  style={{ width: `${Math.round((completedItems / totalItems) * 100)}%` }}
                />
              </div>
            )}
          </section>
        </aside>

        <div className="min-w-0 space-y-8">
          <Section
            title="Arbeitszeiten"
            description={
              record.timeEntries.length > 0
                ? `${record.timeEntries.length} Erfassung${record.timeEntries.length === 1 ? '' : 'en'}`
                : undefined
            }
          >
            <DataTable
              rows={record.timeEntries}
              columns={columns}
              rowKey={(entry) => entry.id}
              caption="Erfasste Arbeitszeiten"
              empty={
                <EmptyState
                  title="Noch keine Arbeitszeit erfasst"
                  body="Sobald jemand vor Ort einstempelt, erscheint die Zeit hier."
                />
              }
            />
          </Section>

          {record.checklistItems.length > 0 && (
            <Section title="Checkliste">
              <ol className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-card">
                {record.checklistItems.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 border-b border-border/70 px-4 py-3 last:border-0"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 size-2 shrink-0 rounded-full',
                        item.completedAt ? 'bg-success' : 'bg-border',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-sm font-medium',
                          !item.completedAt && 'text-muted-foreground',
                        )}
                      >
                        {item.title}
                        {!item.isRequired && (
                          <span className="ms-2 text-xs font-normal text-muted-foreground">
                            optional
                          </span>
                        )}
                      </span>
                      {item.instruction && (
                        <span className="mt-0.5 block text-sm text-muted-foreground">
                          {item.instruction}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.completedAt ? formatDateTime('de', item.completedAt) : 'Offen'}
                    </span>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          <Section title="Hinweise">
            <div className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
              <p className="whitespace-pre-wrap break-anywhere text-sm leading-6">
                {record.job.employee_instructions || (
                  <span className="text-muted-foreground">Keine Arbeitsanweisung hinterlegt.</span>
                )}
              </p>
              {record.job.internal_notes && (
                <div className="mt-4 border-t border-border/70 pt-4">
                  <p className="text-[13px] font-medium text-muted-foreground">Interne Notiz</p>
                  <p className="mt-1 whitespace-pre-wrap break-anywhere text-sm leading-6 text-muted-foreground">
                    {record.job.internal_notes}
                  </p>
                </div>
              )}
            </div>
          </Section>

          <JobPhotoGallery
            photos={record.photos}
            deletablePhotoIds={record.photos.map((photo) => photo.id)}
            deleteAction={deleteOperationalJobPhoto}
          />
        </div>
      </div>
    </div>
  );
}
