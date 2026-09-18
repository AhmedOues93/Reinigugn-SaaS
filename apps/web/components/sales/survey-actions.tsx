'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input, Textarea } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function CompleteSurveyForm({ action, locale }: { action: Action; locale: Locale }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage status={state.status} message={state.message} />
      <Field label={t(locale, 'sales.survey.findings')} htmlFor="findings">
        <Textarea id="findings" name="findings" maxLength={4000} />
      </Field>
      <SubmitButton locale={locale}>{t(locale, 'sales.survey.complete')}</SubmitButton>
    </form>
  );
}

export function QuoteFromSurveyForm({
  action,
  locale,
  defaultTitle,
  disabled,
}: {
  action: Action;
  locale: Locale;
  defaultTitle: string;
  disabled: boolean;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  if (disabled) return <p className="text-sm text-warning">{t(locale, 'sales.area.emptyBody')}</p>;
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage status={state.status} message={state.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t(locale, 'sales.quote.title')} htmlFor="quote-title">
          <Input id="quote-title" name="title" defaultValue={defaultTitle} required minLength={2} maxLength={160} />
        </Field>
        <Field label={t(locale, 'sales.quote.validDays')} htmlFor="valid-days">
          <Input id="valid-days" name="valid_days" type="number" min={1} max={365} defaultValue={30} />
        </Field>
      </div>
      <SubmitButton locale={locale}>{t(locale, 'sales.quote.createFromSurvey')}</SubmitButton>
    </form>
  );
}
