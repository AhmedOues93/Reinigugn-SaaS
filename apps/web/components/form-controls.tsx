'use client';

import { useFormStatus } from 'react-dom';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { t, type Locale } from '@/lib/i18n';
import type { ComponentProps } from 'react';

export function SubmitButton({
  children,
  locale = 'de',
  className,
  variant,
  size,
}: {
  children: React.ReactNode;
  locale?: Locale;
  className?: string;
} & Pick<ComponentProps<typeof Button>, 'variant' | 'size'>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending} className={className} variant={variant} size={size}>
      {pending ? (
        <>
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
          {t(locale, 'common.saving')}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export function FormMessage({ message, status }: { message?: string; status: 'idle' | 'success' | 'error' }) {
  if (!message) return null;
  const isError = status === 'error';
  return (
    <p
      role={isError ? 'alert' : 'status'}
      className={`flex animate-fade-in items-start gap-2.5 rounded-lg border p-3 text-sm leading-6 ${
        isError ? 'border-danger/20 bg-danger-soft text-danger' : 'border-success/20 bg-success-soft text-success'
      }`}
    >
      {isError ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      <span className="break-anywhere">{message}</span>
    </p>
  );
}
