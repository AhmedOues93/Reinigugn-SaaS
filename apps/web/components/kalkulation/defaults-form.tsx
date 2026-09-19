'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, FormActions, FormSection, Input } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import type { CalculationDefaults } from '@/lib/kalkulation';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const euro = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const percent = (bp: number) => (bp / 100).toString().replace('.', ',');

/**
 * The company's calculation assumptions.
 *
 * Every field says what it is for, because these four numbers decide whether
 * the firm's prices cover its costs, and a wrong productive-share is invisible
 * in the result until the year is over.
 *
 * This is costing, not Lohnabrechnung. Nothing here computes anybody's pay or
 * claims to satisfy a tax or payroll obligation.
 */
export function CalculationDefaultsForm({
  action,
  defaults,
}: {
  action: Action;
  defaults: CalculationDefaults;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const unset = defaults.wage_cents_per_hour === 0;

  return (
    <form action={formAction} className="space-y-7">
      <FormMessage status={state.status} message={state.message} />

      {unset && (
        <p className="rounded-lg border border-info/25 bg-info-soft px-3.5 py-3 text-sm leading-6 text-info">
          Diese Werte sind noch nicht hinterlegt. Es sind bewusst keine Beispielwerte vorgegeben —
          Lohn, Nebenkosten und produktiver Anteil sind betriebsindividuell und sollten aus Ihrer
          eigenen Nachkalkulation oder von Ihrer Steuerberatung kommen.
        </p>
      )}

      <FormSection
        title="Personalkosten"
        description="Aus diesen Angaben ergeben sich die Kosten je produktiver Stunde: Lohn × (1 + Nebenkosten) ÷ produktiver Anteil × (1 + Gemeinkosten)."
      >
        <Field
          label="Kalkulationslohn (€ je Stunde)"
          htmlFor="wage"
          info="Der Stundenlohn, auf dem Ihre Kalkulation beruht — ein Mischsatz, nicht das Gehalt einer bestimmten Person."
        >
          <Input id="wage" name="wage" inputMode="decimal" required defaultValue={euro(defaults.wage_cents_per_hour)} />
        </Field>
        <Field
          label="Lohnnebenkosten (%)"
          htmlFor="ancillary"
          info="Arbeitgeberanteil zur Sozialversicherung, Umlagen, Berufsgenossenschaft und Ähnliches, als Zuschlag auf den Lohn."
        >
          <Input id="ancillary" name="ancillary" inputMode="decimal" required defaultValue={percent(defaults.ancillary_rate_bp)} />
        </Field>
        <Field
          label="Produktiver Anteil der bezahlten Zeit (%)"
          htmlFor="productive"
          info="Wie viel der bezahlten Zeit tatsächlich beim Kunden gearbeitet wird. Fahrt zwischen Objekten, Einweisung, Urlaub und Krankheit werden bezahlt und sind nicht produktiv — deshalb kostet eine Stunde vor Ort mehr als eine Stunde Lohn."
        >
          <Input id="productive" name="productive" inputMode="decimal" required defaultValue={percent(defaults.productive_rate_bp)} />
        </Field>
        <Field
          label="Gemeinkostenzuschlag (%)"
          htmlFor="overhead"
          info="Verwaltung, Büro, Fahrzeuge, Versicherungen — alles, was nicht einem einzelnen Auftrag zugeordnet wird."
        >
          <Input id="overhead" name="overhead" inputMode="decimal" required defaultValue={percent(defaults.overhead_rate_bp)} />
        </Field>
      </FormSection>

      <FormSection
        title="Preisziel"
        description="Marge, nicht Aufschlag. Die Marge misst den Gewinn am Verkaufspreis: Preis = Kosten ÷ (1 − Marge). „Kosten plus 30 %“ ergibt dagegen nur rund 23 % Marge."
      >
        <Field label="Zielmarge (%)" htmlFor="margin">
          <Input id="margin" name="margin" inputMode="decimal" required defaultValue={percent(defaults.target_margin_bp)} />
        </Field>
      </FormSection>

      <FormActions>
        <SubmitButton>Grundlagen speichern</SubmitButton>
      </FormActions>
    </form>
  );
}
