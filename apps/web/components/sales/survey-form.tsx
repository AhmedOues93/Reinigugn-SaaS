'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input, Select, Textarea } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

export function SurveyForm({
  action,
  locale,
  surveyors,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  locale: Locale;
  surveyors: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t(locale, 'sales.survey.siteName')} htmlFor="site_name">
          <Input id="site_name" name="site_name" required minLength={2} maxLength={160} />
        </Field>
        <Field label={t(locale, 'sales.survey.scheduledAt')} htmlFor="scheduled_at">
          <Input id="scheduled_at" name="scheduled_at" type="datetime-local" required />
        </Field>
        <Field className="sm:col-span-2" label={t(locale, 'sales.survey.surveyor')} htmlFor="conducted_by">
          <Select id="conducted_by" name="conducted_by" defaultValue="">
            <option value="">{t(locale, 'common.none')}</option>
            {surveyors.map((surveyor) => (
              <option key={surveyor.id} value={surveyor.id}>
                {surveyor.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field className="sm:col-span-3" label={t(locale, 'common.address')} htmlFor="survey_street">
          <Input id="survey_street" name="street" maxLength={160} />
        </Field>
        <Field label="PLZ" htmlFor="survey_postal">
          <Input id="survey_postal" name="postal_code" maxLength={16} />
        </Field>
        <Field className="sm:col-span-2" label={t(locale, 'portal.tab.objects')} htmlFor="survey_city">
          <Input id="survey_city" name="city" maxLength={120} />
        </Field>
      </div>
      <Field label={t(locale, 'sales.survey.accessNotes')} htmlFor="access_notes">
        <Textarea id="access_notes" name="access_notes" maxLength={4000} />
      </Field>
      <SubmitButton locale={locale}>{t(locale, 'sales.survey.new')}</SubmitButton>
    </form>
  );
}
