'use client';

import { AlertTriangle } from 'lucide-react';

/** Never surfaces the raw error text, which can carry query or tenant detail. */
export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-white p-8 text-center">
      <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-red-50 text-red-600">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </div>
      <p className="font-medium text-slate-900">Etwas ist schiefgelaufen</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-600">
        Die Daten konnten nicht geladen werden. Bitte versuchen Sie es erneut.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 min-h-12 rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground"
      >
        Erneut versuchen
      </button>
    </div>
  );
}
