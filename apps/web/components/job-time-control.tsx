'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { FormMessage } from '@/components/form-controls';
import { initialFormState } from '@/lib/actions';

type Action = (state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState>;

function TimeSubmitButton({ running }: { running: boolean }) { const { pending } = useFormStatus(); return <button className="h-14 w-full rounded-md bg-teal-700 text-base font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={pending}>{pending ? (running ? 'Wird beendet...' : 'Wird gestartet...') : (running ? 'BEENDEN' : 'START')}</button>; }

export function JobTimeControl({ action, running, startedAt, finishedAt, durationMinutes, incompleteRequiredItems = 0 }: { action: Action; running: boolean; startedAt?: string | null; finishedAt?: string | null; durationMinutes?: number | null; incompleteRequiredItems?: number }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const format = (value?: string | null) => value ? new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
  const duration = durationMinutes === null || durationMinutes === undefined ? null : `${Math.floor(durationMinutes / 60)} h ${durationMinutes % 60} min`;
  return <section className="rounded-lg border-2 border-teal-700 bg-teal-50 p-5"><FormMessage status={state.status} message={state.message} />{running ? <><p className="text-sm font-medium text-teal-900">Gestartet um {format(startedAt)}</p><p className="mt-1 text-sm text-teal-800">Arbeitszeit laeuft</p>{incompleteRequiredItems > 0 && <p className="mt-4 rounded-md bg-amber-100 p-3 text-sm text-amber-950">Vor dem Beenden sind noch {incompleteRequiredItems} erforderliche Checklistenpunkte offen. Der Einsatz kann bei Bedarf trotzdem beendet werden.</p>}<form action={formAction} className="mt-5"><TimeSubmitButton running /></form></> : finishedAt ? <><p className="font-semibold text-teal-950">Beendet</p><p className="mt-2 text-sm text-teal-900">{format(startedAt)} bis {format(finishedAt)}{duration ? ` · ${duration}` : ''}</p></> : <form action={formAction}><p className="mb-4 text-sm text-teal-900">Starten Sie den Einsatz erst, wenn Sie mit der Arbeit beginnen.</p><TimeSubmitButton running={false} /></form>}</section>;
}
