'use client';

import { useActionState, useState } from 'react';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Card, Field, Input, Textarea } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

type ConfirmAction = (state: FormState) => Promise<FormState>;
type DisputeAction = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * The customer's Abnahme of one performed service.
 *
 * Two answers, both first-class. Offering only "confirm" would make silence the
 * only way to disagree, and silence is exactly what leaves an office guessing
 * weeks later about whether an invoice is safe to send.
 *
 * This confirms the *service*. The invoice is a separate document that comes
 * afterwards and is never put to the customer for approval.
 */
export function PortalAcceptancePanel({
  confirmAction,
  disputeAction,
  locale,
}: {
  confirmAction: ConfirmAction;
  disputeAction: DisputeAction;
  locale: Locale;
}) {
  const [confirmState, confirm] = useActionState(confirmAction, initialFormState);
  const [disputeState, dispute] = useActionState(disputeAction, initialFormState);
  const [showProblem, setShowProblem] = useState(false);

  return (
    <Card className="mt-4 border-primary/25 bg-primary-soft/40 p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="font-semibold">{t(locale, 'portal.acceptance.title')}</h2>
          <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
            {t(locale, 'portal.acceptance.intro')}
          </p>
        </div>
      </div>

      <FormMessage status={confirmState.status} message={confirmState.message} />

      {!showProblem ? (
        <div className="mt-4 space-y-3">
          <form action={confirm}>
            <SubmitButton size="block">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {t(locale, 'portal.acceptance.confirm')}
            </SubmitButton>
          </form>
          <button
            type="button"
            onClick={() => setShowProblem(true)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-danger underline-offset-4 hover:underline"
          >
            <AlertTriangle className="size-4" aria-hidden="true" />
            {t(locale, 'portal.acceptance.reportProblem')}
          </button>
        </div>
      ) : (
        <form action={dispute} className="mt-4 space-y-3 rounded-lg border border-danger/25 bg-card p-4">
          <FormMessage status={disputeState.status} message={disputeState.message} />
          <p className="text-sm leading-6 text-muted-foreground">
            {t(locale, 'portal.acceptance.problemIntro')}
          </p>
          <Field label={t(locale, 'portal.acceptance.problemTitle')} htmlFor="problem-title">
            <Input id="problem-title" name="title" required minLength={2} maxLength={160} autoComplete="off" />
          </Field>
          <Field label={t(locale, 'portal.acceptance.problemDescription')} htmlFor="problem-description">
            <Textarea id="problem-description" name="description" required minLength={2} maxLength={4000} rows={4} />
          </Field>
          <div className="flex flex-wrap gap-3">
            <SubmitButton variant="outline">{t(locale, 'portal.acceptance.problemSubmit')}</SubmitButton>
            <button
              type="button"
              onClick={() => setShowProblem(false)}
              className="min-h-11 text-sm font-medium text-muted-foreground underline-offset-4 hover:underline"
            >
              {t(locale, 'common.cancel')}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}

/** The settled states, so the customer can see what they or a colleague did. */
export function PortalAcceptanceStatus({
  locale,
  status,
  method,
  acceptedAt,
  acceptedByName,
}: {
  locale: Locale;
  status: 'ERFASST' | 'ABNAHME_AUSSTEHEND' | 'ABGENOMMEN' | 'PROBLEM_GEMELDET';
  method: 'KEINE' | 'VOR_ORT_UNTERSCHRIFT' | 'PORTAL_BESTAETIGUNG' | 'BUERO_FREIGABE' | null;
  acceptedAt: string | null;
  acceptedByName: string | null;
}) {
  if (status === 'PROBLEM_GEMELDET') {
    return (
      <Card className="mt-4 border-danger/25 bg-danger-soft/40 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="font-semibold text-danger">{t(locale, 'portal.acceptance.problemOpen')}</h2>
            <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
              {t(locale, 'portal.acceptance.problemOpenBody')}
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (status !== 'ABGENOMMEN') return null;

  const how =
    method === 'VOR_ORT_UNTERSCHRIFT'
      ? t(locale, 'portal.acceptance.methodOnSite')
      : method === 'BUERO_FREIGABE'
        ? t(locale, 'portal.acceptance.methodOffice')
        : t(locale, 'portal.acceptance.methodPortal');

  return (
    <Card className="mt-4 border-success/25 bg-success-soft/40 p-5">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="font-semibold text-success">{t(locale, 'portal.acceptance.accepted')}</h2>
          <p className="break-anywhere mt-0.5 text-sm leading-6 text-muted-foreground">
            {[
              how,
              acceptedByName,
              acceptedAt
                ? new Date(acceptedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>
    </Card>
  );
}
