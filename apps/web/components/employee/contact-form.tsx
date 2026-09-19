'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

/**
 * The contact details an employee maintains about themselves. The email field is
 * shown but read-only: it is the Supabase Auth identity, and changing it belongs
 * to the Auth email-change flow rather than to this profile row.
 */
export function EmployeeContactForm({
  locale,
  firstName,
  lastName,
  phone,
  email,
  action,
}: {
  locale: Locale;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  action: (state: FormState, data: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-4 p-5">
      <FormMessage status={state.status} message={state.message} />
      <Field label={t(locale, 'emp.profile.firstName')} htmlFor="first_name">
        <Input id="first_name" name="first_name" defaultValue={firstName ?? ''} maxLength={120} required autoComplete="given-name" />
      </Field>
      <Field label={t(locale, 'emp.profile.lastName')} htmlFor="last_name">
        <Input id="last_name" name="last_name" defaultValue={lastName ?? ''} maxLength={120} required autoComplete="family-name" />
      </Field>
      <Field label={t(locale, 'emp.profile.phone')} htmlFor="phone">
        <Input id="phone" name="phone" type="tel" defaultValue={phone ?? ''} maxLength={64} autoComplete="tel" />
      </Field>
      <Field label={t(locale, 'auth.email')} hint={t(locale, 'emp.profile.emailReadOnly')} htmlFor="email">
        <Input id="email" defaultValue={email ?? ''} readOnly aria-readonly="true" className="bg-muted text-muted-foreground" />
      </Field>
      <SubmitButton locale={locale} size="block">
        {t(locale, 'common.save')}
      </SubmitButton>
    </form>
  );
}
