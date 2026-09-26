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
  sourceJobId,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  locale: Locale;
  customers: { id: string; name: string; customer_number: string | null }[];
  defaultPeriodStart: string;
  defaultPeriodEnd: string;
  defaultCustomerId?: string;
  sourceJobId?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      {sourceJobId && <input type="hidden" name="source_job_id" value={sourceJobId} />}
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

      <details className="rounded-xl border border-border/80 bg-card">
        <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium">
          E-Rechnung für Geschäftskunden
          <span className="text-xs font-normal text-muted-foreground">XRechnung 3.0</span>
        </summary>
        <div className="space-y-4 border-t border-border/80 p-4">
          <p className="text-sm leading-6 text-muted-foreground">
            Eine E-Rechnung ist eine strukturierte Rechnungsdatei, die Buchhaltungssoftware automatisch lesen kann.
            ReinPlan erzeugt dafür XRechnung 3.0 als XML und verschickt sie zusammen mit der lesbaren PDF. Für normale
            B2B-Rechnungen genügt als Käuferreferenz die vom Kunden gewünschte Referenz; eine Leitweg-ID brauchst du
            grundsätzlich nur bei Rechnungen an Behörden.
          </p>
          <Field
            label="Käuferreferenz / Leitweg-ID"
            htmlFor="buyer_reference"
            info="Für die XRechnung erforderlich. Bei Behörden die Leitweg-ID eintragen. Bei Firmen die vom Kunden vorgegebene Käufer-, Bestell- oder Vertragsreferenz verwenden."
          >
            <Input id="buyer_reference" name="buyer_reference" maxLength={200} placeholder="z. B. Bestellnummer, Vertragsreferenz oder Leitweg-ID" />
          </Field>
        </div>
      </details>

      <Field label="Hinweis auf der Rechnung" htmlFor="customer_note" optional info="Erscheint für den Kunden auf dem Dokument, z. B. ein Dank oder eine Bestellnummer.">
        <Textarea id="customer_note" name="customer_note" maxLength={2000} />
      </Field>

      <SubmitButton locale={locale}>
        {sourceJobId ? 'Rechnungsentwurf erstellen' : t(locale, 'billing.new')}
      </SubmitButton>
    </form>
  );
}
