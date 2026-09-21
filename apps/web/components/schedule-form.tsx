'use client';

import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type FormState, initialFormState } from '@/lib/actions';
import { Button, Input, Select, Textarea } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form-controls';

const weekdays = [['Montag', 1], ['Dienstag', 2], ['Mittwoch', 3], ['Donnerstag', 4], ['Freitag', 5], ['Samstag', 6], ['Sonntag', 7]] as const;
type Option = { id: string; name: string; customer_id?: string }; type Rule = { id?: string; weekday: number; planned_start_time: string; planned_end_time: string; is_active?: boolean }; type Employee = { id: string; status?: string; invited_first_name?: string | null; invited_last_name?: string | null; profiles: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null };
type ScheduleRecord = { id?: string; customer_id?: string; cleaning_object_id?: string; checklist_template_id?: string | null; name?: string; description?: string | null; valid_from?: string; valid_until?: string | null; acceptance_policy?: string | null; billing_mode?: string | null; schedule_rules?: Rule[]; service_schedule_assignments?: { member_id: string }[] }; type ScheduleAction = (state: FormState, data: FormData) => Promise<FormState>;
function employeeName(employee: Employee) {
  const profile = Array.isArray(employee.profiles) ? employee.profiles[0] : employee.profiles;
  return [profile?.first_name ?? employee.invited_first_name, profile?.last_name ?? employee.invited_last_name].filter(Boolean).join(' ') || 'Mitarbeiter';
}

export function ScheduleForm({ schedule, customers, objects, employees, templates, action, submitLabel }: { schedule?: ScheduleRecord; customers: Option[]; objects: Option[]; employees: Employee[]; templates: { id: string; name: string }[]; action: ScheduleAction; submitLabel: string }) {
  const [state, formAction] = useActionState(action, initialFormState); const router = useRouter(); const [customerId, setCustomerId] = useState(schedule?.customer_id ?? ''); const rules = schedule?.schedule_rules ?? []; const assigned = new Set(schedule?.service_schedule_assignments?.map((item) => item.member_id) ?? []);
  useEffect(() => { if (state.status === 'success' && state.id) router.push(`/dashboard/planung/plaene/${state.id}?success=${encodeURIComponent('Plan wurde gespeichert.')}`); }, [router, state]);
  return <form action={formAction} className="space-y-7"><FormMessage status={state.status} message={state.message} /><section className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">Planname <span className="text-danger">*</span><Input className="mt-1.5" name="name" defaultValue={schedule?.name ?? ''} required /></label><label className="block text-sm font-medium">Kunde <span className="text-danger">*</span><Select className="mt-1.5 w-full" name="customer_id" defaultValue={customerId} onChange={(event) => setCustomerId(event.target.value)} required><option value="" disabled>Kunde auswählen</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</Select></label><label className="block text-sm font-medium">Objekt <span className="text-danger">*</span><Select className="mt-1.5 w-full" name="cleaning_object_id" defaultValue={schedule?.cleaning_object_id ?? ''} required><option value="" disabled>Objekt auswählen</option>{objects.filter((object) => object.customer_id === customerId).map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}</Select></label><label className="block text-sm font-medium">Checkliste<Select className="mt-1.5 w-full" name="checklist_template_id" defaultValue={schedule?.checklist_template_id ?? ''}><option value="">Objektstandard verwenden</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</Select></label><label className="block text-sm font-medium">Gültig ab <Input className="mt-1.5" type="date" name="valid_from" defaultValue={schedule?.valid_from ?? ''} required /></label><label className="block text-sm font-medium">Gültig bis <Input className="mt-1.5" type="date" name="valid_until" defaultValue={schedule?.valid_until ?? ''} /></label><label className="block text-sm font-medium sm:col-span-2">Beschreibung<Textarea className="mt-1.5 w-full" name="description" defaultValue={schedule?.description ?? ''} /></label></section>
    {/*
      Agreed once, here, for every visit under this contract. The cleaner in the
      field is never asked to decide whether the customer has to sign — they are
      shown a signature screen or they are not.
    */}
    <section className="border-t pt-6"><h2 className="font-semibold">Abnahme &amp; Abrechnung</h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium">Kundenabnahme
          <Select className="mt-1.5 w-full" name="acceptance_policy" defaultValue={schedule?.acceptance_policy ?? 'KEINE_ABNAHME_ERFORDERLICH'}>
            <option value="KEINE_ABNAHME_ERFORDERLICH">Keine Abnahme erforderlich</option>
            <option value="VOR_ORT_UNTERSCHRIFT">Unterschrift vor Ort</option>
            <option value="PORTAL_ABNAHME">Abnahme im Kundenportal</option>
          </Select>
          <span className="mt-1.5 block text-xs font-normal leading-5 text-muted-foreground">
            Bei Unterhaltsreinigung üblicherweise keine Abnahme. Für Grund- und Sonderreinigung kann eine Bestätigung sinnvoll sein.
          </span>
        </label>
        <label className="block text-sm font-medium">Abrechnungsart
          <Select className="mt-1.5 w-full" name="billing_mode" defaultValue={schedule?.billing_mode ?? 'PAUSCHALE_PRO_EINSATZ'}>
            <option value="PAUSCHALE_PRO_EINSATZ">Pauschale pro Einsatz</option>
            <option value="STUNDENSATZ">Nach Stunden</option>
            <option value="MONATSPAUSCHALE">Monatspauschale</option>
          </Select>
          <span className="mt-1.5 block text-xs font-normal leading-5 text-muted-foreground">
            Nur bei „Nach Stunden“ bestimmt die erfasste Arbeitszeit den Rechnungsbetrag. Einsätze im Monatsvertrag werden nicht einzeln abgerechnet.
          </span>
        </label>
      </div>
    </section>
    <section className="border-t pt-6"><h2 className="font-semibold">Wiederholung</h2><div className="mt-4 space-y-3">{weekdays.map(([label, weekday]) => { const rule = rules.find((item) => item.weekday === weekday && item.is_active !== false); return <div key={weekday} className="grid items-center gap-3 rounded-md border p-3 sm:grid-cols-[150px_1fr_1fr]"><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name={`weekday_${weekday}_enabled`} value="true" defaultChecked={Boolean(rule)} />{label}</label><input name={`weekday_${weekday}_id`} type="hidden" value={rule?.id ?? ''} /><Input name={`weekday_${weekday}_start`} type="time" defaultValue={rule?.planned_start_time ?? '18:00'} /><Input name={`weekday_${weekday}_end`} type="time" defaultValue={rule?.planned_end_time ?? '20:00'} /></div>; })}</div></section>
    <section className="border-t pt-6"><h2 className="font-semibold">Standardzuweisung</h2><div className="mt-4 grid gap-2 sm:grid-cols-2">{employees.map((employee) => <label key={employee.id} className="flex items-center gap-3 rounded-md border p-3 text-sm"><input type="checkbox" name="member_ids" value={employee.id} defaultChecked={assigned.has(employee.id)} />{employeeName(employee)}</label>)}</div></section><div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => router.back()}>Abbrechen</Button><SubmitButton>{submitLabel}</SubmitButton></div>
  </form>;
}
