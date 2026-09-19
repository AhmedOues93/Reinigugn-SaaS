'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';

type ToggleAction = (id: string, isActive: boolean) => Promise<{ error: string | null }>;

export function StatusToggle({ id, isActive, noun, action }: { id: string; isActive: boolean; noun: string; action: ToggleAction }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const verb = isActive ? 'archivieren' : 'reaktivieren';

  function confirm() {
    startTransition(async () => {
      const result = await action(id, !isActive);
      if (result.error) { setError(result.error); return; }
      setOpen(false); setError(null); router.refresh();
    });
  }

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
  }

  return <>
    <Button type="button" variant={isActive ? 'outline' : 'default'} onClick={() => setOpen(true)}>{isActive ? 'Archivieren' : 'Reaktivieren'}</Button>
    {open && (
      <div
        className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4"
        role="dialog"
        aria-modal="true"
        aria-label={`${noun} ${verb}`}
        onKeyDown={(event) => event.key === 'Escape' && close()}
      >
        <button type="button" aria-label="Abbrechen" className="absolute inset-0 cursor-default" onClick={close} />
        <div className="relative w-full max-w-md rounded-lg bg-card p-6 shadow-popover">
          <h2 className="text-lg font-semibold text-foreground">{noun} {verb}?</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{isActive ? `Der ${noun.toLowerCase()} wird nicht gelöscht und kann jederzeit wieder aktiviert werden.` : `Der ${noun.toLowerCase()} wird wieder als aktiv gefuehrt.`}</p>
          {error && <p className="mt-4 rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <Button type="button" variant="outline" disabled={pending} onClick={close}>Abbrechen</Button>
            <Button type="button" disabled={pending} onClick={confirm}>{pending ? 'Wird gespeichert ...' : isActive ? 'Archivieren' : 'Reaktivieren'}</Button>
          </div>
        </div>
      </div>
    )}
  </>;
}
