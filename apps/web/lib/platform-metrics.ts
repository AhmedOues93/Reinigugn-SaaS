import { reinPlanPlans, type ReinPlanPlan, type ReinPlanSubscriptionStatus } from '@/lib/subscription';

/** Eine Zeile aus `platform_list_companies()`. */
export type PlatformCompany = {
  company_id: string;
  name: string;
  created_at: string;
  owner_email: string | null;
  plan: ReinPlanPlan | null;
  status: ReinPlanSubscriptionStatus | null;
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  cancel_at_period_end: boolean;
  stripe_customer_id: string | null;
  comp_access_until: string | null;
  comp_access_note: string | null;
  suspended_at: string | null;
  suspended_reason: string | null;
  employee_count: number;
  office_count: number;
  customer_count: number;
  has_access: boolean;
  would_have_access: boolean;
};

export type CompanyState = 'SUSPENDED' | 'PAYING' | 'PAST_DUE' | 'COMP' | 'TRIAL' | 'EXPIRED';

/** Ab hier gilt ein freier Zugang als unbefristet (fuer Anzeige und Formular). */
export const UNLIMITED_COMP_YEAR = 2099;

/**
 * Was die Betreiberin auf einen Blick sehen muss. Reihenfolge wie in der
 * Datenbankregel: Sperre schlaegt alles, dann zahlend, dann geschenkt, dann
 * Test.
 */
export function companyState(company: PlatformCompany, now = new Date()): CompanyState {
  const future = (value: string | null) => Boolean(value && new Date(value).getTime() > now.getTime());
  if (company.suspended_at) return 'SUSPENDED';
  if (company.status === 'ACTIVE') return 'PAYING';
  if (company.status === 'PAST_DUE') return 'PAST_DUE';
  if (future(company.comp_access_until)) return 'COMP';
  if (future(company.trial_ends_at)) return 'TRIAL';
  return 'EXPIRED';
}

export function isUnlimitedComp(value: string | null) {
  return Boolean(value && new Date(value).getUTCFullYear() >= UNLIMITED_COMP_YEAR);
}

export function daysUntil(value: string | null, now = new Date()) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return Math.ceil((time - now.getTime()) / 86_400_000);
}

export type PlatformSummary = {
  companies: number;
  paying: number;
  /** Monatlicher Umsatz aus aktiven Abos in Cent, nach den oeffentlichen Preisen. */
  mrrCents: number;
  trials: number;
  trialsEndingSoon: number;
  comp: number;
  expired: number;
  suspended: number;
  /** Betriebe, die beim Einschalten der Sperre den Zugang verloeren. */
  wouldLoseAccess: number;
};

export function summarize(companies: PlatformCompany[], now = new Date()): PlatformSummary {
  const summary: PlatformSummary = {
    companies: companies.length,
    paying: 0,
    mrrCents: 0,
    trials: 0,
    trialsEndingSoon: 0,
    comp: 0,
    expired: 0,
    suspended: 0,
    wouldLoseAccess: 0,
  };
  for (const company of companies) {
    const state = companyState(company, now);
    if (state === 'PAYING' || state === 'PAST_DUE') {
      summary.paying += 1;
      if (company.plan) summary.mrrCents += reinPlanPlans[company.plan].monthlyCents;
    }
    if (state === 'TRIAL') {
      summary.trials += 1;
      const left = daysUntil(company.trial_ends_at, now);
      if (left !== null && left <= 7) summary.trialsEndingSoon += 1;
    }
    if (state === 'COMP') summary.comp += 1;
    if (state === 'EXPIRED') summary.expired += 1;
    if (state === 'SUSPENDED') summary.suspended += 1;
    if (!company.would_have_access && !company.suspended_at) summary.wouldLoseAccess += 1;
  }
  return summary;
}
