'use client';

import { useActionState, useState } from 'react';
import { Plus, Trash2, TriangleAlert } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Field, Input, Select } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import {
  costBasisLabels,
  countableFrequencies,
  frequencyLabels,
  unitLabels,
  weekdayLabels,
  type CalculationFrequency,
  type CalculationLine,
  type CalculationUnit,
  type CatalogItem,
} from '@/lib/kalkulation';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const units: CalculationUnit[] = ['QM', 'STUNDE', 'STUECK', 'EINSATZ', 'PAUSCHAL'];
const frequencies = Object.keys(frequencyLabels) as CalculationFrequency[];
const bases = ['PRO_EINSATZ', 'PRO_MONAT', 'PRO_STUNDE', 'PRO_QM'] as const;

function euro(cents: number) {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * One position of the calculation: an area, a service, how often, and what it
 * assumes about productivity and cost.
 *
 * The unit decides which fields mean anything — asking for m²/h on a flat
 * amount is noise — so the form follows the unit rather than showing
 * everything at once.
 */
export function CalculationLineEditor({
  action,
  catalog,
  line,
  onCancel,
}: {
  action: Action;
  catalog: CatalogItem[];
  line?: CalculationLine;
  onCancel?: () => void;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [unit, setUnit] = useState<CalculationUnit>(line?.calculation_unit ?? 'QM');
  const [catalogItemId, setCatalogItemId] = useState(line?.catalog_item_id ?? '');
  const [frequency, setFrequency] = useState<CalculationFrequency>(line?.frequency ?? 'PRO_WOCHE');
  const [showOverride, setShowOverride] = useState(line?.minutes_override != null);
  const countable = countableFrequencies.includes(frequency);

  // Choosing a catalogue service copies its assumptions in. They are defaults,
  // not rules: everything stays editable, and the line keeps its own copy so a
  // later catalogue edit cannot reach back into it.
  const applyCatalogItem = (id: string, form: HTMLFormElement | null) => {
    const item = catalog.find((entry) => entry.id === id);
    if (!item || !form) return;
    const set = (name: string, value: string) => {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) field.value = value;
    };
    setCatalogItemId(id);
    setUnit(item.calculation_unit);
    set('service_name', item.name);
    set('calculation_unit', item.calculation_unit);
    set('productivity', item.default_productivity_per_hour?.toString().replace('.', ',') ?? '');
    set('minutes_per_unit', item.default_minutes_per_unit?.toString().replace('.', ',') ?? '');
    set('material', euro(item.default_material_cents));
    set('material_basis', item.default_material_basis);
  };

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-border/80 bg-card p-4 sm:p-5">
      <FormMessage status={state.status} message={state.message} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Bereich / Raumbezeichnung"
          htmlFor="area_name"
          info="Wo wird die Leistung ausgeführt? Zum Beispiel „3. OG · Besprechungsraum“."
        >
          <Input
            id="area_name"
            name="area_name"
            required
            maxLength={160}
            defaultValue={line?.area_name ?? ''}
            placeholder="z. B. 3. OG · Besprechungsraum"
          />
        </Field>
        <Field
          label="Leistung auswählen"
          htmlFor="catalog_item_id"
          info="Eine Vorlage übernimmt Einheit, Richtleistung und Materialansatz. Für Sonderleistungen „Frei erfassen“ wählen."
        >
          <Select
            id="catalog_item_id"
            name="catalog_item_id"
            value={catalogItemId}
            onChange={(event) => {
              const id = event.target.value;
              setCatalogItemId(id);
              if (id) applyCatalogItem(id, event.target.form);
            }}
          >
            <option value="">Frei erfassen</option>
            {catalog.map((item) => (
              <option key={item.id} value={item.id}>
                {item.category ? `${item.category} · ${item.name}` : item.name}
              </option>
            ))}
          </Select>
        </Field>
        {catalogItemId ? (
          <input type="hidden" id="service_name" name="service_name" defaultValue={line?.service_name ?? ''} />
        ) : (
          <Field label="Leistung" htmlFor="service_name" info="Nur nötig, wenn keine Vorlage aus dem Katalog verwendet wird.">
            <Input
              id="service_name"
              name="service_name"
              required
              maxLength={160}
              defaultValue={line?.service_name ?? ''}
              placeholder="z. B. Sonderreinigung Empfang"
            />
          </Field>
        )}
        <Field label="Einheit" htmlFor="calculation_unit">
          <Select
            id="calculation_unit"
            name="calculation_unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value as CalculationUnit)}
          >
            {units.map((value) => (
              <option key={value} value={value}>
                {unitLabels[value]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={unit === 'QM' ? 'Fläche (m²)' : 'Menge'} htmlFor="quantity">
          <Input id="quantity" name="quantity" inputMode="decimal" required defaultValue={line?.quantity?.toString().replace('.', ',') ?? ''} />
        </Field>
        <Field label="Turnus" htmlFor="frequency">
          <Select
            id="frequency"
            name="frequency"
            value={frequency}
            onChange={(event) => setFrequency(event.target.value as CalculationFrequency)}
          >
            {frequencies.map((value) => (
              <option key={value} value={value}>
                {frequencyLabels[value]}
              </option>
            ))}
          </Select>
        </Field>
        {/*
          "Anzahl" only means something where the Turnus leaves it open. Asking
          how many times a vierteljährliche Leistung happens per quarter invites
          an answer that quietly triples the contract.
        */}
        {countable ? (
          <Field
            label="Anzahl"
            htmlFor="frequency_count"
            info={frequency === 'PRO_WOCHE' ? 'Einsätze pro Woche.' : 'Einsätze pro Monat.'}
          >
            <Input id="frequency_count" name="frequency_count" inputMode="decimal" defaultValue={line?.frequency_count?.toString().replace('.', ',') ?? '1'} />
          </Field>
        ) : (
          <input type="hidden" name="frequency_count" value="1" />
        )}
      </div>

      {/*
        Which days the team attends. Planning detail rather than arithmetic —
        the cost follows from the Turnus — but it belongs on the position,
        because it is what the Leistungsverzeichnis and the Einsatzplan need.
      */}
      {/* Productivity only means something for area and piece work. */}
      {unit === 'QM' && (
        <Field label="Richtleistung (m²/h)" htmlFor="productivity" info="Erfahrungswert: wie viele m² eine Kraft in einer Stunde schafft. Daraus wird die Zeit berechnet.">
          <Input id="productivity" name="productivity" inputMode="decimal" defaultValue={line?.productivity_per_hour?.toString().replace('.', ',') ?? ''} />
        </Field>
      )}
      {(unit === 'STUECK' || unit === 'EINSATZ') && (
        <Field label={unit === 'STUECK' ? 'Minuten je Stück' : 'Minuten je Einsatz'} htmlFor="minutes_per_unit">
          <Input id="minutes_per_unit" name="minutes_per_unit" inputMode="decimal" defaultValue={line?.minutes_per_unit?.toString().replace('.', ',') ?? ''} />
        </Field>
      )}
      {unit === 'QM' && <input type="hidden" name="area_sqm" value="" />}

      {/*
        The professional escape hatch. A Richtleistung is an average and the
        office has walked this building — but a departure has to be
        attributable, or a typo looks exactly like judgement.
      */}
      <details className="rounded-lg border border-border/80 bg-muted/20 p-3.5">
        <summary className="cursor-pointer list-none font-medium">Weitere Angaben</summary>
        <p className="mt-1 text-xs text-muted-foreground">Planung, Sonderzeiten und Zusatzkosten nur bei Bedarf.</p>
        <div className="mt-4 space-y-4">
          {frequency !== 'EINMALIG' && (
            <fieldset>
              <legend className="text-sm font-medium">Wochentage (optional)</legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {weekdayLabels.map((day) => (
                  <label
                    key={day.value}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-border/80 bg-card px-3 text-sm font-medium has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary"
                  >
                    <input
                      type="checkbox"
                      name="service_weekdays"
                      value={day.value}
                      defaultChecked={line?.service_weekdays?.includes(day.value) ?? false}
                      className="size-4 accent-current"
                    />
                    <span>{day.short}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

      {showOverride ? (
        <div className="grid gap-4 rounded-lg border border-warning/25 bg-warning-soft/50 p-3.5 sm:grid-cols-2">
          <Field label="Zeit manuell (Minuten je Einsatz)" htmlFor="minutes_override">
            <Input id="minutes_override" name="minutes_override" inputMode="decimal" defaultValue={line?.minutes_override?.toString().replace('.', ',') ?? ''} />
          </Field>
          <Field label="Begründung" htmlFor="override_reason">
            <Input id="override_reason" name="override_reason" maxLength={1000} defaultValue={line?.override_reason ?? ''} placeholder="z. B. stark verwinkelt, hoher Publikumsverkehr" />
          </Field>
          <button
            type="button"
            onClick={() => setShowOverride(false)}
            className="justify-self-start text-sm font-medium text-muted-foreground underline-offset-4 hover:underline sm:col-span-2"
          >
            Zurück zur Richtleistung
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowOverride(true)}
          className="inline-flex min-h-touch items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline md:min-h-9"
        >
          <TriangleAlert className="size-4" aria-hidden="true" />
          Zeit abweichend von der Richtleistung festlegen
        </button>
      )}

      <details className="rounded-lg border border-border/80 bg-card p-3.5">
        <summary className="cursor-pointer list-none text-sm font-medium">Material, Maschinen, Sonstiges</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {(
            [
              ['material', 'Material', line?.material_cents, line?.material_basis],
              ['machine', 'Maschinen', line?.machine_cents, line?.machine_basis],
              ['other', 'Sonstiges', line?.other_cents, line?.other_basis],
            ] as const
          ).map(([name, label, cents, basis]) => (
            <div key={name} className="grid grid-cols-[1fr_auto] gap-2">
              <Field label={`${label} (€)`} htmlFor={name}>
                <Input id={name} name={name} inputMode="decimal" defaultValue={cents != null ? euro(cents) : '0,00'} />
              </Field>
              <Field label="Basis" htmlFor={`${name}_basis`}>
                <Select id={`${name}_basis`} name={`${name}_basis`} defaultValue={basis ?? 'PRO_EINSATZ'}>
                  {bases.map((value) => (
                    <option key={value} value={value}>
                      {costBasisLabels[value]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          ))}
        </div>
      </details>

      <Field label="Hinweis für das Leistungsverzeichnis" htmlFor="scope_note" info="Kundenseitig sichtbar. Keine Kosten oder Margen eintragen.">
        <Input id="scope_note" name="scope_note" maxLength={1000} defaultValue={line?.scope_note ?? ''} />
      </Field>
        </div>
      </details>

      <div className="flex flex-wrap gap-3">
        <SubmitButton className="w-full justify-center sm:w-auto">
          <Plus className="size-4" aria-hidden="true" />
          {line ? 'Position speichern' : 'Position hinzufügen'}
        </SubmitButton>
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-touch text-sm font-medium text-muted-foreground underline-offset-4 hover:underline md:min-h-9">
            Abbrechen
          </button>
        )}
      </div>
    </form>
  );
}

/** Removing a position, with the confirmation a destructive action deserves. */
export function RemoveLineButton({ action, label }: { action: () => Promise<void>; label: string }) {
  return (
    <form action={action}>
      <button
        type="submit"
        aria-label={`${label} entfernen`}
        className="grid size-touch place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-danger-soft hover:text-danger md:size-9"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </form>
  );
}
