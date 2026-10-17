'use client';

import { useActionState, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { initialFormState, type FormState } from '@/lib/actions';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Button, Field, Input, Textarea } from '@/components/ui';

export function TimeCorrectionForm({
  action,
  startedAt,
  finishedAt,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  startedAt: string;
  finishedAt: string | null;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [editing, setEditing] = useState(false);
  const local = (value: string | null) => (value ? new Date(value).toISOString().slice(0, 16) : '');

  if (!editing) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-medium">Arbeitszeit ist schreibgeschützt</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Änderungen werden mit vorherigem Wert, neuem Wert, Grund und Bearbeiter protokolliert.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="size-4" />
          Korrigieren
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Arbeitszeit korrigieren</p>
          <p className="mt-1 text-sm text-muted-foreground">Jede Korrektur bleibt in der Historie nachvollziehbar.</p>
        </div>
        <Button type="button" variant="ghost" className="size-9 p-0" onClick={() => setEditing(false)} aria-label="Schließen">
          <X className="size-4" />
        </Button>
      </div>
      <FormMessage status={state.status} message={state.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Startzeit" htmlFor="correction-start">
          <Input id="correction-start" name="started_at" type="datetime-local" defaultValue={local(startedAt)} required />
        </Field>
        <Field label="Endzeit" htmlFor="correction-end">
          <Input id="correction-end" name="finished_at" type="datetime-local" defaultValue={local(finishedAt)} required />
        </Field>
        <Field label="Korrekturgrund" htmlFor="correction-reason" className="sm:col-span-2">
          <Textarea
            id="correction-reason"
            name="reason"
            minLength={3}
            maxLength={1000}
            required
            placeholder="z. B. Mitarbeiter hat das Ausstempeln vergessen"
          />
        </Field>
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton>Korrektur speichern</SubmitButton>
        <Button type="button" variant="outline" onClick={() => setEditing(false)}>Abbrechen</Button>
      </div>
    </form>
  );
}
