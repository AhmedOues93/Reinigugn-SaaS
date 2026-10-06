import { createAdminClient } from '@/lib/supabase/admin';
import { priceIdForPlan, reinPlanPlans, stripeStatusToReinPlan, type ReinPlanPlan } from '@/lib/subscription';
import { retrieveStripeSubscription, verifyStripeSignature } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function string(value: unknown) { return typeof value === 'string' && value ? value : null; }
function date(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 253402300799
    ? new Date(value * 1000).toISOString() : null;
}

export async function POST(request: Request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: 'Webhook not configured.' }, { status: 503 });
  }
  const raw = await request.text();
  if (!verifyStripeSignature(raw, request.headers.get('stripe-signature'))) return Response.json({ error: 'Invalid signature.' }, { status: 400 });
  let event;
  try { event = JSON.parse(raw); } catch { return Response.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if (!event || typeof event.id !== 'string' || typeof event.type !== 'string' || !Number.isSafeInteger(event.created) || !event.data?.object) {
    return Response.json({ error: 'Invalid event.' }, { status: 400 });
  }
  if (!['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    return Response.json({ received: true, ignored: true });
  }
  const id = string(event.type === 'checkout.session.completed' ? event.data.object.subscription : event.data.object.id);
  if (!id) return Response.json({ error: 'Missing subscription.' }, { status: 400 });
  try {
    // Read current Stripe state instead of applying an out-of-order snapshot.
    const subscription = await retrieveStripeSubscription(id);
    const metadata = subscription.metadata as Record<string, unknown> | undefined;
    const companyId = string(metadata?.company_id);
    if (!companyId) return Response.json({ received: true, ignored: true });
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) throw new Error('Invalid tenant');
    const items = (subscription.items as { data?: Array<{ price?: { id?: string }; current_period_end?: number }> })?.data;
    if (items?.length !== 1) throw new Error('Unexpected subscription items');
    const price = items[0].price?.id;
    // The configured Price decides the purchased plan, not editable metadata.
    const plan = (Object.keys(reinPlanPlans) as ReinPlanPlan[]).find(key => priceIdForPlan(key) === price);
    const status = stripeStatusToReinPlan(subscription.status);
    const customer = string(subscription.customer);
    if (!plan || !status || !customer) throw new Error('Unknown subscription configuration');
    const { error } = await createAdminClient().rpc('record_reinplan_subscription_event', {
      p_event_id: event.id, p_event_type: event.type, p_created: event.created,
      p_company_id: companyId, p_subscription_id: id, p_customer_id: customer,
      p_price_id: price, p_plan: plan, p_status: status,
      p_cancel: subscription.cancel_at_period_end === true,
      p_period_end: date(items[0].current_period_end ?? subscription.current_period_end),
    });
    if (error) throw new Error('Database write failed');
    return Response.json({ received: true });
  } catch {
    console.error('Stripe webhook processing failed');
    return Response.json({ error: 'Subscription update unavailable.' }, { status: 503 });
  }
}
