'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { changeOwnPassword } from '@/app/account/actions';
import { initialFormState } from '@/lib/actions';
import { Field, Input } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form-controls';

export function AccountPasswordForm() {
  const [state, action] = useActionState(changeOwnPassword, initialFormState);

  return (
    <form action={action} className="space-y-4">
      <FormMessage status={state.status} message={state.message} />
      <Field label="Aktuelles Passwort" htmlFor="account-current-password">
        <Input
          id="account-current-password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <Field
        label="Neues Passwort"
        hint="Mindestens 12 Zeichen."
        htmlFor="account-new-password"
      >
        <Input
          id="account-new-password"
          name="new_password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
      </Field>
      <Field label="Neues Passwort wiederholen" htmlFor="account-confirm-password">
        <Input
          id="account-confirm-password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Passwort ändern</SubmitButton>
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
          Passwort vergessen?
        </Link>
      </div>
    </form>
  );
}
