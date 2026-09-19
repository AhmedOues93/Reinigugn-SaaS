'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input, Textarea } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

export function LeadForm({
  action,
  locale,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  locale: Locale;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <Field label={t(locale, 'sales.lead.organisation')} htmlFor="organisation">
        <Input id="organisation" name="organisation" required minLength={2} maxLength={160} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t(locale, 'sales.lead.contact')} htmlFor="contact_person">
          <Input id="contact_person" name="contact_person" maxLength={160} />
        </Field>
        <Field label={t(locale, 'auth.email')} htmlFor="email">
          <Input id="email" name="email" type="email" maxLength={160} />
        </Field>
        <Field label={t(locale, 'emp.job.call')} htmlFor="phone">
          <Input id="phone" name="phone" maxLength={64} />
        </Field>
        <Field label={t(locale, 'sales.lead.source')} htmlFor="source">
          <Input id="source" name="source" maxLength={120} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field className="sm:col-span-3" label={t(locale, 'common.address')} htmlFor="street">
          <Input id="street" name="street" maxLength={160} />
        </Field>
        <Field label="PLZ" htmlFor="postal_code">
          <Input id="postal_code" name="postal_code" maxLength={16} />
        </Field>
        <Field className="sm:col-span-2" label={t(locale, 'portal.tab.objects')} htmlFor="city">
          <Input id="city" name="city" maxLength={120} />
        </Field>
      </div>
      <Field label={t(locale, 'common.note')} htmlFor="notes">
        <Textarea id="notes" name="notes" maxLength={4000} />
      </Field>
      <SubmitButton locale={locale}>{t(locale, 'sales.leads.new')}</SubmitButton>
    </form>
  );
}
