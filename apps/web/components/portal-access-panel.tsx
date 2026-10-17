'use client';

import { useActionState, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Button, Card, Input } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';

type Contact = { id: string; status: string; email: string | null; firstName: string | null; lastName: string | null };
type Invitation = { id: string; email: string; expires_at: string };

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
  const [inviting, setInviting] = useState(false);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Kundenportal</h2>
          <p className="mt-1 text-sm text-muted-foreground">Zugänge für Ansprechpersonen dieses Kunden.</p>
        </div>
        {!inviting && (
          <Button type="button" variant="outline" onClick={() => setInviting(true)}>
            <Plus className="size-4" />Zugang einladen
          </Button>
        )}
      </div>

      {contacts.length === 0 && invitations.length === 0 && !inviting && (
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">Noch kein Portalzugang eingerichtet.</p>
      )}

      {(contacts.length > 0 || invitations.length > 0) && (
        <ul className="mt-4 divide-y rounded-lg border border-border">
          {contacts.map((contact) => (
            <li key={contact.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{[contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email}</p>
                <p className="mt-0.5 truncate text-sm text-muted-foreground">{contact.email}</p>
              </div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">Aktiv</span>
            </li>
          ))}
          {invitations.map((invitation) => (
            <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <p className="min-w-0 truncate text-sm">{invitation.email}</p>
              <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-medium text-warning">Eingeladen</span>
            </li>
          ))}
        </ul>
      )}

      {inviting && (
        <form action={formAction} className="mt-5 space-y-4 rounded-xl border border-border bg-muted/20 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">Neuen Portalzugang einladen</p>
            <Button type="button" variant="ghost" className="size-9 p-0" onClick={() => setInviting(false)} aria-label="Schließen"><X className="size-4" /></Button>
          </div>
          <FormMessage status={state.status} message={state.message} />
          {state.invitationUrl && <p className="break-all rounded-md bg-muted p-3 text-xs text-muted-foreground">{state.invitationUrl}</p>}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm font-medium">Vorname<Input className="mt-1.5" name="first_name" maxLength={80} required /></label>
            <label className="text-sm font-medium">Nachname<Input className="mt-1.5" name="last_name" maxLength={80} required /></label>
            <label className="text-sm font-medium">E-Mail-Adresse<Input className="mt-1.5" name="email" type="email" maxLength={160} required /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <SubmitButton>Einladung senden</SubmitButton>
            <Button type="button" variant="outline" onClick={() => setInviting(false)}>Abbrechen</Button>
          </div>
        </form>
      )}
    </Card>
  );
}
