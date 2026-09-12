# SauberWerk

Multi-tenant SaaS for small cleaning companies in Germany. Phase 5 adds stabilized planning queries, professional number generation and employee START/BEENDEN time tracking.

## Requirements

- Node.js 20.9 or newer
- pnpm 9 or newer
- Docker Desktop (for local Supabase)
- Supabase CLI

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
pnpm build
pnpm format:check
```

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser-safe anon/publishable key |
| `NEXT_PUBLIC_SITE_URL` | Public web URL, required for Auth email redirects |

## Invitations

Invitation links expire after seven days and can only be used once by the exact invited email address. In local development, the invitation action displays the link for manual testing. Production never logs invitation tokens; connect a provider by replacing `apps/web/lib/mail/invitations.ts` with a Resend, Postmark or comparable adapter.

The RLS integration test is intentionally environment-gated. Provide `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_USER_A_EMAIL`, `TEST_USER_A_PASSWORD`, `TEST_USER_B_EMAIL`, and `TEST_USER_B_PASSWORD` for two users with separate companies, then run `pnpm --filter @reinigung/web test:integration`.

`apps/web/tests/integration/jobs-planning-rls.test.ts` self-provisions isolated local test users when only `TEST_SUPABASE_URL` and `TEST_SUPABASE_ANON_KEY` are set. It covers staff roles, tenant boundaries, job assignments, recurring generation and conflict queries.

## Phase 4 operations

Staff manage single jobs in `/dashboard/auftraege` and recurring templates in `/dashboard/planung/plaene`. A weekly plan exposes customer, object, employee and status filters. Recurring templates generate at most the next eight weeks when saved, reactivated, or when `generate_jobs_for_schedule(schedule_id, until)` is called by a future trusted scheduler.

Generated jobs are unique per schedule rule and date. Re-running generation cannot duplicate them. Future `PLANNED` and `CONFIRMED` jobs may be refreshed from an edited template; `COMPLETED`, `MISSED`, and past jobs are preserved. Deactivated rules cancel only future open jobs.

## Time tracking

Employees can start only jobs assigned to their active membership. `start_my_job` uses database time, permits only one active entry per employee, and moves the job to `IN_PROGRESS`. `stop_my_job` closes the employee's entry with database time and completes a job only when every assigned employee has a completed entry. OWNER/OFFICE can view the working-time list; OWNER/OFFICE corrections use `correct_time_entry` and always create an immutable audit row with a reason.

See [architecture.md](docs/architecture.md), [database.md](docs/database.md), and [security.md](docs/security.md) for design details.
