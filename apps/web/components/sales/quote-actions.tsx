'use client';

import { useActionState, useState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Mail, Send, X } from 'lucide-react';
import { Button, Field, Input, Select } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

function CustomerLink({ url }: { url?: string }) {
  if (!url) return null;
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
      <p className="font-medium">Kundenlink</p>
      <a href={url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-primary underline underline-offset-4">
        {url}
      </a>
    </div>
  );
}

export function SendQuoteForm({ action, locale, disabled }: { action: Action; locale: Locale; disabled: boolean }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [open, setOpen] = useState(false);

  if (!open && state.status !== 'success') {
    return (
      <div>
        <p className="text-sm leading-6 text-muted-foreground">
          Erst beim Senden erhält das Angebot seine Nummer und wird unveränderlich.
        </p>
        {disabled ? (
          <p className="mt-3 text-sm text-warning">Ein Angebot braucht mindestens eine Position.</p>
        ) : (
          <Button type="button" className="mt-4" onClick={() => setOpen(true)}>
            <Send className="size-4" />
            Angebot senden
          </Button>
        )}
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Angebot senden</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            ReinPlan vergibt die Angebotsnummer, erstellt den sicheren Kundenlink und sendet PDF + Link per E-Mail, wenn eine Kundenadresse vorhanden ist.
          </p>
        </div>
        {state.status !== 'success' && (
          <Button type="button" variant="ghost" className="size-9 p-0" onClick={() => setOpen(false)} aria-label="Schließen">
            <X className="size-4" />
          </Button>
        )}
      </div>
      <FormMessage status={state.status} message={state.message} />
      <CustomerLink url={state.invitationUrl} />
      {state.status !== 'success' && <SubmitButton locale={locale}><Send className="size-4" />Jetzt senden</SubmitButton>}
    </form>
  );
}

export function ShareQuoteForm({ action, locale }: { action: Action; locale: Locale }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage status={state.status} message={state.message} />
      <CustomerLink url={state.invitationUrl} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Kundenfreigabe</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Sendet einen neuen sicheren Link und das PDF erneut an den Kunden.
          </p>
        </div>
        <SubmitButton locale={locale} variant="outline">
          <Mail className="size-4" />
          Erneut senden
        </SubmitButton>
      </div>
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Auftragsart" htmlFor="order_type">
          <Select id="order_type" name="order_type" defaultValue={showSchedule ? 'DAUERAUFTRAG' : 'EINMALAUFTRAG'}>
            <option value="EINMALAUFTRAG">Einmalauftrag</option>
            <option value="BEFRISTET">Befristeter Auftrag</option>
            <option value="DAUERAUFTRAG">Laufender Auftrag</option>
          </Select>
        </Field>
        <Field label="Kundenabnahme" htmlFor="acceptance_policy">
          <Select id="acceptance_policy" name="acceptance_policy" defaultValue="KEINE_ABNAHME_ERFORDERLICH">
            <option value="KEINE_ABNAHME_ERFORDERLICH">Keine Abnahme erforderlich</option>
            <option value="DIGITALE_BESTAETIGUNG">Digitale Bestätigung</option>
            <option value="UNTERSCHRIFT">Unterschrift erforderlich</option>
          </Select>
        </Field>
      </div>

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
