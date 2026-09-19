'use client';

import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';
import { useDocumentLocale } from '@/components/document-locale';
import { t } from '@/lib/i18n';

/**
 * Staff-facing error boundary. It never renders the raw error message, which
 * can contain query or tenant detail; retry re-runs the server render. Without
 * this, an uncaught exception in any dashboard page (a dropped Supabase
 * connection, an expired session mid-render) fell through to Next.js's raw
 * error overlay instead of a recoverable screen.
 */
export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useDocumentLocale();
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center px-4 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </div>
      <p className="font-medium text-foreground">{t(locale, 'common.errorTitle')}</p>
      <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t(locale, 'common.errorBody')}</p>
      <Button className="mt-5" onClick={reset}>
        {t(locale, 'common.retry')}
      </Button>
    </div>
  );
}
