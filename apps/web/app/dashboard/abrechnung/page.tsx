import { FileDown, Plus, Receipt } from 'lucide-react';
import { ButtonLink, EmptyState, FilterTabs, PageHeader, StatBand } from '@/components/ui';
import { DataTable } from '@/components/data-table';
import { InvoiceStatusBadge } from '@/components/billing/invoice-status-badge';
import { getBillingSummary, listInvoices, type DisplayInvoiceStatus } from '@/lib/data/billing';
import { formatDate, formatMoney } from '@/lib/format';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

const filters: (DisplayInvoiceStatus | 'all')[] = ['all', 'DRAFT', 'ISSUED', 'OVERDUE', 'PAID', 'CANCELLED'];

type Invoice = Awaited<ReturnType<typeof listInvoices>>[number];

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const active = (filters as string[]).includes(status ?? '') ? (status as DisplayInvoiceStatus | 'all') : 'all';
  const [locale, all, summary] = await Promise.all([currentLocale(), listInvoices(), getBillingSummary()]);
  const invoices = active === 'all' ? all : all.filter((invoice) => invoice.displayStatus === active);
  const count = (filter: DisplayInvoiceStatus | 'all') =>
    filter === 'all' ? all.length : all.filter((invoice) => invoice.displayStatus === filter).length;

  return (
    <>
      <PageHeader
        title={t(locale, 'billing.title')}
        description="Vom Entwurf über Festschreibung und Versand bis zum Zahlungseingang."
        actions={
          <ButtonLink href="/dashboard/abrechnung/neu">
            <Plus className="size-4" aria-hidden="true" />
            {t(locale, 'billing.new')}
          </ButtonLink>
        }
      />

      <StatBand
        className="mb-6"
        items={[
          { label: 'Entwürfe', value: summary.draftCount, href: '/dashboard/abrechnung?status=DRAFT' },
          { label: 'Offen', value: formatMoney(locale, summary.openCents), href: '/dashboard/abrechnung?status=ISSUED' },
          {
            label: 'Überfällig',
            value: formatMoney(locale, summary.overdueCents),
            note: summary.overdueCount ? `${summary.overdueCount} Rechnungen` : undefined,
            href: '/dashboard/abrechnung?status=OVERDUE',
            tone: summary.overdueCents ? 'danger' : undefined,
          },
          { label: 'Bezahlt', value: formatMoney(locale, summary.paidCents), href: '/dashboard/abrechnung?status=PAID', tone: 'success' },
        ]}
      />

      <FilterTabs
        className="mb-4"
        label="Rechnungsstatus"
        items={filters.map((filter) => ({
          href: filter === 'all' ? '/dashboard/abrechnung' : `/dashboard/abrechnung?status=${filter}`,
          label: filter === 'all' ? 'Alle' : t(locale, `billing.status.${filter}`),
          active: active === filter,
          count: count(filter),
        }))}
      />

      <DataTable<Invoice>
        caption="Rechnungen"
        rows={invoices}
        rowKey={(invoice) => invoice.id}
        rowHref={(invoice) => `/dashboard/abrechnung/${invoice.id}`}
        rowActions={(invoice) => (
          <div className="relative z-10 flex items-center gap-2">
            <ButtonLink href={`/dashboard/abrechnung/${invoice.id}`} variant="outline">Öffnen</ButtonLink>
            {invoice.status !== 'DRAFT' && (
              <a
                href={`/dashboard/abrechnung/${invoice.id}/pdf?download=1`}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted max-md:min-h-11"
                aria-label={`PDF ${invoice.invoice_number} ansehen`}
              >
                <FileDown className="size-4" aria-hidden="true" />
                PDF
              </a>
            )}
          </div>
        )}
        columns={[
          {
            key: 'number',
            header: 'Nummer',
            mobile: 'title',
            cell: (invoice) => <span className="tabular-nums">{invoice.invoice_number ?? 'Entwurf'}</span>,
          },
          { key: 'customer', header: 'Kunde', mobile: 'subtitle', cell: (invoice) => invoice.customerName },
          {
            key: 'period',
            header: 'Leistungszeitraum',
            hideBelow: 'lg',
            cell: (invoice) => (
              <span className="tabular-nums">
                {formatDate(locale, invoice.service_period_start)} – {formatDate(locale, invoice.service_period_end)}
              </span>
            ),
          },
          {
            key: 'due',
            header: 'Fällig',
            cell: (invoice) => (
              <span className="tabular-nums">
                {invoice.due_date ? formatDate(locale, invoice.due_date) : '—'}
                {invoice.status === 'ISSUED' && !invoice.sent_at && <span className="ms-2 text-xs font-medium text-warning">nicht versendet</span>}
              </span>
            ),
          },
          {
            key: 'amount',
            header: 'Betrag',
            align: 'end',
            cell: (invoice) => <span className="font-semibold text-foreground">{formatMoney(locale, invoice.gross_total_cents, invoice.currency)}</span>,
          },
          { key: 'status', header: 'Status', mobile: 'status', cell: (invoice) => <InvoiceStatusBadge status={invoice.displayStatus} locale={locale} /> },
        ]}
        empty={
          <EmptyState
            icon={<Receipt />}
            title={active === 'all' ? t(locale, 'billing.empty') : 'Keine Rechnungen in diesem Status'}
            body={active === 'all' ? t(locale, 'billing.emptyBody') : undefined}
          />
        }
      />
    </>
  );
}
