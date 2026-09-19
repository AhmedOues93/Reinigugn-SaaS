'use client';

import { useActionState, useState } from 'react';
import { BellRing, Mail, PackageCheck } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * Delivery of an issued invoice: by e-mail with the PDF attached, or recorded
 * as delivered another way. The e-mail result shown is exactly what the server
 * reported — "not configured" is said as such, never dressed up as success.
 */
export function SendInvoicePanel({
  sendAction,
  manualAction,
  defaultRecipient,
  mailConfigured,
  kind = 'INVOICE',
}: {
  sendAction: Action;
  manualAction: Action;
  defaultRecipient: string | null;
  mailConfigured: boolean;
  kind?: 'INVOICE' | 'REMINDER';
}) {
  const [sendState, send] = useActionState(sendAction, initialFormState);
  const [manualState, manual] = useActionState(manualAction, initialFormState);
  const [showManual, setShowManual] = useState(!mailConfigured);
  const isReminder = kind === 'REMINDER';

  return (
    <div className="space-y-4">
      {mailConfigured ? (
        <form action={send} className="space-y-3">
          <FormMessage status={sendState.status} message={sendState.message} />
          <Field label="Empfänger" htmlFor={`${kind}-recipient`} info="Standardmäßig die E-Mail-Adresse aus den Kundenstammdaten. Das PDF wird angehängt.">
            <Input id={`${kind}-recipient`} name="recipient" type="email" required defaultValue={defaultRecipient ?? ''} autoComplete="off" />
          </Field>
          <SubmitButton variant={isReminder ? 'outline' : 'default'}>
            {isReminder ? <BellRing className="size-4" aria-hidden="true" /> : <Mail className="size-4" aria-hidden="true" />}
            {isReminder ? 'Zahlungserinnerung senden' : 'Per E-Mail senden'}
          </SubmitButton>
        </form>
      ) : (
        <p className="rounded-lg border border-warning/25 bg-warning-soft px-3.5 py-3 text-sm leading-6 text-warning">
          E-Mail-Versand ist nicht eingerichtet. Laden Sie das PDF herunter, senden Sie es selbst und vermerken Sie den Versand hier.
        </p>
      )}

      {mailConfigured && !showManual ? (
        <button type="button" onClick={() => setShowManual(true)} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Auf anderem Weg versendet?
        </button>
      ) : (
        <form action={manual} className="space-y-3 rounded-lg border border-border/80 bg-subtle p-3.5">
          <input type="hidden" name="kind" value={kind} />
          <FormMessage status={manualState.status} message={manualState.message} />
          <Field label={isReminder ? 'Erinnerung vermerken' : 'Versand vermerken'} htmlFor={`${kind}-note`}>
            <Input id={`${kind}-note`} name="note" required minLength={2} maxLength={500} placeholder="z. B. per Post am 19.09." />
          </Field>
          <SubmitButton variant="outline">
            <PackageCheck className="size-4" aria-hidden="true" />
            {isReminder ? 'Erinnerung als erfolgt vermerken' : 'Als versendet vermerken'}
          </SubmitButton>
        </form>
      )}
    </div>
  );
}

export function MarkPaidForm({ action, today }: { action: Action; today: string }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage status={state.status} message={state.message} />
      <Field label="Zahlungseingang am" htmlFor="paid-on">
        <Input id="paid-on" name="paid_on" type="date" defaultValue={today} max={today} required />
      </Field>
      <SubmitButton>Als bezahlt verbuchen</SubmitButton>
    </form>
  );
}

export function AddAllBillableAction({ action, count }: { action: Action; count: number }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary-soft/60 p-3.5">
      <p className="min-w-0 flex-1 text-sm text-foreground">
        <span className="font-semibold">{count} abgeschlossene Einsätze</span> im Leistungszeitraum sind noch nicht abgerechnet.
      </p>
      <SubmitButton size="sm">Alle übernehmen</SubmitButton>
      {state.message && (
        <div className="w-full">
          <FormMessage status={state.status} message={state.message} />
        </div>
      )}
    </form>
  );
}

