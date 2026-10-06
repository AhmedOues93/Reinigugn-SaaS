import { createHmac, timingSafeEqual } from 'node:crypto';
import { appUrl } from '@/lib/utils';
import { priceIdForPlan, type ReinPlanPlan } from '@/lib/subscription';

const stripeApi = 'https://api.stripe.com/v1';

function stripeSecret(): string {
  const value = process.env.STRIPE_SECRET_KEY?.trim();
  if (!value) throw new Error('Stripe ist noch nicht eingerichtet. STRIPE_SECRET_KEY fehlt.');
  return value;
}

async function stripePost(path: string, form: URLSearchParams, idempotencyKey?: string) {
  const response = await fetch(`${stripeApi}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecret()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: form.toString(),
    cache: 'no-store',
    signal: AbortSignal.timeout(15000),
  });
  const payload = await response.json().catch(() => null) as { url?: string; id?: string; error?: { message?: string } } | null;
  if (!response.ok || !payload) throw new Error(payload?.error?.message ?? 'Stripe konnte die Zahlung nicht vorbereiten.');
  return payload;
}

export async function createCheckoutSession({
  companyId,
  email,
  plan,
  trialEndsAt,
  checkoutKey,
  expiresAt,
  customerId,
}: {
  companyId: string;
  email: string;
  plan: ReinPlanPlan;
  trialEndsAt: string | null;
  checkoutKey: string;
  expiresAt: number;
  customerId: string | null;
}): Promise<string> {
  const priceId = priceIdForPlan(plan);
  if (!priceId) throw new Error(`Stripe-Preis für ${plan} fehlt.`);

  const form = new URLSearchParams({
    mode: 'subscription',
    customer_email: email,
    client_reference_id: companyId,
    success_url: appUrl('/dashboard/abo?checkout=success'),
    cancel_url: appUrl('/dashboard/abo?checkout=cancelled'),
    payment_method_collection: 'always',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    'metadata[company_id]': companyId,
    'metadata[reinplan_plan]': plan,
    'subscription_data[metadata][company_id]': companyId,
    'subscription_data[metadata][reinplan_plan]': plan,
  });
  form.set('expires_at', String(expiresAt));
  form.set('billing_address_collection', 'required');
  if (customerId) { form.delete('customer_email'); form.set('customer', customerId); }

  // A customer can choose a plan during the free month. Stripe stores the
  // payment method now but makes the first charge only when the same trial ends.
  const trialEnd = trialEndsAt ? new Date(trialEndsAt) : null;
  if (trialEnd && !Number.isNaN(trialEnd.getTime()) && trialEnd.getTime() > Date.now()) {
    if (trialEnd.getTime() - Date.now() < 48 * 3600000) {
      throw new Error('Ihr kostenloser Test endet in weniger als 48 Stunden. Bitte wählen Sie Ihren Tarif nach Ablauf des Tests; es erfolgt keine vorzeitige Belastung.');
    }
    form.set('subscription_data[trial_end]', String(Math.floor(trialEnd.getTime() / 1000)));
  }

  const result = await stripePost('/checkout/sessions', form, checkoutKey);
  if (!result.url) throw new Error('Stripe hat keine Checkout-Adresse zurückgegeben.');
  return result.url;
}

export async function retrieveStripeSubscription(id: string): Promise<Record<string, unknown>> {
  if (!/^sub_[a-zA-Z0-9]+$/.test(id)) throw new Error('Invalid subscription id');
  const response = await fetch(`${stripeApi}/subscriptions/${id}`, {
    headers: { Authorization: `Bearer ${stripeSecret()}` },
    cache: 'no-store', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Stripe subscription unavailable');
  return response.json();
}

export async function createBillingPortalSession(customerId: string): Promise<string> {
  const result = await stripePost('/billing_portal/sessions', new URLSearchParams({
    customer: customerId,
    return_url: appUrl('/dashboard/abo'),
  }));
  if (!result.url) throw new Error('Stripe hat keine Portal-Adresse zurückgegeben.');
  return result.url;
}

/** Verify the raw Stripe body before decoding it. Never trust a JSON field as a signature. */
export function verifyStripeSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !signature) return false;

  const pieces = signature.split(',').map((piece) => piece.trim());
  const timestamp = pieces.find((piece) => piece.startsWith('t='))?.slice(2);
  const signatures = pieces.filter((piece) => piece.startsWith('v1=')).map((piece) => piece.slice(3));
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 5 * 60) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
  return signatures.some((candidate) => {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) return false;
    return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(candidate, 'hex'));
  });
}
