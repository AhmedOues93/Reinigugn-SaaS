'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  nextHref,
}: {
  action: Action;
  defaults: CalculationDefaults;
  nextHref?: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const advanceAfterSave = useRef(false);
  const unset = defaults.wage_cents_per_hour === 0;
  const [step, setStep] = useState(0);
  const [visitedStep, setVisitedStep] = useState(0);
  const steps = ['Personalkosten', 'Produktive Zeit', 'Auftragskosten', 'Preis & Marge'] as const;

  useEffect(() => {
    if (state.status === 'error') {
      advanceAfterSave.current = false;
      return;
    }
    if (state.status !== 'success') return;

    if (advanceAfterSave.current) {
      advanceAfterSave.current = false;
      setStep((value) => {
        const next = Math.min(steps.length - 1, value + 1);
        setVisitedStep((visited) => Math.max(visited, next));
        return next;
      });
      return;
    }

    if (nextHref) router.push(nextHref);
  }, [state, nextHref, router, steps.length]);

  function saveAndContinue() {
    advanceAfterSave.current = true;
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-7">
      <FormMessage status={state.status} message={state.message} />

      {unset && (
        <p className="border-s-2 border-primary bg-primary/[0.035] px-3 py-2 text-sm leading-5 text-foreground">
          Vor der ersten Kalkulation richten Sie einmal Ihre betrieblichen Kalkulationsgrundlagen ein. Danach kehren Sie automatisch zur Kalkulation zurück. Die Werte bleiben später jederzeit anpassbar.
        </p>
      )}

      <div className="border-b border-border/80 pb-4">
        <div className="grid grid-cols-4 gap-1.5">
          {steps.map((label, index) => (
            <button key={label} type="button" onClick={() => { setStep(index); setVisitedStep((value) => Math.max(value, index)); }} className="min-w-0 text-start">
              <span className={`block h-1.5 rounded-full ${index <= step ? 'bg-primary' : 'bg-muted'}`} />
              <span className={`mt-2 hidden truncate text-xs sm:block ${index === step ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden">
        <CostingFields defaults={defaults} step={step} />
        <input type="hidden" name="wizard_visited_step" value={visitedStep} />
      </div>

      <p className="text-sm leading-6 text-muted-foreground">
        Änderungen gelten für neue Kalkulationen. Bestehende Kalkulationen, Angebote und Verträge
        behalten die Annahmen, mit denen sie erstellt wurden.
      </p>

      <div className="flex items-center justify-between border-t border-border/80 pt-5">
        <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((value) => Math.max(0, value - 1))}><ArrowLeft className="size-4" /> Zurück</Button>
        {step < steps.length - 1 ? (
          <Button type="button" onClick={saveAndContinue}>Weiter <ArrowRight className="size-4" /></Button>
        ) : (
          <SubmitButton><Check className="size-4" /> Grundlagen speichern</SubmitButton>
        )}
      </div>
    </form>
  );
}
