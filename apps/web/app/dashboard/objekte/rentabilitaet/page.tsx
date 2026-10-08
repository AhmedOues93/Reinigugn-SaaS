import Link from 'next/link';
import { TrendingDown } from 'lucide-react';
import { BackLink, Badge, EmptyState, Notice, PageHeader, Section } from '@/components/ui';
import { requireStaffCompany } from '@/lib/auth';
import { listObjectProfitability } from '@/lib/data/profitability';
import {
  type ObjectProfitability,
  marginVerdict,
  percentFromBp,
  summarizeProfitability,
  verdictLabel,
  verdictTone,
} from '@/lib/profitability';

export const metadata = { title: 'Objektrentabilität · ReinPlan' };

function euros(cents: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function hours(minutes: number) {
  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(minutes / 60)} h`;
}

/** Der letzte abgeschlossene Monat als Standardfenster. */
function defaultWindow() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const key = (date: Date) => date.toISOString().slice(0, 10);
  return { from: key(start), to: key(end) };
}

function validDate(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Was jedes Objekt eingebracht und was es gekostet hat.
 *
 * Sortiert ist die Datenbankabfrage nach der Marge aufsteigend: das Objekt,
 * das Geld kostet, steht oben. Eine alphabetische Liste waere hoeflicher und
 * nutzlos.
 */
export default async function ObjectProfitabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ von?: string; bis?: string }>;
}) {
  await requireStaffCompany();
  const params = await searchParams;
  const fallback = defaultWindow();
  const from = validDate(params.von) ?? fallback.from;
  const to = validDate(params.bis) ?? fallback.to;

  let rows: ObjectProfitability[];
  let failure: string | null = null;
  try {
    rows = await listObjectProfitability(from, to);
  } catch (error) {
    rows = [];
    failure = error instanceof Error ? error.message : 'Die Objektrentabilität konnte nicht geladen werden.';
  }
  const summary = summarizeProfitability(rows);
  const period = `${new Date(from).toLocaleDateString('de-DE')} – ${new Date(to).toLocaleDateString('de-DE')}`;

  return (
    <div className="mx-auto min-w-0 max-w-4xl">
      <BackLink href="/dashboard/objekte">Objekte</BackLink>
      <PageHeader
        title="Objektrentabilität"
        description={`Erlös gegen Lohnkosten, ${period}. Zugeordnet wird nach dem Tag des Einsatzes, nicht nach dem Rechnungsdatum.`}
      />

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <label className="min-w-0 text-sm">
          <span className="mb-1 block text-muted-foreground">Von</span>
          <input
            type="date"
            name="von"
            defaultValue={from}
            className="min-h-touch w-full rounded-lg border border-border bg-card px-3 md:min-h-10"
          />
        </label>
        <label className="min-w-0 text-sm">
          <span className="mb-1 block text-muted-foreground">Bis</span>
          <input
            type="date"
            name="bis"
            defaultValue={to}
            className="min-h-touch w-full rounded-lg border border-border bg-card px-3 md:min-h-10"
          />
        </label>
        <button
          type="submit"
          className="min-h-touch rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground md:min-h-10"
        >
          Zeitraum anzeigen
        </button>
      </form>

      {failure ? (
        <Notice tone="danger" title="Nicht verfügbar">{failure}</Notice>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<TrendingDown />}
          title="Keine Leistung in diesem Zeitraum"
          body="In diesem Zeitraum wurde an keinem Objekt Zeit erfasst und nichts abgerechnet."
        />
      ) : (
        <>
          <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Erlös', value: euros(summary.revenueCents) },
              { label: 'Lohnkosten', value: euros(summary.knownCostCents) },
              { label: 'Marge', value: euros(summary.knownMarginCents) },
              { label: 'Objekte im Verlust', value: String(summary.objectsAtLoss) },
            ].map((item) => (
              <div key={item.label} className="min-w-0 rounded-xl border border-border/80 bg-card p-3">
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="mt-0.5 break-words text-lg font-semibold tabular-nums">{item.value}</dd>
              </div>
            ))}
          </dl>

          {summary.objectsWithoutCost > 0 ? (
            <Notice tone="neutral" title="Bei einigen Objekten fehlt der Stundenlohn">
              {summary.objectsWithoutCost}{' '}
              {summary.objectsWithoutCost === 1 ? 'Objekt hat' : 'Objekte haben'} erfasste Zeit von
              Mitarbeiterinnen ohne hinterlegten Stundenlohn. Diese Zeit wird nicht geschätzt — die
              Summen oben lassen sie aus. Der Stundenlohn steht in den{' '}
              <Link href="/dashboard/mitarbeiter" className="font-medium text-primary underline-offset-4 hover:underline">
                Stammdaten der Mitarbeiterin
              </Link>
              .
            </Notice>
          ) : null}

          <Section title="Je Objekt" description="Das Objekt mit der schlechtesten Marge steht oben.">
            <ul className="overflow-hidden rounded-xl border border-border/80">
              {rows.map((row) => {
                const verdict = marginVerdict(row.marginBp, row.marginCents);
                const percent = percentFromBp(row.marginBp);
                return (
                  <li key={row.objectId} className="border-b border-border/70 px-4 py-3 last:border-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <Link
                        href={`/dashboard/objekte/${row.objectId}`}
                        className="min-w-0 break-words font-medium text-primary underline-offset-4 hover:underline"
                      >
                        {row.objectName}
                      </Link>
                      <Badge tone={verdictTone[verdict]}>{verdictLabel[verdict]}</Badge>
                    </div>
                    <p className="mt-0.5 break-words text-sm text-muted-foreground">{row.customerName}</p>
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                      <div className="min-w-0">
                        <dt className="text-xs text-muted-foreground">Erlös</dt>
                        <dd className="tabular-nums">{euros(row.revenueCents)}</dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs text-muted-foreground">Lohnkosten</dt>
                        <dd className="tabular-nums">
                          {row.labourCostCents === null ? '—' : euros(row.labourCostCents)}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs text-muted-foreground">Marge</dt>
                        <dd className="tabular-nums">
                          {row.marginCents === null
                            ? '—'
                            : `${euros(row.marginCents)}${percent === null ? '' : ` · ${percent} %`}`}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-xs text-muted-foreground">Zeit · Einsätze</dt>
                        <dd className="tabular-nums">
                          {hours(row.workedMinutes)} · {row.visits}
                        </dd>
                      </div>
                    </dl>
                    {row.minutesWithoutRate > 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {hours(row.minutesWithoutRate)} ohne hinterlegten Stundenlohn — darum keine Marge.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}
