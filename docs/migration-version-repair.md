# Migration version collision repair — 2026-10-06

Supabase records the numeric prefix, not the entire filename. Three pairs shared
versions, so the PostgreSQL-only test harness concealed a CLI startup failure.
Each pair is now consolidated into one file at its existing version. SQL bodies
are preserved; no historical applied version is deleted or renumbered:

- 20260921000001: notification enum plus branding upload policy.
- 20261005000000: pending invitation deletion plus quote snapshot details.
- 20261006000026: assignment capacity plus one-time public quote signature.

The production ledger was read before this repair. It already records all six
components: notification enum 20260921000001, branding 20260921193627, pending
member deletion 20260921191019, snapshots 20260921195843, capacity 20261004081534,
signature 20261004081535. Do not reapply these old functions to production: newer
migrations replace several of them. No production history repair was needed for
this consolidation. Older local names still differ from production ledger names;
this repair does not claim a blind `db push` is safe against that legacy ledger.
Use schema-drift and migration-ledger checks before a production CLI push.

CI now rejects duplicate prefixes and includes a regression that proves a
collision fails while distinct versions pass. The SQL runner and ledger tool
also run this check before database access. Full SQL/upgrade/schema/restore CI
must pass before merge.

Four previously pending fixes were applied through Supabase on 2026-10-06:
portal_contact_determinism (20261006175943), internal_trigger_permissions
(20261006175948), break_overlap_guard (20261006175957), and
deterministic_actor_resolution (20261006180004). Connector-assigned versions differ
from existing source filenames. Do not reapply solely because an original source
version is missing; compare names/content and schema first.
