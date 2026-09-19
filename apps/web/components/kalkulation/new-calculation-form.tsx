'use client';

import { useActionState, useState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, FormActions, FormSection, Input, Select } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import type { CatalogItem } from '@/lib/kalkulation';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type Option = { id: string; name?: string; label?: string };

export function NewCalculationForm({
  action,
  customers,
  catalog,
  surveys,
}: {
  action: Action;
  customers: Option[];
  catalog: CatalogItem[];
  surveys: { id: string; label: string }[];
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [fromSurvey, setFromSurvey] = useState(surveys.length > 0);

  return (
    <form action={formAction} className="space-y-7">
      <FormMessage status={state.status} message={state.message} />

      <FormSection title="Grunddaten">
        <Field label="Bezeichnung" htmlFor="title" info="Erscheint später als Titel des Angebots.">
          <Input id="title" name="title" required minLength={2} maxLength={160} placeholder="z. B. Bürohaus Alster – Unterhaltsreinigung" />
        </Field>

        {surveys.length > 0 && (
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="source" value="survey" checked={fromSurvey} onChange={() => setFromSurvey(true)} />
              Aus einer Besichtigung
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="source" value="blank" checked={!fromSurvey} onChange={() => setFromSurvey(false)} />
              Ohne Besichtigung
            </label>
          </div>
        )}

        {fromSurvey && surveys.length > 0 ? (
          <Field
            label="Besichtigung"
            htmlFor="site_survey_id"
            info="Die erfassten Flächen werden als Positionen übernommen."
          >
            <Select id="site_survey_id" name="site_survey_id" required>
              <option value="">Besichtigung auswählen</option>
              {surveys.map((survey) => (
                <option key={survey.id} value={survey.id}>
                  {survey.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <Field label="Kunde" htmlFor="customer_id">
            <Select id="customer_id" name="customer_id" required>
              <option value="">Kunde auswählen</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name ?? customer.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label="Standardleistung"
          htmlFor="catalog_item_id"
          info="Wird auf die übernommenen Flächen angewendet — Einheit, Richtleistung und Materialansatz als Vorschlag. Pro Position änderbar."
        >
          <Select id="catalog_item_id" name="catalog_item_id" defaultValue={catalog[0]?.id ?? ''}>
            <option value="">Ohne Vorgabe</option>
            {catalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.category ? `${item.category} · ${item.name}` : item.name}
              </option>
            ))}
          </Select>
        </Field>

        {catalog.length === 0 && (
          <p className="rounded-lg border border-info/25 bg-info-soft px-3.5 py-3 text-sm leading-6 text-info">
            Im Leistungskatalog ist noch nichts hinterlegt. Ohne Richtleistung muss die Zeit je
            Position von Hand eingetragen werden — das funktioniert, ist aber mehr Arbeit und
            weniger vergleichbar.
          </p>
        )}
      </FormSection>

      <FormActions>
        <SubmitButton>Kalkulation anlegen</SubmitButton>
      </FormActions>
    </form>
  );
}
