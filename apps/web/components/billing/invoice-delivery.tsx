'use client';

import { useActionState, useId, useState } from 'react';
import { BellRing, Mail, PackageCheck } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input, Select } from '@/components/ui';
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
  const [showManual, setShowManual] = useState(false);
  // useId is stable across re-renders and unique per form instance, so the
  // invoice and reminder panels never share a key.
  const attemptKey = `${kind ?? 'INVOICE'}-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const isReminder = kind === 'REMINDER';

  return (
    <div className="space-y-4">
      {mailConfigured ? (
        <form action={send} className="space-y-3">
          {/*
            One key per rendering of this form. A double-click, or a retry of
            the same failed send, reuses it, so the provider refuses a second
            delivery and the log gains no duplicate success. Reloading the page
            mints a new one, which is what a deliberate second send is.
          */}
          <input type="hidden" name="idempotency_key" value={attemptKey} />
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
        <div className="rounded-lg border border-border bg-subtle px-3.5 py-3 text-sm leading-6 text-muted-foreground">
          Direkter E-Mail-Versand ist noch nicht verbunden. Das PDF kann heruntergeladen und extern versendet werden.
        </div>
      )}

      {!showManual ? (
        <button type="button" onClick={() => setShowManual(true)} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Weitere Versandart dokumentieren
        </button>
      ) : (
        <form action={manual} className="space-y-3 rounded-lg border border-border/80 bg-subtle p-3.5">
          <input type="hidden" name="kind" value={kind} />
          <FormMessage status={manualState.status} message={manualState.message} />
          <Field label="Versandweg" htmlFor={`${kind}-method`}>
            <Select id={`${kind}-method`} name="method" defaultValue="EXTERNAL_EMAIL">
              <option value="EXTERNAL_EMAIL">Extern per E-Mail</option>
              <option value="POST">Per Post</option>
              <option value="PERSONAL">Persönlich übergeben</option>
              <option value="OTHER">Sonstiger Weg</option>
            </Select>
          </Field>
          <Field label="Notiz" htmlFor={`${kind}-note`} info="Optional, z. B. Ansprechpartner oder Versanddatum.">
            <Input id={`${kind}-note`} name="note" maxLength={500} placeholder="Optional" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="outline">
              <PackageCheck className="size-4" aria-hidden="true" />
              {isReminder ? 'Erinnerung dokumentieren' : 'Versand dokumentieren'}
            </SubmitButton>
            <button type="button" onClick={() => setShowManual(false)} className="min-h-10 px-2 text-sm text-muted-foreground hover:text-foreground">
              Schließen
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  BANK_TRANSFER: 'Überweisung',
  CASH: 'Bar',
  CARD: 'Karte',
  DIRECT_DEBIT: 'Lastschrift',
  OTHER: 'Sonstiges',
};

/**
 * Manual payment reconciliation: somebody looked at a bank statement and is
 * recording what they saw. The date is the date the money arrived, which is
 * usually not today, so it is asked for rather than assumed.
 *
 * Method and reference are optional but worth having — the reference is what
 * ties the row back to a bank line when a payment is later questioned.
 */
export function MarkPaidForm({
  action,
  today,
  outstanding,
  partiallyPaid = false,
}: {
  action: Action;
  today: string;
  /** What is still owed, formatted for display, used as the amount placeholder. */
  outstanding: string;
  partiallyPaid?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [showDetail, setShowDetail] = useState(partiallyPaid);
  // Stable for the life of this form. A double-click or a resubmitted form
  // reuses it, so the database returns the payment already recorded instead of
  // booking a second one. Reloading the page mints a new key, which is what a
  // deliberate second payment is.
  const confirmKey = `pay-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="idempotency_key" value={confirmKey} />
      <FormMessage status={state.status} message={state.message} />
      <Field
        label="Zahlungseingang am"
        htmlFor="paid-on"
        info="Das Datum, an dem das Geld eingegangen ist — laut Kontoauszug, nicht das heutige Datum."
      >
        <Input id="paid-on" name="paid_on" type="date" defaultValue={today} max={today} required />
      </Field>

      {showDetail ? (
        <div className="space-y-3 rounded-lg border border-border/80 bg-subtle p-3.5">
          <Field label="Zahlungsart" htmlFor="paid-method">
            <Select id="paid-method" name="method" defaultValue="BANK_TRANSFER">
              {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Verwendungszweck / Referenz" htmlFor="paid-reference" info="Optional. Was diese Zahlung einer Zeile im Kontoauszug zuordnet.">
            <Input id="paid-reference" name="reference" maxLength={200} placeholder="z. B. Kontoauszug 47" autoComplete="off" />
          </Field>
          <Field label="Betrag" htmlFor="paid-amount" info={`Leer lassen für den offenen Betrag von ${outstanding}. Für eine Teilzahlung den tatsächlich eingegangenen Betrag eintragen.`}>
            <Input id="paid-amount" name="amount" inputMode="decimal" placeholder={outstanding} autoComplete="off" />
          </Field>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowDetail(true)}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Zahlungsart, Referenz oder Teilbetrag erfassen
        </button>
      )}

      <SubmitButton>Zahlungseingang bestätigen</SubmitButton>
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

