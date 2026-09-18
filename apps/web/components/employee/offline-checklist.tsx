'use client';

import { useState, useTransition } from 'react';
import { CloudOff } from 'lucide-react';
import { FormMessage } from '@/components/form-controls';
import { Card } from '@/components/ui';
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
    <Card className="p-5">
      <h2 className="text-base font-semibold tracking-tight">{t(locale, 'emp.job.checklist')}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t(locale, 'emp.job.checklistProgress', { done, total: sorted.length })}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" role="presentation">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.round((done / sorted.length) * 100)}%` }} />
      </div>

      <FormMessage status={state.status} message={state.message} />

      <ol className="mt-5 space-y-4">
        {sorted.map((item) => {
          const completed = isDone(item);
          return (
            <li key={item.id} className="rounded-md border border-border p-4">
              <p className="font-medium">
                {item.title}
                {!item.is_required && (
                  <span className="ms-2 text-xs font-normal text-muted-foreground">{t(locale, 'common.optional')}</span>
                )}
              </p>
              {item.instruction && <p className="mt-2 text-sm text-muted-foreground">{item.instruction}</p>}
              {queued[item.id] && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <CloudOff className="size-3.5 shrink-0" aria-hidden="true" />
                  {t(locale, 'emp.sync.pending', { count: 1 })}
                </p>
              )}
              <button
                type="button"
                onClick={() => toggle(item)}
                disabled={busy}
                aria-pressed={completed}
                className={`mt-4 min-h-12 w-full rounded-md border-2 px-4 text-start text-base font-semibold transition-colors disabled:opacity-60 ${
                  completed
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-input bg-card text-foreground hover:border-primary'
                }`}
              >
                {t(locale, completed ? 'emp.checklist.reopen' : 'emp.checklist.markDone')}
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
