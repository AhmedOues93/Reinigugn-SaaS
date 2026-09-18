# Repository Audit

Audit of the actual code in this repository. The code, migrations and tests are the
source of truth; earlier phase labels are not trusted.

## Verified baseline

`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test` and
`pnpm build` all pass on the audited commit. No runtime regression was found in the
existing dashboard flows; the defects below are gaps and inconsistencies, not crashes.

## What is actually implemented

| Area | State |
| --- | --- |
| Tenant foundation, profiles, memberships | complete |
| Customers, cleaning objects, numbering | complete |
| Employees, master data, invitations | complete |
| Planning, schedules, recurring job generation | complete |
| Jobs, assignments, conflicts | complete |
| Time tracking (`start_my_job` / `stop_my_job`, corrections, audit log) | complete |
| Checklists, snapshots, service records | complete |
| Job photos, operational photos (private buckets, signed access) | complete |
| Complaints, complaint updates, quality inspections | complete |
| Absences, replacements, in-app notifications | complete |
| Employee area (`/dashboard/mein-bereich`) | partial — renders in the desktop dashboard shell |
| Localisation | partial — `de`, `en`, `ar` only, small dictionary, most UI hardcoded German |

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
