'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, Pencil } from 'lucide-react';
import { initialFormState, type FormState } from '@/lib/actions';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Button, Field, Input, Select } from '@/components/ui';
import { serviceFocusOptions } from '@/lib/service-focus';

type Company = Record<string, unknown>;

const steps = ['Allgemein', 'Anschrift', 'Rechnung & Steuer', 'Reinigung', 'Bank & System'] as const;

export function CompanySettingsForm({
  company,
  action,
  serviceFocus = [],
}: {
  company: Company;
  action: (state: FormState, data: FormData) => Promise<FormState>;
  serviceFocus?: string[];
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const chosenFocus = new Set(serviceFocus);
  const directorWasSet = Boolean(String(company.managing_director ?? '').trim());
  const vatWasSet = company.default_vat_rate_basis_points != null;

  useEffect(() => {
    if (state.status === 'success') { setEditing(false); setStep(0); router.refresh(); }
  }, [router, state.status]);

  const next = () => setStep((value) => Math.min(value + 1, steps.length - 1));
  const back = () => setStep((value) => Math.max(value - 1, 0));

  if (!editing) {
    const address = [company.street, [company.postal_code, company.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return (
      <div className="space-y-5">
        <FormMessage status={state.status} message={state.message} />
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Firmendaten</h2>
            <p className="mt-1 text-sm text-muted-foreground">Gespeicherte Unternehmens- und Rechnungsdaten.</p>
          </div>
          <Button type="button" variant="outline" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden="true" /> Bearbeiten
          </Button>
        </div>
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Unternehmen</dt><dd className="mt-1 font-medium">{String(company.name ?? '—')}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Rechtsform</dt><dd className="mt-1">{String(company.legal_form ?? '—')}</dd></div>
          <div className="sm:col-span-2"><dt className="text-xs text-muted-foreground">Anschrift</dt><dd className="mt-1">{address || '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">E-Mail</dt><dd className="mt-1 break-all">{String(company.email ?? '—')}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Telefon</dt><dd className="mt-1">{String(company.phone ?? '—')}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Steuer</dt><dd className="mt-1">{String(company.vat_id ?? company.tax_number ?? '—')}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Zahlungsziel</dt><dd className="mt-1">{company.default_payment_terms_days != null ? String(company.default_payment_terms_days) + ' Tage' : '—'}</dd></div>
          <div><dt className="text-xs text-muted-foreground">IBAN</dt><dd className="mt-1">{String(company.iban ?? '—')}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Sprache / Zeitzone</dt><dd className="mt-1">{String(company.default_language ?? 'de').toUpperCase()} · {String(company.timezone ?? 'Europe/Berlin')}</dd></div>
        </dl>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      <FormMessage status={state.status} message={state.message} />

      <div className="border-b border-border/80 pb-5">
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="font-semibold">{steps[step]}</p>
          <p className="text-muted-foreground">Schritt {step + 1} von {steps.length}</p>
        </div>
        <div className="mt-3 grid grid-cols-5 gap-1.5" aria-label="Fortschritt">
          {steps.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(index)}
              className="group min-w-0 text-start"
              aria-current={index === step ? 'step' : undefined}
            >
              <span className={`block h-1.5 rounded-full transition-colors ${index <= step ? 'bg-primary' : 'bg-muted'}`} />
              <span className={`mt-2 hidden truncate text-xs sm:block ${index === step ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className={step === 0 ? 'grid gap-4 sm:grid-cols-2' : 'hidden'}>
        <Field label="Firmenname *" htmlFor="name" className="sm:col-span-2">
          <Input id="name" name="name" defaultValue={String(company.name ?? '')} required />
        </Field>
        <Field label="Rechtsform" htmlFor="legal_form" optional>
          <Input id="legal_form" name="legal_form" defaultValue={String(company.legal_form ?? '')} placeholder="z. B. GmbH" />
        </Field>
        <Field label="Geschäftsführung" htmlFor="managing_director" optional info="Erscheint im Impressum-Block Ihrer Angebote und Rechnungen.">
          <Input id="managing_director" name="managing_director" defaultValue={String(company.managing_director ?? '')} />
          <input type="hidden" name="managing_director_was_set" value={directorWasSet ? 'true' : 'false'} />
        </Field>
        {/*
          Nicht mehr optional: BR-DE-6 verlangt die Telefonnummer des
          Verkaeufers in jeder XRechnung. Ohne sie laesst sich keine Rechnung
          per E-Mail versenden, also gehoert der Hinweis an das Feld und nicht
          erst auf die Rechnung.
        */}
        <Field label="Telefon" htmlFor="phone" info="Pflichtangabe für die E-Rechnung (XRechnung).">
          <Input id="phone" name="phone" type="tel" autoComplete="tel" defaultValue={String(company.phone ?? '')} />
        </Field>
        <Field label="Allgemeine E-Mail" htmlFor="email" optional>
          <Input id="email" name="email" type="email" autoComplete="email" defaultValue={String(company.email ?? '')} />
        </Field>
        <Field label="Website" htmlFor="website" optional className="sm:col-span-2">
          <Input id="website" name="website" type="url" placeholder="https://" defaultValue={String(company.website ?? '')} />
        </Field>
      </div>

      <div className={step === 1 ? 'grid gap-4 sm:grid-cols-2' : 'hidden'}>
        <Field label="Straße und Hausnummer" htmlFor="street" className="sm:col-span-2">
          <Input id="street" name="street" autoComplete="street-address" defaultValue={String(company.street ?? '')} />
        </Field>
        <Field label="PLZ" htmlFor="postal_code">
          <Input id="postal_code" name="postal_code" inputMode="numeric" autoComplete="postal-code" defaultValue={String(company.postal_code ?? '')} />
        </Field>
        <Field label="Ort" htmlFor="city">
          <Input id="city" name="city" autoComplete="address-level2" defaultValue={String(company.city ?? '')} />
        </Field>
        <Field label="Land" htmlFor="country" className="sm:col-span-2">
          <Input id="country" name="country" autoComplete="country-name" defaultValue={String(company.country ?? 'Deutschland')} />
        </Field>
      </div>

      <div className={step === 2 ? 'grid gap-4 sm:grid-cols-2' : 'hidden'}>
        <Field label="Rechnungs-E-Mail" htmlFor="billing_email" optional>
          <Input id="billing_email" name="billing_email" type="email" defaultValue={String(company.billing_email ?? '')} />
        </Field>
        <Field label="Standard-Zahlungsziel" htmlFor="default_payment_terms_days" optional>
          <Input id="default_payment_terms_days" name="default_payment_terms_days" type="number" min="0" max="365" inputMode="numeric" defaultValue={String(company.default_payment_terms_days ?? '')} />
        </Field>
        <Field label="Steuernummer" htmlFor="tax_number" optional>
          <Input id="tax_number" name="tax_number" defaultValue={String(company.tax_number ?? '')} />
        </Field>
        <Field label="USt-IdNr." htmlFor="vat_id" optional>
          <Input id="vat_id" name="vat_id" defaultValue={String(company.vat_id ?? '')} />
        </Field>
        <Field label="Standard-Stundensatz in Euro" htmlFor="default_hourly_rate" optional>
          <Input id="default_hourly_rate" name="default_hourly_rate" type="number" min="0" step="0.01" inputMode="decimal" defaultValue={company.default_hourly_rate_cents ? String(Number(company.default_hourly_rate_cents) / 100) : ''} />
        </Field>
        <Field label="Umsatzsteuersatz in Prozent" htmlFor="vat_rate" info="Standardsatz für neue Rechnungspositionen. Je Position änderbar.">
          <Input id="vat_rate" name="vat_rate" inputMode="decimal" defaultValue={company.default_vat_rate_basis_points != null ? String(Number(company.default_vat_rate_basis_points) / 100).replace('.', ',') : '19'} />
          <input type="hidden" name="vat_rate_was_set" value={vatWasSet ? 'true' : 'false'} />
        </Field>
        <details className="sm:col-span-2 rounded-xl border border-border/80 bg-muted/20">
          <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
            DATEV / Steuerberatung
            <span className="text-xs font-normal text-muted-foreground">optional</span>
          </summary>
          <div className="grid gap-4 border-t border-border/80 p-4 sm:grid-cols-2">
            <Field label="Beraternummer" htmlFor="datev_beraternummer" optional>
              <Input id="datev_beraternummer" name="datev_beraternummer" inputMode="numeric" maxLength={7} defaultValue={String(company.datev_beraternummer ?? '')} />
            </Field>
            <Field label="Mandantennummer" htmlFor="datev_mandantennummer" optional>
              <Input id="datev_mandantennummer" name="datev_mandantennummer" inputMode="numeric" maxLength={5} defaultValue={String(company.datev_mandantennummer ?? '')} />
            </Field>
            <Field label="Kontenrahmen" htmlFor="datev_kontenrahmen" optional>
              <Select id="datev_kontenrahmen" name="datev_kontenrahmen" defaultValue={String(company.datev_kontenrahmen ?? '')}>
                <option value="">Nicht festgelegt</option>
                <option value="SKR03">SKR03</option>
                <option value="SKR04">SKR04</option>
                <option value="INDIVIDUELL">Individuell</option>
              </Select>
            </Field>
            <Field label="Erlöskonto 19 % USt." htmlFor="datev_revenue_account_19" optional info="Mit der Steuerberatung abstimmen; ReinPlan setzt kein Konto automatisch voraus.">
              <Input id="datev_revenue_account_19" name="datev_revenue_account_19" inputMode="numeric" maxLength={11} defaultValue={String(company.datev_revenue_account_19 ?? '')} />
            </Field>
            <Field label="Erlöskonto 7 % USt." htmlFor="datev_revenue_account_7" optional>
              <Input id="datev_revenue_account_7" name="datev_revenue_account_7" inputMode="numeric" maxLength={11} defaultValue={String(company.datev_revenue_account_7 ?? '')} />
            </Field>
            <Field label="Erlöskonto 0 % USt." htmlFor="datev_revenue_account_0" optional>
              <Input id="datev_revenue_account_0" name="datev_revenue_account_0" inputMode="numeric" maxLength={11} defaultValue={String(company.datev_revenue_account_0 ?? '')} />
            </Field>
          </div>
        </details>
      </div>

      <div className={step === 3 ? 'grid gap-4' : 'hidden'}>
        <div>
          <h2 className="font-semibold">Reinigungsschwerpunkte</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Wähle die Bereiche, die dein Betrieb anbietet. Daraus werden passende Katalogleistungen vorgeschlagen.</p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {serviceFocusOptions.map((option) => (
            <li key={option.value}>
              <label className="flex min-h-touch cursor-pointer items-center gap-3 rounded-lg border border-border/80 bg-card px-3.5 py-2.5 text-sm transition-colors hover:border-primary/50 has-[:checked]:border-primary/40 has-[:checked]:bg-primary-soft">
                <input type="checkbox" name="focus" value={option.value} defaultChecked={chosenFocus.has(option.value)} className="size-4 accent-primary" />
                <span className="font-medium">{option.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      <div className={step === 4 ? 'grid gap-4 sm:grid-cols-2' : 'hidden'}>
        <Field label="IBAN" htmlFor="iban" optional>
          <Input id="iban" name="iban" autoComplete="off" defaultValue={String(company.iban ?? '')} />
        </Field>
        <Field label="BIC" htmlFor="bic" optional>
          <Input id="bic" name="bic" autoComplete="off" defaultValue={String(company.bic ?? '')} />
        </Field>
        <Field label="Zeitzone" htmlFor="timezone">
          <Select id="timezone" name="timezone" defaultValue={String(company.timezone ?? 'Europe/Berlin')}>
            <option value="Europe/Berlin">Europe/Berlin</option>
            <option value="Europe/Vienna">Europe/Vienna</option>
            <option value="Europe/Zurich">Europe/Zurich</option>
          </Select>
        </Field>
        <Field label="Standardsprache" htmlFor="default_language">
          <Select id="default_language" name="default_language" defaultValue={String(company.default_language ?? 'de')}>
            <option value="de">Deutsch</option>
            <option value="en">Englisch</option>
            <option value="ar">Arabisch</option>
            <option value="tr">Türkisch</option>
            <option value="uk">Ukrainisch</option>
            <option value="ru">Russisch</option>
          </Select>
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border/80 pt-5">
        <Button type="button" variant="ghost" onClick={() => step === 0 ? setEditing(false) : back()}>
          <ArrowLeft className="size-4" aria-hidden="true" /> {step === 0 ? 'Abbrechen' : 'Zurück'}
        </Button>
        {step < steps.length - 1 ? (
          <Button type="button" onClick={next}>
            Weiter <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <SubmitButton><Check className="size-4" aria-hidden="true" /> Änderungen speichern</SubmitButton>
        )}
      </div>
    </form>
  );
}
