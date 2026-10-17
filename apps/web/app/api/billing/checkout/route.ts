import { NextResponse } from 'next/server';
import { staffMfaRedirect } from '@/lib/auth';
import { siteUrl } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/admin';
import { createCheckoutSession } from '@/lib/stripe';
import { employeeLimitForPlan, isReinPlanPlan } from '@/lib/subscription';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** Starts a hosted Stripe Checkout only for the tenant owner. */
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(siteUrl()).origin) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  if (process.env.REINPLAN_BILLING_ENABLED !== 'true') return NextResponse.json({ error: 'Online-Zahlung ist noch nicht verfügbar.' }, { status: 503 });
  const body = await request.json().catch(() => null) as { plan?: unknown } | null;
  if (!body || !isReinPlanPlan(body.plan)) {
    return NextResponse.json({ error: 'Bitte wähle einen gültigen Tarif.' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'Bitte melde dich erneut an.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Konto nicht gefunden.' }, { status: 403 });

  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id, role, companies(require_staff_mfa)')
    .eq('profile_id', profile.id)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (!membership || membership.role !== 'OWNER') {
    return NextResponse.json({ error: 'Nur der Inhaber kann ein Abo auswählen.' }, { status: 403 });
  }

  const company = membership.companies as unknown as { require_staff_mfa?: boolean } | null;
  if (await staffMfaRedirect(supabase, company?.require_staff_mfa === true)) return NextResponse.json({ error: 'Bitte bestätigen Sie die Zwei-Faktor-Anmeldung.' }, { status: 403 });

  const { data: subscription, error: subscriptionError } = await supabase
    .from('company_subscriptions')
    .select('trial_ends_at, stripe_subscription_id, stripe_customer_id, status')
    .eq('company_id', membership.company_id)
    .maybeSingle();
  if (subscriptionError || !subscription) {
    return NextResponse.json({ error: 'Der Testzeitraum ist noch nicht eingerichtet.' }, { status: 409 });
  }
  if (subscription.stripe_subscription_id && ['TRIALING', 'ACTIVE', 'PAST_DUE', 'PAUSED'].includes(subscription.status)) {
    return NextResponse.json({ error: 'Ihr Abo existiert bereits. Bitte verwalten Sie es im Zahlungsportal.' }, { status: 409 });
  }

  const { count: employeeCount, error: employeeCountError } = await supabase
    .from('company_members')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', membership.company_id)
    .eq('role', 'EMPLOYEE')
    .in('status', ['ACTIVE', 'INVITED']);
  if (employeeCountError) {
    return NextResponse.json({ error: 'Mitarbeiterzahl konnte nicht geprüft werden.' }, { status: 503 });
  }
  const limit = employeeLimitForPlan(body.plan);
  if ((employeeCount ?? 0) > limit) {
    return NextResponse.json({
      error: `Dieser Tarif erlaubt bis ${limit} Mitarbeitende. Aktuell sind ${employeeCount} aktiv oder eingeladen.`,
    }, { status: 409 });
  }

  try {
    const { data: reservation, error } = await createAdminClient().rpc('reserve_reinplan_checkout', { p_company_id: membership.company_id, p_plan: body.plan });
    if (error || !reservation) return NextResponse.json({ error: 'Checkout ist bereits offen oder der Tarif passt nicht zur Mitarbeiterzahl.' }, { status: 409 });
    const url = await createCheckoutSession({
      checkoutKey: reservation.key,
      expiresAt: reservation.expires_at,
      customerId: subscription.stripe_customer_id,
      companyId: membership.company_id,
      email: user.email,
      plan: body.plan,
      trialEndsAt: subscription.trial_ends_at,
    });
    return NextResponse.json({ url });
  } catch (error) {
    console.error('Stripe checkout setup failed');
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Zahlung konnte nicht vorbereitet werden.' }, { status: 503 });
  }
}
