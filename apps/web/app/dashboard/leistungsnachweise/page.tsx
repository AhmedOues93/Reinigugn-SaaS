import { FileCheck2, Receipt } from 'lucide-react';
import { Badge, Button, ButtonLink, EmptyState, FilterTabs, Input, PageHeader } from '@/components/ui';
import { DataTable, FilterBar } from '@/components/data-table';
import { requireStaffCompany } from '@/lib/auth';
import { addDays, berlinDateKey } from '@/lib/date';
import { formatDate } from '@/lib/format';

function first<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * Every completed visit is a service record. This list is where the office
 * checks them and sees which ones still have to be invoiced — the hand-off
 * between operations and billing.
 */
async function listServiceRecords(from: string, to: string) {
  const { supabase, company } = await requireStaffCompany();
  const { data, error } = await supabase
    .from('jobs')
    .select(
      'id, title, scheduled_date, customer_id, customers(name), cleaning_objects(name), job_time_entries(duration_minutes), invoice_lines(invoice_status, invoice_id)',
    )
    .eq('company_id', company.id)
    .eq('status', 'COMPLETED')
    .gte('scheduled_date', from)
    .lte('scheduled_date', to)
    .order('scheduled_date', { ascending: false });
  if (error) throw new Error('Leistungsnachweise konnten nicht geladen werden.');
  return (data ?? []).map((job) => {
    const live = (job.invoice_lines ?? []).find((line) => line.invoice_status !== 'CANCELLED');
    return {
      ...job,
      minutes: (job.job_time_entries ?? []).reduce((total, entry) => total + (entry.duration_minutes ?? 0), 0),
      invoiceId: live?.invoice_id ?? null,
      billed: Boolean(live),
    };
  });
}

type Row = Awaited<ReturnType<typeof listServiceRecords>>[number];

export default async function ServiceRecordsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; filter?: string }> }) {
  const query = await searchParams;
  const from = query.from || addDays(berlinDateKey(), -30);
  const to = query.to || berlinDateKey();
  const filter = query.filter === 'open' || query.filter === 'billed' ? query.filter : 'all';
  const all = await listServiceRecords(from, to);
  const rows = filter === 'open' ? all.filter((row) => !row.billed) : filter === 'billed' ? all.filter((row) => row.billed) : all;
  const params = (value: string) => `/dashboard/leistungsnachweise?from=${from}&to=${to}${value === 'all' ? '' : `&filter=${value}`}`;

  return (
    <>
      <PageHeader
        title="Leistungsnachweise"
        description="Abgeschlossene Einsätze mit Zeiten, Checkliste und Fotos – und ob sie schon abgerechnet sind."
      />
      <FilterBar>
        <Input name="from" type="date" defaultValue={from} aria-label="Von" />
        <Input name="to" type="date" defaultValue={to} aria-label="Bis" />
        {filter !== 'all' && <input type="hidden" name="filter" value={filter} />}
        <Button type="submit" variant="outline">
          Anwenden
        </Button>
      </FilterBar>
      <FilterTabs
        className="mb-4"
        label="Abrechnungsstatus"
        items={[
          { href: params('all'), label: 'Alle', active: filter === 'all', count: all.length },
          { href: params('open'), label: 'Noch nicht abgerechnet', active: filter === 'open', count: all.filter((row) => !row.billed).length },
          { href: params('billed'), label: 'Abgerechnet', active: filter === 'billed', count: all.filter((row) => row.billed).length },
        ]}
      />
      <DataTable<Row>
        caption="Leistungsnachweise"
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `/dashboard/auftraege/${row.id}/leistungsnachweis`}
        rowActions={(row) =>
          !row.billed ? (
            <ButtonLink
              href={`/dashboard/abrechnung/neu?kunde=${row.customer_id}`}
              variant="ghost"
              size="sm"
              className="relative z-10 text-primary"
              aria-label={`Rechnung für ${first(row.customers)?.name ?? 'Kunde'} erstellen`}
            >
              <Receipt className="size-4" aria-hidden="true" />
              <span className="lg:sr-only xl:not-sr-only">Abrechnen</span>
            </ButtonLink>
          ) : null
        }
        columns={[
          { key: 'object', header: 'Objekt', mobile: 'title', cell: (row) => first(row.cleaning_objects)?.name ?? row.title },
          { key: 'customer', header: 'Kunde', mobile: 'subtitle', cell: (row) => first(row.customers)?.name },
          { key: 'date', header: 'Datum', cell: (row) => <span className="tabular-nums">{formatDate('de', row.scheduled_date)}</span> },
          {
            key: 'time',
            header: 'Zeit netto',
            align: 'end',
            cell: (row) => (row.minutes ? `${Math.floor(row.minutes / 60)} h ${String(row.minutes % 60).padStart(2, '0')}` : '—'),
          },
          {
            key: 'billing',
            header: 'Abrechnung',
            mobile: 'status',
            cell: (row) => (row.billed ? <Badge tone="success">Abgerechnet</Badge> : <Badge tone="warning">Offen</Badge>),
          },
        ]}
        empty={<EmptyState icon={<FileCheck2 />} title="Keine abgeschlossenen Einsätze" body="Im gewählten Zeitraum wurde kein Einsatz abgeschlossen." />}
      />
    </>
  );
}
