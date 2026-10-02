# Hosting requirements and provider assessment

What this application actually needs to run, established from the code rather
than from what a Next.js app typically needs. Nothing is deployed yet; this
exists so the provider can be chosen against real requirements.

## What the application needs

| Requirement | Detail | Consequence for a host |
| --- | --- | --- |
| Next.js 15 App Router, SSR | Every route is dynamic (`ƒ`); nothing is statically exported | A static host cannot serve this |
| React Server Components | All data loading happens server-side | Needs the Next.js server, not just a CDN |
| Server Actions | Every mutation — POST to the same origin | Must forward POST and preserve cookies |
| Route handlers | Invoice PDF, portal PDF, auth callback, invitation start, PWA manifest, Resend webhook | Arbitrary server routes |
| Middleware | Runs on every request to refresh the Supabase session | Must support Next.js middleware |
| Node runtime | `pdf-lib` and `nodemailer` need Node APIs | **Not** an Edge-only runtime |
| Auth cookies | `@supabase/ssr` sets and reads HTTP-only cookies | Must not strip `Set-Cookie`; needs a stable origin |
| PDF generation | Built in memory, streamed in the response | No filesystem, but needs ~128–256 MB headroom |
| Outbound HTTPS | Supabase REST, Resend API | Egress must be allowed |
| pnpm 9 workspace | Three packages plus the app, Turborepo | Must run `pnpm install --frozen-lockfile` from the repository root |
| Node 20.9+ | Per the README | Node 20 or 22 |
| Build-time env | `NEXT_PUBLIC_*` are inlined into the client bundle | Variables must be present **at build time**, not only at run time |
| GitHub auto-deploy | Push to a branch → build → stable HTTPS URL | Git integration, or a deploy action |

### What it does *not* need

No Docker at run time. No persistent disk. No background worker or cron on the
host — nightly job generation runs in the database (`pg_cron`), specifically so
a sleeping web process cannot stop the schedule. No websockets. No sticky
sessions: the app holds no server-side session state, so any instance can serve
any request.

### The one thing that will bite

`NEXT_PUBLIC_*` values are compiled into the JavaScript the browser downloads.
A host that only injects environment variables at run time will produce a build
with `undefined` where the Supabase URL should be, and the failure appears in
the browser rather than in the build log. Every provider below supports
build-time variables; the point is that they must be set **before** the first
build, not after.

## Free and low-cost options, assessed against the above

Popularity is not a criterion. What matters: does it run a Node server with
middleware and Server Actions, does it build a pnpm monorepo, does it deploy
from GitHub, does it give a stable HTTPS URL, and does its free tier permit
commercial use.

### Vercel — best fit, with one caveat to check

Built by the Next.js authors; everything above works without adaptation,
including middleware and Server Actions. GitHub integration gives a stable
production URL plus a per-branch preview URL.

**The caveat is licensing, not capability.** Vercel's Hobby tier is for
non-commercial use. A staging environment for software you intend to sell is
commercial, so this needs checking against Vercel's current terms before use —
the Pro tier is the compliant answer if it does not qualify.

Monorepo settings: root directory `apps/web`, install
`pnpm install --frozen-lockfile`, build `cd ../.. && pnpm build --filter @reinigung/web`
(this command is verified to work).

### Render — strongest free option for commercial use

A free web service runs a Node process with no commercial restriction. Deploys
from GitHub on push. Everything the app needs is supported.

The trade-off is explicit: free instances **sleep after inactivity**, so the
first request after a quiet period takes roughly a minute. For staging that is
an annoyance, not a blocker — and it is exactly why the scheduler was put in
the database rather than on the host.

Build `pnpm install --frozen-lockfile && pnpm build --filter @reinigung/web`,
start `pnpm --filter @reinigung/web start`, health check path `/login`.

### Railway — no sleeping, small monthly credit

Usage-based with a starter credit rather than a free tier. No cold starts,
which makes staging pleasant to demo. Whether it is free in practice depends on
how much the instance runs.

### Netlify — works, but through an adapter

Next.js support is via a runtime adapter that maps SSR and middleware onto
Netlify Functions. Capable, but it is a translation layer, and translation
layers are where middleware and cookie edge cases tend to surface. Fine as a
second choice, not a first.

### Fly.io / a small VPS — most control, most work

Runs the Node process directly, no adapter, no sleeping, and full control over
the runtime. The cost is that you own the Dockerfile, the TLS certificate, the
deploy pipeline and the patching. Appropriate later, over-engineering now.

### Cloudflare Pages/Workers — do not use for this app

Workers are an Edge runtime. `pdf-lib` and `nodemailer` need Node APIs that are
not fully available there, and invoice PDF generation is not optional. Ruled
out on requirements, not on preference.

## Recommendation

**Render for staging**, on the free tier, accepting cold starts — it is
unambiguously usable commercially, needs no adapter, and deploys from GitHub.
**Vercel if the licensing question resolves in your favour**, because the
integration is genuinely better and previews per branch are useful.

Either way the application does not change: no provider-specific code, no
`vercel.json`, no adapter. Switching later means changing three settings.

## Custom domain

All of the above support a custom domain with automatic TLS on the tier
described. Adding one later changes `NEXT_PUBLIC_SITE_URL`, and that value must
then be updated in Supabase Auth → URL Configuration as both the Site URL and a
redirect entry. Nothing else in the application hard-codes a hostname.
