'use client';

import { useState } from 'react';
import { CreditCard, ExternalLink, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import { reinPlanPlans, type ReinPlanPlan } from '@/lib/subscription';

type RequestResult = { url?: string; error?: string };

async function request(url: string, body?: object): Promise<RequestResult> {
  try {
  const response = await fetch(url, {
    method: 'POST',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json().catch(() => ({ error: 'Die Zahlungsseite konnte nicht geöffnet werden.' }));
  } catch {
    return { error: 'Die Zahlungsseite ist gerade nicht erreichbar. Bitte versuchen Sie es erneut.' };
  }
}

export function SubscriptionActions({
  hasCustomer,
  disabled = false,
}: {
  hasCustomer: boolean;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState<ReinPlanPlan | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choosePlan(plan: ReinPlanPlan) {
    setPending(plan);
    setError(null);
    const result = await request('/api/billing/checkout', { plan });
    if (result.url) window.location.assign(result.url);
    else {
      setError(result.error ?? 'Der Checkout konnte nicht gestartet werden.');
      setPending(null);
    }
  }

  async function openPortal() {
    setPending('portal');
    setError(null);
    const result = await request('/api/billing/portal');
    if (result.url) window.location.assign(result.url);
    else {
      setError(result.error ?? 'Das Zahlungsportal konnte nicht geöffnet werden.');
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      {hasCustomer ? (
        <Button type="button" variant="outline" onClick={openPortal} disabled={pending !== null}>
          {pending === 'portal' ? <LoaderCircle className="size-4 animate-spin" /> : <ExternalLink className="size-4" />}
          Zahlung verwalten
        </Button>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {(Object.keys(reinPlanPlans) as ReinPlanPlan[]).map((plan) => {
            const item = reinPlanPlans[plan];
            const busy = pending === plan;
            return (
              <Button key={plan} type="button" variant={plan === 'BETRIEB' ? 'default' : 'outline'} onClick={() => choosePlan(plan)} disabled={disabled || pending !== null} className="min-h-12">
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
                {item.name} wählen · {new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(item.monthlyCents / 100)}
              </Button>
            );
          })}
        </div>
      )}
      {error && <p role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
