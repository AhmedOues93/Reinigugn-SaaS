import { notFound } from 'next/navigation';
import Link from 'next/link';
import { BackLink, Badge, DataRow, PageHeader, Section } from '@/components/ui';
import { getTimeEntry } from '@/lib/data/time-entries';
import { TimeCorrectionForm } from '@/components/time-correction-form';
import { formatDateTime } from '@/lib/format';
import { correctTimeEntry } from '../actions';

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function moment(value: string | null) {
  return value ? formatDateTime('de', value) : 'Läuft';
}

function duration(minutes: number | null) {
  if (minutes == null) return 'Läuft';
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

export default async function TimeEntryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = await getTimeEntry(id);
  if (!entry) notFound();

  const job = one(entry.jobs);
  const member = one(entry.company_members);
  const profile = one(member?.profiles);
  const audits = entry.time_entry_audit_logs ?? [];
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Mitarbeiter';
  const running = !entry.finished_at;

  return (
    <div className="mx-auto max-w-5xl">
      <BackLink href="/dashboard/arbeitszeiten">Arbeitszeiten</BackLink>
      <PageHeader
        title={name}
        description={job?.title ?? undefined}
        meta={
          <>
            <Badge tone={running ? 'primary' : 'success'}>{running ? 'Läuft' : 'Beendet'}</Badge>
            {audits.length > 0 && <Badge tone="warning">Korrigiert</Badge>}
            <span className="text-sm font-medium tabular-nums text-foreground">
              {duration(entry.duration_minutes)}
            </span>
          </>
        }
      />

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <Section title="Erfassung">
            <div className="rounded-xl border border-border/80 bg-card px-5 shadow-card">
              <dl className="divide-y divide-border/70">
                <DataRow label="Beginn" value={moment(entry.started_at)} />
                <DataRow label="Ende" value={moment(entry.finished_at)} />
                <DataRow label="Dauer netto" value={duration(entry.duration_minutes)} />
                <DataRow
                  label="Pausen"
                  value={
                    entry.break_minutes
                      ? `${entry.break_minutes} min, von der Dauer abgezogen`
                      : 'Keine'
                  }
                />
                <DataRow
                  label="Quelle"
                  value={entry.start_source === 'MANUAL' ? 'Manuell erfasst' : 'Mitarbeiter-App'}
                />
              </dl>
            </div>
          </Section>

          <Section title="Zeit korrigieren">
            <div className="rounded-xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
              <TimeCorrectionForm
                action={correctTimeEntry.bind(null, entry.id)}
                startedAt={entry.started_at}
                finishedAt={entry.finished_at}
              />
            </div>
          </Section>

          <Section title="Korrekturhistorie">
            {audits.length === 0 ? (
              <p className="rounded-xl border border-dashed border-foreground/15 px-4 py-5 text-sm text-muted-foreground">
                Die Erfassung ist unverändert.
              </p>
            ) : (
              /* Every correction is auditable, so each one states who, when and
                 from what to what — never just "geändert". */
              <ol className="space-y-4">
                {audits.map((audit) => {
                  const actor = one(audit.profiles);
                  return (
                    <li
                      key={audit.id}
                      className="rounded-xl border border-border/80 bg-card p-4 shadow-card"
                    >
                      <p className="text-sm font-medium text-foreground">
                        {[actor?.first_name, actor?.last_name].filter(Boolean).join(' ') || 'Büro'}
                        <span className="ms-2 text-xs font-normal tabular-nums text-muted-foreground">
                          {formatDateTime('de', audit.changed_at)}
                        </span>
                      </p>
                      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <dt className="text-xs text-muted-foreground">Vorher</dt>
                          <dd className="tabular-nums line-through decoration-muted-foreground/40">
                            {moment(audit.previous_started_at)} –{' '}
                            {moment(audit.previous_finished_at)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Nachher</dt>
                          <dd className="font-medium tabular-nums">
                            {moment(audit.new_started_at)} – {moment(audit.new_finished_at)}
                          </dd>
                        </div>
                      </dl>
                      <p className="break-anywhere mt-3 border-t border-border/70 pt-3 text-sm text-muted-foreground">
                        {audit.reason}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </Section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card">
            <h2 className="mb-1 text-[15px] font-semibold">Auftrag</h2>
            {job ? (
              <>
                <Link
                  href={`/dashboard/auftraege/${entry.job_id}`}
                  className="break-anywhere mt-2 block text-sm font-medium text-primary hover:underline"
                >
                  {job.title}
                </Link>
                <dl className="mt-4 divide-y divide-border/70 border-t border-border/70">
                  <DataRow label="Kunde" value={one(job.customers)?.name ?? '—'} />
                  <DataRow label="Objekt" value={one(job.cleaning_objects)?.name ?? '—'} />
                  <DataRow label="Geplanter Beginn" value={moment(job.planned_start_at ?? null)} />
                  <DataRow label="Geplantes Ende" value={moment(job.planned_end_at ?? null)} />
                </dl>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Kein Auftrag verknüpft.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
