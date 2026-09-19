'use client';

import { Printer } from 'lucide-react';
import { cn } from '@reinigung/ui';
import { buttonVariants } from '@/components/ui';
import { t, type Locale } from '@/lib/i18n';

/** Opens the browser print dialog, which is also how the document is saved as PDF. */
export function PrintButton({ locale, label }: { locale: Locale; label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={cn(buttonVariants(), 'print:hidden')}
    >
      <Printer className="size-4" aria-hidden="true" />
      {label ?? t(locale, 'billing.document')}
    </button>
  );
}
