import { t, type Locale } from '@/lib/i18n';
import { currentLocale } from '@/lib/i18n-server';

export async function JobStatusBadge({ status }: { status: string }) {
  const locale = await currentLocale();
  const classes: Record<string, string> = { PLANNED: 'bg-slate-100 text-slate-700', CONFIRMED: 'bg-blue-50 text-blue-700', CANCELLED: 'bg-red-50 text-red-700', IN_PROGRESS: 'bg-amber-50 text-amber-800', COMPLETED: 'bg-primary-soft text-primary', MISSED: 'bg-red-50 text-red-700' };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${classes[status] ?? classes.PLANNED}`}>{t(locale, `status.${status}` as Parameters<typeof t>[1])}</span>;
}

export function formatJobTime(start: string, end?: string, locale: Locale = 'de') {
  const formatter = new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : locale === 'en' ? 'en-GB' : 'de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
  return end ? `${formatter.format(new Date(start))}–${formatter.format(new Date(end))}` : formatter.format(new Date(start));
}
