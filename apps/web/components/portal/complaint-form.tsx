'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

/**
 * The form offers only this customer's own objects, and the server function
 * re-checks that the chosen object still belongs to them.
 */
export function PortalComplaintForm({
  action,
  locale,
  objects,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  locale: Locale;
  objects: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(action, initialFormState);

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage status={state.status} message={state.message} />
      <label className="block text-sm font-medium">
        {t(locale, 'portal.tab.objects')}
        <select className="mt-1.5 min-h-11 w-full rounded-md border bg-white px-3" name="cleaning_object_id" required defaultValue="">
          <option value="" disabled>
            {t(locale, 'common.none')}
          </option>
          {objects.map((object) => (
            <option key={object.id} value={object.id}>
              {object.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium">
        {t(locale, 'portal.complaints.title')}
        <input className="mt-1.5 min-h-11 w-full rounded-md border px-3" name="title" required minLength={2} maxLength={160} />
      </label>
      <label className="block text-sm font-medium">
        {t(locale, 'common.note')}
        <textarea
          className="mt-1.5 min-h-32 w-full rounded-md border p-3 text-sm"
          name="description"
          required
          minLength={2}
          maxLength={4000}
        />
      </label>
      <SubmitButton locale={locale} className="w-full sm:w-auto">
        {t(locale, 'portal.complaints.new')}
      </SubmitButton>
    </form>
  );
}
