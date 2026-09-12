# SauberWerk

Multi-tenant SaaS for small cleaning companies in Germany. Phase 3 provides protected customer/object management, employee administration, expiring invitations and role-aware access control.

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

See [architecture.md](docs/architecture.md), [database.md](docs/database.md), and [security.md](docs/security.md) for design details.
