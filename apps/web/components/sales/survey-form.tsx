'use client';

import { useActionState, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
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
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        <CalendarPlus className="size-4" aria-hidden="true" />
        Besichtigung planen
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Besichtigung planen</p>
          <p className="text-sm text-muted-foreground">Schritt {step} von 2</p>
        </div>
        <Button type="button" variant="ghost" className="size-10 p-0" onClick={() => setOpen(false)} aria-label="Schließen"><X className="size-4" /></Button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <span className="h-1.5 rounded-full bg-primary" />
        <span className={step === 2 ? 'h-1.5 rounded-full bg-primary' : 'h-1.5 rounded-full bg-muted'} />
      </div>

      <div className={step === 1 ? 'space-y-4' : 'hidden'}>
        <Field label="Objekt / Standort" htmlFor="site_name">
          <Input id="site_name" name="site_name" required minLength={2} maxLength={160} defaultValue={defaults?.siteName ?? ''} placeholder="z. B. Bürozentrum Hafenblick" />
        </Field>
        <Field label={t(locale, 'sales.survey.scheduledAt')} htmlFor="scheduled_at">
          <Input id="scheduled_at" name="scheduled_at" type="datetime-local" required />
        </Field>
        <Field label="Besichtigung durch" htmlFor="conducted_by">
          <Select id="conducted_by" name="conducted_by" defaultValue="">
            <option value="">Später zuweisen</option>
            {surveyors.filter((surveyor) => surveyor.name && surveyor.name !== '—').map((surveyor) => (
              <option key={surveyor.id} value={surveyor.id}>{surveyor.name}</option>
            ))}
          </Select>
        </Field>
      </div>

      <div className={step === 2 ? 'space-y-4' : 'hidden'}>
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
        <Field label="Zugang / Besonderheiten" htmlFor="access_notes" optional>
          <Textarea id="access_notes" name="access_notes" maxLength={4000} placeholder="z. B. Anmeldung am Empfang, Zugang ab 17:30 Uhr" />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
        {step === 1 ? (
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>Abbrechen</Button>
        ) : (
          <Button type="button" variant="outline" onClick={() => setStep(1)}><ChevronLeft className="size-4" />Zurück</Button>
        )}
        {step === 1 ? (
          <Button type="button" onClick={() => setStep(2)}>Weiter<ChevronRight className="size-4" /></Button>
        ) : (
          <SubmitButton locale={locale}>Termin speichern</SubmitButton>
        )}
      </div>
    </form>
  );
}
