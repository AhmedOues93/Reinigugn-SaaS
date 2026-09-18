import Link from 'next/link';
import { Plus, Receipt } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { InvoiceStatusBadge } from '@/components/billing/invoice-status-badge';
import { getBillingSummary, listInvoices, type DisplayInvoiceStatus } from '@/lib/data/billing';
import { formatDate, formatMoney } from '@/lib/format';
import { t } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

const filters: (DisplayInvoiceStatus | 'all')[] = [
  'all',
  'DRAFT',
  'ISSUED',
  'OVERDUE',
  'PAID',
  'CANCELLED',
];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = (filters as string[]).includes(status ?? '')
    ? (status as DisplayInvoiceStatus | 'all')
    : 'all';
  const [locale, invoices, summary] = await Promise.all([
    currentLocale(),
    listInvoices({ status: active }),
    getBillingSummary(),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(locale, 'billing.title')}</h1>
          <p className="mt-2 text-slate-600">{t(locale, 'billing.subtitle')}</p>
        </div>
        <Link href="/dashboard/abrechnung/neu">
          <Button>
            <Plus className="me-2 size-4" aria-hidden="true" />
            {t(locale, 'billing.new')}
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          { label: t(locale, 'billing.draft'), value: String(summary.draftCount) },
          {
            label: t(locale, 'billing.status.ISSUED'),
            value: formatMoney(locale, summary.openCents),
          },
          {
            label: t(locale, 'billing.status.OVERDUE'),
            value: formatMoney(locale, summary.overdueCents),
          },
          {
            label: t(locale, 'billing.status.PAID'),
            value: formatMoney(locale, summary.paidCents),
          },
        ].map((item) => (
          <Card key={item.label} className="p-5">
            <p className="text-sm text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{item.value}</p>
          </Card>
        ))}
      </div>

      <nav className="mt-7 flex flex-wrap gap-2" aria-label={t(locale, 'common.status')}>
        {filters.map((filter) => (
          <Link
            key={filter}
            href={
              filter === 'all' ? '/dashboard/abrechnung' : `/dashboard/abrechnung?status=${filter}`
            }
            aria-current={active === filter ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-md border px-3 text-sm font-medium transition-colors ${
              active === filter
                ? 'border-primary bg-primary/5 text-primary'
                : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {filter === 'all'
              ? t(locale, 'billing.invoices')
              : t(locale, `billing.status.${filter}`)}
          </Link>
        ))}
      </nav>

      <Card className="mt-5 overflow-hidden">
        {invoices.length === 0 ? (
          <div className="p-10 text-center">
            <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-slate-100 text-slate-500">
              <Receipt className="size-5" aria-hidden="true" />
            </div>
            <p className="font-medium">{t(locale, 'billing.empty')}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
              {t(locale, 'billing.emptyBody')}
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {invoices.map((invoice) => (
              <li key={invoice.id}>
                <Link
                  href={`/dashboard/abrechnung/${invoice.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 p-5 hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {invoice.invoice_number ?? t(locale, 'billing.draft')} ·{' '}
                      {invoice.customerName}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      {t(locale, 'billing.servicePeriod')}:{' '}
                      {formatDate(locale, invoice.service_period_start)} –{' '}
                      {formatDate(locale, invoice.service_period_end)}
                      {invoice.due_date &&
                        ` · ${t(locale, 'billing.dueDate')} ${formatDate(locale, invoice.due_date)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="tabular-nums font-semibold">
                      {formatMoney(locale, invoice.gross_total_cents, invoice.currency)}
                    </span>
                    <InvoiceStatusBadge status={invoice.displayStatus} locale={locale} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
