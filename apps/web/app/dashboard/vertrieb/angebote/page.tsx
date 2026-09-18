import Link from 'next/link';
import { FileSignature } from 'lucide-react';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { listQuotes, quoteStatusTone, type QuoteStatus } from '@/lib/data/sales';
import { formatDate, formatMoney } from '@/lib/format';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

const filters: (QuoteStatus | 'all')[] = ['all', 'DRAFT', 'SENT', 'ACCEPTED', 'DECLINED'];

function first<T>(value: T | T[] | null) {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const active = (filters as string[]).includes(status ?? '') ? (status as QuoteStatus | 'all') : 'all';
  const [locale, quotes] = await Promise.all([currentLocale(), listQuotes(active)]);

  return (
    <>
      <PageHeader title={t(locale, 'sales.quotes.title')} />

      <nav className="mb-5 flex flex-wrap gap-2" aria-label={t(locale, 'common.status')}>
        {filters.map((filter) => (
          <Link
            key={filter}
            href={filter === 'all' ? '/dashboard/vertrieb/angebote' : `/dashboard/vertrieb/angebote?status=${filter}`}
            aria-current={active === filter ? 'page' : undefined}
            className={`inline-flex min-h-touch items-center rounded-md border px-3 text-sm font-medium transition-colors ${
              active === filter ? 'border-primary bg-primary-soft text-primary' : 'border-border bg-card hover:bg-muted'
            }`}
          >
            {filter === 'all' ? t(locale, 'sales.quotes.title') : t(locale, `sales.quote.status.${filter}`)}
          </Link>
        ))}
      </nav>

      {quotes.length === 0 ? (
        <EmptyState
          icon={<FileSignature className="size-5" />}
          title={t(locale, 'sales.quote.empty')}
          body={t(locale, 'sales.quote.emptyBody')}
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {quotes.map((quote) => {
              const owner = first(quote.customers)?.name ?? first(quote.leads)?.organisation ?? '—';
              return (
                <li key={quote.id}>
                  <Link
                    href={`/dashboard/vertrieb/angebote/${quote.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-5 hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {quote.quote_number ?? t(locale, 'billing.draft')} · {owner}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {quote.title}
                        {quote.valid_until && ` · ${t(locale, 'sales.quote.validUntil')} ${formatDate(locale, quote.valid_until)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-end">
                        <p className="font-semibold tabular-nums">{formatMoney(locale, quote.gross_total_cents, quote.currency)}</p>
                        {quote.recurring_net_monthly_cents > 0 && (
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {formatMoney(locale, quote.recurring_net_monthly_cents, quote.currency)} / {t(locale, 'sales.quote.monthly')}
                          </p>
                        )}
                      </div>
                      <Badge tone={quoteStatusTone[quote.status as QuoteStatus]}>
                        {t(locale, `sales.quote.status.${quote.status}`)}
                      </Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}
