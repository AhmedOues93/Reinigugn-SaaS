import Link from 'next/link';
import { ChevronRight, Receipt } from 'lucide-react';
import { PortalEmptyState, PortalPageHeader } from '@/components/portal/portal-shell';
import { InvoiceStatusBadge } from '@/components/billing/invoice-status-badge';
import { listPortalInvoices } from '@/lib/data/portal-invoices';
import { portalLocale } from '@/lib/data/portal';
import { formatDate, formatMoney } from '@/lib/format';
import { t } from '@/lib/i18n';

export default async function PortalInvoicesPage() {
  const [locale, invoices] = await Promise.all([portalLocale(), listPortalInvoices()]);

  return (
    <>
      <PortalPageHeader title={t(locale, 'billing.invoices')} />
      {invoices.length === 0 ? (
        <PortalEmptyState
          icon={<Receipt className="size-5" />}
          title={t(locale, 'billing.empty')}
        />
      ) : (
        <ul className="space-y-3">
          {invoices.map((invoice) => (
            <li key={invoice.id}>
              <Link
                href={`/portal/rechnungen/${invoice.id}`}
                className="flex items-center gap-3 rounded-lg border bg-white p-4 transition-colors hover:border-primary"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{invoice.invoice_number}</p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {formatDate(locale, invoice.issue_date)}
                    {invoice.due_date &&
                      ` · ${t(locale, 'billing.dueDate')} ${formatDate(locale, invoice.due_date)}`}
                  </p>
                </div>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatMoney(locale, invoice.gross_total_cents, invoice.currency)}
                </span>
                <InvoiceStatusBadge
                  status={invoice.is_overdue ? 'OVERDUE' : invoice.status}
                  locale={locale}
                />
                <ChevronRight
                  className="size-5 shrink-0 text-slate-400 rtl:rotate-180"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
