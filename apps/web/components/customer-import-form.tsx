'use client';

import { useActionState } from 'react';
import { Upload } from 'lucide-react';
import { initialFormState, type FormState } from '@/lib/actions';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input } from '@/components/ui';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

export function CustomerImportForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, initialFormState);

  return (
    <form action={formAction} className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <Field
        label="CSV-Datei"
        htmlFor="customer-import-file"
        info="Semikolon oder Komma werden erkannt. Maximal 1.000 Datenzeilen und 2 MB."
      >
        <Input
          id="customer-import-file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
        />
      </Field>
      <div className="rounded-xl border border-border bg-subtle px-4 py-3 text-sm leading-6 text-muted-foreground">
        Pflicht ist nur <strong className="text-foreground">Kunde</strong>. Optional können Kundennummer,
        Kontakt- und Rechnungsdaten sowie Objekt, Objektnummer und Objektadresse in derselben Zeile stehen.
        Vorhandene Kunden und Objekte werden wiederverwendet statt doppelt angelegt.
      </div>
      <SubmitButton>
        <Upload className="size-4" aria-hidden="true" />
        CSV importieren
      </SubmitButton>
    </form>
  );
}
