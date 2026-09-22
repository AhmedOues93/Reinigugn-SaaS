'use client';

import { useActionState, useState } from 'react';
import { CopyPlus, Lock, ReceiptText, X } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Button, Field, Input, Select } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { deriveProductiveRateBp, formatBp, type Calculation } from '@/lib/kalkulation';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const euro = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const percent = (bp: number) => (bp / 100).toString().replace('.', ',');
const decimal = (value: number) => value.toString().replace('.', ',');

/**
 * The assumptions behind the cost side, editable while the calculation is a
 * draft. That is what "what if the wage rises" means, and it is the reason a
 * draft exists at all.
 *
 * These are the company's defaults copied onto this calculation. Changing them
 * here changes this calculation only — the company settings are elsewhere, and
 * a finalised calculation cannot be touched from either place.
 *
 * Three groups, kept apart on purpose:
 *
 *   Personal       what an hour of work costs the company
 *   Objektkosten   what this object costs on top of the hours
 *   Zuschläge      what the customer is charged on top of the price
 *
 * The last is not a cost and never enters the cost side. Putting a
 * Anfahrtspauschale in both places is the easiest way to count the same euro
 * twice and believe a contract is more profitable than it is.
 */
export function AssumptionsPanel({ action, calculation }: { action: Action; calculation: Calculation }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [override, setOverride] = useState(calculation.price_override_cents_month != null);
  const [manual, setManual] = useState(calculation.productive_rate_is_manual);
  const [days, setDays] = useState({
    weekly_hours: calculation.weekly_hours,
    working_days_per_week: calculation.working_days_per_week,
    vacation_days: calculation.vacation_days,
    public_holidays: calculation.public_holidays,
    sick_days: calculation.sick_days,
    training_days: calculation.training_days,
    unproductive_minutes_per_day: calculation.unproductive_minutes_per_day,
  });
  const derived = deriveProductiveRateBp(days);
  const num = (raw: string) => {
    const value = Number(raw.replace(',', '.'));
    return Number.isFinite(value) ? value : 0;
  };

  return (
    <form action={formAction} className="space-y-5 rounded-2xl border border-border/80 bg-subtle p-5">
      <h2 className="text-[15px] font-semibold">Annahmen dieser Kalkulation</h2>
      <FormMessage status={state.status} message={state.message} />
      <input type="hidden" name="productive_mode" value={manual ? 'manual' : 'derived'} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Kalkulationslohn (€/Std.)" htmlFor="wage" info="Der Lohn, auf dem diese Kalkulation beruht — nicht das Gehalt einer bestimmten Person.">
          <Input id="wage" name="wage" inputMode="decimal" defaultValue={euro(calculation.wage_cents_per_hour)} />
        </Field>
        <Field label="Lohnnebenkosten (%)" htmlFor="ancillary" info="Arbeitgeberanteil und sonstige Personalnebenkosten.">
          <Input id="ancillary" name="ancillary" inputMode="decimal" defaultValue={percent(calculation.ancillary_rate_bp)} />
        </Field>
        <Field label="Gemeinkostenzuschlag (%)" htmlFor="overhead">
          <Input id="overhead" name="overhead" inputMode="decimal" defaultValue={percent(calculation.overhead_rate_bp)} />
        </Field>
        <Field label="Zielmarge (%)" htmlFor="margin" info="Marge, nicht Aufschlag: Anteil am Verkaufspreis.">
          <Input id="margin" name="margin" inputMode="decimal" defaultValue={percent(calculation.target_margin_bp)} />
        </Field>
        <Field label="Einsätze pro Woche" htmlFor="visits_per_week">
          <Input id="visits_per_week" name="visits_per_week" inputMode="decimal" defaultValue={decimal(calculation.visits_per_week)} />
        </Field>
        <Field label="Fahrtkosten je Einsatz (€)" htmlFor="travel" info="Was die Anfahrt Sie kostet. Was der Kunde dafür zahlt, steht weiter unten unter Zuschläge.">
          <Input id="travel" name="travel" inputMode="decimal" defaultValue={euro(calculation.travel_cents_per_visit)} />
        </Field>
        <Field label="Rüstzeit je Einsatz (Min.)" htmlFor="setup_minutes" info="An- und Abrüsten, Schlüsselübergabe, Wegezeit im Objekt. Wird als Arbeitszeit kalkuliert.">
          <Input id="setup_minutes" name="setup_minutes" inputMode="decimal" defaultValue={decimal(calculation.setup_minutes_per_visit)} />
        </Field>
        <Field label="Sonstige Kosten je Monat (€)" htmlFor="other_monthly">
          <Input id="other_monthly" name="other_monthly" inputMode="decimal" defaultValue={euro(calculation.other_cost_cents_per_month)} />
        </Field>
        <Field
          label="Mindeststundensatz (€)"
          htmlFor="min_hourly_rate"
          info="Untergrenze, die Sie sich selbst gesetzt haben. Sie wird nicht erzwungen, aber angezeigt, wenn der Preis darunter liegt."
        >
          <Input id="min_hourly_rate" name="min_hourly_rate" inputMode="decimal" defaultValue={euro(calculation.min_hourly_rate_cents)} />
        </Field>
      </div>

      {/* --- the personnel model behind the productive share ----------------- */}
      <fieldset className="rounded-lg border border-border/80 bg-card p-3.5">
        <legend className="px-1 text-sm font-medium">Produktive Zeit</legend>
        {manual ? (
          <div className="mt-2 space-y-3">
            <Field
              label="Produktiver Anteil (%)"
              htmlFor="productive"
              info="Anteil der bezahlten Zeit, der tatsächlich beim Kunden gearbeitet wird. Fahrt, Urlaub und Krankheit werden bezahlt und sind nicht produktiv."
            >
              <Input id="productive" name="productive" inputMode="decimal" defaultValue={percent(calculation.productive_rate_bp)} />
            </Field>
            <button
              type="button"
              onClick={() => setManual(false)}
              className="inline-flex min-h-touch items-center text-sm font-medium text-primary underline-offset-4 hover:underline md:min-h-9"
            >
              Aus Urlaub, Feiertagen und Ausfallzeiten berechnen
            </button>
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Wochenstunden" htmlFor="weekly_hours">
                <Input
                  id="weekly_hours"
                  name="weekly_hours"
                  inputMode="decimal"
                  defaultValue={decimal(calculation.weekly_hours)}
                  onChange={(event) => setDays((prev) => ({ ...prev, weekly_hours: num(event.target.value) }))}
                />
              </Field>
              <Field label="Arbeitstage/Woche" htmlFor="working_days">
                <Input
                  id="working_days"
                  name="working_days"
                  inputMode="decimal"
                  defaultValue={decimal(calculation.working_days_per_week)}
                  onChange={(event) =>
                    setDays((prev) => ({ ...prev, working_days_per_week: num(event.target.value) }))
                  }
                />
              </Field>
              <Field label="Urlaubstage" htmlFor="vacation_days">
                <Input
                  id="vacation_days"
                  name="vacation_days"
                  type="number"
                  min={0}
                  max={200}
                  defaultValue={calculation.vacation_days}
                  onChange={(event) => setDays((prev) => ({ ...prev, vacation_days: num(event.target.value) }))}
                />
              </Field>
              <Field label="Feiertage" htmlFor="public_holidays">
                <Input
                  id="public_holidays"
                  name="public_holidays"
                  type="number"
                  min={0}
                  max={60}
                  defaultValue={calculation.public_holidays}
                  onChange={(event) => setDays((prev) => ({ ...prev, public_holidays: num(event.target.value) }))}
                />
              </Field>
              <Field label="Krankheitstage" htmlFor="sick_days">
                <Input
                  id="sick_days"
                  name="sick_days"
                  type="number"
                  min={0}
                  max={200}
                  defaultValue={calculation.sick_days}
                  onChange={(event) => setDays((prev) => ({ ...prev, sick_days: num(event.target.value) }))}
                />
              </Field>
              <Field label="Schulung / Sonstiges" htmlFor="training_days">
                <Input
                  id="training_days"
                  name="training_days"
                  type="number"
                  min={0}
                  max={200}
                  defaultValue={calculation.training_days}
                  onChange={(event) => setDays((prev) => ({ ...prev, training_days: num(event.target.value) }))}
                />
              </Field>
              <Field label="Unprod. Min./Tag" htmlFor="unproductive_minutes" info="Wegezeit zwischen Objekten, Einweisung, Materialausgabe.">
                <Input
                  id="unproductive_minutes"
                  name="unproductive_minutes"
                  inputMode="decimal"
                  defaultValue={decimal(calculation.unproductive_minutes_per_day)}
                  onChange={(event) =>
                    setDays((prev) => ({ ...prev, unproductive_minutes_per_day: num(event.target.value) }))
                  }
                />
              </Field>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">
              (Anwesenheitstage ÷ Arbeitstage) × (1 − unproduktive Minuten ÷ Minuten je Arbeitstag) ={' '}
              <span className="font-semibold tabular-nums text-foreground">{formatBp(derived)}</span>
            </p>
            <button
              type="button"
              onClick={() => setManual(true)}
              className="inline-flex min-h-touch items-center text-sm font-medium text-primary underline-offset-4 hover:underline md:min-h-9"
            >
              Produktiven Anteil stattdessen direkt eingeben
            </button>
          </div>
        )}
      </fieldset>

      {/* --- customer surcharges, which are revenue and not cost ------------- */}
      <fieldset className="rounded-lg border border-border/80 bg-card p-3.5">
        <legend className="px-1 text-sm font-medium">Zuschläge für den Kunden</legend>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Diese Beträge werden auf den kalkulierten Preis aufgeschlagen. Sie sind{' '}
          <em>keine Kosten</em> — die eigenen Fahrt- und Sachkosten stehen oben und sind bereits
          über die Marge gedeckt. Denselben Betrag an beiden Stellen einzutragen, zählt ihn doppelt.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Anfahrtspauschale je Monat (€)" htmlFor="surcharge_travel">
            <Input id="surcharge_travel" name="surcharge_travel" inputMode="decimal" defaultValue={euro(calculation.surcharge_travel_cents_month)} />
          </Field>
          <Field label="Kleinauftragszuschlag je Monat (€)" htmlFor="surcharge_small_order" info="Für Aufträge, deren Verwaltungsaufwand im Verhältnis zum Umfang hoch ist.">
            <Input id="surcharge_small_order" name="surcharge_small_order" inputMode="decimal" defaultValue={euro(calculation.surcharge_small_order_cents_month)} />
          </Field>
          <Field
            label="Nacht-, Sonn- und Feiertagszuschlag (%)"
            htmlFor="surcharge_offpeak"
            info="Prozentualer Aufschlag auf den Grundpreis, wenn außerhalb der Regelzeiten gereinigt wird."
          >
            <Input id="surcharge_offpeak" name="surcharge_offpeak" inputMode="decimal" defaultValue={percent(calculation.surcharge_offpeak_bp)} />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Hinweis zu den Zuschlägen" htmlFor="surcharge_note" info="Interne Notiz. Erscheint nicht im Leistungsverzeichnis.">
            <Input id="surcharge_note" name="surcharge_note" maxLength={1000} defaultValue={calculation.surcharge_note ?? ''} />
          </Field>
        </div>
      </fieldset>

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
        Kalkulation abschließen
      </SubmitButton>
      {state.message && (
        <div className="mt-2 max-w-sm">
          <FormMessage status={state.status} message={state.message} />
        </div>
      )}
    </form>
  );
}

export function FinaliseAndContinueAction({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action} className="mt-4">
      <SubmitButton className="w-full justify-center sm:w-auto">
        Weiter zum Angebot
      </SubmitButton>
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
        <Field className="sm:col-span-2" label="Titel" htmlFor="quote-title">
          <Input id="quote-title" name="title" defaultValue={defaultTitle} maxLength={160} />
        </Field>
        <Field
          label="Abrechnungsart"
          htmlFor="billing_mode"
          info="Wird später für Auftrag und Abrechnung übernommen."
        >
          <Select id="billing_mode" name="billing_mode" defaultValue="MONATSPAUSCHALE">
            <option value="MONATSPAUSCHALE">Monatspauschale</option>
            <option value="PAUSCHALE_PRO_EINSATZ">Pauschale je Einsatz</option>
            <option value="STUNDENSATZ">Nach Stunden</option>
          </Select>
        </Field>
        <Field label="Gültigkeit" htmlFor="valid_days">
          <Select id="valid_days" name="valid_days" defaultValue="30">
            <option value="14">14 Tage</option>
            <option value="30">30 Tage</option>
            <option value="60">60 Tage</option>
            <option value="90">90 Tage</option>
          </Select>
        </Field>
      </div>
      <SubmitButton className="w-full justify-center sm:w-auto">
        <ReceiptText className="size-4" aria-hidden="true" />
        Angebot erstellen
      </SubmitButton>
    </form>
  );
}
