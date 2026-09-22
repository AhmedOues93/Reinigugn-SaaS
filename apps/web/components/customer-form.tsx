'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormState, initialFormState } from '@/lib/actions';
import { Button, Field, FormSection, Input, Textarea } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form-controls';

type CustomerRecord = { id?: string; name?: string | null; customer_number?: string | null; contact_first_name?: string | null; contact_last_name?: string | null; email?: string | null; phone?: string | null; billing_address?: string | null; city?: string | null; postal_code?: string | null; billing_country?: string | null; billing_email?: string | null; payment_terms_days?: number | null; vat_id?: string | null; datev_debtor_account?: string | null; notes?: string | null };
type CustomerAction = (state: FormState, formData: FormData) => Promise<FormState>;

export function CustomerForm({ customer, action, submitLabel }: { customer?: CustomerRecord; action: CustomerAction; submitLabel: string }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success' && state.id) router.push(`/dashboard/kunden/${state.id}?success=${encodeURIComponent('Kunde wurde gespeichert.')}`);
  }, [router, state]);

  function nextStep() {
    const container = formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    const fields = Array.from(container?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea') ?? []);
    const invalid = fields.find((field) => !field.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return;
    }
    setStep((Math.min(4, step + 1)) as 1 | 2 | 3 | 4);
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <FormMessage status={state.status} message={state.message} />

      <div className="rounded-xl border border-border bg-muted/25 p-3">
        <div className="grid grid-cols-4 gap-1 text-center text-[11px] font-medium sm:text-xs">
          {['Kunde', 'Kontakt', 'Rechnung', 'Notizen'].map((label, index) => (
            <span key={label} className={step === index + 1 ? 'text-primary' : 'text-muted-foreground'}>
              {index + 1}. <span className="max-sm:hidden">{label}</span>
            </span>
          ))}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
          <div className="h-full bg-primary transition-all" style={{ width: `${step * 25}%` }} />
        </div>
      </div>

      <div data-step="1" className={step === 1 ? 'block' : 'hidden'} aria-hidden={step !== 1}>
      <FormSection title="Kunde">
        <Field label="Kundenname" htmlFor="name" className="sm:col-span-2">
          <Input id="name" name="name" defaultValue={customer?.name ?? ''} maxLength={160} required />
        </Field>
        <Field label="Kundennummer" htmlFor="customer_number" optional info="Wird automatisch fortlaufend vergeben (z. B. K-0001), wenn Sie das Feld leer lassen.">
          <Input id="customer_number" name="customer_number" defaultValue={customer?.customer_number ?? ''} placeholder="Automatisch" maxLength={64} />
        </Field>
      </FormSection>
      </div>

      <div data-step="2" className={step === 2 ? 'block' : 'hidden'} aria-hidden={step !== 2}>
      <FormSection title="Ansprechperson">
        <Field label="Vorname" htmlFor="contact_first_name">
          <Input id="contact_first_name" name="contact_first_name" defaultValue={customer?.contact_first_name ?? ''} maxLength={120} autoComplete="off" />
        </Field>
        <Field label="Nachname" htmlFor="contact_last_name">
          <Input id="contact_last_name" name="contact_last_name" defaultValue={customer?.contact_last_name ?? ''} maxLength={120} autoComplete="off" />
        </Field>
        <Field label="E-Mail-Adresse" htmlFor="email">
          <Input id="email" name="email" type="email" defaultValue={customer?.email ?? ''} maxLength={254} autoComplete="off" />
        </Field>
        <Field label="Telefon" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={customer?.phone ?? ''} maxLength={64} autoComplete="off" />
        </Field>
      </FormSection>
      </div>

      <div data-step="3" className={step === 3 ? 'block' : 'hidden'} aria-hidden={step !== 3}>
      <FormSection title="Rechnungsdaten" description="Erscheinen auf jeder Rechnung an diesen Kunden.">
        <Field
          label="Rechnungs-E-Mail"
          htmlFor="billing_email"
          className="sm:col-span-2"
          optional
          info="Ziel für den Rechnungsversand per E-Mail. Leer lassen, wenn Rechnungen an die allgemeine E-Mail-Adresse gehen."
        >
          <Input id="billing_email" name="billing_email" type="email" defaultValue={customer?.billing_email ?? ''} maxLength={254} />
        </Field>
        <Field label="Straße und Hausnummer" htmlFor="billing_address" className="sm:col-span-2">
          <Input id="billing_address" name="billing_address" defaultValue={customer?.billing_address ?? ''} maxLength={500} />
        </Field>
        <Field label="Postleitzahl" htmlFor="postal_code">
          <Input id="postal_code" name="postal_code" defaultValue={customer?.postal_code ?? ''} maxLength={16} inputMode="numeric" />
        </Field>
        <Field label="Ort" htmlFor="city">
          <Input id="city" name="city" defaultValue={customer?.city ?? ''} maxLength={120} />
        </Field>
        <Field label="Land" htmlFor="billing_country">
          <Input id="billing_country" name="billing_country" defaultValue={customer?.billing_country ?? 'Deutschland'} maxLength={120} />
        </Field>
        <Field label="Zahlungsziel (Tage)" htmlFor="payment_terms_days" optional info="Überschreibt das Standard-Zahlungsziel Ihrer Firma für diesen Kunden.">
          <Input id="payment_terms_days" name="payment_terms_days" type="number" min="0" max="365" defaultValue={customer?.payment_terms_days ?? ''} />
        </Field>
        <Field label="USt-IdNr. des Kunden" htmlFor="vat_id" optional info="Nur bei Geschäftskunden, z. B. für innergemeinschaftliche Leistungen.">
          <Input id="vat_id" name="vat_id" defaultValue={customer?.vat_id ?? ''} maxLength={64} />
        </Field>
        <Field
          label="DATEV-Debitorenkonto"
          htmlFor="datev_debtor_account"
          optional
          info="Nur nötig für den DATEV-Buchungsexport. Das Konto mit der Steuerberatung abstimmen."
        >
          <Input
            id="datev_debtor_account"
            name="datev_debtor_account"
            inputMode="numeric"
            maxLength={11}
            defaultValue={customer?.datev_debtor_account ?? ''}
          />
        </Field>
      </FormSection>
      </div>

      <div data-step="4" className={step === 4 ? 'block' : 'hidden'} aria-hidden={step !== 4}>
      <FormSection title="Interne Notizen" description="Nur für Ihr Büro sichtbar.">
        <Field label="Notizen" htmlFor="notes" className="sm:col-span-2" optional>
          <Textarea id="notes" name="notes" defaultValue={customer?.notes ?? ''} maxLength={4000} />
        </Field>
      </FormSection>
      </div>

      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-popover backdrop-blur">
        <Button
          type="button"
          variant="outline"
          onClick={() => step === 1 ? router.back() : setStep((step - 1) as 1 | 2 | 3 | 4)}
        >
          {step === 1 ? 'Abbrechen' : <><ChevronLeft className="size-4" />Zurück</>}
        </Button>
        {step < 4 ? (
          <Button type="button" onClick={nextStep}>
            Weiter<ChevronRight className="size-4" />
          </Button>
        ) : (
          <SubmitButton>{submitLabel}</SubmitButton>
        )}
      </div>
    </form>
  );
}
