'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { CheckCircle2, Coffee, Loader2, Play, Square, WifiOff } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { FormMessage } from '@/components/form-controls';
import { useOffline } from '@/components/employee/offline-provider';
import { initialFormState } from '@/lib/actions';
import { localeTag, t, type Locale } from '@/lib/i18n';

type Action = (state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState>;
type Break = { started_at: string; ended_at: string | null };

function ActionButton({
  children,
  pendingLabel,
  variant,
  icon: Icon,
  disabled,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant: 'go' | 'stop' | 'quiet';
  icon: typeof Play;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      className={cn(
        'flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl px-4 text-base font-semibold transition-[background-color,transform] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60',
        variant === 'go' && 'bg-highlight text-ink hover:bg-[hsl(185_64%_68%)]',
        variant === 'stop' && 'bg-white text-ink hover:bg-white/90',
        variant === 'quiet' && 'border border-white/20 bg-white/[0.06] text-white hover:bg-white/[0.12]',
      )}
    >
      {pending ? <Loader2 className="size-5 motion-safe:animate-spin" aria-hidden="true" /> : <Icon className="size-5" aria-hidden="true" />}
      {pending ? pendingLabel : children}
    </button>
  );
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * The field worker's clock, as the hero of the job screen.
 *
 * The server is the clock: start, pause, resume and finish are RPCs that stamp
 * server time, and this component only renders what they recorded. The ticking
 * counter is derived from those stamps (gross time minus breaks) so it can never
 * disagree with the stored net duration after a refresh.
 */
export function JobTimeControl({
  startAction,
  stopAction,
  pauseAction,
  resumeAction,
  running,
  startedAt,
  plannedStartAt,
  finishedAt,
  durationMinutes,
  breaks = [],
  incompleteRequiredItems = 0,
  canStart = true,
  locale = 'de',
}: {
  startAction: Action;
  stopAction: Action;
  pauseAction: Action;
  resumeAction: Action;
  running: boolean;
  startedAt?: string | null;
  plannedStartAt?: string | null;
  finishedAt?: string | null;
  durationMinutes?: number | null;
  breaks?: Break[];
  incompleteRequiredItems?: number;
  canStart?: boolean;
  locale?: Locale;
}) {
  const [startState, start] = useActionState(startAction, initialFormState);
  const [confirmStart, setConfirmStart] = useState(false);
  const [stopState, stop] = useActionState(stopAction, initialFormState);
  const [pauseState, pause] = useActionState(pauseAction, initialFormState);
  const [resumeState, resume] = useActionState(resumeAction, initialFormState);
  const offline = useOffline();
  const online = offline?.online ?? true;
  const openBreak = breaks.find((entry) => !entry.ended_at);
  const paused = running && Boolean(openBreak);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const time = (value?: string | null) =>
    value ? new Intl.DateTimeFormat(localeTag(locale), { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' }).format(new Date(value)) : '—';

  const breakMs = breaks.reduce(
    (total, entry) => total + ((entry.ended_at ? new Date(entry.ended_at).getTime() : now) - new Date(entry.started_at).getTime()),
    0,
  );
  const netMs = startedAt ? Math.max(0, now - new Date(startedAt).getTime() - breakMs) : 0;
  const netSeconds = Math.floor(netMs / 1000);
  const clock = `${pad(Math.floor(netSeconds / 3600))}:${pad(Math.floor((netSeconds % 3600) / 60))}:${pad(netSeconds % 60)}`;
  const breakMinutes = Math.floor(breakMs / 60000);
  const latest = [resumeState, pauseState, stopState, startState].find((state) => state.message);

  return (
    <section
      aria-labelledby="time-title"
      className={cn('surface-ink relative overflow-hidden rounded-3xl p-5 shadow-raised sm:p-6', paused && '[background-image:none] bg-[hsl(32_40%_18%)]')}
    >
      <h2 id="time-title" className="sr-only">
        {t(locale, 'emp.job.timeTitle')}
      </h2>

      {latest?.status === 'error' && (
        <div className="mb-4 [&_p]:bg-white [&_p]:text-danger">
          <FormMessage status="error" message={latest.message} />
        </div>
      )}

      {finishedAt ? (
        <div className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-highlight/15 text-highlight">
            <CheckCircle2 className="size-6" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-white">{t(locale, 'emp.job.finishedLabel')}</p>
            <p className="text-sm tabular-nums text-ink-muted">
              {time(startedAt)} – {time(finishedAt)}
              {durationMinutes != null && ` · ${Math.floor(durationMinutes / 60)} h ${pad(durationMinutes % 60)} min`}
              {breakMinutes > 0 && ` · ${t(locale, 'emp.job.breakTime')} ${breakMinutes} min`}
            </p>
          </div>
        </div>
      ) : running ? (
        <>
          <p className="flex items-center gap-2 text-sm font-medium text-ink-muted">
            <span className={cn('size-2 rounded-full', paused ? 'bg-[hsl(38_95%_60%)]' : 'bg-highlight motion-safe:animate-pulse-dot')} aria-hidden="true" />
            {paused ? t(locale, 'emp.job.pausedSince', { time: time(openBreak?.started_at) }) : t(locale, 'emp.job.startedAtLabel', { time: time(startedAt) })}
          </p>
          <p className="mt-2 text-[3.25rem] font-semibold leading-none tracking-tight tabular-nums text-white" aria-live="off" suppressHydrationWarning>
            {clock}
          </p>
          <p className="mt-2 text-sm text-ink-muted" suppressHydrationWarning>
            {t(locale, 'emp.job.netTime')}
            {breakMinutes > 0 && ` · ${t(locale, 'emp.job.breakTime')} ${breakMinutes} min`}
          </p>

          {incompleteRequiredItems > 0 && !paused && (
            <p className="mt-4 rounded-xl bg-white/[0.07] px-3.5 py-2.5 text-sm text-[hsl(38_95%_72%)]">
              {t(locale, 'emp.job.requiredWarning', { count: incompleteRequiredItems })}
            </p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {paused ? (
              <form action={resume} className="col-span-2">
                <ActionButton variant="go" icon={Play} pendingLabel={t(locale, 'auth.working')} disabled={!online}>
                  {t(locale, 'emp.job.resume')}
                </ActionButton>
              </form>
            ) : (
              <form action={pause}>
                <ActionButton variant="quiet" icon={Coffee} pendingLabel={t(locale, 'auth.working')} disabled={!online}>
                  {t(locale, 'emp.job.pause')}
                </ActionButton>
              </form>
            )}
            <form action={stop} className={paused ? 'col-span-2' : undefined}>
              <ActionButton variant={paused ? 'quiet' : 'stop'} icon={Square} pendingLabel={t(locale, 'emp.job.stopping')} disabled={!online}>
                {paused ? t(locale, 'emp.job.stop') : t(locale, 'emp.job.finish')}
              </ActionButton>
            </form>
          </div>
        </>
      ) : confirmStart ? (
        <div className="rounded-2xl border border-white/15 bg-white/[0.06] p-4">
          <p className="text-base font-semibold text-white">Einsatz jetzt starten?</p>
          <p className="mt-1 text-sm leading-6 text-ink-muted">
            {plannedStartAt
              ? `Geplant ab ${time(plannedStartAt)}. Die Arbeitszeit beginnt sofort mit deiner Bestätigung.`
              : 'Die Arbeitszeit beginnt sofort mit deiner Bestätigung.'}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setConfirmStart(false)}
              className="min-h-12 rounded-xl border border-white/20 px-3 text-sm font-semibold text-white"
            >
              Abbrechen
            </button>
            <form action={start}>
              <ActionButton variant="go" icon={Play} pendingLabel={t(locale, 'emp.job.starting')} disabled={!online || !canStart}>
                Jetzt starten
              </ActionButton>
            </form>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-ink-muted">
            {plannedStartAt ? `Geplanter Start: ${time(plannedStartAt)}` : t(locale, 'emp.job.startHint')}
          </p>
          <button
            type="button"
            disabled={!online || !canStart}
            onClick={() => setConfirmStart(true)}
            className="mt-4 flex min-h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-highlight px-4 text-base font-semibold text-ink transition active:scale-[0.99] disabled:opacity-60"
          >
            <Play className="size-5" aria-hidden="true" />
            {t(locale, 'emp.job.start')}
          </button>
        </div>
      )}

      {!online && !finishedAt && (
        <p className="mt-4 flex items-start gap-2 text-sm text-ink-muted" role="status">
          <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t(locale, 'emp.job.needsConnection')}
        </p>
      )}
      {latest?.status === 'success' && (
        <p className="sr-only" role="status">
          {latest.message}
        </p>
      )}
    </section>
  );
}
