'use client';

import { useState } from 'react';
import { Field, FormSection, Input } from '@/components/ui';
import { deriveProductiveRateBp, formatBp, type CalculationDefaults } from '@/lib/kalkulation';

const euro = (cents: number) => (cents / 100).toFixed(2).replace('.', ',');
const percent = (bp: number) => (bp / 100).toString().replace('.', ',');
const decimal = (value: number) => value.toString().replace('.', ',');

/**
 * The company's costing assumptions, as one set of fields.
 *
 * Shared between the first-run wizard and the Kalkulationsgrundlagen screen so
 * there is exactly one definition of what a company can configure. Two copies
 * of a form like this drift, and the one that drifts is always the one the
 * customer is looking at.
 *
 * This is costing, not Lohnabrechnung. Nothing here computes anybody's pay or
 * claims to satisfy a tax or payroll obligation — it works out what an hour of
 * work costs the company so a price can be set on purpose.
 */
export function CostingFields({ defaults, step }: { defaults: CalculationDefaults; step?: number }) {
  // A company that has never saved anything is a different situation from one
  // that deliberately set zero: the first gets suggested starting points, the
  // second gets its own figures back.
  const configured = defaults.wage_cents_per_hour > 0 || defaults.productive_rate_bp !== 10000;
  const [manual, setManual] = useState(configured ? defaults.productive_rate_is_manual : false);

  const start = {
    weekly_hours: configured ? defaults.weekly_hours : 39,
    working_days_per_week: configured ? defaults.working_days_per_week : 5,
    vacation_days: configured ? defaults.vacation_days : 30,
    public_holidays: configured ? defaults.public_holidays : 11,
    sick_days: configured ? defaults.sick_days : 10,
    training_days: configured ? defaults.training_days : 2,
    unproductive_minutes_per_day: configured ? defaults.unproductive_minutes_per_day : 30,
  };

  // Live, so the consequence of a day is visible while typing it. The stored
  // value always comes from the database; this only previews the same formula.
  const [days, setDays] = useState(start);
  const derived = deriveProductiveRateBp(days);
  const num = (raw: string) => {
    const value = Number(raw.replace(',', '.'));
    return Number.isFinite(value) ? value : 0;
  };

  return (
    <>
      <input type="hidden" name="productive_mode" value={manual ? 'manual' : 'derived'} />

      <div className={step == null || step === 0 ? 'block' : 'hidden'}><FormSection
        title="Personalkosten"
        description="Lohn und Nebenkosten sind betriebsindividuell. Hinterlegen Sie Ihren eigenen Mischsatz."
      >
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <Field
            label="Bruttostundenlohn (€)"
            htmlFor="wage"
            info="Mischsatz Ihrer Reinigungskräfte, nicht das Gehalt einer bestimmten Person."
          >
            <Input id="wage" name="wage" inputMode="decimal" required defaultValue={euro(defaults.wage_cents_per_hour)} />
          </Field>
          <Field
            label="Arbeitgebernebenkosten (%)"
            htmlFor="ancillary"
            info="Arbeitgeberanteil zur Sozialversicherung, Umlagen, Berufsgenossenschaft — als Zuschlag auf den Lohn."
          >
            <Input id="ancillary" name="ancillary" inputMode="decimal" required defaultValue={percent(defaults.ancillary_rate_bp)} />
          </Field>
        </div>
      </FormSection></div>

      <div className={step == null || step === 1 ? 'block' : 'hidden'}><FormSection
        title="Produktive Zeit"
        description="Bezahlte Zeit ist nicht immer Zeit beim Kunden. Die Angaben machen diesen Anteil nachvollziehbar."
      >
        {!manual ? (
          <>
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
              <Field label="Wochenstunden" htmlFor="weekly_hours">
                <Input
                  id="weekly_hours"
                  name="weekly_hours"
                  inputMode="decimal"
                  defaultValue={decimal(start.weekly_hours)}
                  onChange={(event) => setDays((prev) => ({ ...prev, weekly_hours: num(event.target.value) }))}
                />
              </Field>
              <Field label="Arbeitstage pro Woche" htmlFor="working_days">
                <Input
                  id="working_days"
                  name="working_days"
                  inputMode="decimal"
                  defaultValue={decimal(start.working_days_per_week)}
                  onChange={(event) =>
                    setDays((prev) => ({ ...prev, working_days_per_week: num(event.target.value) }))
                  }
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:col-span-2 lg:grid-cols-4">
              <Field label="Urlaubstage" htmlFor="vacation_days">
                <Input
                  id="vacation_days"
                  name="vacation_days"
                  type="number"
                  min={0}
                  max={200}
                  defaultValue={start.vacation_days}
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
                  defaultValue={start.public_holidays}
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
                  defaultValue={start.sick_days}
                  onChange={(event) => setDays((prev) => ({ ...prev, sick_days: num(event.target.value) }))}
                />
              </Field>
              <Field label="Schulung & sonstige Ausfalltage" htmlFor="training_days">
                <Input
                  id="training_days"
                  name="training_days"
                  type="number"
                  min={0}
                  max={200}
                  defaultValue={start.training_days}
                  onChange={(event) => setDays((prev) => ({ ...prev, training_days: num(event.target.value) }))}
                />
              </Field>
            </div>
            <Field
              label="Unproduktive Minuten pro Arbeitstag"
              htmlFor="unproductive_minutes"
              info="Wegezeit zwischen Objekten, Einweisung, Materialausgabe."
              className="sm:col-span-2"
            >
              <Input
                id="unproductive_minutes"
                name="unproductive_minutes"
                inputMode="decimal"
                defaultValue={decimal(start.unproductive_minutes_per_day)}
                onChange={(event) =>
                  setDays((prev) => ({ ...prev, unproductive_minutes_per_day: num(event.target.value) }))
                }
              />
            </Field>

            {/* The working, shown. A percentage handed down without an
                explanation is a percentage nobody revisits. */}
            <div className="rounded-xl border border-border/80 bg-subtle px-4 py-4 text-sm leading-6 text-muted-foreground sm:col-span-2">
              <p>
                <span className="font-medium text-foreground">Anwesenheitstage</span> ={' '}
                {(days.working_days_per_week * 52).toLocaleString('de-DE', { maximumFractionDigits: 0 })} Arbeitstage −{' '}
                {(days.vacation_days + days.public_holidays + days.sick_days + days.training_days).toLocaleString('de-DE')}{' '}
                Ausfalltage
              </p>
              <p className="mt-1">
                <span className="font-medium text-foreground">Produktiver Anteil</span> = (Anwesenheitstage ÷
                Arbeitstage) × (1 − unproduktive Minuten ÷ Minuten je Arbeitstag)
              </p>
              <p className="mt-2 text-foreground">
                Ergibt <span className="font-semibold tabular-nums">{formatBp(derived)}</span> produktiven Anteil —
                eine Stunde beim Kunden kostet damit rund{' '}
                <span className="font-semibold tabular-nums">
                  {(10000 / derived).toLocaleString('de-DE', { maximumFractionDigits: 2 })}
                </span>{' '}
                Stunden Lohn.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setManual(true)}
              className="inline-flex min-h-touch items-center text-sm font-medium text-primary underline-offset-4 hover:underline md:min-h-9 sm:col-span-2"
            >
              Produktiven Anteil stattdessen direkt eingeben
            </button>
          </>
        ) : (
          <>
            <Field
              label="Produktiver Anteil (%)"
              htmlFor="productive"
              info="Wie viel der bezahlten Zeit tatsächlich beim Kunden gearbeitet wird."
              className="sm:col-span-2"
            >
              <Input id="productive" name="productive" inputMode="decimal" required defaultValue={percent(defaults.productive_rate_bp)} />
            </Field>
            <button
              type="button"
              onClick={() => setManual(false)}
              className="inline-flex min-h-touch items-center text-sm font-medium text-primary underline-offset-4 hover:underline md:min-h-9 sm:col-span-2"
            >
              Aus Urlaub, Feiertagen und Ausfallzeiten berechnen
            </button>
          </>
        )}
      </FormSection></div>

      <div className={step == null || step === 3 ? 'block' : 'hidden'}><FormSection
        title="Zuschläge"
        description="Diese Zuschläge decken Verwaltung und die angestrebte Marge in neuen Kalkulationen ab."
      >
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <Field label="Gemeinkostenzuschlag (%)" htmlFor="overhead" info="Verwaltung, Büro, Fahrzeuge, Versicherungen — alles, was nicht einem einzelnen Auftrag zugeordnet wird.">
            <Input id="overhead" name="overhead" inputMode="decimal" required defaultValue={percent(defaults.overhead_rate_bp)} />
          </Field>
          <Field
            label="Zielmarge (%)"
            htmlFor="margin"
            info="Marge, nicht Aufschlag: Anteil am Verkaufspreis. Preis = Kosten ÷ (1 − Marge)."
          >
            <Input id="margin" name="margin" inputMode="decimal" required defaultValue={percent(defaults.target_margin_bp)} />
          </Field>
        </div>
      </FormSection></div>

      <div className={step == null || step === 2 ? 'block' : 'hidden'}><FormSection
        title="Sachkosten"
        description="Startwerte pro Einsatz oder Monat. In einzelnen Kalkulationen weiterhin anpassbar."
      >
        <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
          <Field
            label="Mindeststundensatz (€)"
            htmlFor="min_hourly_rate"
            info="Untergrenze für den Verkauf, unabhängig von der Marge. 0 = keine Untergrenze."
          >
            <Input id="min_hourly_rate" name="min_hourly_rate" inputMode="decimal" defaultValue={euro(defaults.min_hourly_rate_cents)} />
          </Field>
          <Field label="Material je Einsatz (€)" htmlFor="material">
            <Input id="material" name="material" inputMode="decimal" defaultValue={euro(defaults.default_material_cents_per_visit)} />
          </Field>
          <Field label="Maschinen je Monat (€)" htmlFor="machine">
            <Input id="machine" name="machine" inputMode="decimal" defaultValue={euro(defaults.default_machine_cents_per_month)} />
          </Field>
          <Field label="Anfahrt je Einsatz (€)" htmlFor="travel" info="Was die Anfahrt Sie kostet. Was Sie dem Kunden dafür berechnen, steht in der Kalkulation unter „Zuschläge“.">
            <Input id="travel" name="travel" inputMode="decimal" defaultValue={euro(defaults.default_travel_cents_per_visit)} />
          </Field>
          <Field label="Rüstzeit je Einsatz (Min.)" htmlFor="setup_minutes" info="An- und Abrüsten, Schlüsselübergabe, Wegezeit im Objekt. Wird als Arbeitszeit kalkuliert.">
            <Input id="setup_minutes" name="setup_minutes" inputMode="decimal" defaultValue={decimal(defaults.default_setup_minutes_per_visit)} />
          </Field>
        </div>
      </FormSection></div>
    </>
  );
}
