'use client';

import { useActionState } from 'react';
import { Upload } from 'lucide-react';
import { initialFormState, type FormState } from '@/lib/actions';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input } from '@/components/ui';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * Das Hochladeformular, das alle vier Importe teilen.
 *
 * Die Erklaerung darunter ist je Import anders -- was Pflicht ist und was mit
 * vorhandenen Daten passiert, muss dort stehen, wo hochgeladen wird, und nicht
 * in einer Hilfeseite.
 */
export function CsvImportForm({
  action,
  id,
  hint,
}: {
  action: Action;
  /** Eindeutig je Seite, damit das Label auf das richtige Feld zeigt. */
  id: string;
  hint: React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, initialFormState);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <Field
        label="CSV-Datei"
        htmlFor={`${id}-file`}
        info="Semikolon oder Komma werden erkannt. Maximal 1.000 Datenzeilen und 2 MB."
      >
        <Input id={`${id}-file`} name="file" type="file" accept=".csv,text/csv" required />
      </Field>
      <div className="rounded-xl border border-border bg-subtle px-4 py-3 text-sm leading-6 text-muted-foreground">
        {hint}
      </div>
      <SubmitButton>
        <Upload className="size-4" aria-hidden="true" />
        CSV importieren
      </SubmitButton>
    </form>
  );
}
