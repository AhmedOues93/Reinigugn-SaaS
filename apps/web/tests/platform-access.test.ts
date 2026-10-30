import { describe, expect, it } from 'vitest';
import { ACCESS_PAUSED_PATH, isAccessReason, isPathAllowedWithoutAccess } from '@/lib/access';
import { companyState, daysUntil, isUnlimitedComp, summarize, type PlatformCompany } from '@/lib/platform-metrics';

const now = new Date('2026-10-29T10:00:00.000Z');

function company(overrides: Partial<PlatformCompany> = {}): PlatformCompany {
  return {
    company_id: '00000000-0000-4000-8000-000000000001',
    name: 'Glanz GmbH',
    created_at: '2026-10-01T10:00:00.000Z',
    owner_email: 'inhaberin@example.de',
    plan: null,
    status: 'TRIALING',
    trial_ends_at: '2026-11-15T10:00:00.000Z',
    current_period_ends_at: null,
    cancel_at_period_end: false,
    stripe_customer_id: null,
    comp_access_until: null,
    comp_access_note: null,
    suspended_at: null,
    suspended_reason: null,
    employee_count: 3,
    office_count: 1,
    customer_count: 4,
    has_access: true,
    would_have_access: true,
    ...overrides,
  };
}

describe('paths reachable without access', () => {
  it('keeps the notice page open for every role', () => {
    for (const role of ['OWNER', 'OFFICE', 'EMPLOYEE', 'CUSTOMER']) {
      expect(isPathAllowedWithoutAccess(ACCESS_PAUSED_PATH, role)).toBe(true);
    }
  });

  it('lets the office reach billing, two-factor and its own exports', () => {
    expect(isPathAllowedWithoutAccess('/dashboard/abo', 'OWNER')).toBe(true);
    expect(isPathAllowedWithoutAccess('/dashboard/abo?checkout=success', 'OWNER')).toBe(true);
    expect(isPathAllowedWithoutAccess('/dashboard/sicherheit/bestaetigen', 'OFFICE')).toBe(true);
    expect(isPathAllowedWithoutAccess('/dashboard/abrechnung/datev', 'OWNER')).toBe(true);
    expect(isPathAllowedWithoutAccess('/dashboard/arbeitszeiten/monatsabschluss/export', 'OWNER')).toBe(true);
    expect(isPathAllowedWithoutAccess('/dashboard/abrechnung/abc-123/xrechnung', 'OWNER')).toBe(true);
  });

  it('blocks the working screens', () => {
    expect(isPathAllowedWithoutAccess('/dashboard', 'OWNER')).toBe(false);
    expect(isPathAllowedWithoutAccess('/dashboard/kunden/neu', 'OWNER')).toBe(false);
    expect(isPathAllowedWithoutAccess('/dashboard/abrechnung/neu', 'OWNER')).toBe(false);
    expect(isPathAllowedWithoutAccess('/dashboard/abonnieren', 'OWNER')).toBe(false);
  });

  it('gives employees and customers nothing but the notice', () => {
    expect(isPathAllowedWithoutAccess('/dashboard/abo', 'EMPLOYEE')).toBe(false);
    expect(isPathAllowedWithoutAccess('/mitarbeiter', 'EMPLOYEE')).toBe(false);
    expect(isPathAllowedWithoutAccess('/portal/rechnungen', 'CUSTOMER')).toBe(false);
    expect(isPathAllowedWithoutAccess('/dashboard/abrechnung/datev', 'CUSTOMER')).toBe(false);
  });

  it('frees nothing when the path is unknown', () => {
    expect(isPathAllowedWithoutAccess(null, 'OWNER')).toBe(false);
    expect(isPathAllowedWithoutAccess('', 'OWNER')).toBe(false);
  });

  it('accepts only the reasons the database returns', () => {
    expect(isAccessReason('TRIAL_ENDED')).toBe(true);
    expect(isAccessReason('SUSPENDED')).toBe(true);
    expect(isAccessReason('whatever')).toBe(false);
  });
});

describe('platform overview', () => {
  it('orders states like the database rule: suspension first', () => {
    expect(companyState(company({ suspended_at: '2026-10-20T00:00:00Z', status: 'ACTIVE' }), now)).toBe('SUSPENDED');
    expect(companyState(company({ status: 'ACTIVE', plan: 'START' }), now)).toBe('PAYING');
    expect(companyState(company({ status: 'PAST_DUE', plan: 'START' }), now)).toBe('PAST_DUE');
    expect(companyState(company({ trial_ends_at: '2026-10-01T00:00:00Z', comp_access_until: '2027-01-01T00:00:00Z' }), now)).toBe('COMP');
    expect(companyState(company(), now)).toBe('TRIAL');
    expect(companyState(company({ trial_ends_at: '2026-10-28T00:00:00Z' }), now)).toBe('EXPIRED');
    expect(companyState(company({ trial_ends_at: '2026-10-28T00:00:00Z', comp_access_until: '2026-10-28T00:00:00Z' }), now)).toBe('EXPIRED');
  });

  it('counts monthly revenue from paying plans only', () => {
    const summary = summarize([
      company({ status: 'ACTIVE', plan: 'START' }),
      company({ status: 'PAST_DUE', plan: 'BETRIEB' }),
      company({ status: 'ACTIVE', plan: 'UNTERNEHMEN', suspended_at: '2026-10-20T00:00:00Z' }),
      company({ comp_access_until: '2027-01-01T00:00:00Z', trial_ends_at: '2026-10-01T00:00:00Z' }),
      company({ trial_ends_at: '2026-11-02T10:00:00Z' }),
      company({ trial_ends_at: '2026-10-01T00:00:00Z', would_have_access: false }),
    ], now);
    expect(summary.companies).toBe(6);
    expect(summary.paying).toBe(2);
    expect(summary.mrrCents).toBe(6900 + 11900);
    expect(summary.comp).toBe(1);
    expect(summary.trials).toBe(1);
    expect(summary.trialsEndingSoon).toBe(1);
    expect(summary.expired).toBe(1);
    expect(summary.suspended).toBe(1);
    expect(summary.wouldLoseAccess).toBe(1);
  });

  it('treats the far-future date as unlimited and counts days up', () => {
    expect(isUnlimitedComp('2099-12-31T22:59:00.000Z')).toBe(true);
    expect(isUnlimitedComp('2027-06-30T21:59:00.000Z')).toBe(false);
    expect(isUnlimitedComp(null)).toBe(false);
    expect(daysUntil('2026-10-30T10:00:00.000Z', now)).toBe(1);
    expect(daysUntil(null, now)).toBeNull();
  });
});
