import { Clock3 } from 'lucide-react';
import { Badge, Button, EmptyState, Input, PageHeader, Select, StatBand } from '@/components/ui';
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
  const net = finished.reduce((total, entry) => total + (entry.duration_minutes ?? 0), 0);
  const breaks = entries.reduce((total, entry) => total + (entry.break_minutes ?? 0), 0);
  const running = entries.length - finished.length;
  const corrected = entries.filter((entry) => (entry.time_entry_audit_logs?.[0]?.count ?? 0) > 0).length;

  return (
    <>
      <PageHeader title="Arbeitszeiten" description="Erfasste Einsatzzeiten aus der Mitarbeiter-App – netto, nach Abzug der Pausen." />

      <FilterBar>
        <Input name="from" type="date" defaultValue={from} aria-label="Von" />
        <Input name="to" type="date" defaultValue={to} aria-label="Bis" />
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
        <Button type="submit" variant="outline">
          Anwenden
        </Button>
      </FilterBar>

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
              <span className="font-semibold text-foreground">{entry.duration_minutes == null ? '—' : minutes(entry.duration_minutes)}</span>
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
