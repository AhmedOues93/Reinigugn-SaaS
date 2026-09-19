import { Badge } from '@/components/ui';
import { t, type Locale } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

const tone: Record<string, 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'> = {
  PLANNED: 'neutral',
  CONFIRMED: 'info',
  CANCELLED: 'danger',
  IN_PROGRESS: 'primary',
  COMPLETED: 'success',
  MISSED: 'danger',
};

export async function JobStatusBadge({ status }: { status: string }) {
  const locale = await currentLocale();
  return <Badge tone={tone[status] ?? 'neutral'}>{t(locale, `status.${status}` as Parameters<typeof t>[1])}</Badge>;
}

export function formatJobTime(start: string, end?: string, locale: Locale = 'de') {
  const formatter = new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  return end ? `${formatter.format(new Date(start))}–${formatter.format(new Date(end))}` : formatter.format(new Date(start));
}
