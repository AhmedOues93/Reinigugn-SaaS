import { localeTag, type Locale } from '@/lib/i18n';

const berlin = 'Europe/Berlin';

export function formatDate(locale: Locale, value: string, style: 'short' | 'long' = 'short') {
  const date = value.length === 10 ? new Date(`${value}T12:00:00Z`) : new Date(value);
  return new Intl.DateTimeFormat(
    localeTag(locale),
    style === 'long'
      ? { weekday: 'long', day: '2-digit', month: 'long', timeZone: berlin }
      : { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: berlin },
  ).format(date);
}

export function formatTime(locale: Locale, value: string) {
  return new Intl.DateTimeFormat(localeTag(locale), { hour: '2-digit', minute: '2-digit', timeZone: berlin }).format(new Date(value));
}

export function formatTimeRange(locale: Locale, start: string | null, end: string | null) {
  if (!start) return '—';
  return end ? `${formatTime(locale, start)}–${formatTime(locale, end)}` : formatTime(locale, start);
}

export function formatDateTime(locale: Locale, value: string) {
  return new Intl.DateTimeFormat(localeTag(locale), { dateStyle: 'short', timeStyle: 'short', timeZone: berlin }).format(new Date(value));
}

/**
 * Money is stored in minor units and always rendered from that integer, never
 * from a float, so a displayed total can never drift from the stored total.
 */
export function formatMoney(locale: Locale, minorUnits: number, currency = 'EUR') {
  return new Intl.NumberFormat(localeTag(locale), { style: 'currency', currency }).format(minorUnits / 100);
}

export function formatPercent(locale: Locale, basisPoints: number) {
  return new Intl.NumberFormat(localeTag(locale), { style: 'percent', maximumFractionDigits: 2 }).format(basisPoints / 10000);
}
