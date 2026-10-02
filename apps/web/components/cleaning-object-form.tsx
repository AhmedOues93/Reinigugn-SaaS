'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type FormState, initialFormState } from '@/lib/actions';
import { Button, Field, FormSection, Input, Select, Textarea } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form-controls';

type ObjectRecord = { id?: string; customer_id?: string | null; name?: string | null; object_number?: string | null; street?: string | null; postal_code?: string | null; city?: string | null; country?: string | null; contact_first_name?: string | null; contact_last_name?: string | null; contact_phone?: string | null; contact_email?: string | null; area_sqm?: number | null; areas_description?: string | null; access_instructions?: string | null; cleaning_instructions?: string | null; notes?: string | null; checklist_template_id?: string | null };
type CustomerOption = { id: string; name: string; customer_number: string | null; is_active: boolean };
type ObjectAction = (state: FormState, formData: FormData) => Promise<FormState>;

export function CleaningObjectForm({
  object,
  customers,
  templates,
  action,
  submitLabel,
}: {
  object?: ObjectRecord;
  customers: CustomerOption[];
  templates: { id: string; name: string }[];
  action: ObjectAction;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  useEffect(() => {
    if (state.status === 'success' && state.id) router.push(`/dashboard/objekte/${state.id}?success=${encodeURIComponent('Objekt wurde gespeichert.')}`);
  }, [router, state]);

  function nextStep() {
    const container = formRef.current?.querySelector<HTMLElement>('[data-step="' + step + '"]');
    const fields = Array.from(container?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea') ?? []);
    const invalid = fields.find((field) => !field.checkValidity());
    if (invalid) { invalid.reportValidity(); return; }
    setStep((Math.min(4, step + 1)) as 1 | 2 | 3 | 4);
  }

  return (
    <form ref={formRef} action={formAction}>
      <FormMessage status={state.status} message={state.message} />

      <div className="mb-5 rounded-xl border border-border bg-muted/25 p-3">
        <div className="grid grid-cols-4 gap-1 text-center text-[11px] font-medium sm:text-xs">
          {['Allgemein', 'Adresse', 'Kontakt', 'Vor Ort'].map((label, index) => (
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
      <FormSection title="Allgemein">
        <Field label="Kunde" htmlFor="customer_id" className="sm:col-span-2">
          <Select id="customer_id" name="customer_id" defaultValue={object?.customer_id ?? ''} required>
            <option value="" disabled>
              Kunde auswählen
            </option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
                {customer.customer_number ? ` (${customer.customer_number})` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Objektname" htmlFor="name">
          <Input id="name" name="name" defaultValue={object?.name ?? ''} maxLength={160} required />
        </Field>
        <Field label="Objektnummer" htmlFor="object_number" optional info="Wird automatisch fortlaufend vergeben (z. B. O-0001), wenn Sie das Feld leer lassen.">
          <Input id="object_number" name="object_number" defaultValue={object?.object_number ?? ''} placeholder="Automatisch" maxLength={64} />
        </Field>
        <Field
          label="Standardcheckliste"
          htmlFor="checklist_template_id"
          className="sm:col-span-2"
          optional
          info="Neue Aufträge für dieses Objekt erhalten eine Kopie dieser Checkliste. Spätere Änderungen an der Vorlage verändern bereits erstellte Aufträge nicht."
        >
          <Select id="checklist_template_id" name="checklist_template_id" defaultValue={object?.checklist_template_id ?? ''}>
            <option value="">Keine Standardcheckliste</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>
      </div>

      <div data-step="2" className={step === 2 ? 'block' : 'hidden'} aria-hidden={step !== 2}>
      <FormSection title="Adresse">
        <Field label="Straße und Hausnummer" htmlFor="street" className="sm:col-span-2">
          <Input id="street" name="street" defaultValue={object?.street ?? ''} maxLength={240} />
        </Field>
        <Field label="Postleitzahl" htmlFor="postal_code">
          <Input id="postal_code" name="postal_code" defaultValue={object?.postal_code ?? ''} maxLength={16} inputMode="numeric" />
        </Field>
        <Field label="Ort" htmlFor="city">
          <Input id="city" name="city" defaultValue={object?.city ?? ''} maxLength={120} />
        </Field>
        <Field label="Land" htmlFor="country">
          <Input id="country" name="country" defaultValue={object?.country ?? 'Deutschland'} maxLength={120} />
        </Field>
      </FormSection>
      </div>

      <div data-step="3" className={step === 3 ? 'block' : 'hidden'} aria-hidden={step !== 3}>
      <FormSection title="Kontakt vor Ort" description="Sieht das Reinigungsteam im Einsatz.">
        <Field label="Vorname" htmlFor="contact_first_name">
          <Input id="contact_first_name" name="contact_first_name" defaultValue={object?.contact_first_name ?? ''} maxLength={120} />
        </Field>
        <Field label="Nachname" htmlFor="contact_last_name">
          <Input id="contact_last_name" name="contact_last_name" defaultValue={object?.contact_last_name ?? ''} maxLength={120} />
        </Field>
        <Field label="Telefon" htmlFor="contact_phone">
          <Input id="contact_phone" name="contact_phone" type="tel" defaultValue={object?.contact_phone ?? ''} maxLength={64} />
        </Field>
        <Field label="E-Mail" htmlFor="contact_email">
          <Input id="contact_email" name="contact_email" type="email" defaultValue={object?.contact_email ?? ''} maxLength={254} />
        </Field>
      </FormSection>
      </div>

      <div data-step="4" className={step === 4 ? 'block' : 'hidden'} aria-hidden={step !== 4}>
      <FormSection title="Vor Ort" description="Was das Team für den Einsatz wissen muss.">
        <Field label="Fläche in m²" htmlFor="area_sqm" optional>
          <Input id="area_sqm" name="area_sqm" type="number" min="0.01" step="0.01" defaultValue={object?.area_sqm ?? ''} />
        </Field>
        <Field label="Etagen / Bereiche" htmlFor="areas_description" optional>
          <Input id="areas_description" name="areas_description" defaultValue={object?.areas_description ?? ''} maxLength={500} />
        </Field>
        <Field label="Zugangshinweise" htmlFor="access_instructions" className="sm:col-span-2" hint="Keine Alarmcodes, Passwörter oder PINs speichern.">
          <Textarea id="access_instructions" name="access_instructions" defaultValue={object?.access_instructions ?? ''} maxLength={4000} placeholder="z. B. Schlüssel beim Hausmeister, Eingang Hofseite" />
        </Field>
        <Field label="Reinigungsanweisungen" htmlFor="cleaning_instructions" className="sm:col-span-2" optional>
          <Textarea id="cleaning_instructions" name="cleaning_instructions" defaultValue={object?.cleaning_instructions ?? ''} maxLength={4000} />
        </Field>
        <Field label="Interne Notizen" htmlFor="notes" className="sm:col-span-2" optional info="Nur für das Büro sichtbar – nicht in der Mitarbeiter-App und nicht im Kundenportal.">
          <Textarea id="notes" name="notes" defaultValue={object?.notes ?? ''} maxLength={4000} />
        </Field>
      </FormSection>
      </div>

      <div className="sticky bottom-3 z-10 mt-5 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-popover backdrop-blur">
        <Button
          type="button"
          variant="outline"
          onClick={() => step === 1 ? router.back() : setStep((step - 1) as 1 | 2 | 3 | 4)}
        >
          {step === 1 ? 'Abbrechen' : 'Zurück'}
        </Button>
        {step < 4 ? (
          <Button type="button" onClick={nextStep}>
            Weiter
          </Button>
        ) : (
          <SubmitButton>{submitLabel}</SubmitButton>
        )}
      </div>
    </form>
  );
}
