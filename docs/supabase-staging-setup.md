# Creating the Supabase Cloud staging project

A reproducible procedure, start to finish. The migration history is the source
of truth throughout: **no table, policy, function or bucket is ever created by
hand in the dashboard.** Anything built by clicking cannot be reviewed,
rebuilt, or rolled forward, and will silently diverge from the repository.

Everything below is done once, by you, and takes about twenty minutes.

## 1. Create the project

Supabase dashboard → New project.

- **Name**: something that cannot be confused with production, e.g.
  `sauberwerk-staging`.
- **Region**: `eu-central-1` (Frankfurt). Customer and employee data is German;
  keeping it in the EU avoids a transfer question you would otherwise have to
  answer.
- **Database password**: generate one and store it in your password manager.
  You need it for `db push` and for nothing else routine.

Staging must be its **own project**, not a schema or branch inside another one.
Tenant isolation is enforced by row-level security against `auth.uid()`;
sharing a project would put test rows under the same policies as real ones.

## 2. Apply the schema

From the repository root:

```bash
# Prove the migration set still applies to an empty database first.
# Needs only PostgreSQL 16 — no Docker, no Supabase stack.
supabase/test/run.sh

npx supabase login
npx supabase link --project-ref <project-ref>   # the ref is in the project URL

npx supabase db push --dry-run                  # read this before continuing
npx supabase db push
```

Then confirm the project matches the repository:

```bash
npx supabase db diff --linked    # expected: no schema differences
```

This creates everything: tables, enums, indexes, constraints, triggers, RPC and
`security definer` functions, RLS policies, **and all four storage buckets with
their policies**. There is no manual follow-up except the settings below.

## 3. Auth configuration

Authentication → URL Configuration:

- **Site URL**: your staging URL, e.g. `https://sauberwerk-staging.onrender.com`
- **Redirect URLs**: add `<site url>/auth/callback`

Authentication → Providers → Email: leave email/password enabled. Keep
"Confirm email" on, so staging behaves like production.

Without these two URLs, confirmation and password-reset links bounce.
`supabase/config.toml` configures the **local** stack only and has no effect on
a cloud project.

## 4. Enable the nightly job generation

Database → Extensions → enable **`pg_cron`**.

The migration schedules the job automatically where the extension is already
enabled. If it was enabled after `db push`, run the schedule once in the SQL
editor:

```sql
select cron.schedule(
  'sauberwerk-generate-due-jobs',
  '0 3 * * *',
  $$select public.generate_due_jobs(56)$$
);
```

Check it afterwards:

```sql
select jobname, schedule, active from cron.job;
select public.generate_due_jobs(56);   -- run once by hand; safe to repeat
```

Without this, recurring plans stop producing visits about eight weeks after
anyone last edited them.

## 5. Storage

Nothing to do. All four buckets — `job-photos`, `absence-documents`,
`company-branding`, `avatars` — are created by migrations, all private, all
with MIME allow-lists and size limits. Do not make any of them public: files
are reached through short-lived signed URLs, and sick notes in particular are
health data.

Verify:

```sql
select id, public, file_size_limit from storage.buckets order by id;
-- every row must show public = false
```

## 6. Test data

**Do not run the demo seed against a cloud project.** It creates users with a
password that is written down in the repository. It now refuses to run unless
you explicitly acknowledge local development, and refuses outright if the
database already holds a real tenant — but the rule is simpler than the guard:
the seed is for an empty local database.

For staging, create accounts the way a real customer would, through the
application:

1. Sign up as the owner at `<staging url>/signup`, confirm the e-mail.
2. In the app, invite an office user, an employee and a customer contact.
3. Complete each invitation from the link in the e-mail.

That gives you the four roles the end-to-end suite needs, created through the
same code path a real user takes — which also tests that path.

Record the addresses and passwords as GitHub Actions secrets (see below).
Use addresses on a domain you control, so the staging mail guard can allow
them.

## 7. Environment variables

Set these in the hosting platform, for the staging deployment:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_APP_ENV` | `staging` |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | same page → anon/publishable key |
| `NEXT_PUBLIC_SITE_URL` | the staging URL, no trailing slash |
| `RESEND_API_KEY` | Resend → API Keys |
| `MAIL_FROM` | `SauberWerk Staging <staging@ihre-domain.de>` |
| `MAIL_REPLY_TO` | optional |
| `MAIL_CATCH_ALL` | **required** — a mailbox you own |
| `MAIL_ALLOWED_RECIPIENTS` | optional, e.g. `@ihre-domain.de` |
| `RESEND_WEBHOOK_SECRET` | optional, from the Resend webhook |
| `SUPABASE_SERVICE_ROLE_KEY` | optional, **only** if you enable the webhook |

The last one is the single privileged credential in the system and is used by
exactly one route handler. It must never appear under a `NEXT_PUBLIC_` name,
and it is not needed at all unless you want delivery events.

The `NEXT_PUBLIC_*` values are compiled into the browser bundle, so they must
be set **before the first build**, not added afterwards.

## 8. Checks that it worked

```bash
# Schema matches the repository
npx supabase db diff --linked

# Every bucket private
#   (SQL editor) select id, public from storage.buckets;

# The scheduler exists and runs
#   (SQL editor) select jobname, active from cron.job;

# The app is up and reports the right environment
curl -s https://<staging-url>/login | grep -o 'data-app-env="[a-z]*"'
#   expected: data-app-env="staging"
```

Then point the end-to-end suite at it:

```bash
E2E_BASE_URL=https://<staging-url> \
E2E_OWNER_EMAIL=… E2E_OWNER_PASSWORD=… \
E2E_EMPLOYEE_EMAIL=… E2E_EMPLOYEE_PASSWORD=… \
E2E_CUSTOMER_EMAIL=… E2E_CUSTOMER_PASSWORD=… \
  pnpm --filter @reinigung/web test:e2e
```

The suite refuses to run against a target that looks like production or that
reports `data-app-env="production"`, so this is safe to leave wired up.

## 9. When production comes later

A second, separate project, with the same procedure and these differences:
`NEXT_PUBLIC_APP_ENV=production`, no catch-all (the mail guard steps aside),
point-in-time recovery enabled, and a separate hosting project so it cannot
inherit staging's variables. Never restore a production dump into staging: it
would put real customer data behind test credentials.
