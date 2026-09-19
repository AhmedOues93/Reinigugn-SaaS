# Seed Data

`demo.sql` creates one demo tenant for local development. It is not applied
automatically; run it against a local Supabase stack:

```bash
npx supabase start
psql "$(npx supabase status --output json | jq -r .DB_URL)" -f supabase/seed/demo.sql
```

Re-running it is a no-op — it detects its own company and stops, so it cannot
produce duplicates or a second demo tenant.

## What it contains

One company (`SauberWerk Demo GmbH`) with complete master data, a recurring
agreement carrying the rate it was sold at, past visits with recorded working
time, upcoming visits, a complaint under way, a portal contact, and billing: one
paid invoice, one open invoice built from the actual completed visits, and one
draft still being prepared.

The billing rows are created by calling the real `create_draft_invoice`,
`add_invoice_line`, `issue_invoice` and `mark_invoice_paid` functions while
impersonating the owner, so the demo data passes through the same validation,
numbering and snapshotting as production rather than being inserted behind it.

## Accounts

| Email                   | Role     | Surface        |
| ----------------------- | -------- | -------------- |
| `inhaber@demo.test`     | OWNER    | `/dashboard`   |
| `buero@demo.test`       | OFFICE   | `/dashboard`   |
| `mitarbeiter@demo.test` | EMPLOYEE | `/mitarbeiter` |
| `kunde@demo.test`       | CUSTOMER | `/portal`      |

All four use the password `DemoPasswort2026!`. These credentials are for local
development only; never run this file against a hosted project.
