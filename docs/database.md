# Database

## Tables

| Table | Purpose | Tenant relation |
| --- | --- | --- |
| `companies` | A cleaning business tenant | Root tenant record |
| `profiles` | Application profile linked one-to-one to `auth.users` | Identifies the authenticated actor |
| `company_members` | Membership, role and status | Links profile to exactly one company record per membership |
| `customers` | Customer master data | `company_id` identifies the tenant |
| `cleaning_objects` | A customer's cleaning location | `company_id` and `customer_id`; both tenant IDs must match |
| `employee_details` | Employment metadata without payroll data | `company_id` and accepted member profile |
| `company_invitations` | Hashed, expiring one-time invitation token | Bound to one company and pending membership |
| `service_schedules` | Active weekly cleaning template | `company_id`, customer and object must match |
| `schedule_rules` | Structured weekday/start/end rule | Belongs to one schedule; no free-text recurrence |
| `service_schedule_assignments` | Employee template assignment | Active employee member in the schedule company |
| `jobs` | Concrete planned or historical cleaning visit | `company_id`, customer, object and optional schedule |
| `job_assignments` | One or more employees assigned to a job | Active employee member in the job company |

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
