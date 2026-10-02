'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { acceptInvitation, signUpFromInvitation } from '@/app/dashboard/mitarbeiter/actions';
import { initialFormState } from '@/lib/actions';
import { Field, Input } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { t, type Locale } from '@/lib/i18n';

export function InvitationSignUp({ locale = 'de' }: { locale?: Locale }) {
  const [state, action] = useActionState(signUpFromInvitation, initialFormState);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success' && state.id === 'accepted') router.push(state.redirectTo ?? '/dashboard');
  }, [router, state]);

  return (
    <form action={action} className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <Field label={t(locale, 'auth.inviteSetPassword')} hint={t(locale, 'auth.passwordHint')} htmlFor="invite-password">
        <Input id="invite-password" name="password" type="password" autoComplete="new-password" minLength={12} required />
      </Field>
      <Field label="Passwort wiederholen" htmlFor="invite-password-confirmation">
        <Input id="invite-password-confirmation" name="password_confirmation" type="password" autoComplete="new-password" minLength={12} required />
      </Field>
      <SubmitButton locale={locale} size="block">
        {t(locale, 'auth.inviteCreateAccount')}
      </SubmitButton>
    </form>
  );
}

export function InvitationAcceptButton({ locale = 'de' }: { locale?: Locale }) {
  const [state, action] = useActionState(acceptInvitation, initialFormState);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success') router.push(state.redirectTo ?? '/dashboard');
  }, [router, state]);

  return (
    <form action={action} className="space-y-4">
      <FormMessage status={state.status} message={state.message} />
      <p className="text-sm leading-6 text-muted-foreground">
        Deine E-Mail-Adresse wurde über den Einladungslink bestätigt. Lege jetzt dein ReinPlan-Passwort fest.
      </p>
      <Field label={t(locale, 'auth.inviteSetPassword')} hint={t(locale, 'auth.passwordHint')} htmlFor="invite-accept-password">
        <Input id="invite-accept-password" name="password" type="password" autoComplete="new-password" minLength={12} required />
      </Field>
      <Field label="Passwort wiederholen" htmlFor="invite-accept-password-confirmation">
        <Input id="invite-accept-password-confirmation" name="password_confirmation" type="password" autoComplete="new-password" minLength={12} required />
      </Field>
      <SubmitButton locale={locale} size="block">
        Passwort speichern und Einladung annehmen
      </SubmitButton>
    </form>
  );
}
