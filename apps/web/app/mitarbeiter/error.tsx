'use client';

import { AlertTriangle } from 'lucide-react';

/**
 * Employee-facing error boundary. It never renders the raw error message, which
 * can contain query or tenant detail; retry re-runs the server render.
 */
export default function EmployeeError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-white p-8 text-center">
      <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-red-50 text-red-600">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </div>
      <p className="font-medium text-slate-900">Etwas ist schiefgelaufen</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-slate-600">
        Die Daten konnten nicht geladen werden. Bitte versuchen Sie es erneut.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 min-h-12 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        Erneut versuchen
      </button>
    </div>
  );
}
