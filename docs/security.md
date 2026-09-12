# Security Model

Tenant security is implemented with PostgreSQL Row Level Security, not frontend filtering.

- A user can select only their own `profiles` row.
- A user can select only companies where they have an active membership.
- A user can select their own membership; an active owner can additionally view memberships in their company.
- Direct client inserts and deletes on tenant tables are revoked.
- Only `create_company_for_current_user` can create the phase-1 company and owner membership, and it requires `auth.uid()`.
- Sensitive profile columns (`id`, `auth_user_id`, `created_at`) and all membership columns cannot be updated by a browser session.
- Only active `OWNER` memberships can select, create or update customers and cleaning objects for their company.
- Customers and cleaning objects cannot be hard-deleted by an authenticated browser session; archival is an `is_active` update.
- An object must reference a customer of the same company. RLS checks this on every insert/update and a trigger enforces it even if policies change later.

The Supabase service role bypasses RLS and must only be used in trusted server-side operational tooling. It must never be included in Next.js `NEXT_PUBLIC_*` variables.

## Access matrix

| Capability | OWNER | OFFICE | EMPLOYEE |
| --- | --- | --- | --- |
| Customers and objects | Manage own company | Manage own company | No access |
| Employee list | Full access | View company members | No access |
| Invite OFFICE | Yes | No | No |
| Invite EMPLOYEE | Yes | Yes | No |
| Manage OFFICE | Yes | No | No |
| Manage EMPLOYEE | Yes | Yes | No |
| Disable/reactivate OWNER | No | No | No |

`SECURITY DEFINER` invitation functions revoke default public execution and grant only the minimal `authenticated` or preview access needed. Each validates the current active role, the target company and allowed role transition. Tokens are compared through stored hashes; no client can obtain a usable token from the database.

## Policy verification

Create two OWNER users with separate companies. Sign in as user A and query user B's customer or object ID through PostgREST; the result must be empty. Attempt to create an object in company B with company A's customer ID; the request must fail. The environment-gated `tests/integration/rls.test.ts` performs these checks when test credentials are supplied.
