import { ClipboardCheck, Plus, Repeat } from 'lucide-react';
import { listJobs, listAssignableEmployeeOptions, type JobStatusFilter } from '@/lib/data/jobs';
import { listCustomerOptions } from '@/lib/data/customers';
import { listCleaningObjectOptions } from '@/lib/data/cleaning-objects';
import { Button, ButtonLink, EmptyState, Input, PageHeader, Select } from '@/components/ui';
import { DataTable, FilterBar } from '@/components/data-table';
import { JobStatusBadge, formatJobTime } from '@/components/job-badges';
import { formatDate } from '@/lib/format';

const statuses: { value: JobStatusFilter; label: string }[] = [
  { value: 'all', label: 'Alle Status' },
  { value: 'PLANNED', label: 'Geplant' },
  { value: 'CONFIRMED', label: 'Bestätigt' },
  { value: 'IN_PROGRESS', label: 'In Arbeit' },
  { value: 'COMPLETED', label: 'Erledigt' },
  { value: 'CANCELLED', label: 'Storniert' },
];

function status(value?: string): JobStatusFilter {
  return statuses.some((entry) => entry.value === value) ? (value as JobStatusFilter) : 'all';
}

type Job = Awaited<ReturnType<typeof listJobs>>[number];

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function teamOf(job: Job) {
  return (
    job.job_assignments
      .map((assignment) => {
        const profile = first(first(assignment.company_members)?.profiles);
        return [profile?.first_name, profile?.last_name].filter(Boolean).join(' ');
      })
      .filter(Boolean)
      .join(', ') || null
  );
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; customer?: string; object?: string; employee?: string; status?: string }>;
}) {
  const query = await searchParams;
  const currentStatus = status(query.status);
  const [jobs, customers, objects, employees] = await Promise.all([
    listJobs({ from: query.from, to: query.to, customerId: query.customer, objectId: query.object, memberId: query.employee, status: currentStatus }),
    listCustomerOptions(),
    listCleaningObjectOptions(),
    listAssignableEmployeeOptions(),
  ]);
  const filtered = Boolean(query.from || query.to || query.customer || query.object || query.employee) || currentStatus !== 'all';

  return (
    <>
      <PageHeader
        title="Aufträge"
        description="Alle Einsätze – einzeln geplant oder aus Reinigungsplänen erzeugt."
        actions={
          <>
            <ButtonLink href="/dashboard/planung" variant="outline">
              <Repeat className="size-4" aria-hidden="true" />
              Reinigungspläne
            </ButtonLink>
            <ButtonLink href="/dashboard/auftraege/neu">
              <Plus className="size-4" aria-hidden="true" />
              Auftrag erstellen
            </ButtonLink>
          </>
        }
      />

      {/*
        Six controls stacked full width filled a phone screen before a single
        job was visible. Date range and status — the two that answer "what am I
        looking at today" — stay out; customer, object and employee fold away,
        the same shape the Arbeitszeiten filters use.
      */}
      <FilterBar className="min-w-0 max-w-full">
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:contents">
          <Input name="from" type="date" defaultValue={query.from ?? ''} aria-label="Von" />
          <Input name="to" type="date" defaultValue={query.to ?? ''} aria-label="Bis" />
        </div>

        <Select name="status" defaultValue={currentStatus} aria-label="Status">
          {statuses.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </Select>

        <details className="min-w-0 rounded-xl border border-border/80 bg-card sm:contents">
          <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between px-4 text-sm font-medium sm:hidden">
            Weitere Filter
            <span className="text-xs font-normal text-muted-foreground">
              {query.customer || query.object || query.employee ? 'aktiv' : 'optional'}
            </span>
          </summary>
          <div className="grid min-w-0 gap-3 border-t border-border/70 p-3 sm:contents sm:border-0 sm:p-0">
            <Select name="customer" defaultValue={query.customer ?? ''} aria-label="Kunde">
              <option value="">Alle Kunden</option>
              {customers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Select name="object" defaultValue={query.object ?? ''} aria-label="Objekt">
              <option value="">Alle Objekte</option>
              {objects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
            <Select name="employee" defaultValue={query.employee ?? ''} aria-label="Mitarbeiter">
              <option value="">Alle Mitarbeiter</option>
              {employees.map((item) => {
                const profile = first(item.profiles);
                return (
                  <option key={item.id} value={item.id}>
                    {[profile?.first_name, profile?.last_name].filter(Boolean).join(' ')}
                  </option>
                );
              })}
            </Select>
          </div>
        </details>

        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          Anwenden
        </Button>
      </FilterBar>

      <DataTable<Job>
        caption="Aufträge"
        rows={jobs}
        rowKey={(job) => job.id}
        rowHref={(job) => `/dashboard/auftraege/${job.id}`}
        rowActions={(job) => <ButtonLink href={`/dashboard/auftraege/${job.id}`} variant="outline">Öffnen</ButtonLink>}
        columns={[
          {
            key: 'date',
            header: 'Termin',
            mobile: 'subtitle',
            cell: (job) => (
              <span className="tabular-nums">
                <span className="text-foreground">{formatDate('de', job.scheduled_date)}</span>
                <span className="ms-2 text-xs text-muted-foreground">{job.planned_start_at ? formatJobTime(job.planned_start_at, job.planned_end_at ?? undefined) : ''}</span>
              </span>
            ),
          },
          {
            key: 'title',
            header: 'Auftrag',
            mobile: 'title',
            cell: (job) => (
              <span className="inline-flex items-center gap-2">
                {job.title}
                {job.service_schedule_id && <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="Wiederkehrend" />}
              </span>
            ),
          },
          {
            key: 'site',
            header: 'Kunde / Objekt',
            cell: (job) => (
              <span className="block min-w-0">
                <span className="block text-foreground">{first(job.customers)?.name}</span>
                <span className="block text-xs">{first(job.cleaning_objects)?.name}</span>
              </span>
            ),
          },
          {
            key: 'team',
            header: 'Team',
            hideBelow: 'lg',
            cell: (job) => teamOf(job) ?? <span className="font-medium text-danger">Nicht besetzt</span>,
          },
          { key: 'status', header: 'Status', mobile: 'status', cell: (job) => <JobStatusBadge status={job.status} /> },
        ]}
        empty={
          <EmptyState
            icon={<ClipboardCheck />}
            title={filtered ? 'Keine passenden Aufträge' : 'Noch keine Aufträge'}
            body={filtered ? 'Passen Sie Zeitraum oder Filter an.' : 'Planen Sie einen Einzelauftrag oder legen Sie einen wiederkehrenden Reinigungsplan an.'}
            action={
              !filtered && (
                <ButtonLink href="/dashboard/auftraege/neu">
                  <Plus className="size-4" aria-hidden="true" />
                  Auftrag erstellen
                </ButtonLink>
              )
            }
          />
        }
      />
    </>
  );
}
