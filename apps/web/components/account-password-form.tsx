'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { requestOwnPasswordChange } from '@/app/account/actions';
import { initialFormState } from '@/lib/actions';
import { FormMessage, SubmitButton } from '@/components/form-controls';

export function AccountPasswordForm() {
  const [state, action] = useActionState(requestOwnPasswordChange, initialFormState);

  return (
    <form action={action} className="space-y-4">
      <FormMessage status={state.status} message={state.message} />
      <p className="text-sm leading-6 text-muted-foreground">
        Aus Sicherheitsgründen wird das Passwort nicht direkt hier geändert. Wir senden zuerst einen
        Bestätigungslink an deine angemeldete E-Mail-Adresse.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Passwort per E-Mail ändern</SubmitButton>
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
          Passwort vergessen?
        </Link>
      </div>
    </form>
  );
}
