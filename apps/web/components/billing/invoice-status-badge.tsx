import { Badge } from '@/components/ui';
import type { DisplayInvoiceStatus } from '@/lib/data/billing';
import { t, type Locale } from '@/lib/i18n';

const tone: Record<DisplayInvoiceStatus, 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  DRAFT: 'neutral',
  ISSUED: 'info',
  PAID: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'warning',
};

export function InvoiceStatusBadge({
  status,
  locale,
}: {
  status: DisplayInvoiceStatus;
  locale: Locale;
}) {
  return <Badge tone={tone[status]}>{t(locale, `billing.status.${status}`)}</Badge>;
}
