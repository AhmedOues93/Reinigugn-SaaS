# Repository Audit

Audit of the actual code in this repository. The code, migrations and tests are the
source of truth; earlier phase labels are not trusted.

## Verified baseline

`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test` and
`pnpm build` all pass on the audited commit. No runtime regression was found in the
existing dashboard flows; the defects below are gaps and inconsistencies, not crashes.

## What is actually implemented

| Area                                                                   | State                                                                       |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Tenant foundation, profiles, memberships                               | complete                                                                    |
| Customers, cleaning objects, numbering                                 | complete                                                                    |
| Employees, master data, invitations                                    | complete                                                                    |
| Planning, schedules, recurring job generation                          | complete                                                                    |
| Jobs, assignments, conflicts                                           | complete                                                                    |
| Time tracking (`start_my_job` / `stop_my_job`, corrections, audit log) | complete                                                                    |
| Checklists, snapshots, service records                                 | complete                                                                    |
| Job photos, operational photos (private buckets, signed access)        | complete                                                                    |
| Complaints, complaint updates, quality inspections                     | complete                                                                    |
| Absences, replacements, in-app notifications                           | complete                                                                    |
| Employee area (`/dashboard/mein-bereich`)                              | partial — renders in the desktop dashboard shell                            |
| Localisation                                                           | partial — `de`, `en`, `ar` only, small dictionary, most UI hardcoded German |

## What the phase labels claimed but does not exist

Nothing in the repository implements these, in code or in migrations:

- Customer portal (no `CUSTOMER` portal routes, no customer-contact table, no portal RLS)
- Employee PWA (`apps/mobile` is a placeholder README; there is no manifest and no
  mobile-first shell — employees use the desktop dashboard shell)
- Besichtigung, Kalkulation, Angebote, agreements/recurrence beyond `service_schedules`
- Demo data / Trash
- Company branding and logo
- `tr` and `uk` locales
- Rechnungen / Abrechnung (`/dashboard/abrechnung` is a "coming soon" placeholder)

## Concrete defects found

1. `apps/web/app/dashboard/settings/page 2.tsx` — dead duplicate of `page.tsx` with a
   divergent, weaker implementation (it hardcodes the role label "Inhaber" for every
   staff user). Next.js never routes it. Removed.
2. `lib/i18n.ts` ships `de`/`en`/`ar` while the product requires `de`/`en`/`ar`/`tr`/`uk`;
   the database language constraints allow `fr`/`ro`/`pl` but not `uk`, so the two lists
   disagree in both directions.
3. `tests/routes.test.ts` asserts `toHaveLength(8)` on a literal array — it cannot fail
   and tests nothing.
4. Arabic is only handled by a `dir` attribute; there is no shared direction helper, so
   every new surface must re-derive RTL.
5. The employee experience has no bottom navigation, no `Heute` view, no schedule view,
   no profile view and no PWA installability.
6. `docs/architecture.md` still describes phase 1 and lists a language set the code does
   not use.
7. `pnpm format:check` fails on 162 files at the audited commit: Prettier is configured
   and scripted, but the repository has never been formatted with it, and no pipeline
   runs the check. Reformatting 162 files would bury every real change in review noise,
   so this phase leaves it alone and records it instead. It should be done as its own
   commit, with the check then added to CI so it cannot drift again.

## Security review of the audited code

No violation was found in the audited surfaces:

- No service-role key is referenced in application code; the browser client uses the
  publishable key only.
- `job-photos` and the absence-document bucket are private, with path-shape validation
  and per-row policies; metadata is written through `security definer` functions.
- `company_id` and `role` are never read from the client; server actions resolve the
  membership from the session.
- Historical rows (time entries, complaint updates, audit logs) are append-only.

These properties are preserved by the work that follows; RLS is never relaxed to make a
feature work.

## What this phase delivered

The gaps listed above were closed in three commits: the locale set, branding and
the employee PWA; the customer portal and role-aware routing; and billing.

`apps/mobile` is still a placeholder and is now documented as such — the employee
application lives inside `apps/web`, because a second Next.js app would have
duplicated the auth, tenant and RLS layer for no benefit.

Besichtigung, Kalkulation and Angebote were later implemented as phase 12; see
architecture.md. Still not implemented: a Trash/soft-delete system.

Originally recorded here as not attempted: Besichtigung, Kalkulation, Angebote, and a
Trash/soft-delete system. They were listed as already complete in the brief but
exist nowhere in the code, and each is a product phase of its own rather than a
gap in the work described here.

The demo seed was described in the brief as something to extend. There was none:
`supabase/seed/README.md` stated that phase 1 intentionally shipped no sample
tenants. `supabase/seed/demo.sql` is therefore a first seed covering the whole
product including billing, not a second demo company beside an existing one.

## Phase 13 — the employee field app

The employee surface already existed (jobs, checklist, time tracking, photos,
absences, language) and was not rebuilt. Phase 13 closed the gaps that stopped it
from being usable as a real field application.

**Reused rather than reinvented.** `profiles.avatar_url` had existed since the
first migration and was never populated; it was renamed to `avatar_storage_path`
instead of adding a second column, because a private bucket stores a path, not a
URL. `in_app_notifications` stays the single notification system: messaging adds
threads and messages, which notifications cannot express, and then raises an
ordinary notification so the badge that was already there keeps working. Russian
joined the existing locale set rather than a parallel mechanism.

**Messaging is online only, deliberately.** A queued message would sit on the
phone while the cleaner believed the office had been told. For a sick call or a
locked door that is worse than a clear refusal, so the composer disables itself
and says why when the device reports no connection, and nothing about messaging
touches the offline queue.

**Offline scope.** Only the signed-in employee's own assigned visits for today and
the next four weeks are stored, built server-side from the same RLS-checked
queries the online screens use. The record is keyed by user id and a read for a
different id returns nothing; a different user on the same device drops the whole
database before anything is read, and so does signing out. The service worker
caches the application shell and one offline screen that renders purely from
IndexedDB — never an API response, because a cache keyed only by URL could not
tell one user's data from another's.

**Conflict rule.** A queued checklist write carries the moment the cleaner tapped.
`sync_my_checklist_item` sets an absolute state rather than toggling, so a replay
after a dropped connection cannot double-apply, and it answers `SERVER_NEWER` when
the row changed after that moment — the newer server state is kept and the queued
write is dropped rather than silently overwriting the office. Authorisation is
unchanged: it delegates to `complete_my_checklist_item`, so the offline path is
not a way around the assignment check.

**Not verifiable in this environment.** The scratch backend used for interactive
verification has no Supabase Storage, so avatar upload and the signed-URL round
trip could not be exercised end to end here. The authorisation rules behind them —
path shape, ownership, same-company read, cross-tenant denial — are covered by
`supabase/test/employee-field.test.sql` with RLS in force.

## Phase 14 — redesign, invoice delivery, breaks (2026-09-19)

**Fixed defects found while verifying.**
- `/dashboard/reklamationen` failed to load: `complaints` has two foreign keys to
  `jobs` (`job_id`, `follow_up_job_id`), so the unqualified `jobs(...)` embed was
  ambiguous (PGRST201). Now `jobs!complaints_job_id_fkey`.
- `/dashboard/urlaub-krankheit` failed the same way (`company_members` has two
  foreign keys to `profiles`). Now fully qualified.
- The invoice document recomputed per-rate VAT from the net sum while the stored
  total sums per-line VAT, so a document could show 89,38 € VAT beside a total that
  contains 89,36 €. Both renderings now sum the stored line VAT.

**Workflow connections added.** Customer page → create invoice (customer
preselected) and lists the customer's invoices and open balance; "Leistungsnachweise"
is now a real list of completed visits showing which are still unbilled, with a
hand-off to billing; a draft offers "take over all unbilled visits" at the plan
rate; the service-record page links to its invoice or to billing.

**Breaks.** `pause_my_job` / `resume_my_job` record breaks as their own rows;
`duration_minutes` is now net of breaks and `break_minutes` is stored beside it.
Time actions stay online-only; the checklist remains the only offline-queued write.

## Production gaps (not solved here)

- **E-invoicing (XRechnung / ZUGFeRD, EN 16931).** XRechnung 3 UBL XML generation
  is implemented with readiness checks and invoice e-mail attachment. The visual
  PDF remains separate. Production readiness still requires representative exports
  to pass the current official KoSIT validation rules. ZUGFeRD/PDF-A-3 embedding is
  not implemented.
- **Legal review of invoice content.** The PDF carries the § 14 UStG elements the
  data model has, but completeness depends on tenant master data (tax number or
  VAT ID, addresses); nothing enforces that before issuing. Not legally verified.
- **Outbound e-mail** needs a real SMTP provider (`SMTP_*`, `MAIL_FROM`), plus SPF/
  DKIM/DMARC for the sending domain. Bounces are not tracked; "SENT" means accepted
  by the SMTP server, not delivered to the inbox.
- **PDF fonts.** Standard Helvetica (WinAnsi). Names in Cyrillic or Arabic script are
  replaced with "?" in the PDF. Embedding a Unicode font (fontkit) fixes this.
- **Dunning.** Payment reminders are logged and sendable; there are no dunning
  levels, fees, interest or automatic scheduling.
- **Partial / instalment invoices** and **QR/NFC check-in** and **customer
  signatures** on service records are not implemented.
