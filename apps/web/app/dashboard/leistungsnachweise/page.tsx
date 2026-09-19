import { AlertTriangle, CalendarClock, FileCheck2, Receipt, TriangleAlert } from 'lucide-react';
import { Badge, Button, ButtonLink, EmptyState, FilterTabs, Input, PageHeader } from '@/components/ui';
import { DataTable, FilterBar } from '@/components/data-table';
import { addDays, berlinDateKey } from '@/lib/date';
import {
  listAcceptanceConfigWarnings,
  listServiceRecords,
  type ServiceQueue,
  type ServiceRecordRow,
} from '@/lib/data/billing';
import { formatDate } from '@/lib/format';

/**
 * The billing queue: every completed visit, grouped by what has to happen next.
 *
 * The office's question is never "show me all jobs" — it is "what can I invoice
 * today, and what is stuck". So the tabs are the workflow states, and the
 * default is the one that turns into money.
 */
const queues: { key: ServiceQueue | 'ALLE'; label: string }[] = [
  { key: 'BEREIT', label: 'Bereit zur Abrechnung' },
  { key: 'ABNAHME_AUSSTEHEND', label: 'Abnahme ausstehend' },
  { key: 'PROBLEM_GEMELDET', label: 'Problem gemeldet' },
  { key: 'MONATSPAUSCHALE', label: 'Monatspauschale' },
  { key: 'ABGERECHNET', label: 'Abgerechnet' },
  { key: 'ALLE', label: 'Alle' },
];

const policyLabel: Record<ServiceRecordRow['acceptance_policy'], string> = {
  KEINE_ABNAHME_ERFORDERLICH: 'Keine Abnahme',
  VOR_ORT_UNTERSCHRIFT: 'Unterschrift vor Ort',
  PORTAL_ABNAHME: 'Portal-Abnahme',
};

const methodLabel: Record<NonNullable<ServiceRecordRow['acceptance_method']>, string> = {
  KEINE: 'Ohne Abnahme',
  VOR_ORT_UNTERSCHRIFT: 'Vor Ort unterschrieben',
  PORTAL_BESTAETIGUNG: 'Im Portal bestätigt',
  BUERO_FREIGABE: 'Vom Büro freigegeben',
};

function queueBadge(row: ServiceRecordRow) {
  switch (row.queue) {
    case 'BEREIT':
      return <Badge tone="success">Bereit</Badge>;
    case 'ABNAHME_AUSSTEHEND':
      return <Badge tone="warning">Abnahme offen</Badge>;
    case 'PROBLEM_GEMELDET':
      return <Badge tone="danger">Problem</Badge>;
    case 'MONATSPAUSCHALE':
      return <Badge tone="info">Monatspauschale</Badge>;
    default:
      return <Badge tone="neutral">{row.invoice_number ?? 'Abgerechnet'}</Badge>;
  }
}

export default async function ServiceRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; filter?: string }>;
}) {
  const query = await searchParams;
  const from = query.from || addDays(berlinDateKey(), -30);
  const to = query.to || berlinDateKey();
  const requested = queues.find((entry) => entry.key === query.filter)?.key ?? 'BEREIT';

  const [all, warnings] = await Promise.all([
    listServiceRecords(from, to),
    listAcceptanceConfigWarnings(),
  ]);
  const rows = requested === 'ALLE' ? all : all.filter((row) => row.queue === requested);
  const countOf = (key: ServiceQueue | 'ALLE') =>
    key === 'ALLE' ? all.length : all.filter((row) => row.queue === key).length;

  const params = (value: string) =>
    `/dashboard/leistungsnachweise?from=${from}&to=${to}&filter=${value}`;

  return (
    <>
      <PageHeader
        title="Leistungsnachweise"
        description="Abgeschlossene Einsätze mit Zeiten, Checkliste und Fotos – und was noch fehlt, bis daraus eine Rechnung wird."
      />

      {/*
        A contract that asks the customer to accept in the portal, for a customer
        with nobody able to log in, produces visits that can never be accepted
        and therefore never invoiced. Said here rather than discovered at month
        end.
      */}
      {warnings.length > 0 && (
        <div className="mb-4 rounded-xl border border-warning/25 bg-warning-soft px-4 py-3.5">
          <p className="flex items-start gap-2.5 text-sm font-semibold leading-6 text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Portal-Abnahme ohne Ansprechpartner
          </p>
          <p className="mt-1 ps-7 text-sm leading-6 text-foreground">
            Diese Pläne verlangen eine Abnahme im Kundenportal, aber der Kunde hat keinen aktiven
            Portalzugang. Diese Einsätze können nicht abgenommen und damit nicht abgerechnet werden.
          </p>
          <ul className="mt-2 space-y-1 ps-7 text-sm">
            {warnings.map((warning) => (
              <li key={warning.service_schedule_id}>
                <span className="font-medium">{warning.customer_name}</span> · {warning.schedule_name}
                {warning.pending_count > 0 && (
                  <span className="text-muted-foreground"> · {warning.pending_count} wartende Einsätze</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <FilterBar>
        <Input name="from" type="date" defaultValue={from} aria-label="Von" />
        <Input name="to" type="date" defaultValue={to} aria-label="Bis" />
        <input type="hidden" name="filter" value={requested} />
        <Button type="submit" variant="outline">
          Anwenden
        </Button>
      </FilterBar>

      <FilterTabs
        className="mb-4"
        label="Abrechnungsstatus"
        items={queues.map((entry) => ({
          href: params(entry.key),
          label: entry.label,
          active: requested === entry.key,
          count: countOf(entry.key),
        }))}
      />

      <DataTable<ServiceRecordRow>
        caption="Leistungsnachweise"
        rows={rows}
        rowKey={(row) => row.job_id}
        rowHref={(row) => `/dashboard/auftraege/${row.job_id}/leistungsnachweis`}
        rowActions={(row) =>
          row.queue === 'BEREIT' ? (
            <ButtonLink
              href={`/dashboard/abrechnung/neu?kunde=${row.customer_id}`}
              variant="ghost"
              size="sm"
              className="relative z-10 text-primary"
              aria-label={`Rechnung für ${row.customer_name} erstellen`}
            >
              <Receipt className="size-4" aria-hidden="true" />
              <span className="lg:sr-only xl:not-sr-only">Abrechnen</span>
            </ButtonLink>
          ) : null
        }
        columns={[
          { key: 'object', header: 'Objekt', mobile: 'title', cell: (row) => row.object_name || row.title },
          { key: 'customer', header: 'Kunde', mobile: 'subtitle', cell: (row) => row.customer_name },
          {
            key: 'date',
            header: 'Datum',
            cell: (row) => <span className="tabular-nums">{formatDate('de', row.service_date)}</span>,
          },
          {
            key: 'time',
            header: 'Zeit netto',
            align: 'end',
            cell: (row) =>
              row.net_minutes
                ? `${Math.floor(row.net_minutes / 60)} h ${String(row.net_minutes % 60).padStart(2, '0')}`
                : '—',
          },
          {
            key: 'acceptance',
            header: 'Kundenabnahme',
            cell: (row) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-sm">{policyLabel[row.acceptance_policy]}</span>
                {row.accepted_at && row.acceptance_method && (
                  <span className="text-xs text-muted-foreground">
                    {methodLabel[row.acceptance_method]}
                    {row.accepted_by_name ? ` · ${row.accepted_by_name}` : ''}
                  </span>
                )}
                {row.portal_contact_missing && (
                  <span className="flex items-center gap-1 text-xs text-warning">
                    <AlertTriangle className="size-3" aria-hidden="true" />
                    kein Portalzugang
                  </span>
                )}
              </span>
            ),
          },
          { key: 'queue', header: 'Status', mobile: 'status', cell: queueBadge },
        ]}
        empty={
          <EmptyState
            icon={requested === 'PROBLEM_GEMELDET' ? <CalendarClock /> : <FileCheck2 />}
            title={
              requested === 'BEREIT'
                ? 'Nichts zur Abrechnung offen'
                : requested === 'ABNAHME_AUSSTEHEND'
                  ? 'Keine offenen Abnahmen'
                  : requested === 'PROBLEM_GEMELDET'
                    ? 'Keine gemeldeten Probleme'
                    : 'Keine Leistungsnachweise'
            }
            body="Im gewählten Zeitraum gibt es hier nichts zu tun."
          />
        }
      />
    </>
  );
}
