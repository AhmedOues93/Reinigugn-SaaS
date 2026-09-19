'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input, Select, Textarea } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

export function DraftInvoiceForm({
  action,
  locale,
  customers,
  defaultPeriodStart,
  defaultPeriodEnd,
  defaultCustomerId,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  locale: Locale;
  customers: { id: string; name: string; customer_number: string | null }[];
  defaultPeriodStart: string;
  defaultPeriodEnd: string;
  defaultCustomerId?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <label className="block text-sm font-medium">
        {t(locale, 'role.CUSTOMER')}
        <Select
          className="mt-1.5 w-full"
          name="customer_id"
          required
          defaultValue={defaultCustomerId ?? ''}
        >
          <option value="" disabled>
            {t(locale, 'common.none')}
          </option>
          {customers.map((customer) => (
            <option key={customer.id} value={customer.id}>
              {customer.customer_number
                ? `${customer.customer_number} · ${customer.name}`
                : customer.name}
            </option>
          ))}
        </Select>
      </label>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-1.5 text-sm font-medium">{t(locale, 'billing.servicePeriod')}</legend>
        <Input
          name="service_period_start"
          type="date"
          required
          defaultValue={defaultPeriodStart}
          aria-label={t(locale, 'billing.servicePeriod')}
        />
        <Input
          name="service_period_end"
          type="date"
          required
          defaultValue={defaultPeriodEnd}
          aria-label={t(locale, 'billing.servicePeriod')}
        />
      </fieldset>

      <Field
        label="Zahlungsziel in Tagen"
        htmlFor="payment_terms_days"
        optional
        info="Tage nach Rechnungsdatum. Leer lassen, um das Standard-Zahlungsziel der Firma zu verwenden."
      >
        <Input id="payment_terms_days" name="payment_terms_days" type="number" min={0} max={365} placeholder="14" />
      </Field>

      <Field label="Hinweis auf der Rechnung" htmlFor="customer_note" optional info="Erscheint für den Kunden auf dem Dokument, z. B. ein Dank oder eine Bestellnummer.">
        <Textarea id="customer_note" name="customer_note" maxLength={2000} />
      </Field>

      <SubmitButton locale={locale}>{t(locale, 'billing.new')}</SubmitButton>
    </form>
  );
}
