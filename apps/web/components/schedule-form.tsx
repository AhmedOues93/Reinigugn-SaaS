'use client';

import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { type FormState, initialFormState } from '@/lib/actions';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form-controls';

const weekdays = [
  ['Montag', 1],
  ['Dienstag', 2],
  ['Mittwoch', 3],
  ['Donnerstag', 4],
  ['Freitag', 5],
  ['Samstag', 6],
  ['Sonntag', 7],
] as const;

type Option = { id: string; name: string; customer_id?: string };
type Rule = { id?: string; weekday: number; planned_start_time: string; planned_end_time: string; is_active?: boolean };
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
type ScheduleRecord = {
  id?: string;
  customer_id?: string;
  cleaning_object_id?: string;
  checklist_template_id?: string | null;
  name?: string;
  description?: string | null;
  valid_from?: string;
  valid_until?: string | null;
  is_active?: boolean;
  acceptance_policy?: string | null;
  billing_mode?: string | null;
  assignment_mode?: 'AUTO' | 'MANUAL' | null;
  schedule_rules?: Rule[];
  service_schedule_assignments?: { member_id: string }[];
};
type ScheduleAction = (state: FormState, data: FormData) => Promise<FormState>;

function employeeName(employee: Employee) {
  const profile = Array.isArray(employee.profiles) ? employee.profiles[0] : employee.profiles;
  return (
    [profile?.first_name ?? employee.invited_first_name, profile?.last_name ?? employee.invited_last_name]
      .filter(Boolean)
      .join(' ') || 'Mitarbeiter'
  );
}

export function ScheduleForm({
  schedule,
  customers,
  objects,
  employees,
  templates,
  action,
  submitLabel,
}: {
  schedule?: ScheduleRecord;
  customers: Option[];
  objects: Option[];
  employees: Employee[];
  templates: { id: string; name: string }[];
  action: ScheduleAction;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, initialFormState);
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [customerId, setCustomerId] = useState(schedule?.customer_id ?? '');
  const [selectedMembers, setSelectedMembers] = useState(
    () => new Set(schedule?.service_schedule_assignments?.map((item) => item.member_id) ?? []),
  );
  const [assignmentMode, setAssignmentMode] = useState<'AUTO' | 'MANUAL'>(
    schedule?.assignment_mode === 'MANUAL' ? 'MANUAL' : 'AUTO',
  );
  const rules = schedule?.schedule_rules ?? [];
  const setupPending = Boolean(schedule && !schedule.is_active && rules.filter((rule) => rule.is_active !== false).length === 0);
  const [activateAfterSave, setActivateAfterSave] = useState(!schedule || setupPending ? true : Boolean(schedule?.is_active));

  const selectedObject = useMemo(
    () => objects.find((object) => object.id === schedule?.cleaning_object_id),
    [objects, schedule?.cleaning_object_id],
  );

  useEffect(() => {
    if (state.status === 'success' && state.id) {
      router.push(
        `/dashboard/planung/plaene/${state.id}?success=${encodeURIComponent(
          state.message ?? 'Plan wurde gespeichert.',
        )}`,
      );
    }
  }, [router, state]);

  function validateStep() {
    const container = formRef.current?.querySelector<HTMLElement>(`[data-step="${step}"]`);
    const fields = Array.from(
      container?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input:not([type="hidden"]), select, textarea',
      ) ?? [],
    );

    const invalid = fields.find((field) => !field.checkValidity());
    if (invalid) {
      invalid.reportValidity();
      return false;
    }

    if (step === 2) {
      const enabled = weekdays.some(([, weekday]) => {
        const checkbox = formRef.current?.querySelector<HTMLInputElement>(
          `input[name="weekday_${weekday}_enabled"]`,
        );
        return checkbox?.checked;
      });
      if (!enabled) {
        formRef.current?.querySelector<HTMLInputElement>('input[name="weekday_1_enabled"]')?.focus();
        return false;
      }
    }

    return true;
  }

  function next() {
    if (!validateStep()) return;
    setStep((Math.min(4, step + 1)) as 1 | 2 | 3 | 4);
  }

  const activeEmployees = employees.filter((employee) => employee.status === 'ACTIVE').length;
  const invitedEmployees = employees.filter((employee) => employee.status === 'INVITED').length;

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <FormMessage status={state.status} message={state.message} />
      <input type="hidden" name="activate_after_save" value={activateAfterSave ? 'true' : 'false'} />
      <input type="hidden" name="assignment_mode" value={assignmentMode} />

      {setupPending && (
        <div className="rounded-xl border border-warning/30 bg-warning-soft p-4">
          <p className="font-semibold">Planung vervollständigen</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Dieser Plan stammt aus einem angenommenen Kundenangebot. Lege Rhythmus und Team fest, danach kann ReinPlan die Einsätze erzeugen.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-muted/25 p-3">
        <div className="grid grid-cols-4 gap-1 text-center text-[11px] font-medium sm:text-xs">
          {['Basis', 'Rhythmus', 'Team', 'Abrechnung'].map((label, index) => (
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
        <section className="space-y-4">
          <div>
            <h2 className="font-semibold">Plan & Objekt</h2>
            <p className="mt-1 text-sm text-muted-foreground">Was wird für welchen Kunden geplant?</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Planname" htmlFor="schedule-name" className="sm:col-span-2">
              <Input id="schedule-name" name="name" defaultValue={schedule?.name ?? ''} required maxLength={160} />
            </Field>
            <Field label="Kunde" htmlFor="schedule-customer">
              <Select
                id="schedule-customer"
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
            <Field label="Objekt" htmlFor="schedule-object">
              <Select
                id="schedule-object"
                name="cleaning_object_id"
                defaultValue={schedule?.cleaning_object_id ?? ''}
                required
              >
                <option value="" disabled>Objekt auswählen</option>
                {objects
                  .filter((object) => object.customer_id === customerId)
                  .map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}
              </Select>
            </Field>
            <Field label="Gültig ab" htmlFor="schedule-from">
              <Input id="schedule-from" type="date" name="valid_from" defaultValue={schedule?.valid_from ?? ''} required />
            </Field>
            <Field label="Gültig bis" htmlFor="schedule-until" optional>
              <Input id="schedule-until" type="date" name="valid_until" defaultValue={schedule?.valid_until ?? ''} />
            </Field>
            <Field label="Checkliste" htmlFor="schedule-checklist" className="sm:col-span-2">
              <Select id="schedule-checklist" name="checklist_template_id" defaultValue={schedule?.checklist_template_id ?? ''}>
                <option value="">Objektstandard verwenden</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>{template.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Hinweise für das Team" htmlFor="schedule-description" className="sm:col-span-2" optional>
              <Textarea
                id="schedule-description"
                name="description"
                defaultValue={schedule?.description ?? ''}
                maxLength={4000}
                placeholder="Nur Informationen, die das Team beim Einsatz wirklich braucht."
              />
            </Field>
          </div>
        </section>
      </div>

      <div data-step="2" className={step === 2 ? 'block' : 'hidden'} aria-hidden={step !== 2}>
        <section className="space-y-4">
          <div>
            <h2 className="font-semibold">Rhythmus</h2>
            <p className="mt-1 text-sm text-muted-foreground">Wähle nur die Tage, an denen wirklich ein Einsatz stattfinden soll.</p>
          </div>
          <div className="space-y-2">
            {weekdays.map(([label, weekday]) => {
              const rule = rules.find((item) => item.weekday === weekday && item.is_active !== false);
              return (
                <div key={weekday} className="grid items-center gap-3 rounded-xl border border-border p-3 sm:grid-cols-[150px_1fr_1fr]">
                  <label className="flex min-h-10 items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      name={`weekday_${weekday}_enabled`}
                      value="true"
                      defaultChecked={Boolean(rule)}
                      className="size-4"
                    />
                    {label}
                  </label>
                  <input name={`weekday_${weekday}_id`} type="hidden" value={rule?.id ?? ''} />
                  <Field label="Von" htmlFor={`weekday-${weekday}-start`}>
                    <Input
                      id={`weekday-${weekday}-start`}
                      name={`weekday_${weekday}_start`}
                      type="time"
                      defaultValue={rule?.planned_start_time ?? '08:00'}
                    />
                  </Field>
                  <Field label="Bis" htmlFor={`weekday-${weekday}-end`}>
                    <Input
                      id={`weekday-${weekday}-end`}
                      name={`weekday_${weekday}_end`}
                      type="time"
                      defaultValue={rule?.planned_end_time ?? '10:00'}
                    />
                  </Field>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div data-step="3" className={step === 3 ? 'block' : 'hidden'} aria-hidden={step !== 3}>
        <section className="space-y-4">
          <div>
            <h2 className="font-semibold">Stammbesetzung</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              ReinPlan kann die passende Person nach freien Wochenstunden und Zeitkonflikten wählen.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary-soft/40">
              <input
                type="radio"
                name="assignment_mode_choice"
                value="AUTO"
                checked={assignmentMode === 'AUTO'}
                onChange={() => setAssignmentMode('AUTO')}
                className="mt-1 size-4"
              />
              <span>
                <span className="block text-sm font-semibold">Automatisch einplanen</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Empfohlen. ReinPlan nimmt einen aktiven Mitarbeiter ohne Zeitüberschneidung und mit möglichst viel freier Kapazität gemessen an den Wochen-Sollstunden.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4 has-[:checked]:border-primary has-[:checked]:bg-primary-soft/40">
              <input
                type="radio"
                name="assignment_mode_choice"
                value="MANUAL"
                checked={assignmentMode === 'MANUAL'}
                onChange={() => setAssignmentMode('MANUAL')}
                className="mt-1 size-4"
              />
              <span>
                <span className="block text-sm font-semibold">Manuell festlegen</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  Nur verwenden, wenn dieses Objekt bewusst eine feste Person oder ein festes Team bekommen soll.
                </span>
              </span>
            </label>
          </div>

          {assignmentMode === 'AUTO' ? (
            <div className="rounded-xl border border-border bg-muted/25 p-4 text-sm leading-6 text-muted-foreground">
              Die Auswahl passiert beim Speichern. Falls niemand genügend freie Wochenstunden hat oder ein Zeitkonflikt besteht, wird der Plan nicht stillschweigend falsch zugewiesen.
            </div>
          ) : employees.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
              Noch keine Mitarbeiter vorhanden. Du kannst den Plan speichern und das Team später zuweisen.
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {employees.map((employee) => {
                const checked = selectedMembers.has(employee.id);
                return (
                  <label
                    key={employee.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary-soft/40"
                  >
                    <input
                      type="checkbox"
                      name="member_ids"
                      value={employee.id}
                      checked={checked}
                      onChange={(event) => {
                        setSelectedMembers((current) => {
                          const nextSet = new Set(current);
                          if (event.target.checked) nextSet.add(employee.id);
                          else nextSet.delete(employee.id);
                          return nextSet;
                        });
                      }}
                      className="size-4"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{employeeName(employee)}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {employee.status === 'ACTIVE' ? 'Aktiv' : 'Einladung offen'}
                      </span>
                    </span>
                    {checked && <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />}
                  </label>
                );
              })}
            </div>
          )}

          <div className="flex items-start gap-3 rounded-xl bg-muted/30 p-4">
            <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm leading-6 text-muted-foreground">
              {activeEmployees} aktiv{activeEmployees === 1 ? '' : 'e'} Mitarbeiter
              {invitedEmployees > 0 ? ` · ${invitedEmployees} Einladung${invitedEmployees === 1 ? '' : 'en'} offen` : ''}.
              Eingeladene Mitarbeiter sehen Einsätze erst nach Aktivierung ihres Kontos.
            </p>
          </div>
        </section>
      </div>

      <div data-step="4" className={step === 4 ? 'block' : 'hidden'} aria-hidden={step !== 4}>
        <section className="space-y-5">
          <div>
            <h2 className="font-semibold">Abnahme & Abrechnung</h2>
            <p className="mt-1 text-sm text-muted-foreground">Vertragseinstellungen, die für alle Einsätze dieses Plans gelten.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kundenabnahme" htmlFor="schedule-acceptance">
              <Select
                id="schedule-acceptance"
                name="acceptance_policy"
                defaultValue={schedule?.acceptance_policy ?? 'KEINE_ABNAHME_ERFORDERLICH'}
              >
                <option value="KEINE_ABNAHME_ERFORDERLICH">Keine Abnahme erforderlich</option>
                <option value="VOR_ORT_UNTERSCHRIFT">Unterschrift vor Ort</option>
                <option value="PORTAL_ABNAHME">Abnahme im Kundenportal</option>
              </Select>
            </Field>
            <Field label="Abrechnungsart" htmlFor="schedule-billing">
              <Select
                id="schedule-billing"
                name="billing_mode"
                defaultValue={schedule?.billing_mode ?? 'PAUSCHALE_PRO_EINSATZ'}
              >
                <option value="PAUSCHALE_PRO_EINSATZ">Pauschale pro Einsatz</option>
                <option value="STUNDENSATZ">Nach Stunden</option>
                <option value="MONATSPAUSCHALE">Monatspauschale</option>
              </Select>
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-4">
            <input
              type="checkbox"
              checked={activateAfterSave}
              onChange={(event) => setActivateAfterSave(event.target.checked)}
              className="mt-0.5 size-4"
            />
            <span>
              <span className="block text-sm font-semibold">Plan aktivieren</span>
              <span className="mt-1 block text-sm leading-6 text-muted-foreground">
                Wenn aktiviert, erzeugt ReinPlan die nächsten Einsätze und übernimmt die Stammbesetzung automatisch.
              </span>
            </span>
          </label>

          <div className="rounded-xl border border-border bg-muted/20 p-4 text-sm">
            <p className="font-medium">Zusammenfassung</p>
            <p className="mt-2 text-muted-foreground">
              {schedule?.name || 'Neuer Plan'} · {selectedObject?.name ?? 'Objekt'} · {assignmentMode === 'AUTO' ? 'Team automatisch' : `${selectedMembers.size} Teammitglied${selectedMembers.size === 1 ? '' : 'er'}`}
            </p>
          </div>
        </section>
      </div>

      <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-popover backdrop-blur">
        <Button
          type="button"
          variant="outline"
          onClick={() => (step === 1 ? router.back() : setStep((step - 1) as 1 | 2 | 3 | 4))}
        >
          {step === 1 ? 'Abbrechen' : <><ChevronLeft className="size-4" />Zurück</>}
        </Button>
        {step < 4 ? (
          <Button type="button" onClick={next}>
            Weiter
            <ChevronRight className="size-4" />
          </Button>
        ) : (
          <SubmitButton>{activateAfterSave ? 'Plan aktivieren' : submitLabel}</SubmitButton>
        )}
      </div>
    </form>
  );
}
