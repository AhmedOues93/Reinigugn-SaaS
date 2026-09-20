'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { type FormState, initialFormState } from '@/lib/actions';
import { Button, Field, Input, Select } from '@/components/ui';
import { FormMessage, SubmitButton } from '@/components/form-controls';

type EmployeeRecord = { id?: string; role?: 'OFFICE' | 'EMPLOYEE'; invited_first_name?: string | null; invited_last_name?: string | null; invited_phone?: string | null; invited_email?: string | null; profiles?: { first_name?: string | null; last_name?: string | null; phone?: string | null } | { first_name?: string | null; last_name?: string | null; phone?: string | null }[] | null; employee_details?: { employee_number?: string | null; weekly_hours?: number | null; employment_start_date?: string | null; employment_end_date?: string | null; employment_type?: string | null; preferred_language?: string | null; notes?: string | null }[] | null; };
type EmployeeAction = (state: FormState, formData: FormData) => Promise<FormState>;

function profileFor(record?: EmployeeRecord) { return Array.isArray(record?.profiles) ? record?.profiles[0] : record?.profiles; }

export function EmployeeForm({ employee, action, submitLabel, currentRole, invitation }: { employee?: EmployeeRecord; action: EmployeeAction; submitLabel: string; currentRole: 'OWNER' | 'OFFICE'; invitation: boolean }) {
  const [state, formAction] = useActionState(action, initialFormState);
  const router = useRouter(); const profile = profileFor(employee); const details = employee?.employee_details?.[0];
  const [showInvitationLink, setShowInvitationLink] = useState(false);
  useEffect(() => { if (state.status === 'success' && state.id && !state.invitationUrl) router.push(`/dashboard/mitarbeiter/${state.id}?success=${encodeURIComponent(invitation ? 'Einladung wurde erstellt.' : 'Mitarbeiter wurde gespeichert.')}`); }, [router, state, invitation]);
  return <form action={formAction} className="space-y-7"><FormMessage status={state.status} message={state.message} />
    <section className="grid gap-5 sm:grid-cols-2">
      <Field label={<>Vorname <span className="text-danger">*</span></>} htmlFor="first_name">
        <Input id="first_name" name="first_name" defaultValue={profile?.first_name ?? employee?.invited_first_name ?? ''} required maxLength={120} />
      </Field>
      <Field label={<>Nachname <span className="text-danger">*</span></>} htmlFor="last_name">
        <Input id="last_name" name="last_name" defaultValue={profile?.last_name ?? employee?.invited_last_name ?? ''} required maxLength={120} />
      </Field>
      {invitation ? (
        <Field label={<>E-Mail-Adresse <span className="text-danger">*</span></>} htmlFor="email" className="sm:col-span-2">
          <Input id="email" name="email" type="email" required maxLength={254} />
        </Field>
      ) : (
        <Field label="E-Mail-Adresse" htmlFor="email-readonly" className="sm:col-span-2">
          <Input id="email-readonly" className="bg-muted" value={employee?.invited_email ?? ''} readOnly />
        </Field>
      )}
      <Field label="Telefon" htmlFor="phone">
        <Input id="phone" name="phone" type="tel" defaultValue={profile?.phone ?? employee?.invited_phone ?? ''} maxLength={64} />
      </Field>
      <Field label="Rolle" htmlFor="role">
        <Select id="role" name="role" defaultValue={employee?.role ?? 'EMPLOYEE'}>
          <option value="EMPLOYEE">Mitarbeiter</option>
          {currentRole === 'OWNER' && <option value="OFFICE">Büro</option>}
        </Select>
      </Field>
    </section>
    <section className="border-t pt-6">
      <h2 className="font-semibold">Beschäftigung</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <Field
          label="Personalnummer"
          htmlFor="employee_number"
          optional info="Wird automatisch vergeben, wenn Sie das Feld leer lassen."
        >
          <Input id="employee_number" name="employee_number" defaultValue={details?.employee_number ?? ''} placeholder="Automatisch, z. B. M-0001" maxLength={64} />
        </Field>
        <Field label="Wochen-Sollstunden" htmlFor="weekly_hours">
          <Input id="weekly_hours" name="weekly_hours" type="number" min="0" max="168" step="0.25" defaultValue={details?.weekly_hours ?? ''} />
        </Field>
        <Field label="Beschäftigungsart" htmlFor="employment_type">
          <Select id="employment_type" name="employment_type" defaultValue={details?.employment_type ?? ''}>
            <option value="">Nicht angegeben</option>
            <option value="FULL_TIME">Vollzeit</option>
            <option value="PART_TIME">Teilzeit</option>
            <option value="MINIJOB">Minijob</option>
            <option value="OTHER">Sonstige</option>
          </Select>
        </Field>
        <Field label="Bevorzugte Sprache" htmlFor="preferred_language">
          <Select id="preferred_language" name="preferred_language" defaultValue={details?.preferred_language ?? 'de'}>
            <option value="de">Deutsch</option>
            <option value="en">Englisch</option>
            <option value="ar">Arabisch</option>
            <option value="tr">Türkisch</option>
            <option value="uk">Ukrainisch</option>
            <option value="ru">Russisch</option>
          </Select>
        </Field>
        <Field label="Eintrittsdatum" htmlFor="employment_start_date">
          <Input id="employment_start_date" name="employment_start_date" type="date" defaultValue={details?.employment_start_date ?? ''} />
        </Field>
        <Field label="Austrittsdatum" htmlFor="employment_end_date">
          <Input id="employment_end_date" name="employment_end_date" type="date" defaultValue={details?.employment_end_date ?? ''} />
        </Field>
      </div>
      <Field label="Interne Notiz" htmlFor="notes" className="mt-5">
        <textarea
          id="notes"
          className="mt-1.5 flex h-28 w-full rounded-md border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          name="notes"
          defaultValue={details?.notes ?? ''}
          maxLength={4000}
        />
      </Field>
    </section>
    {state.invitationUrl && <div className="rounded-md border border-border bg-muted/35 p-4 text-sm"><div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" onClick={() => setShowInvitationLink((value) => !value)}>{showInvitationLink ? 'Link ausblenden' : 'Einladungslink anzeigen'}</Button>{showInvitationLink && <a className="font-medium text-primary underline" href={state.invitationUrl} target="_blank" rel="noreferrer">Link öffnen</a>}{state.id && <Link className="font-medium text-primary underline" href={`/dashboard/mitarbeiter/${state.id}`}>Zur Mitarbeiteransicht</Link>}</div>{showInvitationLink && <p className="mt-3 break-all text-muted-foreground">{state.invitationUrl}</p>}</div>}
    <div className="flex justify-end gap-3"><Button type="button" variant="outline" onClick={() => router.back()}>Abbrechen</Button><SubmitButton>{submitLabel}</SubmitButton></div>
  </form>;
}
