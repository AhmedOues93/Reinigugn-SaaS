'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { deletePendingEmployee } from '@/app/dashboard/mitarbeiter/actions';

export function DeletePendingEmployee({ memberId }: { memberId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function remove() {
    startTransition(async () => {
      const result = await deletePendingEmployee(memberId);
      if (result.error) { setError(result.error); return; }
      router.push('/dashboard/mitarbeiter');
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="size-10 p-0 text-danger hover:bg-danger-soft"
        aria-label="Offene Einladung löschen"
        title="Offene Einladung löschen"
        onClick={() => setOpen(true)}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4" role="dialog" aria-modal="true">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Abbrechen" onClick={() => !pending && setOpen(false)} />
          <div className="relative w-full max-w-md rounded-lg bg-card p-6 shadow-popover">
            <h2 className="text-lg font-semibold">Offene Einladung löschen?</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Das ist nur möglich, solange noch kein Benutzerkonto aktiviert wurde. Die offene Einladung wird endgültig entfernt.
            </p>
            {error && <p className="mt-4 rounded-md bg-danger-soft p-3 text-sm text-danger">{error}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>Abbrechen</Button>
              <Button type="button" variant="danger" disabled={pending} onClick={remove}>
                {pending ? 'Wird gelöscht ...' : 'Löschen'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
