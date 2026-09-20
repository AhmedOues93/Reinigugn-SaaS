'use client';

import { useActionState, useMemo, useState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input, Select, Textarea } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import type { Locale } from '@/lib/i18n';

type CustomerOption = {
  id: string;
  name: string;
  customer_number: string | null;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  billing_address: string | null;
  postal_code: string | null;
  city: string | null;
};

export function LeadForm({
  action,
  locale: _locale,
  customers,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  locale: Locale;
  customers: CustomerOption[];
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [customerMode, setCustomerMode] = useState<'NEW' | 'EXISTING'>('NEW');
  const [customerId, setCustomerId] = useState('');
  const selected = useMemo(() => customers.find((customer) => customer.id === customerId), [customers, customerId]);

  return (
    <form action={formAction} className="space-y-7">
      <FormMessage status={state.status} message={state.message} />

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">Kunde</h2>
          <p className="mt-1 text-sm text-muted-foreground">Bestehende Kundendaten nicht doppelt erfassen.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['NEW', 'Neuer Interessent', 'Kontaktdaten einmalig erfassen'],
            ['EXISTING', 'Bestehender Kunde', 'Kunde auswählen und Daten übernehmen'],
          ].map(([value, title, description]) => (
            <label key={value} className="cursor-pointer rounded-xl border border-border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/[0.04]">
              <input
                className="sr-only"
                type="radio"
                name="customer_mode"
                value={value}
                checked={customerMode === value}
                onChange={() => { setCustomerMode(value as 'NEW' | 'EXISTING'); setCustomerId(''); }}
              />
              <span className="block text-sm font-semibold">{title}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{description}</span>
            </label>
          ))}
        </div>

        {customerMode === 'EXISTING' ? (
          <div className="space-y-3">
            <Field label="Kunde auswählen" htmlFor="customer_id">
              <Select id="customer_id" name="customer_id" required value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                <option value="">Kunde auswählen...</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}{customer.customer_number ? ` · ${customer.customer_number}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            {selected && (
              <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm">
                <p className="font-semibold">{selected.name}</p>
                <p className="mt-1 text-muted-foreground">
                  {[selected.contact_person, selected.email, selected.phone].filter(Boolean).join(' · ') || 'Keine Kontaktdaten hinterlegt'}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {[selected.billing_address, selected.postal_code, selected.city].filter(Boolean).join(', ') || 'Keine Adresse hinterlegt'}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">Diese Stammdaten werden übernommen und hier nicht erneut bearbeitet.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <Field label="Firma / Organisation" htmlFor="organisation">
              <Input id="organisation" name="organisation" required minLength={2} maxLength={160} autoComplete="organization" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Ansprechperson" htmlFor="contact_person">
                <Input id="contact_person" name="contact_person" maxLength={160} autoComplete="name" />
              </Field>
              <Field label="E-Mail" htmlFor="email">
                <Input id="email" name="email" type="email" maxLength={160} autoComplete="email" />
              </Field>
              <Field label="Telefon" htmlFor="phone">
                <Input id="phone" name="phone" maxLength={64} autoComplete="tel" />
              </Field>
              <Field label="Wie kam die Anfrage?" htmlFor="source">
                <Select id="source" name="source" defaultValue="">
                  <option value="">Bitte wählen...</option>
                  <option value="Telefon">Telefon</option>
                  <option value="E-Mail">E-Mail</option>
                  <option value="Website">Website</option>
                  <option value="Empfehlung">Empfehlung</option>
                  <option value="Ausschreibung">Ausschreibung</option>
                  <option value="Sonstiges">Sonstiges</option>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field className="sm:col-span-3" label="Straße und Hausnummer" htmlFor="street">
                <Input id="street" name="street" maxLength={160} autoComplete="street-address" />
              </Field>
              <Field label="PLZ" htmlFor="postal_code">
                <Input id="postal_code" name="postal_code" maxLength={16} autoComplete="postal-code" inputMode="numeric" />
              </Field>
              <Field className="sm:col-span-2" label="Ort" htmlFor="city">
                <Input id="city" name="city" maxLength={120} autoComplete="address-level2" />
              </Field>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-4 border-t border-border pt-6">
        <div>
          <h2 className="text-base font-semibold">Bedarf</h2>
          <p className="mt-1 text-sm text-muted-foreground">Mit Auswahlfeldern schnell erfassen. Details kommen bei der Besichtigung.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reinigungsart" htmlFor="cleaning_type">
            <Select id="cleaning_type" name="cleaning_type" defaultValue="">
              <option value="">Noch offen</option>
              <option>Unterhaltsreinigung</option>
              <option>Büroreinigung</option>
              <option>Grundreinigung</option>
              <option>Glasreinigung</option>
              <option>Bauendreinigung</option>
              <option>Treppenhausreinigung</option>
              <option>Sanitärreinigung</option>
              <option>Sonderreinigung</option>
            </Select>
          </Field>
          <Field label="Turnus" htmlFor="frequency">
            <Select id="frequency" name="frequency" defaultValue="">
              <option value="">Noch offen</option>
              <option value="Einmalig">Einmalig</option>
              <option value="1x wöchentlich">1x wöchentlich</option>
              <option value="2x wöchentlich">2x wöchentlich</option>
              <option value="3x wöchentlich">3x wöchentlich</option>
              <option value="5x wöchentlich">5x wöchentlich</option>
              <option value="14-täglich">14-täglich</option>
              <option value="Monatlich">Monatlich</option>
              <option value="Individuell">Individuell</option>
            </Select>
          </Field>
          <Field label="Bevorzugte Ausführungszeit" htmlFor="preferred_time">
            <Select id="preferred_time" name="preferred_time" defaultValue="">
              <option value="">Noch offen / flexibel</option>
              <option>Morgens</option>
              <option>Tagsüber</option>
              <option>Abends</option>
              <option>Nach Geschäftsschluss</option>
            </Select>
          </Field>
          <Field label="Gewünschter Start" htmlFor="desired_start">
            <Input id="desired_start" name="desired_start" type="date" />
          </Field>
        </div>
        <Field label="Kurze Notiz (optional)" htmlFor="notes">
          <Textarea id="notes" name="notes" maxLength={3000} placeholder="Nur Besonderheiten, die für die weitere Bearbeitung wichtig sind." />
        </Field>
      </section>

      <SubmitButton locale={_locale}>Anfrage anlegen</SubmitButton>
    </form>
  );
}
