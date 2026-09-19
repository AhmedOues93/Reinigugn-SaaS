/**
 * Pure sales domain logic: types, status tones and the calculation preview.
 *
 * Deliberately free of any server import. `lib/data/sales.ts` reaches
 * `next/headers` through the Supabase server client, so a client component that
 * imported the calculation from there would drag server-only code into the
 * browser bundle and fail the build.
 */
export type LeadStatus = 'NEW' | 'CONTACTED' | 'SURVEY_BOOKED' | 'QUOTED' | 'WON' | 'LOST';
export type SurveyStatus = 'PLANNED' | 'COMPLETED' | 'CANCELLED';
export type QuoteStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED';
export type QuoteRecurrence = 'ONE_OFF' | 'WEEKLY' | 'MONTHLY';

type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'primary';

export const leadStatusTone: Record<LeadStatus, Tone> = {
  NEW: 'info',
  CONTACTED: 'info',
  SURVEY_BOOKED: 'warning',
  QUOTED: 'primary',
  WON: 'success',
  LOST: 'danger',
};

export const quoteStatusTone: Record<QuoteStatus, Tone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  ACCEPTED: 'success',
  DECLINED: 'danger',
  EXPIRED: 'warning',
};

/**
 * The Kalkulation preview shown while measuring. It mirrors
 * `create_quote_from_survey` exactly — hours rounded to three decimals, then the
 * amount rounded to whole cents — so the preview and the generated quote line
 * cannot disagree. The monthly figure uses the same 13/3 weeks-per-month factor
 * as `refresh_quote_totals`.
 */
export function calculateArea(
  area: { services_per_week: number; minutes_per_service: number; hourly_rate_cents: number | null },
  fallbackRateCents: number | null,
) {
  const rate = area.hourly_rate_cents ?? fallbackRateCents;
  const hours = Math.round((area.minutes_per_service / 60) * 1000) / 1000;
  if (rate === null) return { hours, rateCents: null, netCents: null, monthlyNetCents: null };
  const netCents = Math.round(hours * rate);
  const monthlyNetCents = Math.round(netCents * area.services_per_week * (13 / 3));
  return { hours, rateCents: rate, netCents, monthlyNetCents };
}
