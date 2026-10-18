# Capability audit and future modules

Where this product stands against the workflows a professional cleaning company
actually runs, and what is deliberately left for later.

Written after reviewing how established cleaning-software products organise
these workflows. Nothing here copies another product's interface,
implementation or branding — the point of looking was to understand which
problems a Gebäudereinigung has, not how somebody else's screens look.

## What already exists

| Capability | State | Where |
| --- | --- | --- |
| **Einsatzplanung** | Built | Week board, recurring plans, rolling 8-week horizon in `pg_cron`, replacement search on absence |
| **Zeiterfassung** | Built | Start/Pause/Resume/Stop, net time after breaks, staff corrections audited in `time_entry_audit_logs` |
| **Abwesenheit & Vertretung** | Built | Vacation approval with decision, timestamp and decider; sickness reported immediately; affected jobs listed; replacement candidates exclude the unavailable and the double-booked |
| **Reinigungs-/Leistungspläne** | Built | `service_schedules` with weekday rules, billing mode, acceptance policy |
| **Qualitätskontrolle** | Built | `quality_inspections` with pass/fail and follow-up |
| **Reklamationen** | Built | `complaints` with status, priority, assignment, updates; raised from the portal and from a disputed service |
| **Angebote & Kalkulation** | Built this phase | Richtleistung, cost side, margin/markup, snapshot, Leistungsverzeichnis → Angebot → Vertrag |
| **Rechnungen** | Built | Gapless per-company numbering, immutable once issued, snapshots, corrections not edits, § 14 UStG fields, PDF |
| **Zahlungen** | Built | Manual reconciliation with date, method, reference, partial payments, audit trail |
| **Mitarbeiterkommunikation** | Built | In-app threads office ↔ employee, notifications |
| **Kundenportal** | Built | Leistungen, Abnahmen, Rechnungen, Reklamationen — strictly separated from internal figures |
| **Material** | **Not built** | Material appears only as a cost assumption in a calculation |
| **Operatives Reporting** | **Partial** | Dashboard action items and per-screen counts; no exportable reports, no Nachkalkulation |

Nothing above was duplicated in this phase. The Kalkulation extends the
existing Besichtigung → Angebot flow; it did not replace it.

---

## Deliberately not implemented

### Lohnabrechnung — will not be built

This is not a payroll system and should not become one. German payroll is a
regulated, audited domain with its own certification requirements, and a
half-built version of it is a liability rather than a feature.

**What this product can do instead**, and already largely does: keep clean,
auditable time data. Net working time per employee per job, breaks as their own
rows, corrections logged with who, when and why.

*Future scope, small and useful:* a per-period export — employee, date, job,
gross minutes, break minutes, net minutes — as CSV or DATEV-compatible output,
for the company's payroll provider or Steuerberatung to import. That is a
report, not a payroll engine.

### Lagerverwaltung — a lightweight model, later

No stock tracking exists. Material is a cost assumption on a calculation line,
which is the right level for pricing and the wrong level for "do we have
enough".

*Future scope, if it earns its place:*

```
materials            article, unit, current price, supplier
material_stock       per storage location (warehouse, vehicle, object)
material_movements   receipt, withdrawal, transfer, correction
                     with actor and timestamp
minimum_stock        per material and location → reorder alert
```

Consumption could be recorded against a job, which would eventually allow
comparing assumed material cost against actual. Explicitly **not** a full ERP
inventory module: no batch tracking, no valuation methods, no purchase orders.

### Nachkalkulation — the obvious next step

The system now knows what a contract was *calculated* to take, and separately
what it *actually* took. It does not yet compare them.

*Future scope:* per contract and period, calculated hours against recorded
hours, calculated cost against actual personnel cost, and the resulting real
margin. This is the single most valuable report a cleaning company can have,
because it turns each contract's outcome back into a better Richtleistung. It
is deliberately not in this phase: it needs a decision about which period
boundaries to use and how to treat replacements and overtime.

### KI-Assistenz — nothing in this phase

No AI features are built, and none should be added as a gimmick.

*Plausible future uses, all assistive and all reversible:*

- Summarising the day's operational alerts into a short briefing.
- Classifying an incoming Anfrage (routine, Sonderreinigung, out of area) as a
  **suggestion** the office confirms.
- Drafting customer correspondence — a reply to a Reklamation, a payment
  reminder — that a person reads and sends.
- Flagging scheduling anomalies: a visit consistently over its planned time, a
  plan about to run out of generated jobs, an object whose complaints cluster.

**Hard limits.** No autonomous financial decisions: nothing sets a price,
issues an invoice, marks anything paid, approves an absence, or accepts a
service on a customer's behalf. No legal or tax judgements. Anything a model
produces is a draft or a suggestion attributable to the person who accepts it.

---

## Remaining beta blockers

Unchanged from `docs/production-readiness.md`, which remains the authoritative
list. In short: legal pages (Impressum, Datenschutzerklärung), error tracking,
backups with a tested restore, rate limiting, e-mail domain reputation and
bounce consequences, GDPR erasure and export, and invoice completeness
validation.

Two additions from this phase:

- **Nothing is deployed.** No staging project exists, so every workflow that
  needs a real login — the whole authenticated Playwright suite — remains
  unexecuted.
- **Existing Leistungspläne carry a default billing mode.** Plans created
  before phase 19 default to `PAUSCHALE_PRO_EINSATZ`. Any contract that is
  genuinely hourly must be set to `STUNDENSATZ` once, by hand, on the plan.
