'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ArrowRight, Check, Circle } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, FormActions, FormSection, Input } from '@/components/ui';
import { CompanyBrandingForm } from '@/components/company-branding-form';
import { CostingFields } from '@/components/kalkulation/costing-fields';
import { initialFormState, type FormState } from '@/lib/actions';
import { serviceFocusOptions } from '@/lib/service-focus';
import type { CompanyProfile, OnboardingStatus } from '@/lib/data/onboarding';
import type { CalculationDefaults } from '@/lib/kalkulation';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const percent = (bp: number) => (bp / 100).toString().replace('.', ',');

/** Step 1 — who the company is. Only the name is really needed. */
export function CompanyStep({ action, profile }: { action: Action; profile: CompanyProfile | null }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-7">
      <input type="hidden" name="step" value="unternehmen" />
      <FormMessage status={state.status} message={state.message} />

      <FormSection
        title="Unternehmen"
        description="Diese Angaben erscheinen auf Angeboten, Rechnungen und im Kundenportal."
      >
        <Field label="Firmenname" htmlFor="name">
          <Input id="name" name="name" required maxLength={160} defaultValue={profile?.name ?? ''} />
        </Field>
        <Field label="Rechtsform" htmlFor="legal_form">
          <Input id="legal_form" name="legal_form" maxLength={80} placeholder="z. B. GmbH, e. K., GbR" defaultValue={profile?.legal_form ?? ''} />
        </Field>
        <Field label="Geschäftsführung / Ansprechpartner" htmlFor="managing_director" info="Erscheint im Impressum-Block Ihrer Dokumente.">
          <Input id="managing_director" name="managing_director" maxLength={160} defaultValue={profile?.managing_director ?? ''} />
        </Field>
        <Field label="Straße und Hausnummer" htmlFor="street">
          <Input id="street" name="street" maxLength={160} defaultValue={profile?.street ?? ''} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <Field label="PLZ" htmlFor="postal_code">
            <Input id="postal_code" name="postal_code" maxLength={10} inputMode="numeric" defaultValue={profile?.postal_code ?? ''} />
          </Field>
          <Field label="Ort" htmlFor="city">
            <Input id="city" name="city" maxLength={120} defaultValue={profile?.city ?? ''} />
          </Field>
        </div>
        <Field label="Land" htmlFor="country">
          <Input id="country" name="country" maxLength={80} defaultValue={profile?.country ?? 'Deutschland'} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telefon" htmlFor="phone">
            <Input id="phone" name="phone" type="tel" maxLength={64} defaultValue={profile?.phone ?? ''} />
          </Field>
          <Field label="E-Mail" htmlFor="email">
            <Input id="email" name="email" type="email" maxLength={254} defaultValue={profile?.email ?? ''} />
          </Field>
        </div>
        <Field label="Website" htmlFor="website">
          <Input id="website" name="website" maxLength={254} placeholder="https://" defaultValue={profile?.website ?? ''} />
        </Field>
      </FormSection>

      <FormActions>
        <SubmitButton>
          Weiter
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </SubmitButton>
      </FormActions>
    </form>
  );
}

/** Step 2 — what goes on an invoice. Tax identifiers stay optional. */
export function InvoiceStep({ action, profile }: { action: Action; profile: CompanyProfile | null }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-7">
      <input type="hidden" name="step" value="rechnung" />
      <FormMessage status={state.status} message={state.message} />

      <FormSection
        title="Rechnung und Steuer"
        description="Steuernummer oder USt-IdNr. gehören auf eine Rechnung, sobald Sie eine stellen — für die Einrichtung sind sie optional."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Steuernummer" htmlFor="tax_number">
            <Input id="tax_number" name="tax_number" maxLength={64} defaultValue={profile?.tax_number ?? ''} />
          </Field>
          <Field label="USt-IdNr." htmlFor="vat_id">
            <Input id="vat_id" name="vat_id" maxLength={64} placeholder="DE…" defaultValue={profile?.vat_id ?? ''} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Umsatzsteuersatz (%)" htmlFor="vat_rate" info="Standardsatz für neue Rechnungspositionen. Pro Position änderbar.">
            <Input
              id="vat_rate"
              name="vat_rate"
              inputMode="decimal"
              defaultValue={percent(profile?.default_vat_rate_basis_points ?? 1900)}
            />
          </Field>
          <Field label="Zahlungsziel (Tage)" htmlFor="payment_terms_days">
            <Input
              id="payment_terms_days"
              name="payment_terms_days"
              type="number"
              min={0}
              max={365}
              defaultValue={profile?.default_payment_terms_days ?? 14}
            />
          </Field>
        </div>
        <Field label="Rechnungs-E-Mail" htmlFor="billing_email" info="Falls abweichend von der allgemeinen E-Mail-Adresse.">
          <Input id="billing_email" name="billing_email" type="email" maxLength={254} defaultValue={profile?.billing_email ?? ''} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="IBAN" htmlFor="iban">
            <Input id="iban" name="iban" maxLength={40} defaultValue={profile?.iban ?? ''} />
          </Field>
          <Field label="BIC" htmlFor="bic">
            <Input id="bic" name="bic" maxLength={20} defaultValue={profile?.bic ?? ''} />
          </Field>
        </div>
        <p className="text-sm leading-6 text-muted-foreground">
          Die Rechnungsnummern vergibt das System fortlaufend und lückenlos je Jahr. Das ist bewusst
          nicht frei konfigurierbar — eine Lücke in der Nummernfolge ist bei einer Prüfung
          erklärungsbedürftig.
        </p>
      </FormSection>

      <FormActions>
        <SubmitButton>
          Weiter
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </SubmitButton>
      </FormActions>
    </form>
  );
}

/**
 * Step 3 — the costing assumptions.
 *
 * The productive share is the number nobody knows offhand, so the default mode
 * derives it from days the office does know. The working is shown, because a
 * percentage handed down without explanation is a percentage nobody trusts or
 * revisits.
 */
export function CostingStep({ action, defaults }: { action: Action; defaults: CalculationDefaults }) {
  const [state, formAction] = useActionState(action, initialFormState);

  return (
    <form action={formAction} className="space-y-7">
      <FormMessage status={state.status} message={state.message} />
      <CostingFields defaults={defaults} />

      <FormActions>
        <SubmitButton>
          Weiter
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </SubmitButton>
      </FormActions>
    </form>
  );
}

/** Step 4 — which Reinigungsarten, which seeds a starting catalogue. */
export function ServiceFocusStep({ action, selected }: { action: Action; selected: string[] }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const chosen = new Set(selected);

  return (
    <form action={formAction} className="space-y-7">
      <FormMessage status={state.status} message={state.message} />

      <FormSection
        title="Reinigungsschwerpunkte"
        description="Wir legen dazu passende Leistungen mit Richtleistungen im Katalog an. Das sind Startwerte aus der Praxis — keine Norm und keine Zusicherung. Passen Sie sie an Ihre eigene Nachkalkulation an."
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {serviceFocusOptions.map((option) => (
            <li key={option.value}>
              <label className="flex min-h-touch cursor-pointer items-center gap-3 rounded-lg border border-border/80 px-3.5 py-2.5 text-sm transition-colors hover:border-primary md:min-h-11">
                <input type="checkbox" name="focus" value={option.value} defaultChecked={chosen.has(option.value)} />
                {option.label}
              </label>
            </li>
          ))}
        </ul>
      </FormSection>

      <FormActions>
        <SubmitButton>
          Weiter
          <ArrowRight className="size-4 rtl:rotate-180" aria-hidden="true" />
        </SubmitButton>
      </FormActions>
    </form>
  );
}

/** Step 5 — reuses the existing branding form rather than a second one. */
export function BrandingStep({
  action,
  removeAction,
  logoUrl,
  brandColor,
}: {
  action: Action;
  removeAction: Action;
  logoUrl: string | null;
  brandColor: string | null;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Erscheinungsbild</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Logo und Farbe erscheinen in der Navigation, im Kundenportal und auf Ihren Dokumenten.
          Beides ist optional und jederzeit änderbar.
        </p>
      </div>
      <CompanyBrandingForm
        action={action}
        removeAction={removeAction}
        logoUrl={logoUrl}
        brandColor={brandColor}
        submitLabel="Speichern und weiter"
      />
    </div>
  );
}

/**
 * Step 6 — the checklist.
 *
 * Ticked from what the company actually has, not from which steps were
 * clicked. Each open item links to the screen that creates it.
 */
export function FinishStep({
  action,
  status,
}: {
  action: () => Promise<void>;
  status: OnboardingStatus | null;
}) {
  const items = [
    { done: status?.has_calculation_defaults ?? false, label: 'Kalkulationsgrundlagen hinterlegt', href: '/dashboard/kalkulation/grundlagen' },
    { done: status?.has_catalog ?? false, label: 'Leistungskatalog gefüllt', href: '/dashboard/kalkulation/leistungskatalog' },
    { done: status?.has_customer ?? false, label: 'Ersten Kunden anlegen', href: '/dashboard/kunden/neu' },
    { done: status?.has_object ?? false, label: 'Erstes Objekt anlegen', href: '/dashboard/objekte/neu' },
    { done: status?.has_employee ?? false, label: 'Ersten Mitarbeiter einladen', href: '/dashboard/mitarbeiter/neu' },
    { done: status?.has_survey ?? false, label: 'Erste Besichtigung planen', href: '/dashboard/vertrieb/besichtigungen' },
    { done: status?.has_calculation ?? false, label: 'Erste Kalkulation erstellen', href: '/dashboard/kalkulation/neu' },
    { done: status?.has_quote ?? false, label: 'Erstes Angebot versenden', href: '/dashboard/kalkulation' },
  ];
  const open = items.filter((item) => !item.done).length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Fast fertig</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {open === 0
            ? 'Alles eingerichtet. Diese Übersicht bleibt in den Einstellungen erreichbar.'
            : `Noch ${open} ${open === 1 ? 'Schritt' : 'Schritte'} bis zum ersten Angebot. Sie können jederzeit hier weitermachen — die Einrichtung erscheint nicht erneut.`}
        </p>
      </div>

      <ul className="overflow-hidden rounded-xl border border-border/80">
        {items.map((item) => (
          <li key={item.href + item.label} className="border-b border-border/70 last:border-0">
            <Link
              href={item.href}
              className="flex min-h-touch items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-subtle md:min-h-11"
            >
              {item.done ? (
                <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
              ) : (
                <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span className={item.done ? 'text-muted-foreground line-through' : ''}>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <form action={action} className="flex justify-end">
        <SubmitButton>Einrichtung abschließen</SubmitButton>
      </form>
    </div>
  );
}
