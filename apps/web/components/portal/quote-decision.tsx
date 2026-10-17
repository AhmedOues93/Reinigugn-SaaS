'use client';

import { useActionState, useState } from 'react';
import { Check, X } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Button, Field, Textarea } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function PortalQuoteDecision({
  acceptAction,
  declineAction,
}: {
  acceptAction: Action;
  declineAction: Action;
}) {
  const [mode, setMode] = useState<'NONE' | 'ACCEPT' | 'DECLINE'>('NONE');
  const [acceptState, acceptFormAction] = useActionState(acceptAction, initialFormState);
  const [declineState, declineFormAction] = useActionState(declineAction, initialFormState);

  if (mode === 'NONE') {
    return (
      <div className="mt-5 rounded-2xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
        <h2 className="font-semibold">Ihre Entscheidung</h2>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Sie können das Angebot direkt hier im Kundenportal annehmen oder ablehnen.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" onClick={() => setMode('ACCEPT')}>
            <Check className="size-4" />
            Angebot annehmen
          </Button>
          <Button type="button" variant="outline" onClick={() => setMode('DECLINE')}>
            Angebot ablehnen
          </Button>
        </div>
      </div>
    );
  }

  if (mode === 'ACCEPT') {
    return (
      <form action={acceptFormAction} className="mt-5 space-y-4 rounded-2xl border border-success/25 bg-card p-5 shadow-card sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Angebot annehmen</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Die Annahme wird Ihrem angemeldeten Kundenkonto mit Datum und Uhrzeit zugeordnet.
            </p>
          </div>
          <Button type="button" variant="ghost" className="size-9 p-0" onClick={() => setMode('NONE')} aria-label="Schließen">
            <X className="size-4" />
          </Button>
        </div>
        <FormMessage status={acceptState.status} message={acceptState.message} />
        <Field label="Hinweis" htmlFor="portal-quote-note" optional>
          <Textarea id="portal-quote-note" name="note" maxLength={1000} placeholder="Optionaler Hinweis zur Annahme" />
        </Field>
        <div className="flex flex-wrap gap-2">
          <SubmitButton>Angebot verbindlich annehmen</SubmitButton>
          <Button type="button" variant="outline" onClick={() => setMode('NONE')}>Abbrechen</Button>
        </div>
      </form>
    );
  }

  return (
    <form action={declineFormAction} className="mt-5 space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Angebot ablehnen</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Ein kurzer Grund hilft dem Anbieter bei der Rückmeldung.
          </p>
        </div>
        <Button type="button" variant="ghost" className="size-9 p-0" onClick={() => setMode('NONE')} aria-label="Schließen">
          <X className="size-4" />
        </Button>
      </div>
      <FormMessage status={declineState.status} message={declineState.message} />
      <Field label="Grund" htmlFor="portal-quote-decline" optional>
        <Textarea id="portal-quote-decline" name="reason" maxLength={1000} placeholder="Optionaler Grund für die Ablehnung" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <SubmitButton variant="outline">Angebot ablehnen</SubmitButton>
        <Button type="button" variant="outline" onClick={() => setMode('NONE')}>Abbrechen</Button>
      </div>
    </form>
  );
}
