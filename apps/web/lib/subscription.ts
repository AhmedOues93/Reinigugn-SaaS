export const reinPlanPlans = {
  START: {
    name: 'Start',
    monthlyCents: 6900,
    employeeLimit: 5,
    priceEnv: 'STRIPE_PRICE_START',
  },
  BETRIEB: {
    name: 'Betrieb',
    monthlyCents: 11900,
    employeeLimit: 25,
    priceEnv: 'STRIPE_PRICE_BETRIEB',
  },
  UNTERNEHMEN: {
    name: 'Unternehmen',
    monthlyCents: 19900,
    employeeLimit: 75,
    priceEnv: 'STRIPE_PRICE_UNTERNEHMEN',
  },
} as const;

export type ReinPlanPlan = keyof typeof reinPlanPlans;
export type ReinPlanSubscriptionStatus = 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'PAUSED' | 'CANCELED' | 'UNPAID';

export function isReinPlanPlan(value: unknown): value is ReinPlanPlan {
  return typeof value === 'string' && Object.hasOwn(reinPlanPlans, value);
}

export function priceIdForPlan(plan: ReinPlanPlan): string | null {
  const value = process.env[reinPlanPlans[plan].priceEnv]?.trim();
  return value || null;
}

export function employeeLimitForPlan(plan: ReinPlanPlan): number {
  return reinPlanPlans[plan].employeeLimit;
}

export function trialDaysLeft(trialEndsAt: string | null | undefined, now = new Date()): number {
  if (!trialEndsAt) return 0;
  const endsAt = new Date(trialEndsAt);
  if (Number.isNaN(endsAt.getTime())) return 0;
  return Math.max(0, Math.ceil((endsAt.getTime() - now.getTime()) / 86_400_000));
}

export function isSubscriptionUsable(subscription: {
  status: ReinPlanSubscriptionStatus;
  trial_ends_at?: string | null;
}, now = new Date()): boolean {
  if (subscription.status === 'ACTIVE') return true;
  return subscription.status === 'TRIALING' && trialDaysLeft(subscription.trial_ends_at, now) > 0;
}

export function stripeStatusToReinPlan(value: unknown): ReinPlanSubscriptionStatus | null {
  switch (value) {
    case 'trialing': return 'TRIALING';
    case 'active': return 'ACTIVE';
    case 'past_due': return 'PAST_DUE';
    case 'paused': return 'PAUSED';
    case 'canceled': return 'CANCELED';
    case 'unpaid': return 'UNPAID';
    case 'incomplete': return 'UNPAID';
    case 'incomplete_expired': return 'CANCELED';
    default: return null;
  }
}
