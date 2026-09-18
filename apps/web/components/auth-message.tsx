import { AlertCircle, CheckCircle2 } from 'lucide-react';

export function AuthMessage({ error, message }: { error?: string; message?: string }) {
  if (!error && !message) return null;
  const isError = Boolean(error);
  return (
    <p
      role={isError ? 'alert' : 'status'}
      className={`flex items-start gap-2.5 rounded-md p-3 text-sm leading-6 ${
        isError ? 'bg-danger-soft text-danger' : 'bg-success-soft text-success'
      }`}
    >
      {isError ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      <span className="break-anywhere">{error ?? message}</span>
    </p>
  );
}
