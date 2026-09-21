import { Plus, Search, Users } from 'lucide-react';
import { listCustomers, type StatusFilter } from '@/lib/data/customers';
import { ButtonLink, Button, EmptyState, Input, PageHeader, Select } from '@/components/ui';
import { DataTable, FilterBar } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';

function statusFilter(value?: string): StatusFilter {
  return value === 'all' || value === 'inactive' ? value : 'active';
}

type Customer = Awaited<ReturnType<typeof listCustomers>>[number];

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ search?: string; status?: string }> }) {
  const query = await searchParams;
  const status = statusFilter(query.status);
  const customers = await listCustomers({ search: query.search, status });
  const filtered = Boolean(query.search) || status !== 'active';

  return (
    <>
      <PageHeader
        title="Kunden"
        description="Auftraggeber mit ihren Objekten, Ansprechpersonen und Rechnungsdaten."
        actions={
          <ButtonLink href="/dashboard/kunden/neu">
            <Plus className="size-4" aria-hidden="true" />
            Kunde anlegen
          </ButtonLink>
        }
      />

      <FilterBar>
        <div className="relative sm:col-span-2 md:min-w-[18rem]">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input className="ps-9" name="search" defaultValue={query.search ?? ''} placeholder="Name, Ort oder Ansprechperson" aria-label="Kunden durchsuchen" />
        </div>
        <Select name="status" defaultValue={status} aria-label="Status" className="md:max-w-[12rem]">
          <option value="active">Aktive Kunden</option>
          <option value="inactive">Archivierte Kunden</option>
          <option value="all">Alle Kunden</option>
        </Select>
        <Button type="submit" variant="outline">
          Anwenden
        </Button>
      </FilterBar>

      <DataTable<Customer>
        caption="Kunden"
        rows={customers}
        rowKey={(customer) => customer.id}
        rowHref={(customer) => `/dashboard/kunden/${customer.id}`}
        rowActions={(customer) => <ButtonLink href={`/dashboard/kunden/${customer.id}`} variant="outline">Öffnen</ButtonLink>}
        columns={[
          {
            key: 'name',
            header: 'Kunde',
            mobile: 'title',
            cell: (customer) => (
              <span className="block min-w-0">
                <span className="block">{customer.name}</span>
                {customer.customer_number && (
                  <span className="block text-xs font-normal tabular-nums text-muted-foreground">{customer.customer_number}</span>
                )}
              </span>
            ),
          },
          { key: 'contact', header: 'Ansprechperson', cell: (customer) => customer.contact_person || '—' },
          { key: 'phone', header: 'Telefon', hideBelow: 'lg', cell: (customer) => customer.phone || '—' },
          { key: 'city', header: 'Ort', mobile: 'subtitle', cell: (customer) => customer.city || '—' },
          { key: 'objects', header: 'Objekte', align: 'end', cell: (customer) => customer.cleaning_objects?.[0]?.count ?? 0 },
          { key: 'status', header: 'Status', mobile: 'status', cell: (customer) => <StatusBadge isActive={customer.is_active} /> },
        ]}
        empty={
          <EmptyState
            icon={<Users />}
            title={filtered ? 'Keine passenden Kunden' : 'Noch keine Kunden'}
            body={
              filtered
                ? 'Passen Sie Suche oder Status an.'
                : 'Kunden entstehen automatisch aus angenommenen Angeboten – oder Sie legen sie direkt an.'
            }
            action={
              !filtered && (
                <ButtonLink href="/dashboard/kunden/neu">
                  <Plus className="size-4" aria-hidden="true" />
                  Kunde anlegen
                </ButtonLink>
              )
            }
          />
        }
      />
    </>
  );
}
