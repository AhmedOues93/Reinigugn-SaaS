'use client';

import { useActionState } from 'react';
import { initialFormState, type FormState } from '@/lib/actions';
import { FormMessage, SubmitButton } from '@/components/form-controls';
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
      <label className="text-sm font-medium">
        {t(locale, 'emp.absence.type')}
        <select className="mt-1.5 block min-h-11 w-full rounded-md border bg-white px-3" name="type">
          <option value="VACATION">{t(locale, 'emp.absence.vacation')}</option>
          <option value="SICKNESS">{t(locale, 'emp.absence.sickness')}</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        {t(locale, 'emp.absence.start')}
        <input className="mt-1.5 block min-h-11 w-full rounded-md border px-3" name="start_date" type="date" required />
      </label>
      <label className="text-sm font-medium">
        {t(locale, 'emp.absence.end')}
        <input className="mt-1.5 block min-h-11 w-full rounded-md border px-3" name="end_date" type="date" required />
      </label>
      <label className="text-sm font-medium sm:col-span-2">
        {t(locale, 'common.note')}
        <textarea className="mt-1.5 block min-h-24 w-full rounded-md border p-3" name="note" maxLength={1000} />
      </label>
      <div className="sm:col-span-2">
        <SubmitButton locale={locale}>{t(locale, 'emp.absence.submit')}</SubmitButton>
      </div>
    </form>
  );
}
