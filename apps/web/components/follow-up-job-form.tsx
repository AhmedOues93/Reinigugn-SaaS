'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Employee = { id: string; name: string };
export function FollowUpJobForm({ action, employees }: { action: Action; employees: Employee[] }) {
  const [state, formAction] = useActionState(action, initialFormState); const router = useRouter();
  useEffect(() => { if (state.status === 'success' && state.id) router.push(`/dashboard/auftraege/${state.id}`); }, [router, state]);
  return <form action={formAction} className="mt-4 space-y-4"><FormMessage status={state.status} message={state.message} /><div className="grid gap-4 sm:grid-cols-3"><label className="text-sm font-medium">Datum<Input className="mt-1.5" name="scheduled_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label className="text-sm font-medium">Beginn<Input className="mt-1.5" name="planned_start_time" type="time" defaultValue="08:00" required /></label><label className="text-sm font-medium">Ende<Input className="mt-1.5" name="planned_end_time" type="time" defaultValue="10:00" required /></label></div><fieldset><legend className="text-sm font-medium">Mitarbeiter zuweisen</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{employees.map((employee) => <label key={employee.id} className="flex items-center gap-2 rounded border p-2 text-sm"><input type="checkbox" name="member_ids" value={employee.id} />{employee.name}</label>)}</div></fieldset><SubmitButton>Nacharbeitsauftrag erstellen</SubmitButton></form>;
}
