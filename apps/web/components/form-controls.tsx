'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui';
import { t, type Locale } from '@/lib/i18n';

export function SubmitButton({ children, locale = 'de', className }: { children: React.ReactNode; locale?: Locale; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className}>
      {pending ? t(locale, 'common.saving') : children}
    </Button>
  );
}

export function FormMessage({ message, status }: { message?: string; status: 'idle' | 'success' | 'error' }) {
  if (!message) return null;
  return (
    <p
      role={status === 'error' ? 'alert' : 'status'}
      className={
        status === 'error'
          ? 'rounded-md bg-red-50 p-3 text-sm text-red-700'
          : 'rounded-md bg-primary/10 p-3 text-sm text-primary'
      }
    >
      {message}
    </p>
  );
}
