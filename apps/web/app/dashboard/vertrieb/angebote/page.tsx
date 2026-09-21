import { FileDown, FileSignature, Plus } from 'lucide-react';
import { Badge, ButtonLink, EmptyState, FilterTabs, PageHeader } from '@/components/ui';
import { DataTable } from '@/components/data-table';
import { SalesSectionNav } from '@/components/sales/sales-section-nav';
import { listQuotes, quoteStatusTone, type QuoteStatus } from '@/lib/data/sales';
import { formatDate, formatMoney } from '@/lib/format';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

const filters: (QuoteStatus | 'all')[] = ['all', 'DRAFT', 'SENT', 'ACCEPTED', 'DECLINED'];

function first<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

type Quote = Awaited<ReturnType<typeof listQuotes>>[number];

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const active = (filters as string[]).includes(status ?? '') ? (status as QuoteStatus | 'all') : 'all';
  const [locale, all] = await Promise.all([currentLocale(), listQuotes('all')]);
  const quotes = active === 'all' ? all : all.filter((quote) => quote.status === active);

  return (
    <>
      <PageHeader
        title={t(locale, 'sales.quotes.title')}
        description="Angebote direkt aus Kunde, Objekt und Leistungen erstellen. Eine Anfrage oder Besichtigung ist nur bei Bedarf vorgeschaltet."
        actions={
          <ButtonLink href="/dashboard/kalkulation/neu">
            <Plus className="size-4" aria-hidden="true" />
            Neues Angebot
          </ButtonLink>
        }
      />
      <SalesSectionNav active="angebote" locale={locale} />
      <FilterTabs
        className="mb-4"
        label={t(locale, 'common.status')}
        items={filters.map((filter) => ({
          href: filter === 'all' ? '/dashboard/vertrieb/angebote' : `/dashboard/vertrieb/angebote?status=${filter}`,
          label: filter === 'all' ? 'Alle' : t(locale, `sales.quote.status.${filter}`),
          active: active === filter,
          count: filter === 'all' ? all.length : all.filter((quote) => quote.status === filter).length,
        }))}
      />
      <DataTable<Quote>
        caption={t(locale, 'sales.quotes.title')}
        rows={quotes}
        rowKey={(quote) => quote.id}
        rowHref={(quote) => `/dashboard/vertrieb/angebote/${quote.id}`}
        rowActions={(quote) => (
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href={`/dashboard/vertrieb/angebote/${quote.id}`} variant="outline">Ansehen</ButtonLink>
            {quote.status !== 'DRAFT' && (
              <a href={`/dashboard/vertrieb/angebote/${quote.id}/pdf`} target="_self" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted max-md:min-h-11">
                <FileDown className="size-4" aria-hidden="true" />
                PDF
              </a>
            )}
          </div>
        )}
        columns={[
          {
            key: 'owner',
            header: 'Kunde / Interessent',
            mobile: 'title',
            cell: (quote) => first(quote.customers)?.name ?? first(quote.leads)?.organisation ?? '—',
          },
          {
            key: 'title',
            header: 'Angebot',
            mobile: 'subtitle',
            cell: (quote) => (
              <span className="block min-w-0">
                <span className="block truncate">{quote.title}</span>
                <span className="block text-xs tabular-nums">{quote.quote_number ?? 'Entwurf'}</span>
              </span>
            ),
          },
          {
            key: 'valid',
            header: t(locale, 'sales.quote.validUntil'),
            hideBelow: 'lg',
            cell: (quote) => (quote.valid_until ? <span className="tabular-nums">{formatDate(locale, quote.valid_until)}</span> : '—'),
          },
          {
            key: 'monthly',
            header: 'Monatlich netto',
            align: 'end',
            cell: (quote) => (quote.recurring_net_monthly_cents > 0 ? formatMoney(locale, quote.recurring_net_monthly_cents, quote.currency) : '—'),
          },
          {
            key: 'gross',
            header: 'Brutto',
            align: 'end',
            cell: (quote) => <span className="font-semibold text-foreground">{formatMoney(locale, quote.gross_total_cents, quote.currency)}</span>,
          },
          {
            key: 'status',
            header: 'Status',
            mobile: 'status',
            cell: (quote) => <Badge tone={quoteStatusTone[quote.status as QuoteStatus]}>{t(locale, `sales.quote.status.${quote.status}`)}</Badge>,
          },
        ]}
        empty={<EmptyState icon={<FileSignature />} title={t(locale, 'sales.quote.empty')} body={t(locale, 'sales.quote.emptyBody')} />}
      />
    </>
  );
}
