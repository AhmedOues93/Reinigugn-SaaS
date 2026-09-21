import { Calculator, Plus, Settings2, SquareStack } from 'lucide-react';
import { Badge, ButtonLink, EmptyState, FilterTabs, PageHeader } from '@/components/ui';
import { DataTable } from '@/components/data-table';
import { SalesSectionNav } from '@/components/sales/sales-section-nav';
import {
  formatBp,
  formatMinutes,
  listCalculations,
  type CalculationListRow,
  type CalculationStatus,
} from '@/lib/data/kalkulation';
import { formatDate, formatMoney } from '@/lib/format';

const filters: { key: CalculationStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Alle' },
  { key: 'ENTWURF', label: 'Entwürfe' },
  { key: 'FINAL', label: 'Festgeschrieben' },
];

/**
 * Every calculation, with the two numbers that decide whether it was a good
 * idea. Margin is shown rather than price alone, because a large contract at a
 * thin margin is the one worth looking at twice.
 */
export default async function CalculationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const query = await searchParams;
  const active = filters.find((entry) => entry.key === query.status)?.key ?? 'all';
  const rows = await listCalculations(active === 'all' ? undefined : active);

  return (
    <>
      <PageHeader
        title="Kalkulation"
        description="Von der Besichtigung zum Angebot: Zeitbedarf, Kosten, Preis und Deckungsbeitrag."
        actions={
          <>
            <ButtonLink href="/dashboard/kalkulation/leistungskatalog" variant="outline">
              <SquareStack className="size-4" aria-hidden="true" />
              Leistungskatalog
            </ButtonLink>
            <ButtonLink href="/dashboard/kalkulation/grundlagen" variant="outline">
              <Settings2 className="size-4" aria-hidden="true" />
              Grundlagen
            </ButtonLink>
            <ButtonLink href="/dashboard/kalkulation/neu">
              <Plus className="size-4" aria-hidden="true" />
              Neue Kalkulation
            </ButtonLink>
          </>
        }
      />

      <SalesSectionNav active="kalkulationen" locale={locale} />

      <FilterTabs
        className="mb-4"
        label="Status"
        items={filters.map((entry) => ({
          href: entry.key === 'all' ? '/dashboard/kalkulation' : `/dashboard/kalkulation?status=${entry.key}`,
          label: entry.label,
          active: active === entry.key,
        }))}
      />

      <DataTable<CalculationListRow>
        caption="Kalkulationen"
        rows={rows}
        rowKey={(row) => row.id}
        rowHref={(row) => `/dashboard/kalkulation/${row.id}`}
        rowActions={(row) => <ButtonLink href={`/dashboard/kalkulation/${row.id}`} variant="outline">Öffnen</ButtonLink>}
        columns={[
          {
            key: 'title',
            header: 'Kalkulation',
            mobile: 'title',
            cell: (row) => (
              <span>
                {row.title}
                {row.version > 1 && <span className="ms-2 text-xs text-muted-foreground">v{row.version}</span>}
              </span>
            ),
          },
          {
            key: 'customer',
            header: 'Kunde',
            mobile: 'subtitle',
            cell: (row) => row.customer_name ?? row.lead_name ?? '—',
          },
          {
            key: 'hours',
            header: 'Std./Monat',
            align: 'end',
            hideBelow: 'lg',
            cell: (row) => <span className="tabular-nums">{formatMinutes(row.monthly_minutes)}</span>,
          },
          {
            key: 'cost',
            header: 'Kosten/Monat',
            align: 'end',
            hideBelow: 'lg',
            cell: (row) => <span className="tabular-nums">{formatMoney('de', row.total_cost_cents_month)}</span>,
          },
          {
            key: 'price',
            header: 'Preis/Monat',
            align: 'end',
            cell: (row) => (
              <span className="font-medium tabular-nums">{formatMoney('de', row.selling_price_cents_month)}</span>
            ),
          },
          {
            key: 'margin',
            header: 'Marge',
            align: 'end',
            cell: (row) => (
              <span
                className={`tabular-nums ${row.contribution_cents_month < 0 ? 'font-semibold text-danger' : ''}`}
              >
                {formatBp(row.margin_bp)}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            mobile: 'status',
            cell: (row) =>
              row.quote_number ? (
                <Badge tone="info">Angebot {row.quote_number}</Badge>
              ) : row.status === 'FINAL' ? (
                <Badge tone="success">Festgeschrieben</Badge>
              ) : row.status === 'ENTWURF' ? (
                <Badge tone="warning">Entwurf</Badge>
              ) : (
                <Badge tone="neutral">Verworfen</Badge>
              ),
          },
          {
            key: 'created',
            header: 'Erstellt',
            hideBelow: 'lg',
            cell: (row) => <span className="tabular-nums">{formatDate('de', row.created_at)}</span>,
          },
        ]}
        empty={
          <EmptyState
            icon={<Calculator />}
            title="Noch keine Kalkulation"
            body="Erfassen Sie Flächen und Leistungen, und die Kalkulation ermittelt Zeitbedarf, Kosten und einen tragfähigen Preis."
            action={
              <ButtonLink href="/dashboard/kalkulation/neu">
                <Plus className="size-4" aria-hidden="true" />
                Neue Kalkulation
              </ButtonLink>
            }
          />
        }
      />
    </>
  );
}
