import Link from 'next/link';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { Card, PageHeader } from '@/components/ui';
import {
  BrandingStep,
  CostingStep,
  FinishStep,
  InvoiceStep,
  ServiceFocusStep,
  CompanyStep,
} from '@/components/onboarding/steps';
import { getCompanyBranding } from '@/lib/data/branding';
import { getCalculationDefaults } from '@/lib/data/kalkulation';
import { getCompanyProfile, getOnboardingStatus } from '@/lib/data/onboarding';
import { requireStaffCompany } from '@/lib/auth';
import { updateCompanyBranding, removeCompanyLogo } from '../settings/actions';
import { finishOnboarding, saveCompanyProfile, saveCostingDefaults, saveServiceFocus, skipOnboarding } from './actions';

const steps = [
  { key: 'unternehmen', label: 'Unternehmen' },
  { key: 'rechnung', label: 'Rechnung & Steuer' },
  { key: 'kalkulation', label: 'Kalkulationsgrundlagen' },
  { key: 'schwerpunkte', label: 'Reinigungsschwerpunkte' },
  { key: 'branding', label: 'Erscheinungsbild' },
  { key: 'abschluss', label: 'Abschluss' },
] as const;

type StepKey = (typeof steps)[number]['key'];

/**
 * First-run setup.
 *
 * Six short steps rather than one long form, and none of them mandatory — a
 * company that wants to start with a customer can skip straight through and
 * fill the rest in later. What it buys is a system that can actually price
 * something on day one: without a wage assumption and a Leistungskatalog, the
 * first Kalkulation has nothing to work from.
 */
export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<{ schritt?: string }>;
}) {
  const query = await searchParams;
  const current = (steps.find((step) => step.key === query.schritt)?.key ?? 'unternehmen') as StepKey;

  // The session first, because every read below is scoped to that company and
  // the branding lookup needs its id.
  const { company } = await requireStaffCompany();
  const [status, profile, defaults, branding] = await Promise.all([
    getOnboardingStatus(),
    getCompanyProfile(),
    getCalculationDefaults(),
    getCompanyBranding(company.id),
  ]);

  const done = new Set(status?.steps ?? []);
  const index = steps.findIndex((step) => step.key === current);
  const next = steps[index + 1]?.key ?? null;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Einrichtung"
        description={`Sechs kurze Schritte, damit ${company.name} sofort arbeitsfähig ist. Alles lässt sich später in den Einstellungen ändern.`}
      />

      {/* Where you are, and what is already done. */}
      <ol className="mb-6 flex flex-wrap gap-1.5" aria-label="Fortschritt">
        {steps.map((step, position) => {
          const complete = done.has(step.key);
          const active = step.key === current;
          return (
            <li key={step.key}>
              <Link
                href={`/dashboard/einrichtung?schritt=${step.key}`}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'inline-flex min-h-touch items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors md:min-h-9',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : complete
                      ? 'bg-success-soft text-success'
                      : 'bg-foreground/[0.05] text-muted-foreground hover:text-foreground',
                )}
              >
                {complete && !active ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  <span className="tabular-nums">{position + 1}</span>
                )}
                {step.label}
              </Link>
            </li>
          );
        })}
      </ol>

      <Card className="p-5 sm:p-6">
        {current === 'unternehmen' && (
          <CompanyStep action={saveCompanyProfile.bind(null, next)} profile={profile} />
        )}
        {current === 'rechnung' && (
          <InvoiceStep action={saveCompanyProfile.bind(null, next)} profile={profile} />
        )}
        {current === 'kalkulation' && (
          <CostingStep action={saveCostingDefaults.bind(null, next)} defaults={defaults} />
        )}
        {current === 'schwerpunkte' && (
          <ServiceFocusStep
            action={saveServiceFocus.bind(null, next)}
            selected={status?.service_focus ?? []}
          />
        )}
        {current === 'branding' && (
          <BrandingStep
            action={updateCompanyBranding}
            removeAction={removeCompanyLogo}
            logoUrl={branding?.logoUrl ?? null}
            brandColor={branding?.brandColor ?? null}
            companyName={company.name}
            nextHref={`/dashboard/einrichtung?schritt=${next ?? 'abschluss'}`}
          />
        )}
        {current === 'abschluss' && (
          <FinishStep action={finishOnboarding} status={status} />
        )}
      </Card>

      {current !== 'abschluss' && (
        <form action={skipOnboarding} className="mt-4 flex justify-end">
          <button
            type="submit"
            className="inline-flex min-h-touch items-center gap-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline md:min-h-9"
          >
            Einrichtung überspringen
            <ChevronRight className="size-4 rtl:rotate-180" aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
  );
}
