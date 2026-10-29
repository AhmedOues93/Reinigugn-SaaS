import { Ban, Building2, CheckCircle2, CircleDollarSign, Clock3, ExternalLink, Gift, ShieldAlert, TriangleAlert } from 'lucide-react';
import {
  grantCompAccess,
  revokeCompAccess,
  setEnforcement,
  setSuspended,
  setTrialEnd,
} from '@/app/platform/actions';
import { SubmitButton } from '@/components/form-controls';
import { Badge, Card, CardHeader, Input, Notice, PageHeader, Section, StatCard, type Tone } from '@/components/ui';
import { addDays, berlinDateKey } from '@/lib/date';
import { formatMoney } from '@/lib/format';
import { loadPlatformOverview, type PlatformAction } from '@/lib/platform';
import {
  companyState,
  daysUntil,
  isUnlimitedComp,
  summarize,
  type CompanyState,
  type PlatformCompany,
} from '@/lib/platform-metrics';
import { reinPlanPlans } from '@/lib/subscription';

const stateLabel: Record<CompanyState, { label: string; tone: Tone }> = {
  PAYING: { label: 'Zahlend', tone: 'success' },
  PAST_DUE: { label: 'Zahlung offen', tone: 'warning' },
  COMP: { label: 'Freier Zugang', tone: 'info' },
  TRIAL: { label: 'Test', tone: 'primary' },
  EXPIRED: { label: 'Abgelaufen', tone: 'danger' },
  SUSPENDED: { label: 'Gesperrt', tone: 'danger' },
};

const actionLabel: Record<string, string> = {
  TRIAL_END_SET: 'Testende geaendert',
  COMP_ACCESS_GRANTED: 'Freier Zugang vergeben',
  COMP_ACCESS_REVOKED: 'Freier Zugang entzogen',
  SUSPENDED: 'Gesperrt',
  UNSUSPENDED: 'Freigegeben',
  ENFORCEMENT_ON: 'Zugangssperre eingeschaltet',
  ENFORCEMENT_OFF: 'Zugangssperre ausgeschaltet',
};

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeZone: 'Europe/Berlin' }).format(date);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(new Date(value));
}

function stripeCustomerUrl(customerId: string) {
  const testMode = process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_');
  return `https://dashboard.stripe.com/${testMode ? 'test/' : ''}customers/${encodeURIComponent(customerId)}`;
}

function accessLine(company: PlatformCompany, state: CompanyState) {
  if (state === 'SUSPENDED') return `Gesperrt seit ${formatDate(company.suspended_at)}${company.suspended_reason ? ` · ${company.suspended_reason}` : ''}`;
  if (state === 'PAYING' || state === 'PAST_DUE') {
    const plan = company.plan ? reinPlanPlans[company.plan].name : 'Tarif unbekannt';
    const renewal = company.cancel_at_period_end ? 'endet' : 'verlaengert sich';
    return `${plan} · ${renewal} am ${formatDate(company.current_period_ends_at)}`;
  }
  if (state === 'COMP') {
    const until = isUnlimitedComp(company.comp_access_until) ? 'unbefristet' : `bis ${formatDate(company.comp_access_until)}`;
    return `Freier Zugang ${until}${company.comp_access_note ? ` · ${company.comp_access_note}` : ''}`;
  }
  if (state === 'TRIAL') {
    const left = daysUntil(company.trial_ends_at) ?? 0;
    return `Test endet am ${formatDate(company.trial_ends_at)} (noch ${left} ${left === 1 ? 'Tag' : 'Tage'})`;
  }
  return `Test endete am ${formatDate(company.trial_ends_at)}`;
}

function actionDetail(action: PlatformAction) {
  const detail = action.detail ?? {};
  const to = typeof detail.to === 'string' ? detail.to : null;
  const reason = typeof detail.reason === 'string' ? detail.reason : null;
  const note = typeof detail.note === 'string' ? detail.note : null;
  if (action.action === 'COMP_ACCESS_GRANTED' && to) return isUnlimitedComp(to) ? 'unbefristet' : `bis ${formatDate(to)}`;
  if (action.action === 'TRIAL_END_SET' && to) return `neu: ${formatDate(to)}`;
  return reason ?? note ?? null;
}

function CompanyCard({ company }: { company: PlatformCompany }) {
  const state = companyState(company);
  const { label, tone } = stateLabel[state];
  const today = berlinDateKey();
  const fieldId = (name: string) => `${name}-${company.company_id}`;

  return (
    <Card className="overflow-hidden">
      <div className="space-y-2 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{company.name}</p>
            <p className="truncate text-[13px] text-muted-foreground">{company.owner_email ?? 'Keine aktive Inhaberin'}</p>
          </div>
          <Badge tone={tone}>{label}</Badge>
        </div>
        <p className="text-[13px] leading-5 text-muted-foreground">{accessLine(company, state)}</p>
        <p className="text-[13px] text-muted-foreground tabular-nums">
          {company.employee_count} Mitarbeitende · {company.office_count} Buero · {company.customer_count} Kunden · seit {formatDate(company.created_at)}
        </p>
        {company.stripe_customer_id && (
          <a
            href={stripeCustomerUrl(company.stripe_customer_id)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-primary underline-offset-4 hover:underline"
          >
            Zahlungen in Stripe <ExternalLink className="size-3.5" aria-hidden="true" />
          </a>
        )}
      </div>

      <details className="group border-t border-border/80 bg-subtle/60">
        <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold sm:px-5">
          Zugang verwalten
          <span className="text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
        </summary>
        <div className="space-y-5 px-4 pb-5 sm:px-5">
          <form action={setTrialEnd} className="space-y-2">
            <input type="hidden" name="company_id" value={company.company_id} />
            <p className="text-[13px] font-semibold">Testzeitraum</p>
            <div className="flex flex-wrap gap-2">
              {[7, 14, 30].map((days) => (
                <button
                  key={days}
                  type="submit"
                  name="extend_days"
                  value={days}
                  className="min-h-touch rounded-lg border border-input bg-card px-3 text-[13px] font-semibold shadow-card hover:bg-subtle"
                >
                  Bis heute +{days} Tage
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor={fieldId('trial')} className="sr-only">Testende</label>
              <Input id={fieldId('trial')} type="date" name="trial_end" min={today} className="w-auto" />
              <SubmitButton variant="outline" size="sm">Datum setzen</SubmitButton>
            </div>
          </form>

          {state === 'COMP' ? (
            <form action={revokeCompAccess} className="space-y-2">
              <input type="hidden" name="company_id" value={company.company_id} />
              <p className="text-[13px] font-semibold">Freier Zugang</p>
              <SubmitButton variant="outline" size="sm">Freien Zugang entziehen</SubmitButton>
            </form>
          ) : (
            <form action={grantCompAccess} className="space-y-2">
              <input type="hidden" name="company_id" value={company.company_id} />
              <p className="text-[13px] font-semibold">Freien Zugang schenken</p>
              <p className="text-[13px] text-muted-foreground">Fuer Pilotkunden, Freunde oder Kunden, die per Ueberweisung zahlen.</p>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={fieldId('until')} className="sr-only">Bis</label>
                <Input id={fieldId('until')} type="date" name="until" min={today} defaultValue={addDays(today, 90)} className="w-auto" />
                <label className="inline-flex min-h-touch items-center gap-2 text-[13px]">
                  <input type="checkbox" name="unlimited" className="size-4" /> unbefristet
                </label>
              </div>
              <label htmlFor={fieldId('note')} className="sr-only">Notiz</label>
              <Input id={fieldId('note')} name="note" placeholder="Notiz, z. B. Pilot oder zahlt per Rechnung" maxLength={300} />
              <SubmitButton size="sm">Zugang schenken</SubmitButton>
            </form>
          )}

          {state === 'SUSPENDED' ? (
            <form action={setSuspended} className="space-y-2">
              <input type="hidden" name="company_id" value={company.company_id} />
              <input type="hidden" name="suspend" value="false" />
              <p className="text-[13px] font-semibold">Sperre</p>
              <SubmitButton variant="outline" size="sm">Betrieb freigeben</SubmitButton>
            </form>
          ) : (
            <form action={setSuspended} className="space-y-2">
              <input type="hidden" name="company_id" value={company.company_id} />
              <input type="hidden" name="suspend" value="true" />
              <p className="text-[13px] font-semibold">Betrieb sperren</p>
              <p className="text-[13px] text-muted-foreground">Wirkt sofort fuer Buero, Team und Kundenportal, auch bei aktivem Abo. Die Daten bleiben erhalten.</p>
              <label htmlFor={fieldId('reason')} className="sr-only">Grund</label>
              <Input id={fieldId('reason')} name="reason" placeholder="Grund (Pflicht)" required maxLength={300} />
              <SubmitButton variant="danger" size="sm">Sperren</SubmitButton>
            </form>
          )}
        </div>
      </details>
    </Card>
  );
}

export default async function PlatformPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ companies, enforceAccess, actions }, query] = await Promise.all([loadPlatformOverview(), searchParams]);
  const summary = summarize(companies);
  const billingEnabled = process.env.REINPLAN_BILLING_ENABLED === 'true';

  return (
    <div className="space-y-8">
      <PageHeader title="Alle Betriebe" description="Wer ReinPlan nutzt, wer zahlt und wer Zugang hat." />

      {query.success && <Notice tone="success" icon={<CheckCircle2 />} title={query.success} />}
      {query.error && <Notice tone="danger" icon={<TriangleAlert />} title={query.error} />}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Betriebe" value={summary.companies} icon={<Building2 className="size-5" />} />
        <StatCard
          label="Monatsumsatz"
          value={formatMoney('de', summary.mrrCents)}
          note={`${summary.paying} zahlend`}
          icon={<CircleDollarSign className="size-5" />}
          tone="success"
        />
        <StatCard
          label="Im Test"
          value={summary.trials}
          note={summary.trialsEndingSoon > 0 ? `${summary.trialsEndingSoon} enden in 7 Tagen` : 'keiner endet bald'}
          icon={<Clock3 className="size-5" />}
          tone={summary.trialsEndingSoon > 0 ? 'warning' : 'primary'}
        />
        <StatCard
          label="Freier Zugang"
          value={summary.comp}
          note={`${summary.expired} abgelaufen · ${summary.suspended} gesperrt`}
          icon={<Gift className="size-5" />}
          tone="info"
        />
      </div>

      <Card>
        <CardHeader
          title="Zugangssperre nach dem Test"
          description={enforceAccess
            ? 'Eingeschaltet: Betriebe ohne Abo, Test oder freien Zugang koennen nur noch lesen und ihr Abo abschliessen.'
            : 'Ausgeschaltet: alle Betriebe arbeiten weiter, auch nach dem Test. Gesperrte Betriebe bleiben gesperrt.'}
          action={<Badge tone={enforceAccess ? 'success' : 'warning'}>{enforceAccess ? 'An' : 'Aus'}</Badge>}
        />
        <div className="space-y-3 px-5 pb-5 sm:px-6">
          {!enforceAccess && summary.wouldLoseAccess > 0 && (
            <Notice tone="warning" icon={<ShieldAlert />} title={`${summary.wouldLoseAccess} ${summary.wouldLoseAccess === 1 ? 'Betrieb wuerde' : 'Betriebe wuerden'} sofort gesperrt`}>
              Vergib diesen Betrieben zuerst freien Zugang oder verlaengere den Test, wenn sie weiterarbeiten sollen.
            </Notice>
          )}
          {!enforceAccess && !billingEnabled && (
            <Notice tone="neutral" title="Online-Zahlung ist noch aus">
              Ohne REINPLAN_BILLING_ENABLED koennen Betriebe kein Abo abschliessen. Schalte die Sperre erst ein, wenn Stripe laeuft, oder vergib freien Zugang.
            </Notice>
          )}
          <form action={setEnforcement} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="enforce" value={enforceAccess ? 'false' : 'true'} />
            {!enforceAccess && (
              <label className="inline-flex min-h-touch items-center gap-2 text-[13px]">
                <input type="checkbox" name="confirm" className="size-4" required /> Ich habe die Liste geprueft
              </label>
            )}
            <SubmitButton variant={enforceAccess ? 'outline' : 'default'} size="sm">
              {enforceAccess ? 'Sperre ausschalten' : 'Sperre einschalten'}
            </SubmitButton>
          </form>
        </div>
      </Card>

      <Section title="Betriebe" description="Neueste zuerst. Preise und Zahlungen verwaltest du in Stripe.">
        {companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch kein Betrieb registriert.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {companies.map((company) => <CompanyCard key={company.company_id} company={company} />)}
          </div>
        )}
      </Section>

      <Section title="Protokoll" description="Jede Aenderung hier wird unveraenderlich festgehalten.">
        {actions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine Aenderungen.</p>
        ) : (
          <Card>
            <ul className="divide-y divide-border/80">
              {actions.map((action, index) => {
                const detail = actionDetail(action);
                return (
                  <li key={`${action.occurred_at}-${index}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {actionLabel[action.action] ?? action.action}
                        {action.company_name ? <span className="text-muted-foreground"> · {action.company_name}</span> : null}
                      </p>
                      {detail && <p className="text-[13px] text-muted-foreground">{detail}</p>}
                    </div>
                    <p className="text-[13px] text-muted-foreground tabular-nums">{formatDateTime(action.occurred_at)}</p>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </Section>

      <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Ban className="size-4" aria-hidden="true" /> Diese Seite ist nur fuer Plattform-Betreiber sichtbar.
      </p>
    </div>
  );
}
