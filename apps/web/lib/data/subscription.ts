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
};

export async function getMyCompanySubscription() {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership) redirect('/onboarding');
  if (!['OWNER', 'OFFICE'].includes(membership.role)) redirect('/mitarbeiter');

  const { data, error } = await supabase
    .from('company_subscriptions')
    .select('company_id, plan, status, trial_started_at, trial_ends_at, stripe_customer_id, stripe_subscription_id, cancel_at_period_end, current_period_ends_at')
    .eq('company_id', membership.company_id)
    .maybeSingle();
  if (error) throw new Error('Abo-Status konnte nicht geladen werden.');
  return {
    subscription: data as CompanySubscription | null,
    canManageSubscription: membership.role === 'OWNER',
  };
}

/**
 * Darf dieser Betrieb gerade schreiben?
 *
 * Dieselbe Regel wie `public.company_may_write()` in der Datenbank -- und die
 * Datenbank bleibt die entscheidende Stelle. Diese Funktion gibt es, damit
 * die Oberflaeche frueher und freundlicher abbiegt, nicht als Ersatz.
 *
 * Ohne Abo-Zeile: erlaubt. Mandanten aus der Zeit vor der Abo-Tabelle duerfen
 * nicht ploetzlich stehen, und die Datenbank entscheidet genauso. Vorher gab
 * diese Funktion hier `false` zurueck, waehrend die Datenbank schreiben
 * liess -- zwei Antworten auf dieselbe Frage, und die Oberflaeche haette
 * einem Altbestand "kein Zugang" angezeigt, obwohl er arbeiten darf.
 */
export function subscriptionCanUseProduct(subscription: CompanySubscription | null) {
  return subscription ? isSubscriptionUsable(subscription) : true;
}

/**
 * Der Grund, falls gerade nicht geschrieben werden darf -- sonst null.
 *
 * Fuer Server-Actions gedacht: ohne sie meldet eine abgelehnte Richtlinie nur
 * "Der Kunde konnte nicht angelegt werden." und die Inhaberin sucht den
 * Fehler bei sich. Die Richtlinie bleibt der Riegel; dies ist die Erklaerung.
 */
export async function subscriptionWriteBlockMessage(): Promise<string | null> {
  const { supabase, membership } = await getCurrentCompany();
  if (!membership) return null;

  const { data, error } = await supabase
    .from('company_subscriptions')
    .select('status, trial_ends_at')
    .eq('company_id', membership.company_id)
    .maybeSingle();
  // Bei einem Lesefehler nicht sperren: die Datenbank entscheidet ohnehin,
  // und eine erfundene Sperre waere schlimmer als eine fehlende Erklaerung.
  if (error || !data) return null;

  if (isSubscriptionUsable(data as { status: ReinPlanSubscriptionStatus; trial_ends_at: string })) return null;
  return 'Ihr Testzeitraum ist abgelaufen. Ihre Daten bleiben vollständig lesbar und exportierbar, '
    + 'neue Einträge sind erst nach Auswahl eines Tarifs unter „Abo und Zahlung" wieder möglich. '
    + 'Zeiterfassung und Krankmeldungen Ihrer Mitarbeitenden laufen weiter.';
}
