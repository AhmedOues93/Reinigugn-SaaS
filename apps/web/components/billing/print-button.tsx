'use client';

import { Printer } from 'lucide-react';
import { t, type Locale } from '@/lib/i18n';

/** Opens the browser print dialog, which is also how the document is saved as PDF. */
export function PrintButton({ locale }: { locale: Locale }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex min-h-11 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground print:hidden"
    >
      <Printer className="size-4" aria-hidden="true" />
      {t(locale, 'billing.document')}
    </button>
  );
}
