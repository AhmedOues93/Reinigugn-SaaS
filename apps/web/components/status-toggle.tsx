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

  return <>
    <Button type="button" variant={isActive ? 'outline' : 'default'} onClick={() => setOpen(true)}>{isActive ? 'Archivieren' : 'Reaktivieren'}</Button>
    {open && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4" role="dialog" aria-modal="true" aria-label={`${noun} ${verb}`}>
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"><h2 className="text-lg font-semibold">{noun} {verb}?</h2><p className="mt-2 text-sm leading-6 text-slate-600">{isActive ? `Der ${noun.toLowerCase()} wird nicht geloescht und kann jederzeit wieder aktiviert werden.` : `Der ${noun.toLowerCase()} wird wieder als aktiv gefuehrt.`}</p>{error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="mt-6 flex justify-end gap-3"><Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Abbrechen</Button><Button type="button" disabled={pending} onClick={confirm}>{pending ? 'Wird gespeichert ...' : isActive ? 'Archivieren' : 'Reaktivieren'}</Button></div></div>
    </div>}
  </>;
}
