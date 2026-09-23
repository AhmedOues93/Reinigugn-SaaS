'use client';

import { useActionState } from 'react';
import { WandSparkles } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function AutomaticPlanningAssistant({
  weekStart,
  action,
}: {
  weekStart: string;
  action: Action;
}) {
  const [state, formAction] = useActionState(action, initialFormState);

  return (
    <div className="mb-5 rounded-xl border border-border/80 bg-card p-4 shadow-card sm:flex sm:items-center sm:justify-between sm:gap-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <WandSparkles className="size-4 text-primary" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground">Intelligente Wochenplanung</h2>
        </div>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Prüft aktive Auto-Pläne gegen Wochenstunden, bestehende Einsätze, Urlaub, Krankheit,
          Beschäftigungszeitraum und Zeitkonflikte. Unsichere Zuweisungen werden nicht erzwungen.
        </p>
        <div className="mt-3">
          <FormMessage status={state.status} message={state.message} />
        </div>
      </div>
      <form action={formAction} className="mt-4 shrink-0 sm:mt-0">
        <input type="hidden" name="week_start" value={weekStart} />
        <SubmitButton>
          <WandSparkles className="size-4" aria-hidden="true" />
          Woche automatisch planen
        </SubmitButton>
      </form>
    </div>
  );
}
