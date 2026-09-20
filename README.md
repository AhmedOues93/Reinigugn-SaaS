# ReinPlan

ReinPlan is a multi-tenant operations platform for professional cleaning companies in Germany. The product connects sales, customer and object master data, workforce planning, field execution, quality control, working-time records and billing in one workflow.

## Product surfaces

| Surface | Route | Audience |
| --- | --- | --- |
| Office | `/dashboard` | `OWNER`, `OFFICE` |
| Employee app | `/mitarbeiter` | `EMPLOYEE` |
| Customer portal | `/portal` | `CUSTOMER` |

The interface supports German, English, Arabic, Turkish and Ukrainian. Product configuration is tenant-aware, including company identity and document branding.

## Architecture

The web application is built with Next.js and TypeScript in a pnpm monorepo. Supabase/PostgreSQL provides authentication, tenant-scoped persistence, storage and database functions. Row Level Security is part of the data-access boundary.

Core operational flow:

`Anfrage -> Besichtigung -> Kalkulation -> Leistungsverzeichnis -> Angebot -> Auftrag -> Objekt -> Planung -> Mitarbeiter -> Leistungsnachweis -> Abrechnung`

Employee time records are persisted per assignment and can be reviewed by office users. Corrections are auditable. Billing amounts and invoice numbering are controlled by the database rather than trusted from browser input.

## Development

Requirements: Node.js 20.9+, pnpm 9+, Supabase CLI, and PostgreSQL-compatible local infrastructure when database integration work is required.

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
pnpm dev --filter @reinigung/web
```

Quality gates:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm db:verify
pnpm build
```

## Configuration

Browser-safe configuration includes `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL`. Secrets and privileged database credentials must remain server-side and must never be committed.

Database migrations live in `supabase/migrations`. Apply migrations through the documented deployment process and review the target environment before any hosted database change.

## Operations and security

Invitation tokens are short-lived and single-use. Production invitations are delivered through the configured mail provider; development fallback links are restricted to development behavior. Tenant access is enforced in the database through RLS and server-side authorization.

Operational documentation:

- `docs/deployment.md` - deployment and environment handling
- `docs/architecture.md` - application architecture
- `docs/database.md` - database design
- `docs/security.md` - security model
- `docs/hosting.md` - hosting requirements

## Repository policy

`main` is the deployable branch. Feature work is validated through CI before it is merged. Database migrations and application changes should remain reviewable and reproducible; production data is never seeded from development fixtures.
