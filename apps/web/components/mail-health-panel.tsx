'use client';

import { useActionState } from 'react';
import { CheckCircle2, Circle, Mail, Send } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';

type SetupStep = { variable: string; label: string; present: boolean; hint: string };

export function MailHealthPanel({
  configured,
  provider,
  steps = [],
  action,
}: {
  configured: boolean;
  provider: 'resend' | 'smtp' | null;
  steps?: SetupStep[];
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
              : 'Anmelde- und Passwort-E-Mails verschickt Supabase selbst. Einladungen, Angebote und Rechnungen versendet ReinPlan erst, wenn hier ein eigener Anbieter verbunden ist – bis dahin lassen sich PDF und XRechnung-XML herunterladen und extern versenden.'}
          </p>

          {/*
            Ohne diese Liste sieht ein fehlender Absender genauso aus wie ein
            fehlender Anbieter. Es werden nur Namen und ein Ja/Nein gezeigt,
            niemals ein Wert.
          */}
          {!configured && steps.length > 0 && (
            <ul className="mt-3 space-y-2">
              {steps.map((step) => (
                <li key={step.variable} className="flex items-start gap-2.5 text-sm leading-6">
                  {step.present ? (
                    <CheckCircle2 className="mt-1 size-4 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <Circle className="mt-1 size-4 shrink-0 text-warning" aria-hidden="true" />
                  )}
                  <span className="min-w-0">
                    <span className="font-medium text-foreground">{step.label}</span>{' '}
                    <code className="break-anywhere rounded bg-muted px-1 py-0.5 text-xs">{step.variable}</code>
                    <span className="sr-only">{step.present ? ' ist gesetzt' : ' fehlt'}</span>
                    <span className="block text-muted-foreground">{step.hint}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
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
