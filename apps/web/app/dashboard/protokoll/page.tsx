import Link from 'next/link';
import { ScrollText } from 'lucide-react';
import { Badge, EmptyState, Notice, PageHeader, Section } from '@/components/ui';
import { requireStaffCompany } from '@/lib/auth';
import { listAuditEvents } from '@/lib/data/audit';
import {
  type AuditEvent,
  actionLabel,
  auditDetailText,
  auditHref,
  isSensitiveAction,
} from '@/lib/audit';

export const metadata = { title: 'Protokoll · ReinPlan' };

const ranges = {
  '7': 'Letzte 7 Tage',
  '30': 'Letzte 30 Tage',
  '90': 'Letzte 90 Tage',
  '365': 'Letztes Jahr',
} as const;

type RangeKey = keyof typeof ranges;

function dayLabel(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Wer hat was getan.
 *
 * Protokolliert werden die Vorgaenge um Geld, Lohn und Berechtigungen -- nicht
 * jeder Klick. Ein Protokoll, in dem jeder erledigte Einsatz steht, beantwortet
 * keine Frage mehr, weil niemand es liest.
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ tage?: string }>;
}) {
  await requireStaffCompany();
  const params = await searchParams;
  const range: RangeKey = (Object.keys(ranges) as RangeKey[]).includes(params.tage as RangeKey)
    ? (params.tage as RangeKey)
    : '30';
  const to = new Date();
  const from = new Date(to.getTime() - Number(range) * 24 * 60 * 60 * 1000);

  let events: AuditEvent[];
  let failure: string | null = null;
  try {
    events = await listAuditEvents(from.toISOString(), to.toISOString());
  } catch (error) {
    events = [];
    failure = error instanceof Error ? error.message : 'Das Protokoll konnte nicht geladen werden.';
  }

  // Nach Tagen gruppiert: so liest man ein Protokoll, nicht als eine Liste
  // von zweihundert Zeitstempeln.
  const byDay = new Map<string, AuditEvent[]>();
  for (const event of events) {
    const day = event.occurredAt.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), event]);
  }

  return (
    <div className="mx-auto min-w-0 max-w-3xl">
      <PageHeader
        title="Protokoll"
        description="Wer hat was getan — bei Rechnungen, Lohnmonaten, Berechtigungen und Firmendaten."
      />

      <nav className="mb-6 flex flex-wrap gap-1.5" aria-label="Zeitraum">
        {(Object.keys(ranges) as RangeKey[]).map((key) => (
          <Link
            key={key}
            href={`/dashboard/protokoll?tage=${key}`}
            aria-current={key === range ? 'page' : undefined}
            className={
              key === range
                ? 'inline-flex min-h-touch items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground md:min-h-9'
                : 'inline-flex min-h-touch items-center rounded-lg bg-foreground/[0.05] px-3 text-sm font-medium text-muted-foreground hover:text-foreground md:min-h-9'
            }
          >
            {ranges[key]}
          </Link>
        ))}
      </nav>

      {failure ? (
        <Notice tone="danger" title="Nicht verfügbar">{failure}</Notice>
      ) : events.length === 0 ? (
        <EmptyState
          icon={<ScrollText />}
          title="Keine Vorgänge in diesem Zeitraum"
          body="Protokolliert werden Rechnungen, Lohnmonate, Berechtigungen und Änderungen an Steuer- und Bankdaten — nicht jeder Klick."
        />
      ) : (
        <>
          {events.length >= 500 ? (
            <Notice tone="neutral" title="Gekürzt">
              Es werden die 500 jüngsten Vorgänge des Zeitraums gezeigt. Wähle einen kürzeren
              Zeitraum, um die älteren zu sehen.
            </Notice>
          ) : null}

          {[...byDay.entries()].map(([day, entries]) => (
            <Section key={day} title={dayLabel(entries[0]!.occurredAt)}>
              <ul className="overflow-hidden rounded-xl border border-border/80">
                {entries.map((event, index) => {
                  const href = auditHref(event);
                  const detail = auditDetailText(event);
                  return (
                    <li
                      key={`${event.occurredAt}-${event.action}-${event.subjectId ?? index}`}
                      className="border-b border-border/70 px-4 py-3 last:border-0"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="min-w-0 break-words font-medium">
                          {actionLabel(event.action)}
                        </span>
                        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                          {timeLabel(event.occurredAt)}
                        </span>
                      </div>
                      <p className="mt-0.5 break-words text-sm text-muted-foreground">
                        {event.actorName ?? 'System'}
                        {event.subjectLabel ? ' · ' : ''}
                        {event.subjectLabel && href ? (
                          <Link href={href} className="font-medium text-primary underline-offset-4 hover:underline">
                            {event.subjectLabel}
                          </Link>
                        ) : (
                          event.subjectLabel
                        )}
                      </p>
                      {detail ? (
                        <p className="mt-0.5 flex flex-wrap items-center gap-2 break-words text-sm">
                          <span className="min-w-0 text-muted-foreground">{detail}</span>
                          {isSensitiveAction(event.action) ? <Badge tone="warning">Prüfen</Badge> : null}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Section>
          ))}
        </>
      )}
    </div>
  );
}
