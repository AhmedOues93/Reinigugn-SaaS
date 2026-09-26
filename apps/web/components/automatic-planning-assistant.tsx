'use client';

import { useActionState } from 'react';
import { AlertCircle, CheckCircle2, WandSparkles } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { SubmitButton } from '@/components/form-controls';
import { initialPlanningState, type PlanningState, type PlanningVisit } from '@/lib/planning';
import { formatDate } from '@/lib/format';

type Action = (state: PlanningState, formData: FormData) => Promise<PlanningState>;

/** Blocked visits first: they are the only ones that need a decision. */
function order(visits: PlanningVisit[]) {
  return [...visits].sort((a, b) => {
    if (a.assigned !== b.assigned) return a.assigned ? 1 : -1;
    return (a.visitDate ?? '').localeCompare(b.visitDate ?? '') || a.objectName.localeCompare(b.objectName);
  });
}

function VisitRow({ visit }: { visit: PlanningVisit }) {
  return (
    <li
      className={cn(
        'border-s-[3px] bg-subtle px-3 py-2.5',
        visit.assigned ? 'border-s-success' : 'border-s-warning bg-warning-soft',
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[13px] font-semibold tabular-nums text-foreground">
          {visit.visitDate ? formatDate('de', visit.visitDate) : 'ohne Termin'}
        </span>
        {visit.start && visit.end && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {visit.start}–{visit.end}
          </span>
        )}
        <span className="break-anywhere text-[13px] font-medium text-foreground">
          {visit.objectName || visit.scheduleName}
        </span>
        {visit.customerName && (
          <span className="break-anywhere text-xs text-muted-foreground">{visit.customerName}</span>
        )}
      </div>
      <p className="mt-1 flex items-start gap-1.5 text-xs">
        {visit.assigned ? (
          <>
            <CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" aria-hidden="true" />
            <span className="break-anywhere text-muted-foreground">
              Zugewiesen an {visit.memberName ?? 'das Stammteam'}
            </span>
          </>
        ) : (
          <>
            <AlertCircle className="mt-px size-3.5 shrink-0 text-warning" aria-hidden="true" />
            <span className="break-anywhere font-medium text-foreground">
              Nicht zugewiesen – {visit.reason ?? 'Grund unbekannt.'}
            </span>
          </>
        )}
      </p>
    </li>
  );
}

export function AutomaticPlanningAssistant({
  from,
  to,
  action,
}: {
  from: string;
  to: string;
  action: Action;
}) {
  const [state, formAction] = useActionState(action, initialPlanningState);
  const visits = state.visits ?? [];

  return (
    <div className="mb-5 rounded-xl border border-border/80 bg-card p-4 shadow-card">
      <div className="sm:flex sm:items-start sm:justify-between sm:gap-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <WandSparkles className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-foreground">Intelligente Wochenplanung</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Prüft aktive Auto-Pläne gegen Wochenstunden, bestehende Einsätze, Urlaub, Krankheit,
            Beschäftigungszeitraum und Zeitkonflikte. Unsichere Zuweisungen werden nicht erzwungen –
            jeder offene Einsatz nennt seinen Grund.
          </p>
        </div>
        <form action={formAction} className="mt-4 shrink-0 sm:mt-0">
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <SubmitButton className="w-full sm:w-auto">
            <WandSparkles className="size-4" aria-hidden="true" />
            Zeitraum automatisch planen
          </SubmitButton>
        </form>
      </div>

      {state.message && (
        <p
          role={state.status === 'error' ? 'alert' : 'status'}
          className={cn(
            'mt-4 flex animate-fade-in items-start gap-2.5 border-s-2 px-3 py-2 text-sm leading-5 text-foreground',
            state.status === 'error'
              ? 'border-warning bg-warning/[0.045]'
              : 'border-success bg-success/[0.035]',
          )}
        >
          {state.status === 'error' ? (
            <AlertCircle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          )}
          <span className="break-anywhere">{state.message}</span>
        </p>
      )}

      {visits.length > 0 && (
        <ul className="mt-3 max-h-96 space-y-1.5 overflow-y-auto">
          {order(visits).map((visit, index) => (
            <VisitRow key={`${visit.scheduleId}-${visit.visitDate ?? 'none'}-${visit.start ?? index}`} visit={visit} />
          ))}
        </ul>
      )}
    </div>
  );
}
