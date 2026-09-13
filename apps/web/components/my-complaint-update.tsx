'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
export function MyComplaintUpdate({ action }: { action: Action }) { const [state, formAction] = useActionState(action, initialFormState); return <form action={formAction} className="mt-3 space-y-2"><FormMessage status={state.status} message={state.message} /><select className="h-10 w-full rounded-md border bg-white px-3 text-sm" name="status" defaultValue="IN_PROGRESS"><option value="IN_PROGRESS">In Bearbeitung</option><option value="RESOLVED">Gelöst</option></select><textarea className="min-h-20 w-full rounded-md border bg-white px-3 py-2 text-sm" name="note" maxLength={2000} placeholder="Operative Notiz" required /><SubmitButton>Aktualisierung speichern</SubmitButton></form>; }
