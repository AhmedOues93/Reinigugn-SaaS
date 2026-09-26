'use client';

import { useActionState, useState } from 'react';
import { Button, Field, Input } from '@/components/ui';
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
      <p className="text-sm leading-6 text-muted-foreground">
        {t(locale, 'billing.issueHelp')}
      </p>
      {disabled ? (
        <p className="text-sm font-medium text-warning">{t(locale, 'billing.needService')}</p>
      ) : (
        <SubmitButton locale={locale} className="w-full">
          {t(locale, 'billing.issue')}
        </SubmitButton>
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

/**
 * Cancellation always records a reason; the issued document itself is
 * preserved. It is irreversible, so it stays behind an explicit confirm step
 * rather than submitting on the first click.
 */
export function CancelInvoiceAction({ action, locale }: { action: Action; locale: Locale }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button type="button" variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => setConfirming(true)}>
        {t(locale, 'billing.cancelInvoice')}
      </Button>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <FormMessage status={state.status} message={state.message} />
      <p className="text-sm text-muted-foreground">
        Die Stornierung kann nicht rückgängig gemacht werden. Korrekturen erfolgen über eine neue
        Korrekturrechnung.
      </p>
      <Field label="Stornierungsgrund" htmlFor="cancel-reason">
        <Input id="cancel-reason" name="reason" required minLength={3} maxLength={500} />
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={() => setConfirming(false)}>
          {t(locale, 'common.cancel')}
        </Button>
        <SubmitButton locale={locale} variant="danger">
          {t(locale, 'billing.cancelInvoice')}
        </SubmitButton>
      </div>
    </form>
  );
}

export function CorrectionInvoiceAction({ action, locale }: { action: Action; locale: Locale }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-3">
      <FormMessage status={state.status} message={state.message} />
      <p className="text-sm text-muted-foreground">
        Eine Korrekturrechnung entsteht als neuer Entwurf mit denselben Leistungen und verweist auf
        diese stornierte Rechnung.
      </p>
      <SubmitButton locale={locale}>Korrekturrechnung erstellen</SubmitButton>
    </form>
  );
}
