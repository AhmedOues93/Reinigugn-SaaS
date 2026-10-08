'use client';

import { useActionState, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { initialFormState, type FormState } from '@/lib/actions';

/**
 * Der Einsatzbericht: eine Zeile, die sonst am Telefon landet.
 *
 * Freiwillig, deshalb steht das Feld ruhig da und nicht als Pflicht vor dem
 * Feierabend. Nach der Abnahme ist es gesperrt -- was der Kunde unterschrieben
 * hat, aendert sich nicht mehr, und das sagt der Hinweis auch.
 *
 * Dass die Notiz auf dem Leistungsnachweis landet, steht im Hinweis: sonst
 * schreibt jemand Internes hinein und es geht an die Kundin.
 */
export function JobReport({
  action,
  defaultValue,
  locked,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  defaultValue: string;
  locked: boolean;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [value, setValue] = useState(defaultValue);
  const remaining = 2000 - value.length;

  return (
    <section
      aria-labelledby="report-title"
      className="rounded-3xl border border-border/80 bg-card p-4 shadow-card sm:p-5"
    >
      <div className="flex items-center gap-2">
        <NotebookPen className="size-4 text-primary" aria-hidden="true" />
        <h2 id="report-title" className="text-lg font-semibold">
          Notiz zum Einsatz
        </h2>
      </div>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {locked
          ? 'Der Leistungsnachweis ist abgenommen. Die Notiz gehört jetzt dazu und bleibt, wie sie ist.'
          : 'Freiwillig. Was das Büro wissen sollte – abgeschlossene Räume, fehlendes Material, ein Schaden. Die Notiz steht auch auf dem Leistungsnachweis, den die Kundin bekommt.'}
      </p>

      {locked ? (
        value ? (
          <p className="break-anywhere mt-3 whitespace-pre-wrap rounded-xl bg-subtle px-3.5 py-3 text-[15px] leading-6">
            {value}
          </p>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground/70">Keine Notiz hinterlegt.</p>
        )
      ) : (
        <form action={formAction} className="mt-3 space-y-3">
          <label htmlFor="job-report" className="sr-only">
            Notiz zum Einsatz
          </label>
          <textarea
            id="job-report"
            name="note"
            rows={4}
            maxLength={2000}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="z. B. 3. Stock war abgeschlossen"
            className="block w-full min-w-0 rounded-xl border border-border bg-background px-3.5 py-3 text-[15px] leading-6 outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              className={`text-xs tabular-nums ${remaining < 100 ? 'text-warning' : 'text-muted-foreground'}`}
            >
              noch {remaining} Zeichen
            </span>
            <SubmitButton variant="outline">Notiz speichern</SubmitButton>
          </div>
          <FormMessage status={state.status} message={state.message} />
        </form>
      )}
    </section>
  );
}
