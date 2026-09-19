# SauberWerk

Multi-tenant SaaS for small cleaning companies in Germany. One Next.js
application serves three surfaces against one Supabase backend:

| Surface                        | Route          | Audience          |
| ------------------------------ | -------------- | ----------------- |
| Dashboard                      | `/dashboard`   | `OWNER`, `OFFICE` |
| Employee app (installable PWA) | `/mitarbeiter` | `EMPLOYEE`        |
| Customer portal                | `/portal`      | `CUSTOMER`        |

Languages: German, English, Arabic (RTL), Turkish, Ukrainian.

## Requirements

- Node.js 20.9 or newer
- pnpm 9 or newer
- Docker Desktop (for local Supabase)
- Supabase CLI

Deployment and operations:

- [docs/deployment.md](docs/deployment.md) — environment matrix, migrations, outbound mail, CI
- [docs/supabase-staging-setup.md](docs/supabase-staging-setup.md) — creating the staging project, step by step
- [docs/hosting.md](docs/hosting.md) — what the app needs from a host, and which free tiers fit
- [docs/production-readiness.md](docs/production-readiness.md) — what remains before real customers

## Local setup

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
npx supabase start
pnpm dev --filter @reinigung/web
```

Use the API URL and anon/publishable key shown by `npx supabase status` in `apps/web/.env.local`. For email confirmation and password reset, add `NEXT_PUBLIC_SITE_URL=http://localhost:3000` and configure the same redirect URL in Supabase Auth.

## Database

Migrations are applied automatically by `npx supabase start` in a fresh local environment. To reset and re-run all migrations:

```bash
npx supabase db reset
```

To link a hosted Supabase project and apply migrations:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

Never place a Supabase service-role key in `apps/web/.env.local` or any browser-exposed variable.

## Commands

```bash
pnpm dev --filter @reinigung/web
pnpm lint
pnpm typecheck
pnpm test
pnpm --filter @reinigung/web test:integration
pnpm db:verify
pnpm build
pnpm format:check
```

## Environment variables

| Variable                               | Purpose                                           |
| -------------------------------------- | ------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase project API URL                          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe anon/publishable key                 |
| `NEXT_PUBLIC_SITE_URL`                 | Public web URL, required for Auth email redirects |

## Invitations

Invitation links expire after seven days and can only be used once by the exact invited email address. In local development, the invitation action displays the link for manual testing. Production never logs invitation tokens; connect a provider by replacing `apps/web/lib/mail/invitations.ts` with a Resend, Postmark or comparable adapter.

The RLS integration test is intentionally environment-gated. Provide `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_USER_A_EMAIL`, `TEST_USER_A_PASSWORD`, `TEST_USER_B_EMAIL`, and `TEST_USER_B_PASSWORD` for two users with separate companies, then run `pnpm --filter @reinigung/web test:integration`.

`apps/web/tests/integration/jobs-planning-rls.test.ts` self-provisions isolated local test users when only `TEST_SUPABASE_URL` and `TEST_SUPABASE_ANON_KEY` are set. It covers staff roles, tenant boundaries, job assignments, recurring generation and conflict queries.

## Phase 4 operations

Staff manage single jobs in `/dashboard/auftraege` and recurring templates in `/dashboard/planung/plaene`. A weekly plan exposes customer, object, employee and status filters. Recurring templates generate at most the next eight weeks when saved, reactivated, or when `generate_jobs_for_schedule(schedule_id, until)` is called by a future trusted scheduler.

Generated jobs are unique per schedule rule and date. Re-running generation cannot duplicate them. Future `PLANNED` and `CONFIRMED` jobs may be refreshed from an edited template; `COMPLETED`, `MISSED`, and past jobs are preserved. Deactivated rules cancel only future open jobs.

## Time tracking

Employees can start only jobs assigned to their active membership. `start_my_job` uses database time, permits only one active entry per employee, and moves the job to `IN_PROGRESS`. `stop_my_job` closes the employee's entry with database time and completes a job only when every assigned employee has a completed entry. OWNER/OFFICE can view the working-time list; OWNER/OFFICE corrections use `correct_time_entry` and always create an immutable audit row with a reason.

## Verifying the database without Docker

```bash
pnpm db:verify
```

Applies every migration to a throwaway PostgreSQL 16 database and runs the SQL
assertion suites in `supabase/test`. `harness.sql` stands in for the
Supabase-managed `auth`, `storage` and `extensions` schemas, so migrations and
RLS can be checked in CI without a running Supabase stack.

## Demo data

```bash
psql "$(npx supabase status --output json | jq -r .DB_URL)" -f supabase/seed/demo.sql
```

One demo tenant covering master data, planning, time tracking, complaints, the
portal and billing. Re-running it is a no-op. See
[supabase/seed/README.md](supabase/seed/README.md) for the accounts. Local
development only.

## Billing

Money is stored in integer cents and every amount on an invoice is computed by
the database from quantity, unit price and VAT rate, so a client can never send
a total. Invoice numbers are gapless per company and year and are assigned only
at issue. An issued invoice is immutable: it can be marked paid or cancelled, and
a correction is a new invoice referencing the cancelled one, never a rewrite.
A completed visit can appear on at most one live invoice.

Employees have no access to invoices at all; customers see only their own issued
invoices in the portal.

See [audit.md](docs/audit.md), [architecture.md](docs/architecture.md),
[database.md](docs/database.md), and [security.md](docs/security.md) for design
details.
