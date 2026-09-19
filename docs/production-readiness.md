# Production readiness

What stands between this and real paying customers. Written as an honest
assessment, not a checklist to tick: several items below are judgements a
Steuerberater, a lawyer or a DPO has to make, and this document does not make
them.

**Nothing here claims legal, tax, GDPR or security compliance.** Where a legal
obligation is mentioned, it is described as something to verify with someone
qualified.

## Already in place

Worth stating, because it changes what the remaining work is.

- **Tenant isolation** enforced by row-level security on every table, verified
  by an SQL suite that runs in CI — including the sharpest case, two customers
  inside one tenant.
- **No privileged credential in the application.** Everything runs on the
  publishable key under RLS. The one exception is the optional Resend webhook
  route, which is server-only.
- **Billing integrity**: integer cents throughout, immutable issued invoices,
  gapless per-company numbering, snapshots at issue time, corrections rather
  than edits, duplicate billing prevented, idempotent delivery recording.
- **Private storage**: four buckets, none public, short-lived signed URLs, MIME
  and size limits, path-shape guards.
- **Schema as code**: 40 migrations, no dashboard-built objects, proven to
  apply to an empty database on every push.
- **Honest e-mail**: a delivery is recorded only after the provider accepts it.

## Blockers before real customers

### 1. Backups and recovery — **blocking**

Supabase's free and Pro tiers differ sharply here. Point-in-time recovery is a
paid add-on; without it you have daily snapshots and a recovery point measured
in hours. For a system holding invoices — records a business is required to
keep — that is not adequate.

Needed: PITR enabled, a documented restore procedure, and a restore actually
performed once into a scratch project. A backup nobody has restored is a
hypothesis.

### 2. Error tracking — **blocking**

There is none. Today a server action that throws shows the user a German error
message and leaves no trace anyone will see. With real customers you will not
learn about a broken invoice flow until someone telephones.

Needed: Sentry or equivalent, wired into `error.tsx`, `global-error.tsx` and
the route handlers, with alerting. Scrub PII: this application handles names,
addresses and sick notes.

### 3. E-mail domain reputation — **blocking**

Resend works out of the box on a shared sending domain. Invoices sent that way
land in spam often enough to matter, and a customer who never saw an invoice
does not pay it.

Needed: a verified sending domain with SPF, DKIM and a DMARC record; a
dedicated subdomain (`rechnung.ihre-domain.de`) so transactional mail is not
affected by anything else sent from the main domain; and warm-up if volume
starts high.

### 4. Bounce handling — **partially built**

The webhook foundation exists: signature verification, idempotent recording,
and a `mail_events` table. What is missing is the consequence — a hard bounce
should mark the invoice as undelivered and tell the office, not sit in a log.

Needed: surface bounces on the invoice, and suppress repeat sending to an
address that hard-bounced.

### 5. Rate limiting — **blocking for anything public**

Nothing is rate limited. Sign-in, password reset and the invitation flow can be
hammered. Supabase applies some limits to its auth endpoints; the application's
own server actions have none.

Needed: at minimum, limits on authentication attempts and on invitation
sending. The hosting platform or an upstream proxy is the usual place.

### 6. Legal pages — **blocking in Germany**

A commercial German website needs an **Impressum** (§ 5 DDG) and a
**Datenschutzerklärung**. Neither exists. This is not optional and is cheap to
fix, but the content must be yours, not generated.

Also needed before customers: terms of service, an AV-Vertrag (data processing
agreement) to offer *your* customers — because you process personal data on
their behalf — and a decision about cookie consent (the app sets only
functional auth cookies, which normally do not need consent, but that judgement
should be confirmed).

### 7. GDPR mechanics — **needs work**

The architecture is helpful here: data is tenant-scoped and access-controlled.
What is missing is the operational side.

- **Right to erasure**: no mechanism. Complicated by invoices, which must be
  retained for ten years under German law — so erasure means anonymising
  around retained financial records, not deleting them.
- **Data export**: no mechanism.
- **Retention**: nothing expires. Sick notes are health data and should not be
  kept indefinitely.
- **Records of processing** (Art. 30): not written.
- **Sub-processors**: Supabase and Resend process personal data on your behalf;
  both need a DPA in place, and your customers need to be told.

None of this is a code problem primarily. All of it needs a decision.

### 8. Secrets management — **adequate, with a gap**

Secrets live in the hosting platform and GitHub Actions, never in the
repository, and `.env.local` is ignored. That is fine.

The gap is rotation: no procedure, and no record of what is set where. Write
one before more people have access.

### 9. Invoice data validation — **needs review**

The schema captures every § 14 UStG field and the PDF prints them, verified by
test. What is *not* enforced is that a company has filled them in: an invoice
can be issued by a tenant with no tax number, and the document will simply lack
it.

Needed: refuse to issue an invoice until the company's own mandatory details
are present. Cheap, and prevents an invalid document reaching a customer.

### 10. German E-Rechnung — **not implemented, and time-bound**

There is no structured XML output: no XRechnung, no ZUGFeRD, no UBL/CII. The
PDF is a PDF.

Receiving e-invoices has been mandatory for German B2B since 1 January 2025.
For **sending**, paper and PDF remain permissible through 2026; from 2027
businesses above €800,000 prior-year turnover must send structured formats, and
from 2028 the obligation covers all B2B. Invoices under €250 and §19
Kleinunternehmer are exempt from issuing.

So: not a blocker for launching to small cleaning companies now, and a hard
deadline that arrives on a known date. ZUGFeRD (a hybrid PDF/A-3 carrying the
XML) fits this product best, because the human-readable document stays the same
artefact.

**Confirm the thresholds and dates with a Steuerberater before relying on
them.**

### 11. Observability — **missing**

No metrics, no uptime monitoring, no log aggregation. You would not know
staging or production was down until you looked.

Needed at minimum: an uptime check on `/login`, and somewhere logs are kept
longer than the platform's default.

### 12. The scheduler's single point of failure — **watch**

Nightly job generation now runs in `pg_cron`, which is the right place. But
nothing watches it: if the job stops, plans quietly stop producing visits
again — the same failure, just harder to notice.

Needed: alert if `generate_due_jobs` has not succeeded in 48 hours.

### 13. Payment reconciliation is manual — **deliberate, for now**

An invoice becomes paid because somebody read a bank statement and recorded
what they saw: date, method, reference, amount. Nothing detects a transfer, and
the interface does not suggest otherwise.

That is the right choice for a beta — an automatic match that is wrong is worse
than no automatic match — but it is worth knowing what it costs and what it
does not cost. Payments are their own table, so the step after this one does
not touch the invoice at all:

- a bank-statement import inserts rows with `source = 'BANK_IMPORT'` and the
  bank's own reference;
- a Stripe webhook inserts `source = 'STRIPE'` with the payment intent as
  `external_reference`, which is uniquely indexed so a redelivered webhook
  cannot book twice;
- an invoice reaches PAID by the same rule in every case — when the payments
  reach the gross total.

Partial payments already work. What is missing before any of that is switched
on is the matching itself, and a decision about what happens when a transfer
matches nothing.

## Not blockers, but worth knowing

- **Load**: untested. Fine for a handful of tenants; unknown beyond.
- **Accessibility**: good foundations, never audited against WCAG.
- **Browser support**: only Chromium is tested. Safari on iOS matters for the
  employee PWA.
- **Offline**: the field app has offline support that has never been verified
  end to end in a browser.
- **i18n**: five languages ship; only German has been reviewed by anyone.

## Suggested order

1. Legal pages, Impressum and Datenschutzerklärung — cheapest, and legally
   required the moment the site is public.
2. Error tracking and uptime monitoring — you cannot fix what you cannot see.
3. Backups with a tested restore.
4. E-mail domain, SPF/DKIM/DMARC, and bounce consequences.
5. Rate limiting.
6. Invoice completeness validation.
7. GDPR mechanics: erasure, export, retention.
8. E-Rechnung, against the 2027 deadline.
