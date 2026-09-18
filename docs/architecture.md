# Architecture

The repository is a pnpm workspace managed by Turborepo. `apps/web` is a single
Next.js App Router application that serves all three product surfaces.
`apps/mobile` remains an unused placeholder: the employee application is a
mobile-first PWA inside `apps/web`, not a separate codebase.

Shared packages have narrow responsibilities:

- `@reinigung/ui`: shared Tailwind utility support.
- `@reinigung/types`: domain role and entity types.
- `@reinigung/validation`: Zod schemas shared by server actions and clients,
  including the single definition of the supported locales.
- `@reinigung/config`: product-level constants.

Browser interactions use Supabase's publishable key only. Server actions perform
input validation and use the cookie-bound Supabase session. The database remains
the final authorization boundary.

## Three surfaces, one application

| Surface         | Route          | Audience          |
| --------------- | -------------- | ----------------- |
| Dashboard       | `/dashboard`   | `OWNER`, `OFFICE` |
| Employee app    | `/mitarbeiter` | `EMPLOYEE`        |
| Customer portal | `/portal`      | `CUSTOMER`        |

`lib/landing.ts` holds the only mapping from role to surface. The root page,
onboarding, the staff guard and invitation acceptance all route through it, so
the surfaces cannot drift apart. The value it returns is always a fixed internal
path, never user input, so it cannot become an open redirect.

The employee area used to live at `/dashboard/mein-bereich` inside the desktop
shell. That route now redirects permanently to `/mitarbeiter`; there is one
employee surface, not two parallel ones.

### Employee app

A mobile-first frame: compact branded header, a content column capped at phone
width, and a persistent bottom tab bar. Safe-area insets keep it clear of the
notch and the home indicator, and every interactive target is at least 44px.
It is installable through a manifest that carries no tenant data. Screens:
Heute, Einsätze, job detail (time workflow, checklist, photos), Nachrichten,
Urlaub/Krankheit, Profil.

### Customer portal

One navigation component renders as a bottom tab bar on phones and as a tab row
from `sm` upwards, so there is no separate mobile layout to keep in step.
Screens: overview, objects, delivered services, invoices, complaints, profile.

## Localisation

`de`, `en`, `ar`, `tr`, `uk`. `lib/i18n.ts` holds one namespaced dictionary per
locale; the test suite enforces key parity, placeholder parity, non-empty values
and real UTF-8 umlauts in German. `direction()` derives RTL once, so no surface
re-implements it. The database language constraints, the Zod schema and the UI
all use the same five codes.

## Roles and invitations

`OWNER` and `OFFICE` use the staff dashboard. `EMPLOYEE` and `CUSTOMER` are
redirected server-side to their own surface. Permissions are repeated in server
actions and PostgreSQL functions.

Invitations create a pending `company_members` record without a profile. A random
token is generated only in the server action, persisted as a SHA-256 hash, and
placed in an HttpOnly cookie after the recipient opens the link. The recipient
signs up using the invitation email, then an atomic PostgreSQL function creates
the active membership. Acceptance branches on the invited role: an employee gets
an `employee_details` record, a portal customer gets a `customer_contacts` link.
The mail service is provider-neutral.

## Sales pipeline

Lead → Besichtigung → Kalkulation → Angebot → acceptance. Acceptance converts
into the existing `customers`, `cleaning_objects` and `service_schedules` tables
rather than introducing a parallel contract model, so a won quote lands directly
in the planning the rest of the product already runs on. See
[database.md](database.md) for the conversion and [security.md](security.md) for
who may see a price.

## Operational planning

`service_schedules` are weekly templates with structured `schedule_rules`; `jobs`
are concrete visits. The generator is a database function so a future trusted
cron can extend the rolling eight-week horizon without a browser session. It is
idempotent through the schedule/rule/date unique key and preserves completed,
missed, and past records when templates change.

## Time tracking

`job_time_entries` are the source of truth for actual work. START and STOP are
PostgreSQL functions using `now()` rather than browser clocks. The employee app
only invokes these narrow functions; it cannot directly mutate historical
entries.

## Billing

Invoices build on the existing customer, object, agreement, job and service-record
model rather than beside it: an invoice line can name the job it bills and the
agreement it came from, and only completed, not-yet-billed visits are offered.
Amounts are computed in the database from quantity, unit price and VAT rate;
issued invoices are immutable; corrections are new invoices that reference the
cancelled original. See [database.md](database.md) and [security.md](security.md).

The invoice document renders from the snapshots taken at issue time and is laid
out for A4, so it prints — and therefore saves as PDF — from the browser with the
tenant's logo. That keeps branding correct without adding a server-side PDF
renderer.

## Local development

Docker runs the local Supabase stack (PostgreSQL, Auth, Storage, Mailpit);
`pnpm dev` runs Next.js on the host. The Next.js app is deliberately not
containerised.

`pnpm db:verify` applies every migration to a throwaway PostgreSQL database and
runs the SQL assertion suites. It needs a PostgreSQL 16 server but not Docker,
so migrations and RLS can be checked in CI without a full Supabase stack.
