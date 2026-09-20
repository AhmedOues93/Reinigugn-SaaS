'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input, Select, Textarea } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

export function SurveyForm({
  action, locale, surveyors, defaults,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  locale: Locale;
  surveyors: { id: string; name: string }[];
  defaults?: { siteName?: string; street?: string; postalCode?: string; city?: string };
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Objekt / Standort" htmlFor="site_name">
          <Input id="site_name" name="site_name" required minLength={2} maxLength={160} defaultValue={defaults?.siteName ?? ''} placeholder="z. B. Bürozentrum Hafenblick" />
        </Field>
        <Field label={t(locale, 'sales.survey.scheduledAt')} htmlFor="scheduled_at">
          <Input id="scheduled_at" name="scheduled_at" type="datetime-local" required />
        </Field>
        <Field className="sm:col-span-2" label="Besichtigung durch" htmlFor="conducted_by">
          <Select id="conducted_by" name="conducted_by" defaultValue="">
            <option value="">Noch nicht zugewiesen</option>
            {surveyors.map((surveyor) => <option key={surveyor.id} value={surveyor.id}>{surveyor.name}</option>)}
          </Select>
        </Field>
      </div>
      <div className="rounded-xl border border-border bg-muted/30 p-4">
        <p className="mb-4 text-sm font-medium">Objektadresse</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field className="sm:col-span-3" label="Straße und Hausnummer" htmlFor="survey_street">
            <Input id="survey_street" name="street" maxLength={160} defaultValue={defaults?.street ?? ''} autoComplete="street-address" />
          </Field>
          <Field label="PLZ" htmlFor="survey_postal">
            <Input id="survey_postal" name="postal_code" maxLength={16} defaultValue={defaults?.postalCode ?? ''} autoComplete="postal-code" />
          </Field>
          <Field className="sm:col-span-2" label="Ort" htmlFor="survey_city">
            <Input id="survey_city" name="city" maxLength={120} defaultValue={defaults?.city ?? ''} autoComplete="address-level2" />
          </Field>
        </div>
      </div>
      <Field label="Zugang / Besonderheiten (optional)" htmlFor="access_notes">
        <Textarea id="access_notes" name="access_notes" maxLength={4000} placeholder="z. B. Schlüssel, Anmeldung am Empfang, Zugang erst ab 17:30 Uhr" />
      </Field>
      <SubmitButton locale={locale}>Besichtigung planen</SubmitButton>
    </form>
  );
}
