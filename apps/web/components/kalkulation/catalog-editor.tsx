'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Card, CardHeader, Field, Input, Select } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import { costBasisLabels, unitLabels, type CalculationUnit } from '@/lib/kalkulation';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
const units: CalculationUnit[] = ['QM', 'STUNDE', 'STUECK', 'EINSATZ', 'PAUSCHAL'];
const bases = ['PRO_EINSATZ', 'PRO_MONAT', 'PRO_STUNDE', 'PRO_QM'] as const;

/**
 * Adding a service to the catalogue.
 *
 * Which productivity field is asked for follows the unit: m²/h for area work,
 * minutes for piece and per-visit work, and nothing at all for a flat amount.
 * Asking for all three at once is how a form teaches people to ignore it.
 */
export function CatalogItemEditor({ action, item }: { action: Action; item?: {
  name: string; category: string | null; calculation_unit: CalculationUnit; default_productivity_per_hour: number | null;
  default_minutes_per_unit: number | null; default_material_cents: number; default_material_basis: string; description: string | null; is_active: boolean;
} }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [unit, setUnit] = useState<CalculationUnit>(item?.calculation_unit ?? 'QM');

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={item ? 'Leistung bearbeiten' : 'Leistung hinzufügen'}
        description="Einheit, Richtleistung und Materialansatz bilden die Grundlage für neue Kalkulationen."
      />
      <form action={formAction} className="space-y-5 p-5 sm:p-6">
        <FormMessage status={state.status} message={state.message} />

        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Bezeichnung" htmlFor="name" className="lg:col-span-2">
            <Input id="name" name="name" required minLength={2} maxLength={160} placeholder="z. B. Unterhaltsreinigung Büro" defaultValue={item?.name} />
          </Field>
          <Field label="Kategorie" htmlFor="category" info="Gruppiert die Liste, z. B. Unterhalt, Glas, Sonderreinigung.">
            <Input id="category" name="category" maxLength={80} defaultValue={item?.category ?? ''} />
          </Field>
          <Field label="Kalkulationseinheit" htmlFor="calculation_unit" hint="Bestimmt, wie der Aufwand berechnet wird.">
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

          {unit === 'QM' && (
            <Field
              label="Richtleistung (m²/h)"
              htmlFor="productivity"
              info="Wie viele m² eine Reinigungskraft in einer Stunde schafft. Erfahrungswert Ihres Betriebs."
            >
              <Input id="productivity" name="productivity" inputMode="decimal" required placeholder="z. B. 250" defaultValue={item?.default_productivity_per_hour ?? ''} />
            </Field>
          )}
          {(unit === 'STUECK' || unit === 'EINSATZ') && (
            <Field label={unit === 'STUECK' ? 'Minuten je Stück' : 'Minuten je Einsatz'} htmlFor="minutes_per_unit">
              <Input id="minutes_per_unit" name="minutes_per_unit" inputMode="decimal" defaultValue={item?.default_minutes_per_unit ?? ''} />
            </Field>
          )}

          <Field label="Material je Ansatz (€)" htmlFor="material" hint="0,00, wenn keine separaten Materialkosten anfallen.">
            <Input id="material" name="material" inputMode="decimal" defaultValue={item ? (item.default_material_cents / 100).toFixed(2).replace('.', ',') : '0,00'} />
          </Field>
          <Field label="Materialbasis" htmlFor="material_basis">
            <Select id="material_basis" name="material_basis" defaultValue={item?.default_material_basis ?? 'PRO_EINSATZ'}>
              {bases.map((value) => (
                <option key={value} value={value}>
                  {costBasisLabels[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Beschreibung" htmlFor="description" optional info="Kann als Leistungsbeschreibung im Leistungsverzeichnis dienen.">
          <Input id="description" name="description" maxLength={2000} defaultValue={item?.description ?? ''} />
        </Field>

        <input type="hidden" name="is_active" value={item?.is_active === false ? 'false' : 'true'} />
        <SubmitButton>
          <Plus className="size-4" aria-hidden="true" />
          {item ? 'Änderungen speichern' : 'Leistung speichern'}
        </SubmitButton>
      </form>
    </Card>
  );
}
