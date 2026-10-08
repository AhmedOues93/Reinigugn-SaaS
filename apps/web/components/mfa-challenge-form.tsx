'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { verifyMfaChallenge } from '@/app/dashboard/sicherheit/actions';
import { initialFormState } from '@/lib/actions';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input } from '@/components/ui';

export function MfaChallengeForm() {
  const [state, action] = useActionState(verifyMfaChallenge, initialFormState);
  const router = useRouter();

  useEffect(() => {
    // Der Riegel laesst erst durch, wenn die Sitzung auf aal2 steht; das
    // entscheidet der Server, darum ein echter Seitenwechsel und kein
    // lokaler Zustand.
    if (state.status === 'success' && state.redirectTo) router.replace(state.redirectTo);
  }, [state, router]);

  return (
    <form action={action} className="space-y-4">
      <Field label="Code aus der App" htmlFor="mfa-challenge-code">
        <Input
          id="mfa-challenge-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          autoFocus
          required
        />
      </Field>
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton className="w-full">Weiter</SubmitButton>
    </form>
  );
}
