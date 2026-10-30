import { getCurrentCompany } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { isSubscriptionUsable, type ReinPlanPlan, type ReinPlanSubscriptionStatus } from '@/lib/subscription';

export type CompanySubscription = {
  company_id: string;
  plan: ReinPlanPlan | null;
  status: ReinPlanSubscriptionStatus;
  trial_started_at: string;
  trial_ends_at: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: boolean;
  current_period_ends_at: string | null;
  comp_access_until: string | null;
  suspended_at: string | null;
};

export async function getMyCompanySubscription() {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership) redirect('/onboarding');
  if (!['OWNER', 'OFFICE'].includes(membership.role)) redirect('/mitarbeiter');

  const { data, error } = await supabase
    .from('company_subscriptions')
    .select('company_id, plan, status, trial_started_at, trial_ends_at, stripe_customer_id, stripe_subscription_id, cancel_at_period_end, current_period_ends_at, comp_access_until, suspended_at')
    .eq('company_id', membership.company_id)
    .maybeSingle();
  if (error) throw new Error('Abo-Status konnte nicht geladen werden.');
  return {
    subscription: data as CompanySubscription | null,
    canManageSubscription: membership.role === 'OWNER',
  };
}

export function subscriptionCanUseProduct(subscription: CompanySubscription | null, now = new Date()) {
  if (!subscription || subscription.suspended_at) return false;
  if (hasCompAccess(subscription, now)) return true;
  return isSubscriptionUsable(subscription, now);
}

/** Freier Zugang, von der Plattform vergeben (Pilot, Zahlung per Rechnung). */
export function hasCompAccess(subscription: Pick<CompanySubscription, 'comp_access_until'> | null, now = new Date()) {
  const until = subscription?.comp_access_until ? new Date(subscription.comp_access_until) : null;
  return Boolean(until && !Number.isNaN(until.getTime()) && until.getTime() > now.getTime());
}
