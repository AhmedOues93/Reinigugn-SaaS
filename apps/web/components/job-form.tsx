'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormState, initialFormState } from '@/lib/actions';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form-controls';

type Option = { id: string; name: string; customer_id?: string; is_active?: boolean };
type Employee = {
  id: string;
  status?: string;
  invited_first_name?: string | null;
  invited_last_name?: string | null;
  profiles:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null;
};
type JobRecord = {
  id?: string;
  customer_id?: string;
  cleaning_object_id?: string;
  checklist_template_id?: string | null;
  title?: string;
  description?: string | null;
  scheduled_date?: string;
  planned_start_at?: string;
  planned_end_at?: string;
  status?: string;
  priority?: string;
  internal_notes?: string | null;
  employee_instructions?: string | null;
  job_assignments?: { member_id: string }[];
};
type JobAction = (state: FormState, data: FormData) => Promise<FormState>;

function time(value?: string) {
  return value
    ? new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Europe/Berlin',
      }).format(new Date(value))
    : '';
}

function employeeName(employee: Employee) {
  const profile = Array.isArray(employee.profiles) ? employee.profiles[0] : employee.profiles;
  return (
    [profile?.first_name ?? employee.invited_first_name, profile?.last_name ?? employee.invited_last_name]
      .filter(Boolean)
      .join(' ') || 'Mitarbeiter'
  );
}

export function JobForm({
  job,
  customers,
  objects,
  employees,
  templates,
  action,
  submitLabel,
}: {
  job?: JobRecord;
  customers: Option[];
  objects: Option[];
  employees: Employee[];
  templates: { id: string; name: string }[];
  action: JobAction;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [customerId, setCustomerId] = useState(job?.customer_id ?? '');
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.status === 'success' && state.id) {
      router.push('/dashboard/auftraege/' + state.id + '?success=' + encodeURIComponent('Auftrag wurde gespeichert.'));
    }
  }, [router, state]);

  const selectedMembers = new Set(job?.job_assignments?.map((item) => item.member_id) ?? []);
  const availableObjects = objects.filter((object) => object.customer_id === customerId);

  function nextStep() {
    const container = formRef.current?.querySelector<HTMLElement>('[data-step="' + step + '"]');
    const fields = Array.from(
      container?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input:not([type="hidden"]):not([type="checkbox"]), select, textarea',
      ) ?? [],
    );
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

      {state.conflictWarning && (
        <label className="block rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-foreground">
          <strong className="text-warning">Bitte vor dem Speichern prüfen:</strong>{' '}
          <span className="break-anywhere">{state.conflictWarning}</span>
          <span className="mt-3 flex min-h-touch items-center gap-2 font-medium">
            <input name="confirm_conflicts" value="true" type="checkbox" className="size-4" />
            Trotzdem speichern
          </span>
        </label>
      )}

      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-muted/25 p-3">
        <div className="grid grid-cols-4 gap-1 text-center text-[11px] font-medium sm:text-xs">
          {['Objekt', 'Termin', 'Team', 'Hinweise'].map((label, index) => (
            <span key={label} className={step === index + 1 ? 'text-primary' : 'text-muted-foreground'}>
              {index + 1}. <span className="max-sm:hidden">{label}</span>
            </span>
          ))}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
          <div className="h-full bg-primary transition-all" style={{ width: String(step * 25) + '%' }} />
        </div>
      </div>

      <div data-step="1" className={step === 1 ? 'mx-auto block max-w-2xl' : 'hidden'} aria-hidden={step !== 1}>
        <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
          <h2 className="font-semibold">Kunde & Objekt</h2>
          <p className="mt-1 text-sm text-muted-foreground">Welcher einzelne Einsatz soll geplant werden?</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Kunde" htmlFor="job-customer">
              <Select
                id="job-customer"
                name="customer_id"
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                required
              >
                <option value="" disabled>Kunde auswählen</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Objekt" htmlFor="job-object">
              <Select id="job-object" name="cleaning_object_id" defaultValue={job?.cleaning_object_id ?? ''} required>
                <option value="" disabled>Objekt auswählen</option>
                {availableObjects.map((object) => (
                  <option key={object.id} value={object.id}>{object.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Titel" htmlFor="job-title" className="sm:col-span-2">
              <Input id="job-title" name="title" defaultValue={job?.title ?? ''} required maxLength={160} placeholder="z. B. Grundreinigung Eingangsbereich" />
            </Field>
            <Field label="Beschreibung" htmlFor="job-description" optional className="sm:col-span-2">
              <Textarea id="job-description" name="description" defaultValue={job?.description ?? ''} maxLength={4000} />
            </Field>
          </div>
        </section>
      </div>

      <div data-step="2" className={step === 2 ? 'mx-auto block max-w-2xl' : 'hidden'} aria-hidden={step !== 2}>
        <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
          <h2 className="font-semibold">Termin</h2>
          <p className="mt-1 text-sm text-muted-foreground">Datum, Zeit und Priorität für diesen Einsatz.</p>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Datum" htmlFor="job-date">
              <Input id="job-date" name="scheduled_date" type="date" defaultValue={job?.scheduled_date ?? ''} required />
            </Field>
            <Field label="Status" htmlFor="job-status">
              <Select id="job-status" name="status" defaultValue={job?.status ?? 'PLANNED'}>
                <option value="PLANNED">Geplant</option>
                <option value="CONFIRMED">Bestätigt</option>
                <option value="CANCELLED">Storniert</option>
              </Select>
            </Field>
            <Field label="Beginn" htmlFor="job-start">
              <Input id="job-start" name="planned_start_time" type="time" defaultValue={time(job?.planned_start_at)} required />
            </Field>
            <Field label="Ende" htmlFor="job-end">
              <Input id="job-end" name="planned_end_time" type="time" defaultValue={time(job?.planned_end_at)} required />
            </Field>
            <Field label="Priorität" htmlFor="job-priority">
              <Select id="job-priority" name="priority" defaultValue={job?.priority ?? 'NORMAL'}>
                <option value="LOW">Niedrig</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">Hoch</option>
                <option value="URGENT">Dringend</option>
              </Select>
            </Field>
            <Field label="Checkliste" htmlFor="job-checklist" optional>
              <Select id="job-checklist" name="checklist_template_id" defaultValue={job?.checklist_template_id ?? ''}>
                <option value="">Objektstandard verwenden</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </Select>
            </Field>
          </div>
        </section>
      </div>

      <div data-step="3" className={step === 3 ? 'mx-auto block max-w-2xl' : 'hidden'} aria-hidden={step !== 3}>
        <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
          <h2 className="font-semibold">Mitarbeiter</h2>
          <p className="mt-1 text-sm text-muted-foreground">Optional. Du kannst die Besetzung auch später in der Planung ändern.</p>
          {employees.length === 0 ? (
            <p className="mt-5 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Noch keine Mitarbeiter verfügbar. Der Auftrag kann trotzdem angelegt werden.
            </p>
          ) : (
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {employees.map((employee) => (
                <label key={employee.id} className="flex min-h-11 items-center gap-3 rounded-xl border border-border p-3 text-sm">
                  <input type="checkbox" name="member_ids" value={employee.id} defaultChecked={selectedMembers.has(employee.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{employeeName(employee)}</span>
                    {employee.status === 'INVITED' && <span className="block text-xs text-muted-foreground">Einladung offen</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
        </section>
      </div>

      <div data-step="4" className={step === 4 ? 'mx-auto block max-w-2xl' : 'hidden'} aria-hidden={step !== 4}>
        <section className="rounded-xl border border-border/80 bg-card p-5 shadow-card sm:p-6">
          <h2 className="font-semibold">Hinweise</h2>
          <p className="mt-1 text-sm text-muted-foreground">Nur das eintragen, was für diesen Einsatz wirklich relevant ist.</p>
          <div className="mt-5 grid gap-4">
            <Field label="Arbeitsanweisung" htmlFor="job-instructions" optional>
              <Textarea id="job-instructions" name="employee_instructions" defaultValue={job?.employee_instructions ?? ''} maxLength={4000} />
            </Field>
            <Field label="Interne Notiz" htmlFor="job-internal" optional>
              <Textarea id="job-internal" name="internal_notes" defaultValue={job?.internal_notes ?? ''} maxLength={4000} />
            </Field>
          </div>
        </section>
      </div>

      <div className="sticky bottom-3 z-10 mx-auto flex max-w-2xl items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-popover backdrop-blur">
        <Button
          type="button"
          variant="outline"
          onClick={() => (step === 1 ? router.back() : setStep((step - 1) as 1 | 2 | 3 | 4))}
        >
          {step === 1 ? 'Abbrechen' : <><ChevronLeft className="size-4" />Zurück</>}
        </Button>
        {step < 4 ? (
          <Button type="button" onClick={nextStep}>
            Weiter
            <ChevronRight className="size-4" />
          </Button>
        ) : (
          <SubmitButton>{submitLabel}</SubmitButton>
        )}
      </div>
    </form>
  );
}
