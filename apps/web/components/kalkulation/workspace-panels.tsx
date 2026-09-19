'use client';

import { useActionState, useState } from 'react';
import { CopyPlus, Lock, ReceiptText } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input, Select } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import type { Calculation } from '@/lib/kalkulation';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const euro = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const percent = (bp: number) => (bp / 100).toString().replace('.', ',');

/**
 * The assumptions behind the cost side, editable while the calculation is a
 * draft. That is what "what if the wage rises" means, and it is the reason a
 * draft exists at all.
 *
 * These are the company's defaults copied onto this calculation. Changing them
 * here changes this calculation only — the company settings are elsewhere, and
 * a finalised calculation cannot be touched from either place.
 */
export function AssumptionsPanel({ action, calculation }: { action: Action; calculation: Calculation }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [override, setOverride] = useState(calculation.price_override_cents_month != null);

  return (
    <form action={formAction} className="space-y-4 rounded-2xl border border-border/80 bg-subtle p-5">
      <h2 className="text-[15px] font-semibold">Annahmen dieser Kalkulation</h2>
      <FormMessage status={state.status} message={state.message} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Kalkulationslohn (€/Std.)" htmlFor="wage" info="Der Lohn, auf dem diese Kalkulation beruht — nicht das Gehalt einer bestimmten Person.">
          <Input id="wage" name="wage" inputMode="decimal" defaultValue={euro(calculation.wage_cents_per_hour)} />
        </Field>
        <Field label="Lohnnebenkosten (%)" htmlFor="ancillary" info="Arbeitgeberanteil und sonstige Personalnebenkosten.">
          <Input id="ancillary" name="ancillary" inputMode="decimal" defaultValue={percent(calculation.ancillary_rate_bp)} />
        </Field>
        <Field
          label="Produktiver Anteil (%)"
          htmlFor="productive"
          info="Anteil der bezahlten Zeit, der tatsächlich beim Kunden gearbeitet wird. Fahrt, Urlaub und Krankheit werden bezahlt und sind nicht produktiv."
        >
          <Input id="productive" name="productive" inputMode="decimal" defaultValue={percent(calculation.productive_rate_bp)} />
        </Field>
        <Field label="Gemeinkostenzuschlag (%)" htmlFor="overhead">
          <Input id="overhead" name="overhead" inputMode="decimal" defaultValue={percent(calculation.overhead_rate_bp)} />
        </Field>
        <Field label="Zielmarge (%)" htmlFor="margin" info="Marge, nicht Aufschlag: Anteil am Verkaufspreis.">
          <Input id="margin" name="margin" inputMode="decimal" defaultValue={percent(calculation.target_margin_bp)} />
        </Field>
        <Field label="Einsätze pro Woche" htmlFor="visits_per_week">
          <Input id="visits_per_week" name="visits_per_week" inputMode="decimal" defaultValue={calculation.visits_per_week.toString().replace('.', ',')} />
        </Field>
        <Field label="Fahrtkosten je Einsatz (€)" htmlFor="travel">
          <Input id="travel" name="travel" inputMode="decimal" defaultValue={euro(calculation.travel_cents_per_visit)} />
        </Field>
        <Field label="Rüstzeit je Einsatz (Min.)" htmlFor="setup_minutes" info="An- und Abrüsten, Schlüsselübergabe, Wegezeit im Objekt. Wird als Arbeitszeit kalkuliert.">
          <Input id="setup_minutes" name="setup_minutes" inputMode="decimal" defaultValue={calculation.setup_minutes_per_visit.toString().replace('.', ',')} />
        </Field>
        <Field label="Sonstige Kosten je Monat (€)" htmlFor="other_monthly">
          <Input id="other_monthly" name="other_monthly" inputMode="decimal" defaultValue={euro(calculation.other_cost_cents_per_month)} />
        </Field>
      </div>

      {/*
        An explicit price is a legitimate commercial decision — a strategic
        customer, a foot in the door. It is recorded with its reason so that
        six months later somebody can tell a decision from a mistake.
      */}
      {override ? (
        <div className="grid gap-4 rounded-lg border border-warning/25 bg-warning-soft/50 p-3.5 sm:grid-cols-2">
          <Field label="Verkaufspreis pro Monat (€)" htmlFor="price_override">
            <Input
              id="price_override"
              name="price_override"
              inputMode="decimal"
              defaultValue={calculation.price_override_cents_month != null ? euro(calculation.price_override_cents_month) : ''}
            />
          </Field>
          <Field label="Begründung" htmlFor="price_override_reason">
            <Input
              id="price_override_reason"
              name="price_override_reason"
              maxLength={1000}
              defaultValue={calculation.price_override_reason ?? ''}
              placeholder="z. B. Einstiegspreis, Folgeauftrag erwartet"
            />
          </Field>
          <button
            type="button"
            onClick={() => setOverride(false)}
            className="justify-self-start text-sm font-medium text-muted-foreground underline-offset-4 hover:underline sm:col-span-2"
          >
            Zurück zum kalkulierten Preis
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOverride(true)}
          className="inline-flex min-h-touch items-center text-sm font-medium text-primary underline-offset-4 hover:underline md:min-h-9"
        >
          Verkaufspreis abweichend festlegen
        </button>
      )}

      <SubmitButton>Kalkulation aktualisieren</SubmitButton>
    </form>
  );
}

/** Freezing the calculation, which is what makes an Angebot possible. */
export function FinaliseCalculationAction({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction}>
      <SubmitButton variant="outline">
        <Lock className="size-4" aria-hidden="true" />
        Festschreiben
      </SubmitButton>
      {state.message && (
        <div className="mt-2 max-w-sm">
          <FormMessage status={state.status} message={state.message} />
        </div>
      )}
    </form>
  );
}

/** A new draft copy; the frozen original stays exactly as it was. */
export function ReviseCalculationAction({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <SubmitButton variant="outline">
        <CopyPlus className="size-4" aria-hidden="true" />
        Revision erstellen
      </SubmitButton>
    </form>
  );
}

/**
 * The Angebot. The billing mode chosen here is carried into the contract on
 * acceptance, so the price and the way it is charged stay consistent all the
 * way to the invoice.
 */
export function QuoteFromCalculationForm({
  action,
  defaultTitle,
}: {
  action: Action;
  defaultTitle: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  return (
    <form action={formAction} className="mt-3 space-y-4">
      <FormMessage status={state.status} message={state.message} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Titel" htmlFor="quote-title">
          <Input id="quote-title" name="title" defaultValue={defaultTitle} maxLength={160} />
        </Field>
        <Field
          label="Abrechnungsart"
          htmlFor="billing_mode"
          info="Bestimmt, wie später abgerechnet wird. Nur bei „Nach Stunden“ darf die erfasste Arbeitszeit die Rechnungsmenge bestimmen."
        >
          <Select id="billing_mode" name="billing_mode" defaultValue="MONATSPAUSCHALE">
            <option value="MONATSPAUSCHALE">Monatspauschale</option>
            <option value="PAUSCHALE_PRO_EINSATZ">Pauschale je Einsatz</option>
            <option value="STUNDENSATZ">Nach Stunden</option>
          </Select>
        </Field>
        <Field label="Gültig für (Tage)" htmlFor="valid_days">
          <Input id="valid_days" name="valid_days" type="number" min={1} max={365} defaultValue={30} />
        </Field>
      </div>
      <SubmitButton>
        <ReceiptText className="size-4" aria-hidden="true" />
        Angebot aus Kalkulation erstellen
      </SubmitButton>
    </form>
  );
}
