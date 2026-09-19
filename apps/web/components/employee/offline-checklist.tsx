'use client';

import { useState, useTransition } from 'react';
import { CloudOff } from 'lucide-react';
import { FormMessage } from '@/components/form-controls';
import { useOffline } from '@/components/employee/offline-provider';
import { initialFormState, type FormState } from '@/lib/actions';
import { t, type Locale } from '@/lib/i18n';

type Item = { id: string; position: number; title: string; instruction: string | null; is_required: boolean; completed_at: string | null };

/**
 * The checklist a cleaner actually taps through, online or not.
 *
 * Online it goes straight to the existing employee-scoped action. Offline the
 * tap is written to the local queue and marked "waiting" — never shown as
 * saved — and replayed on reconnect through `sync_my_checklist_item`, which is
 * idempotent and refuses to overwrite a newer office change.
 */
export function OfflineJobChecklist({
  items,
  completeItem,
  locale,
}: {
  items: Item[];
  completeItem: (itemId: string, completed: boolean, state: FormState, formData: FormData) => Promise<FormState>;
  locale: Locale;
}) {
  const offline = useOffline();
  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [queued, setQueued] = useState<Record<string, true>>({});
  const [state, setState] = useState<FormState>(initialFormState);
  const [busy, startTransition] = useTransition();

  const sorted = [...items].sort((a, b) => a.position - b.position);
  const isDone = (item: Item) => local[item.id] ?? Boolean(item.completed_at);
  const done = sorted.filter(isDone).length;

  const toggle = (item: Item) => {
    const next = !isDone(item);
    if (offline && !offline.online) {
      setLocal((value) => ({ ...value, [item.id]: next }));
      setQueued((value) => ({ ...value, [item.id]: true }));
      void offline.queueChecklistItem(item.id, next);
      setState(initialFormState);
      return;
    }
    startTransition(async () => {
      const result = await completeItem(item.id, next, initialFormState, new FormData());
      setState(result);
      if (result.status !== 'error') setLocal((value) => ({ ...value, [item.id]: next }));
    });
  };

  if (sorted.length === 0) return null;

  return (
    <section aria-labelledby="checklist-title" className="overflow-hidden rounded-3xl border border-border/80 bg-card shadow-card">
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-5">
        <h2 id="checklist-title" className="text-lg font-semibold">
          {t(locale, 'emp.job.checklist')}
        </h2>
        <span className="rounded-full bg-muted px-2.5 py-1 text-sm font-semibold tabular-nums">
          {t(locale, 'emp.job.stepsDone', { done, total: sorted.length })}
        </span>
      </div>
      <div className="mx-5 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={sorted.length} aria-valuenow={done} aria-label={t(locale, 'emp.job.checklistProgress', { done, total: sorted.length })}>
        <div className="h-full rounded-full bg-success transition-all duration-500" style={{ width: `${Math.round((done / sorted.length) * 100)}%` }} />
      </div>

      {state.message && (
        <div className="px-5 pt-3">
          <FormMessage status={state.status} message={state.message} />
        </div>
      )}

      <ol className="mt-3 divide-y divide-border/70 border-t border-border/70">
        {sorted.map((item) => {
          const completed = isDone(item);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => toggle(item)}
                disabled={busy}
                aria-pressed={completed}
                className="flex min-h-16 w-full items-start gap-4 px-5 py-4 text-start transition-colors hover:bg-subtle active:bg-muted disabled:opacity-60"
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                    completed ? 'border-success bg-success text-white' : 'border-input bg-card'
                  }`}
                >
                  {completed && (
                    <svg viewBox="0 0 16 16" className="size-4">
                      <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-base font-medium ${completed ? 'text-muted-foreground line-through decoration-muted-foreground/40' : 'text-foreground'}`}>
                    {item.title}
                    {!item.is_required && <span className="ms-2 text-xs font-normal text-muted-foreground no-underline">{t(locale, 'common.optional')}</span>}
                  </span>
                  {item.instruction && <span className="mt-1 block text-sm leading-6 text-muted-foreground">{item.instruction}</span>}
                  {queued[item.id] && (
                    <span className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-warning">
                      <CloudOff className="size-3.5 shrink-0" aria-hidden="true" />
                      {t(locale, 'emp.sync.pending', { count: 1 })}
                    </span>
                  )}
                  <span className="sr-only">{t(locale, completed ? 'emp.checklist.reopen' : 'emp.checklist.markDone')}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
