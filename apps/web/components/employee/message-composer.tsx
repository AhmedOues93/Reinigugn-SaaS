'use client';

import { useActionState, useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input, Textarea } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

/**
 * Messaging is online only, by design.
 *
 * A queued message would sit on the phone while the cleaner believed the office
 * had been told — for a sick call or a locked door that is worse than a clear
 * refusal. So nothing here is ever written to the offline queue: while the
 * device reports no connection the form is disabled and says why.
 */
function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

function OfflineNotice({ locale }: { locale: Locale }) {
  return (
    <p className="flex items-start gap-2.5 rounded-md bg-muted p-3 text-sm text-muted-foreground" role="status">
      <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{t(locale, 'emp.messages.offlineHint')}</span>
    </p>
  );
}

export function NewThreadForm({
  locale,
  action,
}: {
  locale: Locale;
  action: (state: FormState, data: FormData) => Promise<FormState>;
}) {
  const online = useOnline();
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="space-y-4">
      <FormMessage status={state.status} message={state.message} />
      {!online && <OfflineNotice locale={locale} />}
      <Field label={t(locale, 'emp.messages.subject')} htmlFor="subject">
        <Input id="subject" name="subject" maxLength={200} required disabled={!online} />
      </Field>
      <Field label={t(locale, 'emp.messages.body')} htmlFor="body">
        <Textarea id="body" name="body" maxLength={4000} required disabled={!online} />
      </Field>
      <SubmitButton locale={locale} size="block">
        {t(locale, 'emp.messages.send')}
      </SubmitButton>
    </form>
  );
}

export function ReplyForm({
  locale,
  action,
}: {
  locale: Locale;
  action: (state: FormState, data: FormData) => Promise<FormState>;
}) {
  const online = useOnline();
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="mt-5 space-y-3">
      <FormMessage status={state.status} message={state.message} />
      {!online && <OfflineNotice locale={locale} />}
      <Field label={t(locale, 'emp.messages.body')} htmlFor="reply-body">
        <Textarea id="reply-body" name="body" maxLength={4000} required disabled={!online} />
      </Field>
      <SubmitButton locale={locale} size="block">
        {t(locale, 'emp.messages.send')}
      </SubmitButton>
    </form>
  );
}
