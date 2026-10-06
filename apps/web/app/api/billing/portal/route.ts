import { NextResponse } from 'next/server';
import { staffMfaRedirect } from '@/lib/auth';
import { siteUrl } from '@/lib/env';
import { createBillingPortalSession } from '@/lib/stripe';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

/** Stripe's hosted portal manages payment method, invoices and cancellation. */
export async function POST(request: Request) {
  if (request.headers.get('origin') !== new URL(siteUrl()).origin) return NextResponse.json({ error: 'Invalid origin.' }, { status: 403 });
  if (process.env.REINPLAN_BILLING_ENABLED !== 'true') return NextResponse.json({ error: 'Online-Zahlung ist noch nicht verfügbar.' }, { status: 503 });
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Bitte melde dich erneut an.' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'Konto nicht gefunden.' }, { status: 403 });
  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id, role, companies(require_staff_mfa)')
    .eq('profile_id', profile.id)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (!membership || membership.role !== 'OWNER') {
    return NextResponse.json({ error: 'Nur der Inhaber kann die Zahlung verwalten.' }, { status: 403 });
  }
  const company = membership.companies as unknown as { require_staff_mfa?: boolean } | null;
  if (await staffMfaRedirect(supabase, company?.require_staff_mfa === true)) return NextResponse.json({ error: 'Bitte bestätigen Sie die Zwei-Faktor-Anmeldung.' }, { status: 403 });

  const { data: subscription } = await supabase
    .from('company_subscriptions')
    .select('stripe_customer_id')
    .eq('company_id', membership.company_id)
    .maybeSingle();
  if (!subscription?.stripe_customer_id) {
    return NextResponse.json({ error: 'Noch kein Zahlungsprofil vorhanden.' }, { status: 409 });
  }

  try {
    return NextResponse.json({ url: await createBillingPortalSession(subscription.stripe_customer_id) });
  } catch (error) {
    console.error('Stripe portal setup failed');
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Zahlungsportal nicht erreichbar.' }, { status: 503 });
  }
}

