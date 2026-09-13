'use client';

import { useActionState } from 'react';
import { initialFormState, type FormState } from '@/lib/actions';
import { FormMessage, SubmitButton } from '@/components/form-controls';

export function AbsenceForm({ action }: { action: (state: FormState, data: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return <form action={formAction} className="grid gap-4 sm:grid-cols-2"><FormMessage status={state.status} message={state.message} /><label className="text-sm font-medium">Art<select className="mt-1 block h-10 w-full rounded border bg-white px-3" name="type"><option value="VACATION">Urlaub</option><option value="SICKNESS">Krankheit</option></select></label><label className="text-sm font-medium">Beginn<input className="mt-1 block h-10 w-full rounded border px-3" name="start_date" type="date" required /></label><label className="text-sm font-medium">Voraussichtliches Ende<input className="mt-1 block h-10 w-full rounded border px-3" name="end_date" type="date" required /></label><label className="text-sm font-medium sm:col-span-2">Optionale Notiz<textarea className="mt-1 block min-h-24 w-full rounded border p-3" name="note" maxLength={1000} /></label><div className="sm:col-span-2"><SubmitButton>Abwesenheit melden</SubmitButton></div></form>;
}
