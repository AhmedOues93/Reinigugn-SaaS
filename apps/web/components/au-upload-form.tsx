'use client';

import { useActionState } from 'react';
import { FormMessage } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';

export function AuUploadForm({ action }: { action: (state: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, initialFormState);
  return <form className="mt-3 flex flex-wrap items-center gap-2" action={formAction}>
    <input name="document" type="file" accept="application/pdf,image/jpeg,image/png" required aria-label="AU-Dokument" />
    <button className="rounded border px-3 py-1 text-sm disabled:opacity-60" disabled={pending}>{pending ? 'Wird hochgeladen …' : 'AU hochladen'}</button>
    <FormMessage status={state.status} message={state.message} />
  </form>;
}
