'use client';

import { useState, useTransition } from 'react';
import { CalendarPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui';

/**
 * Tops up the visits of every active recurring plan.
 *
 * The planning screen shows this only when at least one standing contract is
 * about to run out of generated visits, so it reads as "something needs doing"
 * rather than as permanent furniture.
 */
export function ExtendHorizonButton({ action }: { action: () => Promise<{ error: string | null }> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Button
        type="button"
        size="sm"
        disabled={pending}
        aria-busy={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await action();
            if (result.error) setError(result.error);
          })
        }
      >
        {pending ? (
          <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <CalendarPlus className="size-4" aria-hidden="true" />
        )}
        Einsätze verlängern
      </Button>
      {error && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
