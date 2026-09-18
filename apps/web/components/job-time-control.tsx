'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { FormMessage } from '@/components/form-controls';
import { initialFormState } from '@/lib/actions';
import { localeTag, t, type Locale } from '@/lib/i18n';

type Action = (state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState>;

function TimeSubmitButton({ running, locale }: { running: boolean; locale: Locale }) {
  const { pending } = useFormStatus();
  const label = pending
    ? t(locale, running ? 'emp.job.stopping' : 'emp.job.starting')
    : t(locale, running ? 'emp.job.stop' : 'emp.job.start');
  return (
    <button
      className="min-h-14 w-full rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
      type="submit"
      disabled={pending}
    >
      {label}
    </button>
  );
}

/**
 * START / BEENDEN control. The database functions are the clock; this only shows
 * what the server reported and submits the narrow RPC-backed action.
 */
export function JobTimeControl({
  action,
  running,
  startedAt,
  finishedAt,
  durationMinutes,
  incompleteRequiredItems = 0,
  locale = 'de',
}: {
  action: Action;
  running: boolean;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMinutes?: number | null;
  incompleteRequiredItems?: number;
  locale?: Locale;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const format = (value?: string | null) =>
    value
      ? new Intl.DateTimeFormat(localeTag(locale), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(
          new Date(value),
        )
      : '—';
  const duration =
    durationMinutes === null || durationMinutes === undefined
      ? null
      : `${Math.floor(durationMinutes / 60)} h ${durationMinutes % 60} min`;

  return (
    <section className="rounded-lg border-2 border-primary bg-primary/5 p-5">
      <FormMessage status={state.status} message={state.message} />
      {running ? (
        <>
          <p className="text-sm font-medium text-slate-900">{t(locale, 'emp.job.startedAtLabel', { time: format(startedAt) })}</p>
          <p className="mt-1 text-sm text-slate-700">{t(locale, 'emp.job.runningNow')}</p>
          {incompleteRequiredItems > 0 && (
            <p className="mt-4 rounded-md bg-amber-100 p-3 text-sm text-amber-950">
              {t(locale, 'emp.job.requiredWarning', { count: incompleteRequiredItems })}
            </p>
          )}
          <form action={formAction} className="mt-5">
            <TimeSubmitButton running locale={locale} />
          </form>
        </>
      ) : finishedAt ? (
        <>
          <p className="font-semibold text-slate-900">{t(locale, 'emp.job.finishedLabel')}</p>
          <p className="mt-2 text-sm text-slate-700">
            {format(startedAt)} – {format(finishedAt)}
            {duration ? ` · ${duration}` : ''}
          </p>
        </>
      ) : (
        <form action={formAction}>
          <p className="mb-4 text-sm text-slate-700">{t(locale, 'emp.job.startHint')}</p>
          <TimeSubmitButton running={false} locale={locale} />
        </form>
      )}
    </section>
  );
}
