import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@reinigung/ui';

/** Server-side outcome of an auth action, shown at the top of the form. */
export function AuthMessage({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  const isError = Boolean(error);
  return (
    <p
      role={isError ? 'alert' : 'status'}
      className={cn(
        'flex animate-fade-in items-start gap-2.5 rounded-xl border p-3.5 text-sm leading-6',
        isError ? 'border-danger/20 bg-danger-soft text-danger' : 'border-success/20 bg-success-soft text-success',
      )}
    >
      {isError ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      <span className="break-anywhere font-medium">{error ?? message}</span>
    </p>
  );
}
