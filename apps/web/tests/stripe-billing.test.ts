import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCheckoutSession } from '@/lib/stripe';

const input = { companyId: 'company', email: 'owner@example.test', plan: 'START' as const, trialEndsAt: null, checkoutKey: 'same-attempt', expiresAt: 2000000000, customerId: null };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('hosted Checkout', () => {
  it('reuses the reserved key and customer, preserves the original trial end', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_example'); vi.stubEnv('STRIPE_PRICE_START', 'price_start');
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-06T10:00:00Z'));
    const fetch = vi.fn().mockResolvedValue(Response.json({ url: 'https://checkout.stripe.com/test' })); vi.stubGlobal('fetch', fetch);
    await createCheckoutSession({ ...input, customerId: 'cus_existing', trialEndsAt: '2026-10-10T10:00:00Z' });
    const options = fetch.mock.calls[0][1]; const form = new URLSearchParams(options.body);
    expect(options.headers['Idempotency-Key']).toBe('same-attempt');
    expect(form.get('customer')).toBe('cus_existing'); expect(form.has('customer_email')).toBe(false);
    expect(form.get('subscription_data[trial_end]')).toBe(String(Date.parse('2026-10-10T10:00:00Z') / 1000));
    expect(form.get('expires_at')).toBe('2000000000'); expect(form.get('line_items[0][price]')).toBe('price_start');
  });
  it('does not bill early during the final 48 hours of a free trial', async () => {
    vi.stubEnv('STRIPE_PRICE_START', 'price_start'); vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-06T10:00:00Z'));
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    await expect(createCheckoutSession({ ...input, trialEndsAt: '2026-10-07T10:00:00Z' })).rejects.toThrow('48 Stunden');
    expect(fetch).not.toHaveBeenCalled();
  });
});

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/stripe', async original => ({ ...await original<typeof import('@/lib/stripe')>(), retrieveStripeSubscription: vi.fn(), verifyStripeSignature: vi.fn() }));
import { POST } from '@/app/api/webhooks/stripe/route';
import { createAdminClient } from '@/lib/supabase/admin';
import { retrieveStripeSubscription, verifyStripeSignature } from '@/lib/stripe';

describe('Stripe webhook boundary', () => {
  const request = () => new Request('https://app.example/api/webhooks/stripe', { method: 'POST', body: JSON.stringify({ id: 'evt_1', type: 'customer.subscription.updated', created: 10, data: { object: { id: 'sub_1', status: 'active' } } }) });
  function configure() { vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'secret'); vi.stubEnv('STRIPE_SECRET_KEY', 'key'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service'); vi.stubEnv('STRIPE_PRICE_START', 'price_start'); }
  it('returns 503 while unconfigured', async () => { vi.stubEnv('STRIPE_SECRET_KEY', ''); expect((await POST(request())).status).toBe(503); });
  it('rejects unverified bodies before privileged reads', async () => { configure(); vi.mocked(verifyStripeSignature).mockReturnValue(false); expect((await POST(request())).status).toBe(400); expect(retrieveStripeSubscription).not.toHaveBeenCalled(); });
  it('uses current Stripe state and configured price, rather than event metadata', async () => {
    configure(); vi.mocked(verifyStripeSignature).mockReturnValue(true);
    vi.mocked(retrieveStripeSubscription).mockResolvedValue({ status: 'canceled', customer: 'cus_1', metadata: { company_id: 'b1111111-1111-1111-1111-111111111111', reinplan_plan: 'UNTERNEHMEN' }, items: { data: [{ price: { id: 'price_start' }, current_period_end: 1800000000 }] } });
    const rpc = vi.fn().mockResolvedValue({ error: null }); vi.mocked(createAdminClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof createAdminClient>);
    expect((await POST(request())).status).toBe(200);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_plan: 'START', p_status: 'CANCELED', p_period_end: '2027-01-15T08:00:00.000Z' });
  });
  it('asks Stripe to retry when the atomic write fails', async () => {
    configure(); vi.mocked(verifyStripeSignature).mockReturnValue(true);
    vi.mocked(retrieveStripeSubscription).mockResolvedValue({ status: 'active', customer: 'cus_1', metadata: { company_id: 'b1111111-1111-1111-1111-111111111111' }, items: { data: [{ price: { id: 'price_start' } }] } });
    vi.mocked(createAdminClient).mockReturnValue({ rpc: vi.fn().mockResolvedValue({ error: { message: 'temporary failure' } }) } as unknown as ReturnType<typeof createAdminClient>);
    expect((await POST(request())).status).toBe(503);
  });
});
