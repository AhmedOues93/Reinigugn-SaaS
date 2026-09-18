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

| Capability               | OWNER              | OFFICE               | EMPLOYEE  |
| ------------------------ | ------------------ | -------------------- | --------- |
| Customers and objects    | Manage own company | Manage own company   | No access |
| Employee list            | Full access        | View company members | No access |
| Invite OFFICE            | Yes                | No                   | No        |
| Invite EMPLOYEE          | Yes                | Yes                  | No        |
| Manage OFFICE            | Yes                | No                   | No        |
| Manage EMPLOYEE          | Yes                | Yes                  | No        |
| Disable/reactivate OWNER | No                 | No                   | No        |

## Phase 4 access matrix

| Capability                          | OWNER | OFFICE | EMPLOYEE      |
| ----------------------------------- | ----- | ------ | ------------- |
| Create and edit single jobs         | Yes   | Yes    | No            |
| Create, edit and activate schedules | Yes   | Yes    | No            |
| Assign active employees             | Yes   | Yes    | No            |
| View company-wide planning          | Yes   | Yes    | No            |
| View own assigned jobs              | Yes   | Yes    | Yes, only own |

Jobs, schedules and their assignments have RLS enabled. `is_company_staff(company_id)` protects staff management policies. Employee job and customer/object reads use `is_current_job_assignee(job_id)`, so direct PostgREST calls cannot expose another employee's visits. `create_single_job`, `update_job_details`, generation and conflict lookups are `SECURITY DEFINER` functions that check the current active staff membership before acting.

Conflict detection queries overlapping assignments server-side (`existing.start < requested.end` and `existing.end > requested.start`) and excludes cancelled, completed and missed jobs. It intentionally returns a warning rather than a hard block; the staff member must explicitly confirm the warning before the server action persists the job.

## Time tracking

Employees can select only their own time entries and cannot receive write privileges on the time-entry table. `start_my_job` verifies an active EMPLOYEE membership, a matching assignment, tenant identity, valid job state, and absence of another active entry. `stop_my_job` can close only the caller's active entry. Staff have company-scoped operational access; corrections require a valid interval and reason and write an audit row. RLS remains enabled on entries and audit logs.

`SECURITY DEFINER` invitation functions revoke default public execution and grant only the minimal `authenticated` or preview access needed. Each validates the current active role, the target company and allowed role transition. Tokens are compared through stored hashes; no client can obtain a usable token from the database.

## Policy verification

Create two OWNER users with separate companies. Sign in as user A and query user B's customer or object ID through PostgREST; the result must be empty. Attempt to create an object in company B with company A's customer ID; the request must fail. The environment-gated `tests/integration/rls.test.ts` performs these checks when test credentials are supplied.

## Employee application (phase 9)

The employee app at `/mitarbeiter` reads and writes only through the narrow
`SECURITY DEFINER` functions that already existed for the employee area
(`start_my_job`, `stop_my_job`, `complete_my_checklist_item`,
`create_my_job_photo_metadata`, `create_my_absence`, `attach_my_au_document`),
plus `set_my_preferred_language`, which lets an employee change their own app
language and nothing else on their record.

Every storage path an employee writes is built from the `company_id` of the
membership resolved on the server. The client never supplies a tenant segment,
and the storage policies re-derive ownership from the job or absence row rather
than trusting the path.

## Company branding (phase 9)

`company-branding` is a private bucket. Any active member of the company may read
its objects, because the dashboard, the employee app, the portal and the invoice
document all render the logo; only an owner may write or delete them. Logos reach
the browser as short-lived signed URLs, never as stored paths.

## Customer portal (phase 10)

Row-level security is row-level, not column-level, and several operational tables
carry columns a customer must never see: `jobs.internal_notes`,
`customers.notes`, `complaints.internal_note`, and employee identity on
assignments and time entries. The portal therefore does **not** open those tables
to the `CUSTOMER` role at all. Instead:

- Every portal read is a `SECURITY DEFINER` function returning an explicit column
  list (`get_my_portal_overview`, `list_my_portal_objects`,
  `list_my_portal_upcoming_jobs`, `list_my_portal_service_records`,
  `get_my_portal_service_record`, `list_my_portal_job_photos`,
  `list_my_portal_complaints`, `list_my_portal_invoices`,
  `get_my_portal_invoice`).
- Every portal write is a narrow function (`create_my_portal_complaint`) that
  re-derives the company and the customer from `current_customer_contact()` and
  validates the referenced object against them. A forged object or job id cannot
  reach another customer's data.
- Service records show what was done and how long it took, never which employee
  did it.
- Documentation photos are limited to the `AFTER` and `DOCUMENTATION` categories
  of the customer's own visits, and the storage policy re-derives ownership from
  the job rather than from the path.

## Billing access (phase 11)

| Capability                        | OWNER | OFFICE | EMPLOYEE | CUSTOMER                 |
| --------------------------------- | ----- | ------ | -------- | ------------------------ |
| See any invoice or invoice line   | Yes   | Yes    | **No**   | Own issued invoices only |
| See a price, a rate or a margin   | Yes   | Yes    | **No**   | Own invoices only        |
| Create or edit a draft            | Yes   | Yes    | No       | No                       |
| Issue, mark paid, cancel, correct | Yes   | Yes    | No       | No                       |
| See a draft                       | Yes   | Yes    | No       | **No**                   |

No policy on `invoices` or `invoice_lines` grants anything to the `EMPLOYEE`
role, so an employee reads zero rows — the employee app cannot display a price
even by mistake. `billing_actor()` gates every write function on an active
`OWNER`/`OFFICE` membership, and each function re-scopes its target by
`company_id`, so an owner of another tenant gets "not found" rather than access.

These properties are asserted, not assumed: `supabase/test/billing.test.sql`
exercises them against a real database with RLS in force.

## Verifying the database

```bash
pnpm db:verify   # needs a PostgreSQL 16 server; no Docker required
```

`supabase/test/run.sh` creates a throwaway database, applies every migration in
order and runs the SQL assertion suites. `supabase/test/harness.sql` stands in
for the Supabase-managed `auth`, `storage` and `extensions` schemas so the whole
set can be checked without a running Supabase stack. The suites impersonate users
by setting `request.jwt.claim.sub` **and** switching to the `authenticated` role,
because the owning superuser bypasses RLS entirely and would make the assertions
pass without proving anything.
