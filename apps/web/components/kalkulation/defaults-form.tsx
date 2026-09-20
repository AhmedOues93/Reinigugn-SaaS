'use client';

import { useActionState, useState } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Button } from '@/components/ui';
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
  const [step, setStep] = useState(0);
  const steps = ['Personalkosten', 'Produktive Zeit', 'Betriebskosten', 'Preisziel'] as const;

  return (
    <form action={formAction} className="space-y-7">
      <FormMessage status={state.status} message={state.message} />

      {unset && (
        <p className="border-s-2 border-primary bg-primary/[0.035] px-3 py-2 text-sm leading-5 text-foreground">
          Noch keine eigenen Kalkulationswerte hinterlegt. Startwerte dienen nur als Orientierung und sollten mit den Betriebsdaten geprüft werden.
        </p>
      )}

      <div className="border-b border-border/80 pb-4">
        <div className="grid grid-cols-4 gap-1.5">
          {steps.map((label, index) => (
            <button key={label} type="button" onClick={() => setStep(index)} className="min-w-0 text-start">
              <span className={`block h-1.5 rounded-full ${index <= step ? 'bg-primary' : 'bg-muted'}`} />
              <span className={`mt-2 hidden truncate text-xs sm:block ${index === step ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden">
        <CostingFields defaults={defaults} step={step} />
      </div>

      <p className="text-sm leading-6 text-muted-foreground">
        Änderungen gelten für neue Kalkulationen. Bestehende Kalkulationen, Angebote und Verträge
        behalten die Annahmen, mit denen sie erstellt wurden.
      </p>

      <div className="flex items-center justify-between border-t border-border/80 pt-5">
        <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeft className="size-4" /> Zurück</Button>
        {step < steps.length - 1 ? (
          <Button type="button" onClick={() => setStep((value) => Math.min(steps.length - 1, value + 1))}>Weiter <ArrowRight className="size-4" /></Button>
        ) : (
          <SubmitButton><Check className="size-4" /> Grundlagen speichern</SubmitButton>
        )}
      </div>
    </form>
  );
}
