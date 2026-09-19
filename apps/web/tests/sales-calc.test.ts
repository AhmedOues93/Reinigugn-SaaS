import { describe, expect, it } from 'vitest';
import { calculateArea, leadStatusTone, quoteStatusTone } from '@/lib/sales-calc';

/**
 * These mirror the arithmetic asserted against the real database in
 * supabase/test/sales.test.sql, so the on-screen preview and the generated
 * quote line cannot drift apart.
 */
describe('survey area calculation', () => {
  it('derives hours and price from minutes and the hourly rate', () => {
    // 120 min at 36.00/h => 2.000 h => 7200 cents, as the SQL suite asserts.
    expect(calculateArea({ services_per_week: 2, minutes_per_service: 120, hourly_rate_cents: null }, 3600)).toMatchObject({
      hours: 2,
      rateCents: 3600,
      netCents: 7200,
    });
    // 45 min at 42.00/h => 0.750 h => 3150 cents.
    expect(calculateArea({ services_per_week: 2, minutes_per_service: 45, hourly_rate_cents: 4200 }, 3600)).toMatchObject({
      hours: 0.75,
      netCents: 3150,
    });
  });

  it('prefers the area rate over the company default', () => {
    const withOwn = calculateArea({ services_per_week: 1, minutes_per_service: 60, hourly_rate_cents: 5000 }, 3600);
    expect(withOwn.rateCents).toBe(5000);
    expect(withOwn.netCents).toBe(5000);
  });

  it('reports no price when neither the area nor the company has a rate', () => {
    const result = calculateArea({ services_per_week: 1, minutes_per_service: 60, hourly_rate_cents: null }, null);
    expect(result.rateCents).toBeNull();
    expect(result.netCents).toBeNull();
    expect(result.monthlyNetCents).toBeNull();
    // Hours are still known, because they do not depend on a rate.
    expect(result.hours).toBe(1);
  });

  it('converts a weekly frequency to a monthly value at 13/3 weeks', () => {
    // 7200 cents twice a week => 7200 * 2 * 13/3 = 62400.
    expect(calculateArea({ services_per_week: 2, minutes_per_service: 120, hourly_rate_cents: 3600 }, null).monthlyNetCents).toBe(62400);
  });

  it('rounds minutes that do not divide evenly into hours', () => {
    // 50 min => 0.833 h at 3600 => 2999 cents (not 3000).
    expect(calculateArea({ services_per_week: 1, minutes_per_service: 50, hourly_rate_cents: 3600 }, null)).toMatchObject({
      hours: 0.833,
      netCents: 2999,
    });
  });
});

describe('status tones', () => {
  it('covers every lead and quote status', () => {
    for (const status of ['NEW', 'CONTACTED', 'SURVEY_BOOKED', 'QUOTED', 'WON', 'LOST'] as const) {
      expect(leadStatusTone[status]).toBeTruthy();
    }
    for (const status of ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED'] as const) {
      expect(quoteStatusTone[status]).toBeTruthy();
    }
  });

  it('marks a won or accepted outcome as success and a lost one as danger', () => {
    expect(leadStatusTone.WON).toBe('success');
    expect(leadStatusTone.LOST).toBe('danger');
    expect(quoteStatusTone.ACCEPTED).toBe('success');
    expect(quoteStatusTone.DECLINED).toBe('danger');
  });
});
