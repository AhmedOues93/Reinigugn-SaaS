'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function SendQuoteForm({ action, locale, disabled }: { action: Action; locale: Locale; disabled: boolean }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage status={state.status} message={state.message} />
      <p className="text-sm text-muted-foreground">
        Beim Senden erhält das Angebot seine Nummer und ist danach unveränderlich.
      </p>
      {disabled ? (
        <p className="text-sm text-warning">Ein Angebot braucht mindestens eine Position.</p>
      ) : (
        <SubmitButton locale={locale}>{t(locale, 'sales.quote.send')}</SubmitButton>
      )}
    </form>
  );
}

/**
 * Acceptance needs the weekdays and the service window, because it creates the
 * recurring plan. For a one-off quote those inputs are hidden and the defaults
 * are never used, since no schedule is created.
 */
export function AcceptQuoteForm({ action, locale, showSchedule }: { action: Action; locale: Locale; showSchedule: boolean }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const weekdays = [1, 2, 3, 4, 5, 6, 7] as const;

  return (
    <form action={formAction} className="space-y-4">
      <FormMessage status={state.status} message={state.message} />
      <h2 className="font-semibold">{t(locale, 'sales.accept.title')}</h2>
      <p className="text-sm text-muted-foreground">{t(locale, 'sales.accept.body')}</p>

      {showSchedule ? (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t(locale, 'sales.accept.weekdays')}</legend>
            <div className="flex flex-wrap gap-2">
              {weekdays.map((day) => (
                <label
                  key={day}
                  className="inline-flex min-h-touch cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:text-primary"
                >
                  <input type="checkbox" name="weekdays" value={day} defaultChecked={day === 1} className="size-4 accent-current" />
                  {t(locale, `sales.weekday.${day}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t(locale, 'sales.accept.from')} htmlFor="start-time">
              <Input id="start-time" name="start_time" type="time" defaultValue="08:00" required />
            </Field>
            <Field label={t(locale, 'sales.accept.to')} htmlFor="end-time">
              <Input id="end-time" name="end_time" type="time" defaultValue="10:00" required />
            </Field>
          </div>
        </>
      ) : (
        <input type="hidden" name="weekdays" value="1" />
      )}

      <SubmitButton locale={locale}>{t(locale, 'sales.quote.accept')}</SubmitButton>
    </form>
  );
}

export function DeclineQuoteForm({ action, locale }: { action: Action; locale: Locale }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage status={state.status} message={state.message} />
      <Field label={t(locale, 'sales.quote.declineReason')} htmlFor="decline-reason">
        <Input id="decline-reason" name="reason" required minLength={3} maxLength={500} />
      </Field>
      <SubmitButton locale={locale} variant="outline">
        {t(locale, 'sales.quote.decline')}
      </SubmitButton>
    </form>
  );
}
