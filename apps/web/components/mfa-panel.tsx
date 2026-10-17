'use client';

import { useActionState, useState, useTransition } from 'react';
import { KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import {
  confirmMfaEnrolment,
  removeMfaFactor,
  setStaffMfaRequirement,
  startMfaEnrolment,
} from '@/app/dashboard/sicherheit/actions';
import { type FormState, initialFormState } from '@/lib/actions';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Button, Field, Input } from '@/components/ui';

export type MfaFactorView = { id: string; friendlyName: string | null; createdAt: string };

export function MfaPanel({
  factors,
  required,
  isOwner,
  startEnrolment,
}: {
  factors: MfaFactorView[];
  required: boolean;
  isOwner: boolean;
  /** Vorgeschaltet, wenn die Person vom Riegel zum Einrichten geschickt wurde. */
  startEnrolment: boolean;
}) {
  const [enrolment, setEnrolment] = useState<FormState>(initialFormState);
  const [pending, startTransition] = useTransition();
  const [confirmState, confirmAction] = useActionState(confirmMfaEnrolment, initialFormState);
  const [removeState, removeAction] = useActionState(removeMfaFactor, initialFormState);
  const [requirementState, requirementAction] = useActionState(setStaffMfaRequirement, initialFormState);

  const begin = () => startTransition(async () => setEnrolment(await startMfaEnrolment()));
  const open = enrolment.mfaEnrolment;
  const done = confirmState.status === 'success';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-card sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
            <ShieldCheck className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold">Zwei-Faktor-Anmeldung</p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              Ein zusätzlicher sechsstelliger Code aus einer App auf dem Telefon. Ein gestohlenes
              Passwort allein genügt dann nicht mehr, um an Lohn- und Kundendaten zu kommen.
            </p>
          </div>
        </div>

        {factors.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {factors.map((factor) => (
              <li
                key={factor.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/80 px-3 py-2"
              >
                <span className="min-w-0 break-words text-sm">
                  <span className="font-medium">{factor.friendlyName || 'Authenticator-App'}</span>
                  <span className="block text-xs text-muted-foreground">
                    Eingerichtet am {new Date(factor.createdAt).toLocaleDateString('de-DE')}
                  </span>
                </span>
                <form action={removeAction}>
                  <input type="hidden" name="factor_id" value={factor.id} />
                  <SubmitButton variant="outline">
                    <Trash2 className="size-4" />
                    Entfernen
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            Für dieses Konto ist noch keine App eingerichtet.
          </p>
        )}
        <FormMessage status={removeState.status} message={removeState.message} />

        {!open && !done ? (
          <Button type="button" className="mt-4" onClick={begin} disabled={pending}>
            <KeyRound className="size-4" />
            {factors.length > 0 ? 'Weitere App einrichten' : 'App einrichten'}
          </Button>
        ) : null}
        {enrolment.status === 'error' ? (
          <FormMessage status="error" message={enrolment.message} />
        ) : null}
        {startEnrolment && !open && !done ? (
          <p className="mt-3 text-sm font-medium text-primary">
            Dein Betrieb verlangt die Zwei-Faktor-Anmeldung. Bitte richte sie jetzt ein.
          </p>
        ) : null}

        {open ? (
          <form action={confirmAction} className="mt-5 space-y-4 border-t border-border/80 pt-5">
            <ol className="space-y-2 text-sm leading-5 text-muted-foreground">
              <li>1. Öffne eine Authenticator-App auf dem Telefon.</li>
              <li>2. Scanne den Code oder tippe den Schlüssel darunter ein.</li>
              <li>3. Gib den sechsstelligen Code aus der App hier ein.</li>
            </ol>
            <div
              className="mx-auto w-full max-w-[220px] overflow-hidden rounded-lg bg-white p-2 [&_svg]:h-auto [&_svg]:w-full"
              /* Der QR-Code kommt als SVG aus der eigenen Supabase-Instanz. */
              dangerouslySetInnerHTML={{ __html: open.qrCode }}
            />
            <p className="break-all rounded-lg bg-muted px-3 py-2 text-center font-mono text-xs">
              {open.secret}
            </p>
            <input type="hidden" name="factor_id" value={open.factorId} />
            <Field label="Code aus der App" htmlFor="mfa-code">
              <Input
                id="mfa-code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                required
              />
            </Field>
            <FormMessage status={confirmState.status} message={confirmState.message} />
            <div className="flex flex-wrap gap-2">
              <SubmitButton>Bestätigen</SubmitButton>
              <Button type="button" variant="outline" onClick={() => setEnrolment(initialFormState)}>
                Abbrechen
              </Button>
            </div>
          </form>
        ) : null}
        {done ? <FormMessage status="success" message={confirmState.message} /> : null}
      </div>

      {isOwner ? (
        <form action={requirementAction} className="rounded-xl border border-border/80 bg-card p-4 shadow-card sm:p-6">
          <p className="font-semibold">Für das ganze Büro verlangen</p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {required
              ? 'Alle Konten mit Büro-Zugang müssen eine App eingerichtet haben.'
              : 'Derzeit freiwillig. Eingeschaltet wird jedes Büro-Konto beim nächsten Aufruf zur Einrichtung geführt.'}
          </p>
          <input type="hidden" name="required" value={required ? 'false' : 'true'} />
          <FormMessage status={requirementState.status} message={requirementState.message} />
          <SubmitButton variant={required ? 'outline' : 'default'} className="mt-4">
            {required ? 'Zwang aufheben' : 'Verpflichtend machen'}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
