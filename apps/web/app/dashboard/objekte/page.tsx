import { Building2, Plus, Search } from 'lucide-react';
import { listCleaningObjects } from '@/lib/data/cleaning-objects';
import { listCustomerOptions, type StatusFilter } from '@/lib/data/customers';
import { Button, ButtonLink, EmptyState, Input, PageHeader, Select } from '@/components/ui';
import { DataTable, FilterBar } from '@/components/data-table';
import { StatusBadge } from '@/components/status-badge';

function statusFilter(value?: string): StatusFilter {
  return value === 'all' || value === 'inactive' ? value : 'active';
}

type CleaningObject = Awaited<ReturnType<typeof listCleaningObjects>>[number];

export default async function ObjectsPage({ searchParams }: { searchParams: Promise<{ search?: string; status?: string; customer?: string }> }) {
  const query = await searchParams;
  const status = statusFilter(query.status);
  const [objects, customers] = await Promise.all([
    listCleaningObjects({ search: query.search, status, customerId: query.customer }),
    listCustomerOptions(),
  ]);
  const filtered = Boolean(query.search || query.customer) || status !== 'active';

  return (
    <>
      <PageHeader
        title="Objekte"
        description="Die Orte, an denen gereinigt wird – mit Zugang, Ansprechperson und Leistungsumfang."
        actions={
          <ButtonLink href="/dashboard/objekte/neu">
            <Plus className="size-4" aria-hidden="true" />
            Objekt anlegen
          </ButtonLink>
        }
      />

      <FilterBar>
        <div className="relative sm:col-span-2 md:min-w-[16rem]">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input className="ps-9" name="search" defaultValue={query.search ?? ''} placeholder="Objektname oder Ort" aria-label="Objekte durchsuchen" />
        </div>
        <Select name="customer" defaultValue={query.customer ?? ''} aria-label="Kunde">
          <option value="">Alle Kunden</option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status} aria-label="Status">
          <option value="active">Aktive Objekte</option>
          <option value="inactive">Archivierte Objekte</option>
          <option value="all">Alle Objekte</option>
        </Select>
        <Button type="submit" variant="outline">
          Anwenden
        </Button>
      </FilterBar>

      <DataTable<CleaningObject>
        caption="Objekte"
        rows={objects}
        rowKey={(object) => object.id}
        rowHref={(object) => `/dashboard/objekte/${object.id}`}
        rowActions={(object) => <ButtonLink href={`/dashboard/objekte/${object.id}`} variant="outline">Öffnen</ButtonLink>}
        columns={[
          { key: 'name', header: 'Objekt', mobile: 'title', cell: (object) => object.name },
          { key: 'customer', header: 'Kunde', mobile: 'subtitle', cell: (object) => object.customers?.[0]?.name ?? '—' },
          { key: 'city', header: 'Ort', cell: (object) => object.city || '—' },
          { key: 'status', header: 'Status', mobile: 'status', cell: (object) => <StatusBadge isActive={object.is_active} /> },
        ]}
        empty={
          <EmptyState
            icon={<Building2 />}
            title={filtered ? 'Keine passenden Objekte' : 'Noch keine Objekte'}
            body={filtered ? 'Passen Sie Suche, Kunde oder Status an.' : 'Legen Sie zuerst einen Kunden und dann sein Reinigungsobjekt an.'}
            action={
              !filtered && (
                <ButtonLink href="/dashboard/objekte/neu">
                  <Plus className="size-4" aria-hidden="true" />
                  Objekt anlegen
                </ButtonLink>
              )
            }
          />
        }
      />
    </>
  );
}
