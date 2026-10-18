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
      className={`flex animate-fade-in items-start gap-2.5 border-s-2 px-3 py-2 text-sm leading-5 ${
        isError ? 'border-danger bg-danger/[0.035] text-foreground' : 'border-success bg-success/[0.035] text-foreground'
      }`}
    >
      {isError ? (
        <AlertCircle className={`mt-0.5 size-4 shrink-0 ${isError ? 'text-danger' : 'text-success'}`} aria-hidden="true" />
      ) : (
        <CheckCircle2 className={`mt-0.5 size-4 shrink-0 ${isError ? 'text-danger' : 'text-success'}`} aria-hidden="true" />
      )}
      <span className="break-anywhere">{message}</span>
    </p>
  );
}
