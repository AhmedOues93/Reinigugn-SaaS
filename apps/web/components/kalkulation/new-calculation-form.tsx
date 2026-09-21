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
  preferredSurveyId,
}: {
  action: Action;
  customers: Option[];
  catalog: CatalogItem[];
  surveys: { id: string; label: string }[];
  preferredSurveyId?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [fromSurvey, setFromSurvey] = useState(Boolean(preferredSurveyId));
  const [customerMode, setCustomerMode] = useState<'NEW' | 'EXISTING'>('NEW');

  return (
    <form action={formAction} className="space-y-7">
      <FormMessage status={state.status} message={state.message} />

      <FormSection title="1. Kunde / Objekt">
        {!fromSurvey && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="cursor-pointer rounded-xl border border-border p-4 has-[:checked]:border-primary">
                <input type="radio" name="customer_mode" value="NEW" checked={customerMode === 'NEW'} onChange={() => setCustomerMode('NEW')} className="sr-only" />
                <span className="block text-sm font-semibold">Neuer Kunde</span>
                <span className="mt-1 block text-xs text-muted-foreground">Kontaktdaten und Objekt direkt erfassen</span>
              </label>
              <label className="cursor-pointer rounded-xl border border-border p-4 has-[:checked]:border-primary">
                <input type="radio" name="customer_mode" value="EXISTING" checked={customerMode === 'EXISTING'} onChange={() => setCustomerMode('EXISTING')} className="sr-only" />
                <span className="block text-sm font-semibold">Bestehender Kunde</span>
                <span className="mt-1 block text-xs text-muted-foreground">Vorhandene Stammdaten verwenden</span>
              </label>
            </div>
            {customerMode === 'EXISTING' ? (
              <Field label="Kunde" htmlFor="customer_id">
                <Select id="customer_id" name="customer_id" required>
                  <option value="">Kunde auswählen</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name ?? customer.label}</option>)}
                </Select>
              </Field>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field className="sm:col-span-2" label="Firma / Kunde" htmlFor="organisation"><Input id="organisation" name="organisation" required minLength={2} maxLength={160} /></Field>
                <Field label="Ansprechperson" htmlFor="contact_person"><Input id="contact_person" name="contact_person" maxLength={160} /></Field>
                <Field label="E-Mail" htmlFor="email"><Input id="email" name="email" type="email" maxLength={160} /></Field>
                <Field label="Telefon" htmlFor="phone"><Input id="phone" name="phone" maxLength={64} /></Field>
                <Field label="Straße und Hausnummer" htmlFor="street"><Input id="street" name="street" maxLength={160} /></Field>
                <Field label="PLZ" htmlFor="postal_code"><Input id="postal_code" name="postal_code" maxLength={16} /></Field>
                <Field label="Ort" htmlFor="city"><Input id="city" name="city" maxLength={120} /></Field>
              </div>
            )}
          </>
        )}

        <Field label="Bezeichnung" htmlFor="title" info="Erscheint später als Titel des Angebots.">
          <Input id="title" name="title" required minLength={2} maxLength={160} placeholder="z. B. Bürohaus Alster – Unterhaltsreinigung" />
        </Field>

        {surveys.length > 0 && (
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="source" value="survey" checked={fromSurvey} onChange={() => setFromSurvey(true)} />
              Daten aus Besichtigung übernehmen
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="source" value="blank" checked={!fromSurvey} onChange={() => setFromSurvey(false)} />
              Angaben direkt erfassen
            </label>
          </div>
        )}

        {fromSurvey && surveys.length > 0 ? (
          <Field
            label="Besichtigung"
            htmlFor="site_survey_id"
            info="Die erfassten Flächen werden als Positionen übernommen."
          >
            <Select id="site_survey_id" name="site_survey_id" required defaultValue={preferredSurveyId ?? ""}>
              <option value="">Besichtigung auswählen</option>
              {surveys.map((survey) => (
                <option key={survey.id} value={survey.id}>
                  {survey.label}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        </FormSection>

      <FormSection title="2. Leistungen">
        {customerMode === 'NEW' && !fromSurvey && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reinigungsart" htmlFor="cleaning_type"><Select id="cleaning_type" name="cleaning_type" defaultValue=""><option value="">Noch offen</option><option>Unterhaltsreinigung</option><option>Büroreinigung</option><option>Grundreinigung</option><option>Glasreinigung</option><option>Treppenhausreinigung</option><option>Sanitärreinigung</option><option>Sonderreinigung</option></Select></Field>
            <Field label="Turnus" htmlFor="frequency"><Select id="frequency" name="frequency" defaultValue=""><option value="">Noch offen</option><option>Einmalig</option><option>1x wöchentlich</option><option>2x wöchentlich</option><option>3x wöchentlich</option><option>5x wöchentlich</option><option>Monatlich</option></Select></Field>
            <Field label="Gewünschter Start" htmlFor="desired_start"><Input id="desired_start" name="desired_start" type="date" /></Field>
          </div>
        )}
        <Field
          label="Leistungsvorlage"
          htmlFor="catalog_item_id"
          info="Wird auf die übernommenen Flächen angewendet — Einheit, Richtleistung und Materialansatz als Vorschlag. Pro Position änderbar."
        >
          <Select id="catalog_item_id" name="catalog_item_id" defaultValue={catalog[0]?.id ?? ''}>
            <option value="">Individuelle Leistung – Zeit später manuell erfassen</option>
            {catalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.category ? `${item.category} · ${item.name}` : item.name}
              </option>
            ))}
          </Select>
        </Field>

        {catalog.length === 0 && (
          <p className="rounded-lg border border-border bg-muted/30 px-3.5 py-3 text-sm leading-6 text-muted-foreground">
            Noch keine Leistungsvorlage vorhanden. Sie können direkt fortfahren und die Leistungen im nächsten Schritt erfassen.
          </p>
        )}
      </FormSection>

      <FormActions>
        <SubmitButton>Weiter zur Kalkulation</SubmitButton>
      </FormActions>
    </form>
  );
}
