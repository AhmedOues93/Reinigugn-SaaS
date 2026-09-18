'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function IssueInvoiceAction({
  action,
  locale,
  disabled,
}: {
  action: Action;
  locale: Locale;
  disabled: boolean;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage status={state.status} message={state.message} />
      <p className="text-sm text-slate-600">
        Beim Festschreiben erhält die Rechnung ihre Nummer und ist danach unveränderlich.
        Korrekturen erfolgen über eine Stornierung.
      </p>
      {disabled ? (
        <p className="text-sm text-amber-800">Eine Rechnung braucht mindestens eine Position.</p>
      ) : (
        <SubmitButton locale={locale}>{t(locale, 'billing.issue')}</SubmitButton>
      )}
    </form>
  );
}

export function MarkPaidAction({ action, locale }: { action: Action; locale: Locale }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton locale={locale}>{t(locale, 'billing.markPaid')}</SubmitButton>
    </form>
  );
}

/** Cancellation always records a reason; the issued document itself is preserved. */
export function CancelInvoiceAction({ action, locale }: { action: Action; locale: Locale }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage status={state.status} message={state.message} />
      <label className="block text-sm font-medium">
        Stornierungsgrund
        <input
          className="mt-1.5 min-h-touch w-full rounded-md border px-3 text-sm"
          name="reason"
          required
          minLength={3}
          maxLength={500}
        />
      </label>
      <SubmitButton locale={locale}>{t(locale, 'billing.cancelInvoice')}</SubmitButton>
    </form>
  );
}

export function CorrectionInvoiceAction({ action, locale }: { action: Action; locale: Locale }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage status={state.status} message={state.message} />
      <p className="text-sm text-slate-600">
        Eine Korrekturrechnung entsteht als neuer Entwurf mit denselben Positionen und verweist auf
        diese stornierte Rechnung.
      </p>
      <SubmitButton locale={locale}>Korrekturrechnung erstellen</SubmitButton>
    </form>
  );
}
