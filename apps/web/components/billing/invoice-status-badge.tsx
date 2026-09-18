import type { DisplayInvoiceStatus } from '@/lib/data/billing';
import { t, type Locale } from '@/lib/i18n';

const tone: Record<DisplayInvoiceStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  ISSUED: 'bg-blue-50 text-blue-700',
  PAID: 'bg-primary/10 text-primary',
  OVERDUE: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-amber-100 text-amber-900',
};

export function InvoiceStatusBadge({
  status,
  locale,
}: {
  status: DisplayInvoiceStatus;
  locale: Locale;
}) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${tone[status]}`}
    >
      {t(locale, `billing.status.${status}`)}
    </span>
  );
}
