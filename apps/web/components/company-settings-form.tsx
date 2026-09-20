'use client';

import { useActionState } from 'react';
import { initialFormState, type FormState } from '@/lib/actions';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input, Select } from '@/components/ui';
import { serviceFocusOptions } from '@/lib/service-focus';

// The row is read with `select(...)`, so a column added later arrives here as
// whatever Postgres returns. Every field below is read through String() or
// Number(), which is why an unknown is safe and a narrower type would only
// force casts at the call site.
type Company = Record<string, unknown>;

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
  const chosenFocus = new Set(serviceFocus);
  return (
    <form action={formAction} className="space-y-7">
      <FormMessage status={state.status} message={state.message} />
      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Allgemein</h2>
        <Field label="Firmenname *" htmlFor="name" className="sm:col-span-2">
          <Input id="name" name="name" defaultValue={String(company.name ?? '')} required />
        </Field>
        <Field label="Rechtsform" htmlFor="legal_form">
          <Input id="legal_form" name="legal_form" defaultValue={String(company.legal_form ?? '')} />
        </Field>
        <Field
          label="Geschäftsführung"
          htmlFor="managing_director"
          info="Erscheint im Impressum-Block Ihrer Angebote und Rechnungen."
        >
          <Input
            id="managing_director"
            name="managing_director"
            defaultValue={String(company.managing_director ?? '')}
          />
        </Field>
        <Field label="Telefon" htmlFor="phone">
          <Input id="phone" name="phone" defaultValue={String(company.phone ?? '')} />
        </Field>
        <Field label="Allgemeine E-Mail" htmlFor="email">
          <Input id="email" name="email" type="email" defaultValue={String(company.email ?? '')} />
        </Field>
        <Field label="Website" htmlFor="website">
          <Input id="website" name="website" defaultValue={String(company.website ?? '')} />
        </Field>
      </section>
      <section className="grid gap-4 border-t pt-6 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Anschrift</h2>
        {[
          ['street', 'Straße und Hausnummer'],
          ['postal_code', 'PLZ'],
          ['city', 'Ort'],
          ['country', 'Land'],
        ].map(([name, label]) => (
          <Field key={name} label={label} htmlFor={name}>
            <Input
              id={name}
              name={name}
              defaultValue={String(company[name] ?? (name === 'country' ? 'Deutschland' : ''))}
            />
          </Field>
        ))}
      </section>
      <section className="grid gap-4 border-t pt-6 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Rechnung / Steuer</h2>
        {[
          ['billing_email', 'Rechnungs-E-Mail'],
          ['tax_number', 'Steuernummer'],
          ['vat_id', 'USt-IdNr.'],
          ['default_payment_terms_days', 'Standard-Zahlungsziel'],
          ['default_hourly_rate', 'Standard-Stundensatz in Euro'],
        ].map(([name, label]) => (
          <Field key={name} label={label} htmlFor={name}>
            <Input
              id={name}
              name={name}
              type={name === 'default_payment_terms_days' || name === 'default_hourly_rate' ? 'number' : 'text'}
              step={name === 'default_hourly_rate' ? '0.01' : undefined}
              defaultValue={
                name === 'default_hourly_rate'
                  ? company.default_hourly_rate_cents
                    ? String(Number(company.default_hourly_rate_cents) / 100)
                    : ''
                  : String(company[name] ?? '')
              }
            />
          </Field>
        ))}
        <Field
          label="Umsatzsteuersatz in Prozent"
          htmlFor="vat_rate"
          info="Standardsatz für neue Rechnungspositionen. Je Position änderbar."
        >
          <Input
            id="vat_rate"
            name="vat_rate"
            inputMode="decimal"
            defaultValue={
              company.default_vat_rate_basis_points != null
                ? String(Number(company.default_vat_rate_basis_points) / 100).replace('.', ',')
                : '19'
            }
          />
        </Field>
      </section>
      <section className="grid gap-4 border-t pt-6">
        <div>
          <h2 className="font-semibold">Reinigungsschwerpunkte</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Steuert, welche Leistungen beim Ergänzen des Leistungskatalogs vorgeschlagen werden.
            Neue Schwerpunkte fügen passende Leistungen hinzu; bestehende Katalogeinträge bleiben
            unverändert.
          </p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {serviceFocusOptions.map((option) => (
            <li key={option.value}>
              <label className="flex min-h-touch cursor-pointer items-center gap-3 rounded-lg border border-border/80 px-3.5 py-2.5 text-sm transition-colors hover:border-primary md:min-h-11">
                <input
                  type="checkbox"
                  name="focus"
                  value={option.value}
                  defaultChecked={chosenFocus.has(option.value)}
                />
                {option.label}
              </label>
            </li>
          ))}
        </ul>
      </section>
      <section className="grid gap-4 border-t pt-6 sm:grid-cols-2">
        <h2 className="font-semibold sm:col-span-2">Bank und System</h2>
        <Field label="IBAN" htmlFor="iban">
          <Input id="iban" name="iban" defaultValue={String(company.iban ?? '')} />
        </Field>
        <Field label="BIC" htmlFor="bic">
          <Input id="bic" name="bic" defaultValue={String(company.bic ?? '')} />
        </Field>
        <Field label="Zeitzone" htmlFor="timezone">
          <Input id="timezone" name="timezone" defaultValue={String(company.timezone ?? 'Europe/Berlin')} />
        </Field>
        <Field label="Standardsprache" htmlFor="default_language">
          <Select
            id="default_language"
            name="default_language"
            defaultValue={String(company.default_language ?? 'de')}
          >
            <option value="de">Deutsch</option>
            <option value="en">Englisch</option>
            <option value="ar">Arabisch</option>
            <option value="tr">Türkisch</option>
            <option value="uk">Ukrainisch</option>
            <option value="ru">Russisch</option>
          </Select>
        </Field>
      </section>
      <div className="flex justify-end">
        <SubmitButton>Firmendaten speichern</SubmitButton>
      </div>
    </form>
  );
}
