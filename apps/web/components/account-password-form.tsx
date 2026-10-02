'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { KeyRound, Mail, X } from 'lucide-react';
import { requestOwnEmailChange, requestOwnPasswordChange } from '@/app/account/actions';
import { initialFormState } from '@/lib/actions';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Button, Field, Input } from '@/components/ui';

export function AccountPasswordForm() {
  const [passwordState, passwordAction] = useActionState(requestOwnPasswordChange, initialFormState);
  const [emailState, emailAction] = useActionState(requestOwnEmailChange, initialFormState);
  const [mode, setMode] = useState<'NONE' | 'EMAIL'>('NONE');

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <form action={passwordAction} className="rounded-xl border border-border/80 p-4">
          <FormMessage status={passwordState.status} message={passwordState.message} />
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><KeyRound className="size-4" /></span>
            <div className="min-w-0">
              <p className="font-semibold">Passwort ändern</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">Wir senden einen verifizierten Link an deine aktuelle E-Mail-Adresse.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <SubmitButton>Link senden</SubmitButton>
            <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">Passwort vergessen?</Link>
          </div>
        </form>

        <div className="rounded-xl border border-border/80 p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary"><Mail className="size-4" /></span>
            <div className="min-w-0">
              <p className="font-semibold">E-Mail-Adresse ändern</p>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">Aktuelles Passwort bestätigen, danach die neue Adresse per E-Mail verifizieren.</p>
            </div>
          </div>
          {mode === 'NONE' ? (
            <Button type="button" variant="outline" className="mt-4" onClick={() => setMode('EMAIL')}>E-Mail ändern</Button>
          ) : (
            <form action={emailAction} className="mt-4 space-y-3">
              <FormMessage status={emailState.status} message={emailState.message} />
              <Field label="Neue E-Mail-Adresse" htmlFor="new-account-email">
                <Input id="new-account-email" name="new_email" type="email" autoComplete="email" required />
              </Field>
              <Field label="Aktuelles Passwort" htmlFor="current-account-password">
                <Input id="current-account-password" name="current_password" type="password" autoComplete="current-password" required />
              </Field>
              <div className="flex flex-wrap gap-2">
                <SubmitButton>Bestätigungslink senden</SubmitButton>
                <Button type="button" variant="outline" onClick={() => setMode('NONE')}><X className="size-4" />Abbrechen</Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
