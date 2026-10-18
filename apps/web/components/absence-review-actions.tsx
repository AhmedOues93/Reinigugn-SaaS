'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Button, Textarea } from '@/components/ui';
import { SubmitButton } from '@/components/form-controls';

export function AbsenceReviewActions({
  approveAction,
  rejectAction,
}: {
  approveAction: (formData: FormData) => Promise<void>;
  rejectAction: (formData: FormData) => Promise<void>;
}) {
  const [rejecting, setRejecting] = useState(false);

  if (!rejecting) {
    return (
      <div className="flex flex-wrap gap-2">
        <form action={approveAction}>
          <SubmitButton size="sm">Genehmigen</SubmitButton>
        </form>
        <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(true)}>
          Ablehnen
        </Button>
      </div>
    );
  }

  return (
    <form action={rejectAction} className="w-full max-w-sm space-y-2 rounded-xl border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Ablehnungsgrund</p>
        <Button type="button" variant="ghost" className="size-8 p-0" onClick={() => setRejecting(false)} aria-label="Schließen">
          <X className="size-4" />
        </Button>
      </div>
      <Textarea
        name="review_note"
        minLength={3}
        maxLength={1000}
        required
        placeholder="Kurzer, sachlicher Grund"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setRejecting(false)}>Abbrechen</Button>
        <SubmitButton size="sm" variant="danger">Ablehnen</SubmitButton>
      </div>
    </form>
  );
}
