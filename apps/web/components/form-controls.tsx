'use client';

import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui';

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? 'Wird gespeichert ...' : children}</Button>;
}

export function FormMessage({ message, status }: { message?: string; status: 'idle' | 'success' | 'error' }) {
  if (!message) return null;
  return <p className={status === 'error' ? 'rounded-md bg-red-50 p-3 text-sm text-red-700' : 'rounded-md bg-teal-50 p-3 text-sm text-teal-800'}>{message}</p>;
}
