'use client';

import { AlertTriangle } from 'lucide-react';
import { useDocumentLocale } from '@/components/document-locale';
import { t } from '@/lib/i18n';

/**
 * Employee-facing error boundary. It never renders the raw error message, which
 * can contain query or tenant detail; retry re-runs the server render.
 */
export default function EmployeeError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useDocumentLocale();
  return (
    <div className="rounded-lg border border-danger/20 bg-card p-8 text-center" role="alert">
      <div className="mx-auto mb-3 grid size-10 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </div>
      <p className="font-medium text-foreground">{t(locale, 'common.errorTitle')}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">{t(locale, 'common.errorBody')}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 min-h-12 w-full rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        {t(locale, 'common.retry')}
      </button>
    </div>
  );
}
