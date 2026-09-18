'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Textarea } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';

export function StaffReplyForm({ action }: { action: (state: FormState, data: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="mt-5 space-y-3">
      <FormMessage status={state.status} message={state.message} />
      <Field label="Antwort" htmlFor="staff-reply">
        <Textarea id="staff-reply" name="body" maxLength={4000} required />
      </Field>
      <SubmitButton>Senden</SubmitButton>
    </form>
  );
}
