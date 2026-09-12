# Architecture

The repository is a pnpm workspace managed by Turborepo. `apps/web` is a Next.js App Router application and is the only implemented product surface in phase 1. `apps/mobile` is deliberately a placeholder for the later employee application.

Shared packages have narrow responsibilities:

- `@reinigung/ui`: shared Tailwind utility support.
- `@reinigung/types`: domain role and entity types.
- `@reinigung/validation`: Zod schemas shared by server actions and future clients.
- `@reinigung/config`: product-level constants.

Browser interactions use Supabase's publishable key only. Server actions perform input validation and use the cookie-bound Supabase session. The database remains the final authorization boundary.

Authentication routes are public. `/onboarding` and `/dashboard/*` obtain the authenticated user on the server. The dashboard requires an active company membership; a signed-in user without one is redirected to onboarding.

## Roles and invitations

`OWNER` and `OFFICE` use the staff dashboard. `EMPLOYEE` is redirected server-side to `/dashboard/mein-bereich` and cannot access customer, object or employee routes. Permissions are repeated in server actions and PostgreSQL functions.

Invitations create a pending `company_members` record without a profile. A random token is generated only in the server action, persisted as a SHA-256 hash, and placed in an HttpOnly cookie after the recipient opens the link. The recipient signs up using the invitation email, then an atomic PostgreSQL function creates the active membership and employee detail record. The mail service is provider-neutral.

## Phase 4 operational planning

`service_schedules` are weekly templates with structured `schedule_rules`; `jobs` are concrete visits. The generator is a database function so a future trusted cron can extend the rolling eight-week horizon without a browser session. It is idempotent through the schedule/rule/date unique key and preserves completed, missed, and past records when templates change.

The staff dashboard exposes jobs and the weekly calendar. The employee dashboard intentionally exposes only assigned, read-only visits. Employee-facing copy remains in route components and not in database functions; a future mobile app can introduce locale dictionaries at that presentation boundary without changing operational data or authorization logic.
