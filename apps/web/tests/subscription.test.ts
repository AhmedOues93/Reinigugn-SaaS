import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  employeeLimitForPlan,
  isReinPlanPlan,
  isSubscriptionUsable,
  stripeStatusToReinPlan,
  trialDaysLeft,
} from '@/lib/subscription';
import { subscriptionCanUseProduct } from '@/lib/data/subscription';
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

describe('Schreibsperre und Oberflaeche', () => {
  /*
    Die Datenbank entscheidet (public.company_may_write), die Oberflaeche
    biegt nur frueher ab. Beide muessen dasselbe sagen, sonst zeigt die Seite
    etwas anderes an als das Produkt tut. Diese Faelle stehen in
    supabase/test/subscription-write-lock.test.sql spiegelbildlich.
  */
  const expired = { status: 'TRIALING' as const, trial_ends_at: '2026-10-01T00:00:00.000Z' };
  const running = { status: 'TRIALING' as const, trial_ends_at: '2026-11-01T00:00:00.000Z' };
  const now = new Date('2026-10-14T12:00:00.000Z');

  it('behandelt einen fehlenden Abo-Datensatz als erlaubt, wie die Datenbank', () => {
    // Mandanten aus der Zeit vor der Abo-Tabelle haben keine Zeile. Vorher
    // gab diese Stelle `false` zurueck, waehrend die Datenbank schreiben
    // liess -- die Oberflaeche haette "kein Zugang" behauptet.
    expect(subscriptionCanUseProduct(null)).toBe(true);
  });

  it('sperrt den abgelaufenen Testzeitraum und laesst den laufenden zu', () => {
    expect(isSubscriptionUsable(expired, now)).toBe(false);
    expect(isSubscriptionUsable(running, now)).toBe(true);
  });

  it('haelt jeden anderen Abo-Zustand fuer nicht nutzbar', () => {
    // Dieselbe Liste prueft die SQL-Suite gegen company_may_write.
    for (const status of ['PAST_DUE', 'PAUSED', 'CANCELED', 'UNPAID'] as const) {
      expect(isSubscriptionUsable({ status, trial_ends_at: running.trial_ends_at }, now)).toBe(false);
    }
  });

  it('laesst ein aktives Abo schreiben, auch wenn der Testzeitraum vorbei ist', () => {
    expect(isSubscriptionUsable({ status: 'ACTIVE', trial_ends_at: expired.trial_ends_at }, now)).toBe(true);
  });
});
