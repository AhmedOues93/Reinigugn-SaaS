'use client';

import { useActionState } from 'react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Card, Input } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';

type Contact = { id: string; status: string; email: string | null; firstName: string | null; lastName: string | null };
type Invitation = { id: string; email: string; expires_at: string };

/**
 * Staff view of a customer's portal access. Invitations reuse the standard
 * single-use, seven-day token flow, so nothing about auth is special-cased here.
 */
export function PortalAccessPanel({
  action,
  contacts,
  invitations,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  contacts: Contact[];
  invitations: Invitation[];
}) {
  const [state, formAction] = useActionState(action, initialFormState);

  return (
    <Card className="mt-5 p-5">
      <h2 className="font-semibold">Kundenportal-Zugang</h2>
      <p className="mt-1 text-sm text-slate-600">
        Eingeladene Ansprechpersonen sehen ausschließlich die Objekte, Termine, Leistungsnachweise und Rechnungen dieses Kunden.
      </p>

      {(contacts.length > 0 || invitations.length > 0) && (
        <ul className="mt-5 divide-y rounded-md border">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{[contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email}</p>
                <p className="mt-0.5 truncate text-sm text-slate-600">{contact.email}</p>
              </div>
              <span className="inline-flex shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">Aktiv</span>
            </li>
          ))}
          {invitations.map((invitation) => (
            <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="min-w-0 truncate text-sm text-slate-700">{invitation.email}</p>
              <span className="inline-flex shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900">
                Eingeladen
              </span>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="mt-5 space-y-4">
        <FormMessage status={state.status} message={state.message} />
        {state.invitationUrl && (
          <p className="break-all rounded-md bg-slate-50 p-3 text-xs text-slate-700">{state.invitationUrl}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm font-medium">
            Vorname
            <Input className="mt-1.5" name="first_name" maxLength={80} required />
          </label>
          <label className="text-sm font-medium">
            Nachname
            <Input className="mt-1.5" name="last_name" maxLength={80} required />
          </label>
          <label className="text-sm font-medium">
            E-Mail-Adresse
            <Input className="mt-1.5" name="email" type="email" maxLength={160} required />
          </label>
        </div>
        <SubmitButton>Portalzugang einladen</SubmitButton>
      </form>
    </Card>
  );
}
