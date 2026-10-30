# Production email: sender identity and invitation links

There are **two separate senders**. Configuring only one does not fix the other.

## 1. Supabase Auth (account confirmation, reset, fallback invitations)

In the **production** Supabase project, open Authentication → SMTP Settings
(the label may change). Enable custom SMTP using a provider you control.
For Resend SMTP, use the provider's current documented host, port, username
and API key; never commit these credentials. Choose a sender on a domain
verified with the provider, e.g. `ReinPlan <konto@your-verified-domain.example>`.
Set the reply-to address to a mailbox that you actually read. Verify SPF/DKIM
and DMARC on that domain. Do not use an unverified or invented domain.

Under Authentication → URL Configuration, set Site URL to the actual HTTPS
production origin. Allow the exact `/auth/callback` redirect on that origin.
Check password reset, sign-up confirmation and an invitation with an inbox
you own. A Supabase-branded sender means Auth custom SMTP is not configured
or is not the sender used for that particular email; changing the Next.js
MAIL_FROM variable alone cannot change Supabase Auth emails.

## 2. ReinPlan application messages (offers, invoices, application invitations)

Configure the production host's server-side environment:
`RESEND_API_KEY`, `MAIL_FROM`, optionally `MAIL_REPLY_TO`, and the
application's existing recipient-guard settings. `MAIL_FROM` must be an
address on the verified sending domain. The app uses the Resend HTTPS API
when RESEND_API_KEY is present; otherwise it may use configured SMTP.
Do not publish keys in `NEXT_PUBLIC_*` variables.

The mail transport reports provider acceptance, not inbox delivery.
Check Resend delivery events, spam, domain DNS and the recipient guard.
The app's fallback `auth.resetPasswordForEmail` and `auth.signInWithOtp`
still use **Supabase Auth's SMTP**, not the app's Resend API.

## 3. Staging is not production

Use a separate Supabase project, URL, sender and catch-all mailbox for staging.
Never point write-capable authenticated E2E tests at the production database.
GitHub's `STAGING_BASE_URL` and six `E2E_*_EMAIL/PASSWORD` secrets belong
to the protected `staging` environment. The workflow does not create that
environment or its accounts automatically.

## Acceptance checklist

- [ ] New user confirmation: recognizable sender, correct HTTPS callback.
- [ ] Password reset: correct sender, token works once, no localhost link.
- [ ] Employee and customer invitation: link arrives and lands in correct portal.
- [ ] Application offer/invoice mail: correct sender, no test redirect.
- [ ] Bounced/complained delivery is not represented as delivered.
- [ ] No production invoice or customer data is sent to a test mailbox.
