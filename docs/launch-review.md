# ReinPlan launch review — 2026-10-04

Reviewed base: `33e6a8db13fde0b11fa9954d989e336799716b4f`.
This is a source-code assessment, not a production verification.

## Product choice

ReinPlan is the first launch candidate: its repository implements a connected
cleaning-company workflow, employee app and customer portal. The owner reports
three companies waiting to trial it; these are prospects, not paying subscribers.
Baustift is the next focused candidate (voice to quote), while BuroPilot's current
default branch contains foundational contracts and policy code rather than a
complete connected email-automation product. No revenue forecast follows from
repository size or test count.

## Changes in this branch

- Render and Netlify platform URLs repair missing/loopback site origins used in
  invitation and password-reset links. Explicit custom domains take precedence.
  Deployed origins must use HTTPS and contain no credentials, path, query or
  fragment. Supabase Auth redirect allow-lists still need matching configuration.
- Next.js `onRequestError` emits structured server-error events to hosting logs.
  Events contain time, framework route template, route type and a validated digest;
  no request URL, headers, error message or stack is sent by this hook. This does
  not control Next.js/platform default logs. Configure retention and alerts on
  `reinplan.request_error`; browser-only failures and caught errors are not covered.

## Remaining launch work

| Area | Evidence / next action |
| --- | --- |
| SaaS subscription billing | No checkout, subscription entitlement or subscription webhook found. Invoice payments in the cleaning business are a separate domain. Decide trial/plan rules and connect a payment provider; manual pilot billing can precede this. |
| Hosted schema | Compare remote migration history to the repository before any change. Several migration fixes already exist; do not blindly replay them. |
| Real workflow | Exercise owner signup, invite acceptance, customer/employee access, scheduling, time/photo submission, acceptance and invoicing on disposable staging data. Unit success does not prove this. |
| Email | Verify app mail provider, Supabase Auth SMTP, domain and callback URLs. Test actual receipt and bounced-message consequences. |
| Operations | Configure log alerts, uptime monitoring, scheduler monitoring, backup coverage and demonstrate restore. No hosted configuration was inspected. |
| Invoice issuance | `issue_invoice` needs a database-level completeness review before numbering/snapshotting. An XML export validator alone does not guard all invoice issuance. |
| Operator information and data policies | Legal routes exist; actual operator details, customer agreements, export/erasure and retention decisions still need review. |

Do not use the older readiness document's statements that no legal pages, auth
throttle or health endpoint exist: those features are present in this base.
Presence in source does not prove the deployed instance has them configured.

## Deployment notes

Set `NEXT_PUBLIC_APP_ENV` explicitly to staging or production. Set
`NEXT_PUBLIC_SITE_URL` to the public custom domain when one exists; otherwise
Render supplies `RENDER_EXTERNAL_URL` and Netlify supplies `URL`. Add the matching
`/auth/callback` URL to Supabase Auth. Test an actual password-reset/invitation
email after deployment. Configure a log alert on `reinplan.request_error` and an
external check on `/api/health` (liveness only, not database readiness).
