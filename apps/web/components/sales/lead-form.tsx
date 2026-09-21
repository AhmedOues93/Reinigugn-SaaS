'use client';

import { useActionState, useMemo, useState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

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
  locale,
  customers,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  locale: Locale;
  customers: CustomerOption[];
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [customerMode, setCustomerMode] = useState<'NEW' | 'EXISTING'>('NEW');
  const [customerId, setCustomerId] = useState('');
  const [step, setStep] = useState<1 | 2>(1);
  const selected = useMemo(() => customers.find((customer) => customer.id === customerId), [customers, customerId]);

  return (
    <form action={formAction} className="space-y-7">
      <FormMessage status={state.status} message={state.message} />

      <div className="rounded-xl border border-border bg-muted/25 p-3">
        <div className="flex items-center justify-between gap-3 text-xs font-medium">
          <span className={step === 1 ? 'text-primary' : 'text-muted-foreground'}>{'1. ' + t(locale, 'sales.lead.stepCustomer')}</span>
          <span className={step === 2 ? 'text-primary' : 'text-muted-foreground'}>{'2. ' + t(locale, 'sales.lead.stepNeed')}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
          <div className="h-full bg-primary transition-all" style={{ width: step === 1 ? '50%' : '100%' }} />
        </div>
      </div>

      <div className={step === 1 ? 'block' : 'hidden'} aria-hidden={step !== 1}>
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">{t(locale, 'sales.lead.stepCustomer')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t(locale, 'sales.lead.newSubtitle')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            ['NEW', t(locale, 'sales.lead.newProspect'), t(locale, 'sales.lead.newProspectBody')],
            ['EXISTING', t(locale, 'sales.lead.existingCustomer'), t(locale, 'sales.lead.existingCustomerBody')],
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
            <Field label={t(locale, 'sales.lead.selectCustomer')} htmlFor="customer_id">
              <Select id="customer_id" name="customer_id" required value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
                <option value="">{t(locale, 'sales.lead.selectCustomer')}</option>
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
                  {[selected.contact_person, selected.email, selected.phone].filter(Boolean).join(' · ') || t(locale, 'sales.lead.noContact')}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {[selected.billing_address, selected.postal_code, selected.city].filter(Boolean).join(', ') || t(locale, 'sales.lead.noAddress')}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{t(locale, 'sales.lead.reuseHint')}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <Field label={t(locale, 'sales.lead.organisation')} htmlFor="organisation">
              <Input id="organisation" name="organisation" required minLength={2} maxLength={160} autoComplete="organization" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t(locale, 'sales.lead.contact')} htmlFor="contact_person">
                <Input id="contact_person" name="contact_person" maxLength={160} autoComplete="name" />
              </Field>
              <Field label={t(locale, 'sales.quote.email')} htmlFor="email">
                <Input id="email" name="email" type="email" maxLength={160} autoComplete="email" />
              </Field>
              <Field label={t(locale, 'sales.quote.phone')} htmlFor="phone">
                <Input id="phone" name="phone" maxLength={64} autoComplete="tel" />
              </Field>
              <Field label={t(locale, 'sales.lead.howReceived')} htmlFor="source">
                <Select id="source" name="source" defaultValue="">
                  <option value="">{t(locale, 'sales.lead.select')}</option>
                  <option value="Telefon">{t(locale, 'sales.lead.sourcePhone')}</option>
                  <option value="E-Mail">{t(locale, 'sales.lead.sourceEmail')}</option>
                  <option value="Website">{t(locale, 'sales.lead.sourceWebsite')}</option>
                  <option value="Empfehlung">{t(locale, 'sales.lead.sourceReferral')}</option>
                  <option value="Ausschreibung">{t(locale, 'sales.lead.sourceTender')}</option>
                  <option value="Sonstiges">{t(locale, 'sales.lead.sourceOther')}</option>
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field className="sm:col-span-3" label={t(locale, 'sales.quote.street')} htmlFor="street">
                <Input id="street" name="street" maxLength={160} autoComplete="street-address" />
              </Field>
              <Field label={t(locale, 'sales.quote.postalCode')} htmlFor="postal_code">
                <Input id="postal_code" name="postal_code" maxLength={16} autoComplete="postal-code" inputMode="numeric" />
              </Field>
              <Field className="sm:col-span-2" label={t(locale, 'sales.quote.city')} htmlFor="city">
                <Input id="city" name="city" maxLength={120} autoComplete="address-level2" />
              </Field>
            </div>
          </div>
        )}
      </section>
      </div>

      <div className={step === 2 ? 'block' : 'hidden'} aria-hidden={step !== 2}>
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold">{t(locale, 'sales.lead.needTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t(locale, 'sales.lead.needBody')}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t(locale, 'sales.quote.cleaningType')} htmlFor="cleaning_type">
            <Select id="cleaning_type" name="cleaning_type" defaultValue="">
              <option value="">{t(locale, 'sales.quote.open')}</option>
              <option value="Unterhaltsreinigung">{t(locale, 'sales.cleaning.MAINTENANCE')}</option>
              <option value="Büroreinigung">{t(locale, 'sales.cleaning.OFFICE')}</option>
              <option value="Grundreinigung">{t(locale, 'sales.cleaning.DEEP')}</option>
              <option value="Glasreinigung">{t(locale, 'sales.cleaning.GLASS')}</option>
              <option value="Bauendreinigung">Bauendreinigung</option>
              <option value="Treppenhausreinigung">{t(locale, 'sales.cleaning.STAIRCASE')}</option>
              <option value="Sanitärreinigung">{t(locale, 'sales.cleaning.SANITARY')}</option>
              <option value="Sonderreinigung">{t(locale, 'sales.cleaning.SPECIAL')}</option>
            </Select>
          </Field>
          <Field label={t(locale, 'sales.quote.frequency')} htmlFor="frequency">
            <Select id="frequency" name="frequency" defaultValue="">
              <option value="">Noch offen</option>
              <option value="Einmalig">{t(locale, 'sales.frequency.ONCE')}</option>
              <option value="1x wöchentlich">{t(locale, 'sales.frequency.WEEKLY_1')}</option>
              <option value="2x wöchentlich">{t(locale, 'sales.frequency.WEEKLY_2')}</option>
              <option value="3x wöchentlich">{t(locale, 'sales.frequency.WEEKLY_3')}</option>
              <option value="5x wöchentlich">{t(locale, 'sales.frequency.WEEKLY_5')}</option>
              <option value="14-täglich">14-täglich</option>
              <option value="Monatlich">{t(locale, 'sales.frequency.MONTHLY')}</option>
              <option value="Individuell">Individuell</option>
            </Select>
          </Field>
          <Field label={t(locale, 'sales.lead.preferredTime')} htmlFor="preferred_time">
            <Select id="preferred_time" name="preferred_time" defaultValue="">
              <option value="">{t(locale, 'sales.lead.timeOpen')}</option>
              <option value="Morgens">{t(locale, 'sales.lead.timeMorning')}</option>
              <option value="Tagsüber">{t(locale, 'sales.lead.timeDay')}</option>
              <option value="Abends">{t(locale, 'sales.lead.timeEvening')}</option>
              <option value="Nach Geschäftsschluss">{t(locale, 'sales.lead.timeAfterHours')}</option>
            </Select>
          </Field>
          <Field label={t(locale, 'sales.lead.desiredStart')} htmlFor="desired_start">
            <Input id="desired_start" name="desired_start" type="date" />
          </Field>
        </div>
        <Field label={t(locale, 'sales.lead.shortNote')} htmlFor="notes">
          <Textarea id="notes" name="notes" maxLength={3000} placeholder={t(locale, 'sales.lead.shortNotePlaceholder')} />
        </Field>
      </section>
      </div>

      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-popover backdrop-blur">
        {step === 2 ? (
          <Button type="button" variant="outline" onClick={() => setStep(1)}>{t(locale, 'sales.quote.back')}</Button>
        ) : (
          <span />
        )}
        {step === 1 ? (
          <Button type="button" onClick={() => setStep(2)}>{t(locale, 'sales.quote.next')}</Button>
        ) : (
          <SubmitButton locale={locale}>{t(locale, 'sales.lead.create')}</SubmitButton>
        )}
      </div>
    </form>
  );
}
