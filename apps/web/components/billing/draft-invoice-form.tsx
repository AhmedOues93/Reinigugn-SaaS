'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Input } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

export function DraftInvoiceForm({
  action,
  locale,
  customers,
  defaultPeriodStart,
  defaultPeriodEnd,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  locale: Locale;
  customers: { id: string; name: string; customer_number: string | null }[];
  defaultPeriodStart: string;
  defaultPeriodEnd: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <label className="block text-sm font-medium">
        {t(locale, 'role.CUSTOMER')}
        <select
          className="mt-1.5 min-h-11 w-full rounded-md border bg-white px-3 text-sm"
          name="customer_id"
          required
          defaultValue=""
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
        </select>
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

      <label className="block text-sm font-medium">
        {t(locale, 'billing.dueDate')}
        <Input
          className="mt-1.5"
          name="payment_terms_days"
          type="number"
          min={0}
          max={365}
          placeholder="14"
        />
        <span className="mt-1 block text-xs font-normal text-slate-500">
          Tage nach Rechnungsdatum. Leer lassen, um das Standard-Zahlungsziel der Firma zu
          verwenden.
        </span>
      </label>

      <label className="block text-sm font-medium">
        {t(locale, 'common.note')}
        <textarea
          className="mt-1.5 min-h-24 w-full rounded-md border p-3 text-sm"
          name="customer_note"
          maxLength={2000}
        />
      </label>

      <SubmitButton locale={locale}>{t(locale, 'billing.new')}</SubmitButton>
    </form>
  );
}
