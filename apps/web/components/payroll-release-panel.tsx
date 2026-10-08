'use client';

import { useActionState, useState } from 'react';
import { CheckCircle2, Lock, LockOpen } from 'lucide-react';
import { Textarea } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';
import type { PayrollState } from '@/lib/data/monthly-summary';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * Der Stand eines Lohnmonats, und der eine Knopf, der ihn ändert.
 *
 * Bewusst zwei getrennte Zustände statt eines Schalters: Freigeben ist
 * Routine, Wiederöffnen ist eine Entscheidung mit Begründung. Ein Schalter
 * würde beides gleich aussehen lassen.
 */
export function PayrollReleasePanel({
  month,
  state,
  canReopen,
  releaseAction,
  reopenAction,
}: {
  month: string;
  state: PayrollState;
  /** Nur die Inhaberin darf wieder öffnen; das Büro sieht den Grund, nicht den Knopf. */
  canReopen: boolean;
  releaseAction: Action;
  reopenAction: Action;
}) {
  const [releaseState, release] = useActionState(releaseAction, initialFormState);
  const [reopenState, reopen] = useActionState(reopenAction, initialFormState);
  const [showReopen, setShowReopen] = useState(false);
  const released = state.status === 'RELEASED';

  const releasedAt = state.released_at
    ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(
        new Date(state.released_at),
      )
    : null;

  return (
    <section
      aria-labelledby="payroll-state-title"
      className={`mb-5 rounded-xl border p-4 shadow-card sm:p-5 ${released ? 'border-success/30 bg-success-soft' : 'border-border/80 bg-card'}`}
    >
      <div className="sm:flex sm:items-start sm:justify-between sm:gap-5">
        <div className="min-w-0">
          <h2 id="payroll-state-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {released ? (
              <Lock className="size-4 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <LockOpen className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            {released ? 'Freigegeben' : 'Noch nicht freigegeben'}
          </h2>
          <p className="break-anywhere mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
            {released
              ? `Die Zahlen sind eingefroren. Arbeitszeiten dieses Monats lassen sich nicht mehr ändern, und der Export liefert immer dieselbe Datei.${releasedAt ? ` Freigegeben am ${releasedAt}${state.released_by_name ? ` von ${state.released_by_name}` : ''}${state.sequence && state.sequence > 1 ? `, Freigabe Nr. ${state.sequence}` : ''}.` : ''}`
              : 'Solange der Monat offen ist, ändern sich die Zahlen mit jeder Korrektur. Für die Lohnabrechnung einmal freigeben – danach sind sie fest.'}
          </p>
          {state.reopen_reason && (
            <p className="break-anywhere mt-2 text-xs leading-5 text-muted-foreground">
              Zuletzt wieder geöffnet: {state.reopen_reason}
            </p>
          )}
        </div>

        <div className="mt-4 shrink-0 sm:mt-0">
          {released ? (
            canReopen && (
              <button
                type="button"
                onClick={() => setShowReopen((value) => !value)}
                className="min-h-touch text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                Monat wieder öffnen
              </button>
            )
          ) : (
            <form action={release}>
              <input type="hidden" name="monat" value={month} />
              <SubmitButton className="w-full sm:w-auto">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Monat freigeben
              </SubmitButton>
            </form>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <FormMessage status={releaseState.status} message={releaseState.message} />
        <FormMessage status={reopenState.status} message={reopenState.message} />
      </div>

      {released && canReopen && showReopen && (
        <form action={reopen} className="mt-4 border-t border-border/70 pt-4">
          <input type="hidden" name="monat" value={month} />
          <label className="block text-sm font-medium text-foreground" htmlFor="reopen-reason">
            Warum wird der Monat wieder geöffnet?
          </label>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Die bisherige Freigabe bleibt erhalten und bleibt exportierbar – der Lohnlauf von damals ist also weiterhin
            nachvollziehbar.
          </p>
          <Textarea
            id="reopen-reason"
            name="grund"
            required
            minLength={3}
            maxLength={1000}
            rows={2}
            className="mt-2"
            placeholder="z. B. Krankmeldung wurde nachgereicht"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <SubmitButton variant="outline">
              <LockOpen className="size-4" aria-hidden="true" />
              Wieder öffnen
            </SubmitButton>
            <button
              type="button"
              onClick={() => setShowReopen(false)}
              className="min-h-touch px-2 text-sm text-muted-foreground hover:text-foreground"
            >
              Abbrechen
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
