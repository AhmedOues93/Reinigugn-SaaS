'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

export function AuUploadForm({
  action,
  locale = 'de',
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  locale?: Locale;
}) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return (
    <form className="mt-3 space-y-3" action={formAction}>
      <label className="block text-sm font-medium">
        {t(locale, 'emp.absence.auLabel')}
        <input
          className="mt-1.5 block w-full text-sm file:min-h-11 file:rounded-md file:border-0 file:bg-slate-100 file:px-4 file:text-sm file:font-medium"
          name="document"
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          required
        />
      </label>
      <button
        className="min-h-touch w-full rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 disabled:opacity-60 sm:w-auto"
        disabled={pending}
      >
        {pending ? t(locale, 'common.saving') : t(locale, 'emp.absence.auUpload')}
      </button>
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
