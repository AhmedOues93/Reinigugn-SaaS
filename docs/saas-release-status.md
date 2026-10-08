# ReinPlan SaaS release status — 2026-10-06

This replaces older readiness claims for the current work. Green means the stated
check passed; it is not a promise that every production scenario was exercised.
Orange means implementation/configuration/real-world validation is incomplete.
Red means a capability needed for the stated launch is absent or not activated.

| Stage | Status | Evidence and remaining requirement |
| --- | --- | --- |
| Existing hosting | GREEN | Render deployed af2fd2e (Claude fixes); deployment of the collision repair is tracked separately. Health endpoint returns 200. |
| Automated checks | GREEN | CI1420 passed types/lint/unit, build, SQL/upgrade/schema/restore, KoSIT and public/CAPTCHA browser suites. Credential-dependent integrations were skipped. |
| Tenant isolation and invoice guards | GREEN | RLS and invoice completeness guards were checked live. Invoice rejection preserves numbering. This is the verified scope, not a full penetration test. |
| Customers, objects and employees | ORANGE | CRUD/import/archive code and tests exist. Full browser verification with three disposable roles remains. |
| Sales, costing and quotes | GREEN | Request-to-invoice SQL workflow passed against production in a rollback transaction; quote/sales tests passed CI. PDF/browser/email interaction still needs pilot validation. |
| Scheduling and recurring jobs | GREEN | SQL assignment/capacity/scheduler checks pass; nightly job generation was verified active and successful. Actual office browser workflow still needs pilot validation. |
| Field work and time tracking | GREEN | Isolated live rollback workflow passed start/pause/checklist/photo metadata/stop/service record. Offline replay is covered by SQL and unit tests after two measured defects were fixed (a swallowed second shift, a break inflated by an out-of-order replay); overlapping working times of one person are rejected. Real image upload, device offline sync in a browser and Safari remain ORANGE. |
| Payroll release | GREEN | SQL release/immutability/export assertions pass CI. No claim of live payroll-office acceptance. Regional holidays beyond nationwide ones remain outside the current calendar model. |
| Customer portal and acceptance | ORANGE | Role/acceptance code and SQL tests exist. Real customer invite, browser acceptance and download remain unverified. |
| Invoice PDF, XRechnung, ZUGFeRD and DATEV | GREEN | PDF/DATEV tests and official KoSIT validation pass CI. The invoice PDF is PDF/A-3B (confirmed by veraPDF 1.26.1) and the ZUGFeRD hybrid PDF carries the CII XML as `factur-x.xml`; the XML extracted from the finished file is accepted by the KoSIT validator. Real recipient/import acceptance remains unverified. |
| Monthly billing, profitability and audit | GREEN | SQL/unit coverage passes CI. Profitability needs real wage/cost inputs; unknown costs are not assumed zero. |
| Onboarding and first job | ORANGE | Guided company setup and first-job reach are implemented/tested. A fresh owner browser signup and actual first-job completion still need validation. |
| Quality, complaints and messages | ORANGE | Checklists/complaint/message modules and SQL checks exist. Verify actual employee/customer browser interaction and notifications. |
| Branding and data imports | ORANGE | Logo validation/private storage, document branding and CSV import exist with tests. Actual logo upload and production file-import round trip remain unverified. |
| Subscription page and 30-day trial | GREEN | PR10 merged; production creates trial rows. Public prices 69/119/199 EUR and caps 5/25/75 were verified. Owner authentication protects the subscription page. |
| Live paid self-service launch | RED | REINPLAN_BILLING_ENABLED=false. Checkout/Portal intentionally return 503. Stripe account/keys/three monthly EUR Price IDs, webhook and test-mode payment verification are required before activation. |
| Expiry enforcement | RED | Product-wide enforcement is not implemented; pilot access stays available after trial. Must cover direct DB/API/Server Actions, preserve billing/account/export access, and handle offline work deliberately. |
| Auth links and server error logging | GREEN | PR8 merged and deployed; safe structured hook logs and hosted-origin checks pass tests. Actual reset/invitation email still needs delivery verification. |
| CAPTCHA and MFA operation | ORANGE | CAPTCHA lifecycle and MFA code/tests exist. Turnstile keys/provider activation and real MFA enrolment/recovery remain unverified. Leaked-password protection was disabled in the last advisor result. |
| Email reliability | ORANGE | Resend/SMTP adapters, guard, signed delivery-event webhook and owner test action exist. Verify SMTP/domain SPF/DKIM/DMARC, real receipt, bounce consequences and suppression. |
| Monitoring and recovery | ORANGE | Health/logs/cron and local restore drill exist. Configure actual alerts and demonstrate hosted recovery including Auth and Storage. |
| Operator/legal information | RED | Impressum/Datenschutz still have operator placeholders. Actual legal operator, service address, contact and provider/retention agreements are required; do not invent details. |
| Privacy lifecycle | ORANGE | RLS/private storage exist. Customer export, erasure and retention operations still need implementation/review. |
| Current DB cleanup | GREEN | Supabase recovered. Five fixes applied live; scoped rollback portal/pause and actor tests passed. Zero mutable search-path advisor findings. No fixture users remain. |

## Current source fixes

- Trigger functions are internal; revoke their PUBLIC/anon/authenticated EXECUTE
  rights while retaining existing trigger operation. Keep legitimate token-based
  public quote and invitation RPCs available.
- Fix search_path for de_hours, Easter/holiday/working-day helpers and the audit
  immutability guard. Calendar calculations themselves are unchanged.
- Scope field-workflow fixtures to their own tenant/job so pre-existing checklist
  rows cannot be used accidentally. Null conditions now fail assertions.
- New-job prerequisite errors no longer silently turn into empty option lists.
  Authentication redirects propagate; database errors reach the existing retry
  boundary. The page renders dynamically rather than logging build-time cookies.

## Exact remaining inputs

1. Supabase recovered; new fixes applied and verified. Legacy source-to-production ledger alignment requires drift reconciliation before blind CLI db push.
2. Connect Stripe and configure the three agreed monthly prices in test mode.
   Secret keys belong in hosting configuration, never chat or source files.
3. Supply a disposable staging project/service and OWNER/EMPLOYEE/CUSTOMER accounts
   for the existing authenticated browser suite. It refuses known production URLs.
4. Choose the actual business/operator details and service address for legal pages.

Do not mark an integration GREEN merely because its code is present.

Current source verification: 289 web unit tests pass (5 integration tests skipped),
web typecheck/lint pass; full CI remains the release gate for this change.
