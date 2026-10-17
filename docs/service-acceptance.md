# Leistungsnachweis and Kundenabnahme

How a cleaning visit becomes proof, how proof becomes billable work, and where
the customer gets a say. Written for whoever configures a Leistungsplan and
whoever has to explain a disputed invoice six months later.

## The path

```
Einsatz  →  Mitarbeiter arbeitet  →  Finish
                                       │
                                       ▼
                            Leistungsnachweis (Snapshot)
                                       │
              ┌────────────────────────┼────────────────────────┐
              ▼                        ▼                        ▼
   KEINE_ABNAHME_ERFORDERLICH   VOR_ORT_UNTERSCHRIFT      PORTAL_ABNAHME
              │                        │                        │
              │                  Kunde unterschreibt      Kunde bestätigt
              │                  auf dem Gerät            im Kundenportal
              │                        │                        │
              │                        │                ┌───────┴───────┐
              │                        │                ▼               ▼
              │                        │           bestätigt      Problem gemeldet
              │                        │                │               │
              ▼                        ▼                ▼               ▼
           ERFASST               ABGENOMMEN        ABGENOMMEN     PROBLEM_GEMELDET
              └────────────┬───────────┴────────────────┘               │
                           ▼                                     Büro klärt
                  Bereit zur Abrechnung                                 │
                           │                                            │
                           ▼                                   zurück zur Abnahme
                  Büro wählt aus → Rechnungsentwurf              oder Freigabe
                           │
                           ▼
              festgeschrieben → versendet → bezahlt
```

No invoice is created or sent because an employee finished a job. An accepted
service becomes **eligible** for the billing queue; a person still decides what
goes on which invoice and when.

## Where the rule lives

The Kundenabnahme is a commercial arrangement, so it is agreed on the
**Vertrag / Leistungsplan** and never chosen by the cleaner in the field. The
employee is shown a signature screen or they are not.

Resolution order, most specific first:

| Level | When it is used |
| --- | --- |
| `jobs.acceptance_policy` | A one-off Sonderreinigung that differs from the contract. Set by the office. |
| `service_schedules.acceptance_policy` | **The normal answer.** The contract for this recurring service. |
| `cleaning_objects.acceptance_policy` | A site-wide house rule, for ad-hoc visits with no contract. |
| default | `KEINE_ABNAHME_ERFORDERLICH` |

One customer can have different policies on different contracts — routine
Unterhaltsreinigung with no acceptance, Grundreinigung with a signature.

Resolved in one place, `public.resolve_acceptance_policy(job_id)`, so the field
app, the portal and the billing queue cannot disagree.

### A rule nobody can satisfy

`PORTAL_ABNAHME` on a customer with no active portal contact produces visits
that can never be accepted and therefore never invoiced. The office is warned
on the Leistungsnachweise screen — `list_acceptance_config_warnings()` — rather
than finding out when the month is closed.

## What is recorded

One `service_records` row per visit, created when the job reaches `COMPLETED`.
A unique `job_id` makes a double Finish harmless, and a trigger on `jobs` builds
it however the job got there, not only through the field app's Finish button.

The row **snapshots** the visit: customer and object, service date, actual start
and finish, break minutes, net working time, who performed it and for how long,
the checklist as it stood, the photos, and the service description. Renaming the
object or correcting a time entry afterwards does not rewrite what the customer
was shown — the same principle the issued invoice already uses.

## Acceptance evidence

| Method | Recorded |
| --- | --- |
| `VOR_ORT_UNTERSCHRIFT` | Signer's name, timestamp, and the signature image in the private `service-signatures` bucket |
| `PORTAL_BESTAETIGUNG` | The confirming contact's name and member id, timestamp |
| `BUERO_FREIGABE` | The office user who released it after clarifying a dispute, timestamp |
| `KEINE` | Nothing to record — no acceptance was required |

`BUERO_FREIGABE` is a separate method precisely so it can never be read as the
customer having confirmed. They did not.

Signature files live in a private bucket with MIME and size limits, reached
only through short-lived signed URLs, with path-shape guards that tie a file to
one company and one visit.

**This is business evidence and audit documentation.** It is not a claim that a
stored signature creates legal certainty or qualifies as a qualified electronic
signature — that depends on facts this system does not know, and on advice this
document does not give.

## Disputes

A customer asked to accept is not left choosing between approving and silence.
"Problem melden" creates a **Reklamation** in the complaint workflow the
application already has, linked to the same job, and moves the record to
`PROBLEM_GEMELDET`.

Nothing about the recorded service is rewritten. The customer describes the
problem; the evidence stands as it was.

A disputed service is **not billable**. The office closes it out two ways, both
logged:

- **Zurück zur Abnahme** — something was put right; the customer is asked again.
- **Vom Büro freigegeben** — settled directly (a phone call, a credit note) and
  released for billing, recorded as `BUERO_FREIGABE`.

## Immutability and corrections

Once `ABGENOMMEN`, a database trigger refuses any change to the performed
service, the recorded times, the acceptance or the signature. Not hidden in the
UI — refused, so no action, script or future feature can produce a record that
claims the customer approved something else.

The one way back is `revoke_service_acceptance`, which:

- is restricted to the **OWNER**,
- requires a reason,
- refuses outright if the service is already on a live invoice — correct the
  invoice instead, which billing already knows how to do,
- and writes the revoked acceptance, who revoked it and why into
  `service_record_events`.

Every transition is in that audit trail with an actor and a timestamp.

## Billable, exactly once

`list_billable_jobs` offers a visit only when all of these hold:

1. the job is `COMPLETED`,
2. it has a Leistungsnachweis in `ERFASST` or `ABGENOMMEN`,
3. its contract is not `MONATSPAUSCHALE`,
4. no live (non-cancelled) invoice line already bills it.

That last condition is unchanged and is also enforced by a unique index. There
is one billing-state concept, not two: "billed" is the existence of an invoice
line, never a second status that can drift.

## Billing modes

Recorded working time is operational evidence and payroll data. It may set what
the customer is charged **only** where the contract says so.

| `billing_mode` | Invoice line |
| --- | --- |
| `PAUSCHALE_PRO_EINSATZ` *(default)* | Quantity 1 × "Einsatz" at the agreed price |
| `STUNDENSATZ` | Net working hours × the agreed hourly rate |
| `MONATSPAUSCHALE` | Not billed per visit; the visits are evidence the month was served |

> **This changed existing behaviour.** Before, "alle übernehmen" multiplied the
> plan's `billing_unit_price_cents` by the recorded hours in every case, so a
> plan sold at 48 € per visit invoiced 120 € when the visit ran two and a half
> hours. Existing plans default to `PAUSCHALE_PRO_EINSATZ`, which is the safe
> reading of a price per visit. **Any plan that really is hourly has to be set
> to `STUNDENSATZ` once**, on the Leistungsplan.

Fixed monthly amounts and manually agreed line items are unaffected: a manual
invoice line has always been free-form and still is.

## What the customer sees

Two separate areas, deliberately:

- **Leistungen** — what was performed, with pending and completed Abnahmen.
- **Rechnungen** — what is owed, and whether it is paid.

A customer confirms a **service**. They are never asked to approve an invoice.
The service is usually confirmed before the invoice exists at all; the invoice
is then delivered and paid.

## Scoping

Every portal function resolves the caller's own contact row first and matches
the record against it, so passing another customer's job id returns "not found"
— the lookup never leaves the caller's own customer relationship. That holds
for another customer of the **same** company, which is the case company-level
scoping alone would let through, and is asserted in
`supabase/test/acceptance.test.sql`.
