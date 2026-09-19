import Link from 'next/link';
import { Download, Receipt } from 'lucide-react';
import { PortalPageHeader } from '@/components/portal/portal-shell';
import { EmptyState } from '@/components/ui';
import { InvoiceStatusBadge } from '@/components/billing/invoice-status-badge';
import { listPortalInvoices } from '@/lib/data/portal-invoices';
import { portalLocale } from '@/lib/data/portal';
import { formatDate, formatMoney } from '@/lib/format';
import { t } from '@/lib/i18n';

export default async function PortalInvoicesPage() {
  const [locale, invoices] = await Promise.all([portalLocale(), listPortalInvoices()]);
  const openCents = invoices.filter((invoice) => invoice.status === 'ISSUED').reduce((total, invoice) => total + invoice.gross_total_cents, 0);

  return (
    <>
      <PortalPageHeader
        title={t(locale, 'billing.invoices')}
        actions={
          openCents > 0 && (
            <p className="text-sm text-muted-foreground">
              {t(locale, 'portal.invoice.openTotal')}: <span className="font-semibold tabular-nums text-foreground">{formatMoney(locale, openCents)}</span>
            </p>
          )
        }
      />
      {invoices.length === 0 ? (
        <EmptyState icon={<Receipt />} title={t(locale, 'billing.empty')} />
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-card">
          {invoices.map((invoice) => (
            <li key={invoice.id} className="relative flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/70 px-4 py-4 transition-colors last:border-0 hover:bg-subtle sm:flex-nowrap sm:px-5">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/portal/rechnungen/${invoice.id}`}
                  className="font-semibold tabular-nums text-foreground after:absolute after:inset-0 after:content-[''] hover:text-primary"
                >
                  {invoice.invoice_number}
                </Link>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t(locale, 'portal.invoice.period')} {formatDate(locale, invoice.service_period_start)} – {formatDate(locale, invoice.service_period_end)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {invoice.status === 'PAID' && invoice.paid_at
                    ? t(locale, 'portal.invoice.paidOn', { date: formatDate(locale, invoice.paid_at) })
                    : invoice.status === 'ISSUED'
                      ? t(locale, invoice.is_overdue ? 'portal.overview.overdueSince' : 'portal.overview.dueBy', { date: formatDate(locale, invoice.due_date) })
                      : formatDate(locale, invoice.issue_date)}
                </p>
              </div>
              <span className="text-lg font-semibold tabular-nums">{formatMoney(locale, invoice.gross_total_cents, invoice.currency)}</span>
              <InvoiceStatusBadge status={invoice.is_overdue ? 'OVERDUE' : invoice.status} locale={locale} />
              <a
                href={`/portal/rechnungen/${invoice.id}/pdf`}
                className="relative z-10 grid size-touch shrink-0 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                aria-label={`${t(locale, 'portal.invoice.download')}: ${invoice.invoice_number}`}
              >
                <Download className="size-[18px]" aria-hidden="true" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
