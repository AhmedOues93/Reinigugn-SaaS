import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  employeeLimitForPlan,
  isReinPlanPlan,
  isSubscriptionUsable,
  stripeStatusToReinPlan,
  trialDaysLeft,
} from '@/lib/subscription';
import { verifyStripeSignature } from '@/lib/stripe';

describe('SaaS subscription lifecycle', () => {
  it('keeps the public employee caps in one server-side source of truth', () => {
    expect(employeeLimitForPlan('START')).toBe(5);
    expect(employeeLimitForPlan('BETRIEB')).toBe(25);
    expect(employeeLimitForPlan('UNTERNEHMEN')).toBe(75);
  });

  it('keeps a trial usable until its exact end and never past it', () => {
    const now = new Date('2026-10-05T10:00:00.000Z');
    expect(trialDaysLeft('2026-10-06T10:00:00.000Z', now)).toBe(1);
    expect(isSubscriptionUsable({ status: 'TRIALING', trial_ends_at: '2026-10-06T10:00:00.000Z' }, now)).toBe(true);
    expect(isSubscriptionUsable({ status: 'TRIALING', trial_ends_at: '2026-10-05T10:00:00.000Z' }, now)).toBe(false);
    expect(isSubscriptionUsable({ status: 'ACTIVE', trial_ends_at: '2020-01-01T00:00:00.000Z' }, now)).toBe(true);
  });

  it('only accepts the three public plans and Stripe states we persist', () => {
    expect(isReinPlanPlan('START')).toBe(true);
    expect(isReinPlanPlan('BETRIEB')).toBe(true);
    expect(isReinPlanPlan('UNTERNEHMEN')).toBe(true);
    expect(isReinPlanPlan('FREE')).toBe(false);
    expect(stripeStatusToReinPlan('trialing')).toBe('TRIALING');
    expect(stripeStatusToReinPlan('past_due')).toBe('PAST_DUE');
    expect(stripeStatusToReinPlan('incomplete')).toBe('UNPAID');
    expect(isReinPlanPlan('toString')).toBe(false);
    expect(isReinPlanPlan('__proto__')).toBe(false);
  });
});

describe('Stripe webhook signature', () => {
  const now = 1_800_000_000_000;
  const secret = 'whsec_test_signing_secret';
  const body = JSON.stringify({ id: 'evt_123', type: 'customer.subscription.updated' });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function header(timestamp = String(Math.floor(now / 1000)), signedBody = body, signingSecret = secret) {
    const value = createHmac('sha256', signingSecret).update(`${timestamp}.${signedBody}`, 'utf8').digest('hex');
    return `t=${timestamp},v1=${value}`;
  }

  it('accepts the exact body and rejects tampering, old deliveries and wrong secrets', () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', secret);
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(verifyStripeSignature(body, header())).toBe(true);
    expect(verifyStripeSignature(`${body} `, header())).toBe(false);
    expect(verifyStripeSignature(body, header(undefined, body, 'other-secret'))).toBe(false);
    expect(verifyStripeSignature(body, header(String(Math.floor(now / 1000) - 301)))).toBe(false);
  });
});
