# Database

## Tables

| Table                          | Purpose                                               | Tenant relation                                            |
| ------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------- |
| `companies`                    | A cleaning business tenant                            | Root tenant record                                         |
| `profiles`                     | Application profile linked one-to-one to `auth.users` | Identifies the authenticated actor                         |
| `company_members`              | Membership, role and status                           | Links profile to exactly one company record per membership |
| `customers`                    | Customer master data                                  | `company_id` identifies the tenant                         |
| `cleaning_objects`             | A customer's cleaning location                        | `company_id` and `customer_id`; both tenant IDs must match |
| `employee_details`             | Employment metadata without payroll data              | `company_id` and accepted member profile                   |
| `company_invitations`          | Hashed, expiring one-time invitation token            | Bound to one company and pending membership                |
| `service_schedules`            | Active weekly cleaning template                       | `company_id`, customer and object must match               |
| `schedule_rules`               | Structured weekday/start/end rule                     | Belongs to one schedule; no free-text recurrence           |
| `service_schedule_assignments` | Employee template assignment                          | Active employee member in the schedule company             |
| `jobs`                         | Concrete planned or historical cleaning visit         | `company_id`, customer, object and optional schedule       |
| `job_assignments`              | One or more employees assigned to a job               | Active employee member in the job company                  |

All future business records must include `company_id uuid not null references companies(id)`. RLS policies must use the helper functions from the initial migration to verify membership before allowing access.

## Customers and objects

Customers are soft-deleted through `is_active = false`; there is no delete permission for browser sessions. `cleaning_objects` uses a database trigger and an RLS `WITH CHECK` clause to require that its `customer_id` belongs to the same `company_id`. This prevents cross-company assignment even when PostgREST is called directly.

Both tables maintain `updated_at` with a `before update` trigger. Their indexes cover tenant, active-status, customer relationship and common list-search fields.

## Members and invitations

`company_members.profile_id` is nullable only while a membership is `INVITED`. Pending name, phone and email fields allow the staff UI to display an invitation before an Auth profile exists. After acceptance, `complete_company_invitation` links the authenticated profile, creates `employee_details`, marks the membership `ACTIVE`, and consumes the token atomically.

Invitation records retain only a SHA-256 token hash. `expires_at`, `accepted_at` and `revoked_at` enforce expiration, one-time use and resend invalidation. Disabling a member changes the membership and employee-detail active status; it never deletes data.

## Onboarding transaction

`create_company_for_current_user(company_name)` is a `SECURITY DEFINER` PostgreSQL function called by an authenticated user. It validates the name, verifies that the profile has no active membership, inserts the company, and inserts one `OWNER` membership in the same transaction. No browser client receives direct table-insert privileges.

## Jobs and recurring schedules

`jobs` link a customer and object to one scheduled date and UTC instants derived from the schedule timezone (`Europe/Berlin` by default). A trigger verifies that the selected customer, object, optional schedule and every assignment all belong to one company. Separate assignment triggers prevent a cross-company employee from being attached to either a job or a schedule.

`generate_jobs_for_schedule(schedule_id, until)` generates only the finite rolling horizon requested by its caller. The unique tuple `(service_schedule_id, schedule_rule_id, scheduled_date)` prevents duplicate visits. Existing future `PLANNED`/`CONFIRMED` generated jobs are refreshed; completed, missed and past visits are immutable to template generation. Deactivated rules cancel future open generated jobs rather than deleting them.

## Master data and time entries

Customer, object and employee business numbers are company-scoped and unique. Missing numbers are generated under a transaction advisory lock as `K-0001`, `O-0001`, and `M-0001`; manual values remain supported. The Phase-5 schema also prepares billing contact data, country, payment terms, object area and employee language/employment data without collecting payroll, tax, banking or health data for employees.

`job_time_entries` contains trusted `started_at`/`finished_at` timestamps, derived minutes, and source values. A partial unique index allows only one active entry per employee. `time_entry_audit_logs` stores every staff correction with old/new values, reason and actor. All timestamps are `timestamptz`; schedules retain their company-local timezone behavior.

## Customer portal (phase 10)

| Table               | Purpose                                               | Tenant relation                                 |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| `customer_contacts` | Links a `CUSTOMER` membership to exactly one customer | `company_id`, `customer_id`, unique `member_id` |

A trigger rejects any contact whose member is not a `CUSTOMER` of the same
company as the customer record, so the link cannot be forged from the
application layer.

## Billing (phase 11)

| Table                     | Purpose                                  | Tenant relation                                              |
| ------------------------- | ---------------------------------------- | ------------------------------------------------------------ |
| `invoices`                | Draft, issued, paid or cancelled invoice | `company_id` and `customer_id`                               |
| `invoice_lines`           | One billed position                      | `company_id`, `invoice_id`, optional `job_id` for provenance |
| `invoice_number_counters` | Per company and year number sequence     | `company_id`                                                 |

Design decisions worth knowing before changing anything here:

- **Money is integer minor units.** Every amount is a `bigint` in cents. No
  monetary value is ever a float, anywhere in the stack.
- **Amounts are computed, never supplied.** `compute_invoice_line_amounts`
  derives net, VAT and gross per line from quantity, unit price and rate;
  `refresh_invoice_totals` derives the invoice totals from its lines. A client
  cannot send a total, and a displayed total cannot drift from the stored one.
  Rounding happens per line and the lines are then summed, so the printed
  positions always add up to the printed total.
- **`OVERDUE` is not a stored status.** It is derived from the due date of an
  `ISSUED` invoice, so it can never be stale.
- **Numbering is gapless per company and year.** `issue_invoice` locks the
  counter row for the transaction, so concurrent issues serialise instead of
  colliding. Drafts carry no number.
- **Issued invoices are immutable.** `guard_issued_invoice` and
  `guard_issued_invoice_lines` reject every change to a non-draft invoice except
  recording payment and cancellation, and reject deletion outright. Corrections
  are new drafts carrying `corrects_invoice_id`; the cancelled original stays in
  the books with who cancelled it, when and why.
- **A visit is billed once.** `invoice_lines.invoice_status` mirrors the parent
  invoice so a partial unique index can enforce one live invoice line per job.
  Cancelling an invoice releases its jobs for re-billing.
- **Snapshots.** Issuing stores the customer and company master data as JSON on
  the invoice. The document renders from those snapshots, so renaming a customer
  never rewrites an invoice that was already sent.
