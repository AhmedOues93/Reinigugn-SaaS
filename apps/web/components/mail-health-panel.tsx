'use client';

import { useActionState } from 'react';
import { CheckCircle2, MailWarning, Send } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';

export function MailHealthPanel({
  configured,
  provider,
  action,
}: {
  configured: boolean;
  provider: 'resend' | 'smtp' | null;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, initialFormState);

  return (
    <div className="rounded-xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
      <FormMessage status={state.status} message={state.message} />
      <div className="flex items-start gap-3">
        <span
          className={
            configured
              ? 'grid size-10 shrink-0 place-items-center rounded-lg bg-success-soft text-success'
              : 'grid size-10 shrink-0 place-items-center rounded-lg bg-warning-soft text-warning'
          }
        >
          {configured ? <CheckCircle2 className="size-5" /> : <MailWarning className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {configured ? 'E-Mail-Versand eingerichtet' : 'E-Mail-Versand nicht vollständig eingerichtet'}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {configured
              ? 'Provider: ' + (provider === 'resend' ? 'Resend' : 'SMTP') + '. Teste den Versand direkt an deine Anmelde-E-Mail.'
              : 'Für zuverlässige Einladungen, Passwort-Mails und Rechnungen braucht Produktion RESEND_API_KEY oder SMTP_HOST plus MAIL_FROM.'}
          </p>
          {configured && (
            <form action={formAction} className="mt-4">
              <SubmitButton>
                <Send className="size-4" />
                Test-E-Mail senden
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
