'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input, Textarea } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';

export function StaffNewThreadForm({ action }: { action: (state: FormState, data: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="mt-5 space-y-3">
      <FormMessage status={state.status} message={state.message} />
      <Field label="Betreff" htmlFor="thread-subject">
        <Input id="thread-subject" name="subject" maxLength={200} required />
      </Field>
      <Field label="Nachricht" htmlFor="thread-body">
        <Textarea id="thread-body" name="body" maxLength={4000} required />
      </Field>
      <SubmitButton>Unterhaltung starten</SubmitButton>
    </form>
  );
}
