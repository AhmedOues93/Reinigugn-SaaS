import { CheckCircle2, Clock3, CreditCard, TriangleAlert } from 'lucide-react';
import { Badge, Card, CardHeader, DataRow, Notice, PageHeader, Section } from '@/components/ui';
import { SubscriptionActions } from '@/components/subscription-actions';
import { getMyCompanySubscription, subscriptionCanUseProduct } from '@/lib/data/subscription';
import { reinPlanPlans, trialDaysLeft } from '@/lib/subscription';

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' }).format(date);
}

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const [{ subscription, canManageSubscription }, query] = await Promise.all([getMyCompanySubscription(), searchParams]);
  const billingEnabled = process.env.REINPLAN_BILLING_ENABLED === 'true';
  const usable = subscriptionCanUseProduct(subscription);
  const days = trialDaysLeft(subscription?.trial_ends_at);
  const currentPlan = subscription?.plan ? reinPlanPlans[subscription.plan] : null;
  const hasStripeCustomer = Boolean(subscription?.stripe_customer_id);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        title="Abo und Zahlung"
        description="30 Tage kostenlos testen. Tarif, Testzeitraum und Zahlung an einem Ort verwalten."
      />

      {query.checkout === 'success' && (
        <Notice tone="success" icon={<CheckCircle2 />} title="Zurück vom Checkout">
          Der unten angezeigte Abo-Status wird ausschließlich durch Stripe bestätigt. Falls er noch unverändert ist, laden Sie die Seite bitte in wenigen Sekunden neu.
        </Notice>
      )}
      {query.checkout === 'cancelled' && (
        <Notice tone="neutral" icon={<Clock3 />} title="Checkout abgebrochen">
          Ihr kostenloser Test läuft weiter. Sie können einen Tarif jederzeit erneut auswählen.
        </Notice>
      )}

      <Card>
        <CardHeader
          title="Ihr aktueller Zugang"
          description={subscription?.status === 'ACTIVE' ? 'Ihr ReinPlan-Zugang ist aktiv.' : 'Sie entscheiden erst nach dem Testzeitraum.'}
          action={
            <Badge tone={usable ? 'success' : 'danger'}>
              {subscription?.status === 'ACTIVE' ? 'Aktiv' : usable ? 'Kostenloser Test' : 'Zugang abgelaufen'}
            </Badge>
          }
        />
        <dl className="divide-y divide-border/80 px-5 sm:px-6">
          <DataRow label="Tarif" value={currentPlan ? `${currentPlan.name} · bis ${currentPlan.employeeLimit} Mitarbeitende` : 'Noch nicht gewählt'} />
          <DataRow label="Testzeitraum endet" value={formatDate(subscription?.trial_ends_at)} />
          {subscription?.current_period_ends_at && <DataRow label="Nächste Verlängerung" value={formatDate(subscription.current_period_ends_at)} />}
          {subscription?.cancel_at_period_end && <DataRow label="Kündigung" value="Zum Ende des aktuellen Abrechnungszeitraums vorgemerkt" />}
        </dl>
      </Card>

      {subscription?.status === 'TRIALING' && days > 0 && (
        <Notice tone="info" icon={<Clock3 />} title={`Noch ${days} ${days === 1 ? 'Tag' : 'Tage'} kostenlos testen`}>
          Wählen Sie schon jetzt Ihren Tarif. Die Zahlungsdaten werden sicher bei Stripe gespeichert; die erste Belastung beginnt erst nach dem kostenlosen Testzeitraum.
        </Notice>
      )}
      {billingEnabled && !usable && (
        <Notice tone="warning" icon={<TriangleAlert />} title="Testzeitraum beendet">
          Wählen Sie einen Tarif, damit Ihr Team ohne Unterbrechung weiterarbeiten kann.
        </Notice>
      )}

      <Section title={hasStripeCustomer ? 'Zahlung verwalten' : 'Tarif auswählen'} description={hasStripeCustomer ? 'Zahlungsmethode, Rechnungen oder Kündigung sicher im Stripe-Portal verwalten.' : 'Alle Tarife starten mit den bereits laufenden 30 Tagen kostenlos.'}>
        <div className="rounded-xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
          {!billingEnabled ? (<p className="text-sm leading-6 text-muted-foreground">Die Online-Zahlung ist noch nicht freigeschaltet. Ihr Pilotzugang bleibt bestehen.</p>) : canManageSubscription ? (
            <SubscriptionActions hasCustomer={hasStripeCustomer} disabled={subscription?.status === 'ACTIVE'} />
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">Nur die Inhaberin oder der Inhaber kann Tarif und Zahlung ändern. Bitte wende dich an die Betriebsleitung.</p>
          )}
        </div>
      </Section>

      <Section title="In jedem Tarif enthalten" description="Ein Betrieb, ein Zugang für Büro, Team und Kundenportal.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {['Kunden und Objekte', 'Einsatzplanung und Zeiterfassung', 'Leistungsnachweise mit Fotos', 'Angebote, Kalkulation und Rechnungen', 'Kundenportal und Abnahmen', 'Qualität und Reklamationen'].map((feature) => (
            <div key={feature} className="flex items-center gap-2 rounded-xl border border-border/80 bg-card px-4 py-3 text-sm font-medium shadow-card">
              <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
              {feature}
            </div>
          ))}
        </div>
      </Section>

      <p className="flex items-center gap-2 text-sm text-muted-foreground"><CreditCard className="size-4" /> Zahlung und Aboverwaltung werden von Stripe bereitgestellt.</p>
    </div>
  );
}
