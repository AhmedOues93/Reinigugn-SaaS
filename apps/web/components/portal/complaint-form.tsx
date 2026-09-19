'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input, Select, Textarea } from '@/components/ui';
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
    <form action={formAction} className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <Field label={t(locale, 'portal.tab.objects')} htmlFor="complaint-object">
        <Select id="complaint-object" name="cleaning_object_id" required defaultValue="">
          <option value="" disabled>
            {t(locale, 'common.none')}
          </option>
          {objects.map((object) => (
            <option key={object.id} value={object.id}>
              {object.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t(locale, 'portal.complaints.title')} htmlFor="complaint-title">
        <Input id="complaint-title" name="title" required minLength={2} maxLength={160} />
      </Field>
      <Field label={t(locale, 'common.note')} htmlFor="complaint-description">
        <Textarea id="complaint-description" name="description" className="min-h-32" required minLength={2} maxLength={4000} />
      </Field>
      <SubmitButton locale={locale} size="block">
        {t(locale, 'portal.complaints.new')}
      </SubmitButton>
    </form>
  );
}
