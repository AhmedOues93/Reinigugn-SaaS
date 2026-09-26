'use client';

import { useActionState, useState } from 'react';
import { AlertTriangle, History, Mail, ShieldCheck, Undo2 } from 'lucide-react';
import { FormMessage, SubmitButton } from '@/components/form-controls';
import { Card, Field, Input, Select } from '@/components/ui';
import { initialFormState, type FormState } from '@/lib/actions';
import type {
  AcceptanceMethod,
  AcceptancePolicy,
  ServiceRecordEvent,
} from '@/lib/data/billing';

type Action = (state: FormState, formData: FormData) => Promise<FormState>;
type MailAction = (kind: 'REQUEST' | 'REMINDER', state: FormState, formData: FormData) => Promise<FormState>;

const policyLabel: Record<AcceptancePolicy, string> = {
  KEINE_ABNAHME_ERFORDERLICH: 'Keine Abnahme erforderlich',
  VOR_ORT_UNTERSCHRIFT: 'Unterschrift vor Ort',
  PORTAL_ABNAHME: 'Abnahme im Kundenportal',
};

const methodLabel: Record<AcceptanceMethod, string> = {
  KEINE: 'Ohne Abnahme abgeschlossen',
  VOR_ORT_UNTERSCHRIFT: 'Vor Ort unterschrieben',
  PORTAL_BESTAETIGUNG: 'Im Kundenportal bestätigt',
  BUERO_FREIGABE: 'Nach Klärung vom Büro freigegeben',
};

const eventLabel: Record<ServiceRecordEvent['event'], string> = {
  ERSTELLT: 'Leistungsnachweis erstellt',
  UNTERSCHRIEBEN: 'Vor Ort unterschrieben',
  BESTAETIGT: 'Vom Kunden bestätigt',
  PROBLEM_GEMELDET: 'Problem gemeldet',
  PROBLEM_GEKLAERT: 'Problem geklärt',
  FREIGABE_WIDERRUFEN: 'Abnahme widerrufen',
};

function when(value: string) {
  return new Date(value).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * The acceptance state of one Leistungsnachweis, for the office.
 *
 * It answers three questions the office actually asks: what was agreed, what
 * happened, and — when the customer complained — what to do about it.
 */
export function ServiceAcceptancePanel({
  policy,
  status,
  method,
  acceptedAt,
  acceptedByName,
  signatureUrl,
  events,
  resolveAction,
  revokeAction,
  mailAction,
  requestSentAt,
  reminderSentAt,
  canRevoke,
  invoiced,
}: {
  policy: AcceptancePolicy;
  status: 'ERFASST' | 'ABNAHME_AUSSTEHEND' | 'ABGENOMMEN' | 'PROBLEM_GEMELDET';
  method: AcceptanceMethod | null;
  acceptedAt: string | null;
  acceptedByName: string | null;
  signatureUrl: string | null;
  events: ServiceRecordEvent[];
  resolveAction: Action;
  revokeAction: Action;
  mailAction: MailAction;
  requestSentAt: string | null;
  reminderSentAt: string | null;
  /** Revocation is the OWNER's call; the server enforces it regardless. */
  canRevoke: boolean;
  invoiced: boolean;
}) {
  const [resolveState, resolve] = useActionState(resolveAction, initialFormState);
  const [revokeState, revoke] = useActionState(revokeAction, initialFormState);
  const [requestState, sendRequest] = useActionState(mailAction.bind(null, 'REQUEST'), initialFormState);
  const [reminderState, sendReminder] = useActionState(mailAction.bind(null, 'REMINDER'), initialFormState);
  const [showRevoke, setShowRevoke] = useState(false);

  return (
    // The card prints: a Leistungsnachweis whose whole purpose is proof should
    // carry the acceptance and the signature when it goes on paper. Only the
    // things you cannot do on paper — resolving a dispute, revoking, the
    // internal protocol — are hidden from print.
    <Card className="mt-6 p-5">
      <div className="flex items-start gap-3">
        <ShieldCheck
          className={`mt-0.5 size-5 shrink-0 ${status === 'ABGENOMMEN' ? 'text-success' : status === 'PROBLEM_GEMELDET' ? 'text-danger' : 'text-muted-foreground'}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold">Kundenabnahme</h2>
          <p className="mt-0.5 text-sm leading-6 text-muted-foreground">
            Laut Vertrag: {policyLabel[policy]}
          </p>
          {status === 'ABGENOMMEN' && method && (
            <p className="mt-1 text-sm leading-6 text-success">
              {methodLabel[method]}
              {acceptedByName ? ` · ${acceptedByName}` : ''}
              {acceptedAt ? ` · ${when(acceptedAt)}` : ''}
            </p>
          )}
          {status === 'ABNAHME_AUSSTEHEND' && (
            <p className="mt-1 text-sm leading-6 text-warning">
              Wartet auf die Abnahme. Bis dahin nicht abrechenbar.
            </p>
          )}
        </div>
      </div>

      {policy === 'PORTAL_ABNAHME' && status === 'ABNAHME_AUSSTEHEND' && (
        <div className="mt-4 rounded-lg border border-border bg-subtle p-4 print:hidden">
          <p className="text-sm font-semibold">Kunde per E-Mail informieren</p>
          {!requestSentAt ? (
            <form action={sendRequest} className="mt-3 space-y-3">
              <FormMessage status={requestState.status} message={requestState.message} />
              <p className="text-sm leading-6 text-muted-foreground">
                Sendet dem aktiven Portal-Kontakt direkt den Link zu diesem Leistungsnachweis.
              </p>
              <SubmitButton variant="outline">
                <Mail className="size-4" aria-hidden="true" />
                Abnahmeanfrage senden
              </SubmitButton>
            </form>
          ) : !reminderSentAt ? (
            <form action={sendReminder} className="mt-3 space-y-3">
              <FormMessage status={reminderState.status} message={reminderState.message} />
              <p className="text-sm leading-6 text-muted-foreground">
                Anfrage gesendet am {when(requestSentAt)}. Eine einmalige Erinnerung ist möglich.
              </p>
              <SubmitButton variant="outline">
                <Mail className="size-4" aria-hidden="true" />
                Einmal erinnern
              </SubmitButton>
            </form>
          ) : (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Anfrage gesendet am {when(requestSentAt)} · Erinnerung gesendet am {when(reminderSentAt)}.
            </p>
          )}
        </div>
      )}

      {signatureUrl && (
        <figure className="mt-4">
          <figcaption className="mb-1.5 text-sm text-muted-foreground">Unterschrift</figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived storage URL */}
          <img
            src={signatureUrl}
            alt={`Unterschrift von ${acceptedByName ?? 'Kunde'}`}
            className="max-h-32 rounded-lg border border-border bg-card p-2"
          />
        </figure>
      )}

      {/* The customer said something was wrong. This is where it gets closed out. */}
      {status === 'PROBLEM_GEMELDET' && (
        <form action={resolve} className="mt-4 space-y-3 rounded-lg border border-danger/25 bg-danger-soft/40 p-4 print:hidden">
          <p className="flex items-start gap-2 text-sm font-semibold leading-6 text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Der Kunde hat ein Problem gemeldet
          </p>
          <FormMessage status={resolveState.status} message={resolveState.message} />
          <Field label="Wie wurde es geklärt?" htmlFor="dispute-outcome">
            <Select id="dispute-outcome" name="outcome" defaultValue="ZURUECK_ZUR_ABNAHME">
              <option value="ZURUECK_ZUR_ABNAHME">Nachgearbeitet – Kunde nimmt erneut ab</option>
              <option value="BUERO_FREIGABE">Direkt geklärt – vom Büro freigeben</option>
            </Select>
          </Field>
          <Field label="Notiz" htmlFor="dispute-note" info="Landet im Protokoll dieses Leistungsnachweises.">
            <Input id="dispute-note" name="note" maxLength={1000} placeholder="z. B. telefonisch geklärt, Gutschrift vereinbart" />
          </Field>
          <SubmitButton variant="outline">Meldung klären</SubmitButton>
        </form>
      )}

      {/* The audit trail: how this record reached the state it is in. */}
      {events.length > 0 && (
        <div className="mt-5 border-t border-border pt-4 print:hidden">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <History className="size-4 text-muted-foreground" aria-hidden="true" />
            Protokoll
          </h3>
          <ol className="mt-3 space-y-2.5">
            {events.map((item, index) => (
              <li key={`${item.created_at}-${index}`} className="border-l-2 border-border pl-3 text-sm leading-6">
                <p className="font-medium">{eventLabel[item.event]}</p>
                <p className="text-muted-foreground">
                  {[item.actor_name, when(item.created_at)].filter(Boolean).join(' · ')}
                </p>
                {item.note && <p className="break-anywhere text-muted-foreground">{item.note}</p>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/*
        Undoing an acceptance. Deliberately tucked away and deliberately loud
        about what it costs: the customer's confirmation is evidence, and
        replacing it silently is exactly what must not be possible.
      */}
      {status === 'ABGENOMMEN' && canRevoke && !invoiced && (
        <div className="mt-5 border-t border-border pt-4 print:hidden">
          {!showRevoke ? (
            <button
              type="button"
              onClick={() => setShowRevoke(true)}
              className="inline-flex min-h-touch items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-danger hover:underline md:min-h-9"
            >
              <Undo2 className="size-4" aria-hidden="true" />
              Abnahme widerrufen
            </button>
          ) : (
            <form action={revoke} className="space-y-3">
              <p className="text-sm leading-6 text-muted-foreground">
                Der Widerruf setzt die Leistung zurück auf „Abnahme ausstehend“. Die bisherige
                Abnahme bleibt mit Grund im Protokoll stehen.
              </p>
              <FormMessage status={revokeState.status} message={revokeState.message} />
              <Field label="Grund" htmlFor="revoke-reason">
                <Input id="revoke-reason" name="reason" required minLength={3} maxLength={1000} />
              </Field>
              <div className="flex flex-wrap gap-3">
                <SubmitButton variant="outline">Widerrufen</SubmitButton>
                <button
                  type="button"
                  onClick={() => setShowRevoke(false)}
                  className="min-h-touch text-sm font-medium text-muted-foreground underline-offset-4 hover:underline md:min-h-9"
                >
                  Abbrechen
                </button>
              </div>
            </form>
          )}
        </div>
      )}
      {status === 'ABGENOMMEN' && canRevoke && invoiced && (
        <p className="mt-5 border-t border-border pt-4 text-sm leading-6 text-muted-foreground print:hidden">
          Diese Leistung ist abgerechnet. Eine Korrektur läuft über die Rechnung, nicht über die Abnahme.
        </p>
      )}
    </Card>
  );
}
