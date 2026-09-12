'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/form-controls';
import { initialFormState } from '@/lib/actions';

type Action = (state: typeof initialFormState, formData: FormData) => Promise<typeof initialFormState>;

export function JobTimeControl({ action, running, startedAt, finishedAt, durationMinutes }: { action: Action; running: boolean; startedAt?: string | null; finishedAt?: string | null; durationMinutes?: number | null }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const format = (value?: string | null) => value ? new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
  const duration = durationMinutes === null || durationMinutes === undefined ? null : `${Math.floor(durationMinutes / 60)} h ${durationMinutes % 60} min`;
  return <section className="rounded-lg border-2 border-teal-700 bg-teal-50 p-5"><FormMessage status={state.status} message={state.message} />{running ? <><p className="text-sm font-medium text-teal-900">Gestartet um {format(startedAt)}</p><p className="mt-1 text-sm text-teal-800">Arbeitszeit laeuft</p><form action={formAction} className="mt-5"><button className="h-14 w-full rounded-md bg-teal-700 text-base font-semibold text-white hover:bg-teal-800" type="submit">BEENDEN</button></form></> : finishedAt ? <><p className="font-semibold text-teal-950">Beendet</p><p className="mt-2 text-sm text-teal-900">{format(startedAt)} bis {format(finishedAt)}{duration ? ` · ${duration}` : ''}</p></> : <form action={formAction}><p className="mb-4 text-sm text-teal-900">Starten Sie den Einsatz erst, wenn Sie mit der Arbeit beginnen.</p><button className="h-14 w-full rounded-md bg-teal-700 text-base font-semibold text-white hover:bg-teal-800" type="submit">START</button></form>}</section>;
}
