'use client';

import { useActionState } from 'react';
import { initialFormState, type FormState } from '@/lib/actions';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input, Select, Textarea } from '@/components/ui';
import { t, type Locale } from '@/lib/i18n';

export function AbsenceForm({
  action,
  locale = 'de',
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  locale?: Locale;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormMessage status={state.status} message={state.message} />
      </div>
      <Field label={t(locale, 'emp.absence.type')} htmlFor="absence-type">
        <Select id="absence-type" name="type">
          <option value="VACATION">{t(locale, 'emp.absence.vacation')}</option>
          <option value="SICKNESS">{t(locale, 'emp.absence.sickness')}</option>
        </Select>
      </Field>
      <div className="hidden sm:block" />
      <Field label={t(locale, 'emp.absence.start')} htmlFor="absence-start">
        <Input id="absence-start" name="start_date" type="date" required />
      </Field>
      <Field label={t(locale, 'emp.absence.end')} htmlFor="absence-end">
        <Input id="absence-end" name="end_date" type="date" required />
      </Field>
      <Field className="sm:col-span-2" label={t(locale, 'common.note')} htmlFor="absence-note">
        <Textarea id="absence-note" name="note" maxLength={1000} />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton locale={locale} size="block">
          {t(locale, 'emp.absence.submit')}
        </SubmitButton>
      </div>
    </form>
  );
}
