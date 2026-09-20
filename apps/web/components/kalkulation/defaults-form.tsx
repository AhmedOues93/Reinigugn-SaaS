'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { FormActions } from '@/components/ui';
import { CostingFields } from '@/components/kalkulation/costing-fields';
import { initialFormState, type FormState } from '@/lib/actions';
import type { CalculationDefaults } from '@/lib/kalkulation';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

/**
 * The company's calculation assumptions.
 *
 * The fields themselves live in `CostingFields`, shared with the first-run
 * wizard: the setup screen and this one must not be able to disagree about what
 * a company can configure.
 *
 * Changing anything here affects new calculations only. Every calculation
 * carries its own copy of these numbers, so a wage review cannot retroactively
 * move a price that was already offered or accepted.
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
          Diese Werte sind noch nicht hinterlegt. Die vorgeschlagenen Ausfalltage sind Startwerte aus
          der Praxis, keine Norm — Lohn, Nebenkosten und produktiver Anteil sind betriebsindividuell.
        </p>
      )}

      <CostingFields defaults={defaults} />

      <p className="text-sm leading-6 text-muted-foreground">
        Änderungen gelten für neue Kalkulationen. Bestehende Kalkulationen, Angebote und Verträge
        behalten die Annahmen, mit denen sie erstellt wurden.
      </p>

      <FormActions>
        <SubmitButton>Grundlagen speichern</SubmitButton>
      </FormActions>
    </form>
  );
}
