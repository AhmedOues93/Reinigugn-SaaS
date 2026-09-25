import { CalendarCheck, Clock3, Download } from 'lucide-react';
import { Badge, Button, ButtonLink, EmptyState, Input, PageHeader, Select, StatBand } from '@/components/ui';
import { DataTable, FilterBar } from '@/components/data-table';
import { listTimeEntries } from '@/lib/data/time-entries';
import { listActiveEmployeeOptions } from '@/lib/data/jobs';
import { listCustomerOptions } from '@/lib/data/customers';
import { listCleaningObjectOptions } from '@/lib/data/cleaning-objects';
import { berlinDateKey, addDays } from '@/lib/date';
import { formatDate, formatTime } from '@/lib/format';

type Entry = Awaited<ReturnType<typeof listTimeEntries>>[number];

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}
const minutes = (value: number) => `${Math.floor(value / 60)} h ${String(value % 60).padStart(2, '0')}`;

export default async function TimeEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; employee?: string; customer?: string; object?: string }>;
}) {
  const query = await searchParams;
  const from = query.from || addDays(berlinDateKey(), -6);
  const to = query.to || berlinDateKey();
  const [entries, employees, customers, objects] = await Promise.all([
    listTimeEntries({ from, to, memberId: query.employee, customerId: query.customer, objectId: query.object }),
    listActiveEmployeeOptions(),
    listCustomerOptions(),
    listCleaningObjectOptions(),
  ]);

  const finished = entries.filter((entry) => entry.duration_minutes != null);
  /*
   * duration_minutes is already net: ensure_time_entry_integrity subtracts the
   * breaks when it writes the row. Subtracting break_minutes again here took
   * every paused shift down a second time — an eight-hour day with a half-hour
   * break was reported as 7:00 instead of 7:30, on this screen and in the CSV
   * the office hands to its Lohnbüro. Asserted in monthly-summary.test.sql.
   */
  const net = finished.reduce((total, entry) => total + Math.max(0, entry.duration_minutes ?? 0), 0);
  const breaks = entries.reduce((total, entry) => total + (entry.break_minutes ?? 0), 0);
  const running = entries.length - finished.length;
  const corrected = entries.filter((entry) => (entry.time_entry_audit_logs?.[0]?.count ?? 0) > 0).length;

  return (
    <>
      <div className="min-w-0 max-w-full overflow-hidden">
        <PageHeader
          title="Arbeitszeiten"
          description="Erfasste Einsatzzeiten aus der Mitarbeiter-App – netto, nach Abzug der Pausen."
          actions={
            <ButtonLink href="/dashboard/arbeitszeiten/monatsabschluss" variant="outline">
              <CalendarCheck className="size-4 shrink-0" aria-hidden="true" />
              Monatsabschluss
            </ButtonLink>
          }
        />

        <FilterBar className="min-w-0 max-w-full">
          <div className="grid min-w-0 grid-cols-2 gap-3 sm:contents">
            <Input name="from" type="date" defaultValue={from} aria-label="Von" />
            <Input name="to" type="date" defaultValue={to} aria-label="Bis" />
          </div>

          <details className="min-w-0 rounded-xl border border-border/80 bg-card sm:contents">
            <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between px-4 text-sm font-medium sm:hidden">
              Weitere Filter
              <span className="text-xs font-normal text-muted-foreground">
                {query.employee || query.customer || query.object ? 'aktiv' : 'optional'}
              </span>
            </summary>
            <div className="grid min-w-0 gap-3 border-t border-border/70 p-3 sm:contents sm:border-0 sm:p-0">
              <Select name="employee" defaultValue={query.employee ?? ''} aria-label="Mitarbeiter">
                <option value="">Alle Mitarbeiter</option>
                {employees.map((employee) => {
                  const profile = first(employee.profiles);
                  return (
                    <option key={employee.id} value={employee.id}>
                      {[profile?.first_name, profile?.last_name].filter(Boolean).join(' ')}
                    </option>
                  );
                })}
              </Select>
              <Select name="customer" defaultValue={query.customer ?? ''} aria-label="Kunde">
                <option value="">Alle Kunden</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
              </Select>
              <Select name="object" defaultValue={query.object ?? ''} aria-label="Objekt">
                <option value="">Alle Objekte</option>
                {objects.map((object) => (
                  <option key={object.id} value={object.id}>
                    {object.name}
                  </option>
                ))}
              </Select>
            </div>
          </details>

          <Button type="submit" variant="outline" className="w-full sm:w-auto">
            Anwenden
          </Button>
        </FilterBar>

        <div className="mb-5 flex min-w-0 justify-end">
          <ButtonLink
            href={`/dashboard/arbeitszeiten/export?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&employee=${encodeURIComponent(query.employee ?? '')}&customer=${encodeURIComponent(query.customer ?? '')}&object=${encodeURIComponent(query.object ?? '')}`}
            variant="outline"
            size="sm"
            className="max-w-full"
          >
            <Download className="size-4 shrink-0" />
            CSV für Excel exportieren
          </ButtonLink>
        </div>
      </div>

      <StatBand
        className="mb-5"
        items={[
          { label: 'Arbeitszeit netto', value: minutes(net) },
          { label: 'Pausen', value: minutes(breaks) },
          { label: 'Läuft gerade', value: running, tone: running ? 'success' : undefined },
          { label: 'Nachträglich korrigiert', value: corrected, tone: corrected ? 'warning' : undefined },
        ]}
      />

      <DataTable<Entry>
        caption="Arbeitszeiten"
        rows={entries}
        rowKey={(entry) => entry.id}
        rowHref={(entry) => `/dashboard/arbeitszeiten/${entry.id}`}
        columns={[
          {
            key: 'employee',
            header: 'Mitarbeiter',
            mobile: 'title',
            cell: (entry) => {
              const profile = first(first(entry.company_members)?.profiles);
              return [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || '—';
            },
          },
          {
            key: 'site',
            header: 'Einsatz',
            mobile: 'subtitle',
            cell: (entry) => {
              const job = first(entry.jobs);
              return (
                <span className="block min-w-0">
                  <span className="block truncate text-foreground">{first(job?.cleaning_objects)?.name ?? job?.title}</span>
                  <span className="block truncate text-xs">{first(job?.customers)?.name}</span>
                </span>
              );
            },
          },
          { key: 'date', header: 'Datum', cell: (entry) => <span className="tabular-nums">{formatDate('de', entry.started_at)}</span> },
          {
            key: 'planned',
            header: 'Geplant',
            hideBelow: 'xl',
            cell: (entry) => {
              const job = first(entry.jobs);
              return job?.planned_start_at ? (
                <span className="tabular-nums">
                  {formatTime('de', job.planned_start_at)}–{job.planned_end_at ? formatTime('de', job.planned_end_at) : ''}
                </span>
              ) : (
                '—'
              );
            },
          },
          {
            key: 'actual',
            header: 'Tatsächlich',
            cell: (entry) => (
              <span className="tabular-nums text-foreground">
                {formatTime('de', entry.started_at)}–{entry.finished_at ? formatTime('de', entry.finished_at) : '…'}
              </span>
            ),
          },
          { key: 'break', header: 'Pause', align: 'end', hideBelow: 'lg', cell: (entry) => (entry.break_minutes ? `${entry.break_minutes} min` : '—') },
          {
            key: 'net',
            header: 'Netto',
            align: 'end',
            cell: (entry) => (
              <span className="font-semibold text-foreground">{entry.duration_minutes == null ? '—' : minutes(Math.max(0, entry.duration_minutes - (entry.break_minutes ?? 0)))}</span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            mobile: 'status',
            cell: (entry) => (
              <span className="inline-flex flex-wrap justify-end gap-1">
                {entry.finished_at ? <Badge tone="neutral">Beendet</Badge> : <Badge tone="success">Läuft</Badge>}
                {(entry.time_entry_audit_logs?.[0]?.count ?? 0) > 0 && <Badge tone="warning">Korrigiert</Badge>}
              </span>
            ),
          },
        ]}
        empty={<EmptyState icon={<Clock3 />} title="Keine Arbeitszeiten" body="Im gewählten Zeitraum wurde nichts erfasst." />}
      />
    </>
  );
}
