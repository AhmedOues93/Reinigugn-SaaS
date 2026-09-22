'use client';

import { useActionState } from 'react';
import { CheckCircle2, Mail, Send } from 'lucide-react';
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
              : 'grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground'
          }
        >
          {configured ? <CheckCircle2 className="size-5" /> : <Mail className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {configured ? 'E-Mail-Versand eingerichtet' : 'E-Mail-Versand noch nicht verbunden'}
          </p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {configured
              ? 'Provider: ' + (provider === 'resend' ? 'Resend' : 'SMTP') + '. Teste den Versand direkt an deine Anmelde-E-Mail.'
              : 'ReinPlan kann aktuell weiterhin über die vorhandene Auth-E-Mail arbeiten. Für direkten Versand von Einladungen, Angeboten und Rechnungen kann später ein eigener E-Mail-Anbieter verbunden werden.'}
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
