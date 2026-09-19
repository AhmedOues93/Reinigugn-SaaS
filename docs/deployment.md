# Deployment

Two environments, kept deliberately separate. Production is not set up yet;
everything below describes **staging** and the local development loop it must
not disturb.

| | Local | Staging |
| --- | --- | --- |
| Database / Auth / Storage | Supabase CLI (Docker) | Supabase Cloud, its own project |
| Application | `next dev` on your machine | Hosting platform, public HTTPS |
| E-mail | Mailpit, nothing leaves the machine | Real SMTP provider, **guarded** |
| Data | Demo seed | Test data only — never a production copy |
| `NEXT_PUBLIC_APP_ENV` | `local` | `staging` |

Staging is a separate Supabase project, not a schema or a branch inside another
one. Tenant isolation is enforced by row-level security against `auth.uid()`;
sharing a project would put test rows under the same policies as real ones.

## Configuration

Every value the application reads is listed in `apps/web/.env.example`, and
`apps/web/lib/env.ts` is the only place they are read. A missing variable fails
at the first read naming itself, rather than surfacing later as `undefined`
inside a Supabase client.

| Variable | Local | Staging |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_ENV` | `local` | `staging` |
| `NEXT_PUBLIC_SUPABASE_URL` | `npx supabase status` | Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `npx supabase status` | same page, anon/publishable key |
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` | the public HTTPS URL |
| `SMTP_*`, `MAIL_FROM` | Mailpit, optional | provider credentials |
| `MAIL_CATCH_ALL` / `MAIL_ALLOWED_RECIPIENTS` | not needed | **required** — see below |

### There is no service-role key, and there must not be

The application talks to Supabase only with the publishable (anon) key. Every
access decision — which tenant, which role, which customer — is made by
row-level security in the database. Nothing in the repository reads
`SUPABASE_SERVICE_ROLE_KEY`, and nothing should: a service-role key bypasses
RLS completely, and any value reachable from a `NEXT_PUBLIC_` name is compiled
into the browser bundle.

If a future feature seems to need one, it almost certainly needs a
`security definer` function instead — that is how every privileged operation in
this schema already works.

## Applying the schema to a new staging project

The migrations in `supabase/migrations/` are the source of truth. They are
append-only: never edit, reorder, squash or delete one that has been applied
anywhere, and never build the schema by hand in the dashboard. A schema that
exists only in a dashboard cannot be rebuilt, reviewed or rolled forward.

Against a brand-new, empty project:

```bash
# 1. Prove the set still applies cleanly to an empty database first.
#    Needs only a PostgreSQL 16 server — no Docker, no Supabase stack.
supabase/test/run.sh

# 2. Link the repository to the staging project (project ref from its URL).
npx supabase link --project-ref <staging-project-ref>

# 3. Show what would be applied, and read it before continuing.
npx supabase db push --dry-run

# 4. Apply.
npx supabase db push
```

Step 1 is not optional. It applies all migrations to a throwaway database and
runs the SQL invariants — tenant isolation, billing immutability, invoice
numbering, the field-app rules — so a broken migration is caught before it
reaches a hosted project. CI runs the same script on every push.

Afterwards, confirm the project actually matches the repository:

```bash
npx supabase db diff --linked   # expected output: no schema differences
```

### What the migrations already cover

Everything, including the parts that are easy to forget: tables, enums,
indexes, constraints, triggers, RPC and `security definer` functions, RLS
policies, **and the four storage buckets with their policies**. There is no
manual post-deployment step and nothing to click in the dashboard except Auth
URLs (below).

### Auth URLs

In the staging project, Authentication → URL Configuration:

- **Site URL**: the same value as `NEXT_PUBLIC_SITE_URL`
- **Redirect URLs**: add `<NEXT_PUBLIC_SITE_URL>/auth/callback`

Without these, confirmation and password-reset links bounce. `supabase/config.toml`
configures the **local** stack only; cloud projects are configured per project.

## Storage

Four buckets, all created by migrations and all **private** — no bucket is
public, and files are reached only through short-lived signed URLs:

| Bucket | Holds | Signed URL |
| --- | --- | --- |
| `job-photos` | before/after and documentation photos | 15 minutes |
| `absence-documents` | sick notes (AU) | 5 minutes |
| `company-branding` | tenant logo | 30 minutes |
| `avatars` | employee profile pictures | 30 minutes |

Each has a MIME allow-list and a size limit at the bucket level, and path-shape
guard functions plus RLS policies on `storage.objects` decide who may read or
write a given path. Sick notes are health data: the bucket is private, the
window is the shortest of the four, and only the employee and staff who may
manage that member can reach a path.

## Hosting

The application is portable: no filesystem writes (invoice PDFs are generated
in memory with `pdf-lib`), no long-running process, no background workers, and
no Edge-runtime constraints. It runs anywhere that runs a Next.js 15 server.

**Vercel** is the least-friction option and has a free tier with automatic
deployments per push:

- Root directory: `apps/web`
- Build command: `cd ../.. && pnpm build --filter @reinigung/web`
- Install command: `pnpm install --frozen-lockfile`
- Node: 20
- Environment variables: the staging column of the table above, set for the
  Preview and/or Production scope of the **staging** project

Render, Railway and Fly.io all work too, with `pnpm build` and `pnpm start`.
Netlify needs its Next.js runtime adapter.

Keep staging on its own hosting project or team, so a production deployment
later cannot inherit staging's environment variables.

## Outbound e-mail

`apps/web/lib/mail/transport.ts` speaks plain SMTP, so any provider works —
Postmark, Brevo, Mailjet, SES, Resend, or a company relay. Locally that is
Mailpit; in staging it is the real provider.

With `SMTP_HOST` or `MAIL_FROM` unset, sending is disabled and each attempt is
recorded as `NOT_CONFIGURED`. The application never reports a delivery that did
not happen.

### The staging guard

Staging data looks like real data: a customer row carries a real mailbox. A
test invoice must not land in an actual customer's inbox, and a stray payment
reminder is worse. `apps/web/lib/mail/guard.ts` therefore applies, in order:

1. **Production** sends exactly what it was given.
2. **Local** sends unchanged — Mailpit accepts every address — with `[LOKAL]`
   in the subject so a screenshot is never mistaken for a real message.
3. **Staging** delivers normally only to `MAIL_ALLOWED_RECIPIENTS` (full
   addresses, or `@domain` for a whole domain). Everything else is redirected
   to `MAIL_CATCH_ALL`, with the intended recipient in the subject and the
   first line of the body. With neither configured, staging **refuses to send**
   and says why.

Refusing is deliberate. A staging environment that silently mails customers is
a worse failure than one that cannot send at all. `tests/mail-guard.test.ts`
covers each branch, including casing and lookalike domains.

## Tests and CI

`.github/workflows/ci.yml` runs on every push and pull request:

| Job | What it proves |
| --- | --- |
| `static` | typecheck, lint, unit tests across the workspace |
| `database` | every migration applies to an empty PostgreSQL 16 and the SQL invariants hold |
| `build` | the production build compiles |
| `e2e` | the unauthenticated surface works in a real browser |

The end-to-end suite lives in `apps/web/e2e`:

```bash
pnpm --filter @reinigung/web test:e2e:public   # no backend needed
pnpm --filter @reinigung/web test:e2e          # everything

# against a deployed staging environment
E2E_BASE_URL=https://staging.example.com \
E2E_OWNER_EMAIL=… E2E_OWNER_PASSWORD=… \
  pnpm --filter @reinigung/web test:e2e
```

`e2e/public` needs nothing and runs in CI. `e2e/authenticated` needs a
reachable Supabase project and a seeded owner, and **skips** rather than
passing when that is absent — a green run never means "the workflow works" when
nothing was exercised. Point it at a disposable project: it signs in and writes
rows.

## Known gap: nothing generates work on a schedule

Recurring plans create visits up to eight weeks ahead, and only when a plan is
saved, reactivated, or a quote is accepted. There is no scheduler, so an
untouched standing contract stops producing visits about two months later. The
planning screen names the plans that are running out and offers to extend them,
which is a prompt, not automation.

Closing it properly needs one of:

- `pg_cron` in the Supabase project calling `generate_jobs_for_schedule` for
  each active plan, or
- a scheduled request from the hosting platform to an authenticated route
  handler.

Both need a decision about credentials for an unattended caller, which is why
neither is in place yet.
