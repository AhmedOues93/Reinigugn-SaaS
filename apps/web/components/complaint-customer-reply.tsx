'use client';

import { useActionState, useEffect, useRef } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';

export function ComplaintCustomerReply({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === 'success') formRef.current?.reset();
  }, [state.status]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <FormMessage status={state.status} message={state.message} />
      <div>
        <label htmlFor="complaint-reply" className="mb-1.5 block text-sm font-medium text-foreground">
          Antwort an den Kunden
        </label>
        <textarea
          id="complaint-reply"
          name="note"
          rows={4}
          maxLength={4000}
          required
          placeholder="Zum Beispiel: Vielen Dank für Ihren Hinweis. Wir haben die Nachreinigung für morgen eingeplant."
          className="min-h-28 w-full resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-[15px] text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <p className="mt-1.5 text-xs text-muted-foreground">
          Diese Antwort wird direkt im Kundenportal im Verlauf der Reklamation angezeigt.
        </p>
      </div>
      <SubmitButton size="block">Antwort senden</SubmitButton>
    </form>
  );
}
