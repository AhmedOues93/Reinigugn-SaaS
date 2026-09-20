# Einrichtung — the first day

What a new company meets after signing up, and why it is shaped this way.

Before this, a new OWNER typed a company name, landed on an empty dashboard,
and met *„Im Leistungskatalog ist noch nichts hinterlegt“* the first time they
tried to price anything. Every assumption started at zero, which is honest and
useless: an empty system cannot demonstrate that it is worth using.

## The wizard

Six short steps at `/dashboard/einrichtung`, not one long form:

| Schritt | Was dort passiert |
| --- | --- |
| Unternehmen | Name, Rechtsform, Geschäftsführung, Anschrift, Kontakt |
| Rechnung & Steuer | Steuernummer, USt-IdNr., Umsatzsteuersatz, Zahlungsziel, Bankverbindung |
| Kalkulationsgrundlagen | Lohn, Nebenkosten, produktive Zeit, Gemeinkosten, Zielmarge, Sachkosten |
| Reinigungsschwerpunkte | welche Reinigungsarten — legt dazu passende Katalogleistungen an |
| Erscheinungsbild | Logo und Farbe |
| Abschluss | Checkliste dessen, was noch fehlt |

**Nothing is mandatory.** Only the company name is required, and that already
exists by the time the wizard opens. A company that wants to start by entering a
customer can skip straight through; *„Einrichtung überspringen“* is on every
step and keeps whatever has been filled in.

**It appears once, and only for the OWNER.** `shouldRunOnboarding` redirects
from `/dashboard` while `onboarding_completed_at` is null. An OFFICE colleague
joining three months later lands in the application, not in somebody else's
company setup.

Progress lives on the company (`onboarding_steps`), so a closed tab does not
lose it, and a finished wizard does not reappear.

Everything the wizard sets is editable afterwards under **Einstellungen** and
**Kalkulation → Grundlagen**. The two screens share one component
(`CostingFields`), so the setup form and the settings form cannot drift apart.

## The closing checklist

Ticked from what the company **actually has**, not from which steps were
clicked:

```sql
has_calculation_defaults   a wage is configured
has_catalog                the Leistungskatalog is not empty
has_customer               a customer exists
has_object                 a cleaning object exists
has_employee               an employee was added or invited
has_survey                 a Besichtigung was planned
has_calculation            a Kalkulation exists
has_quote                  an Angebot was created
```

A checklist that ticks itself when somebody presses *weiter* teaches people to
stop reading it. Each open item links to the screen that closes it, so it is a
way to act rather than a list of reproaches.

## The seeded Leistungskatalog

Choosing Reinigungsschwerpunkte calls `set_service_focus`, which stores the
choice and then calls `seed_service_catalog`. That inserts realistic entries —
Reinigungsart, Einheit, Richtleistung, Materialansatz — for each chosen focus,
across roughly a dozen categories.

Three properties matter:

- **It never overwrites.** `on conflict (company_id, name) do nothing`, so
  repeating it adds nothing and leaves every edited Richtleistung alone. The
  function returns how many rows it actually inserted.
- **It is per tenant.** Seeding one company touches no other.
- **Every m² service carries a Richtleistung.** A seeded service without one
  would contribute no time and silently price at zero. Asserted in the SQL
  suite.

> **The seeded values are starting points from practice.** They are not a
> standard, not an industry guarantee and not a legal requirement. A firm's own
> Richtleistungen depend on its equipment, its standards and its buildings, and
> every seeded value is editable from the moment it appears.

Changing the focus later, in Einstellungen, adds the newly matching services and
leaves everything already there untouched.

## Company profile

`save_company_profile` is **OWNER only** — not OFFICE. The profile carries the
tax identifiers and appears on every invoice; the office may run the business on
it, but not rewrite whose business it is. Omitted fields are left alone rather
than cleared, so a partial save is safe.

Invoice numbering is deliberately **not** configurable. It is issued
consecutively and without gaps per year, and a gap in the sequence is the kind
of thing that has to be explained during an audit.

> This document describes what the software does. It is not tax or legal
> advice, and the application does not decide which identifiers a particular
> company is obliged to show on its invoices.

## Where it lives

| | |
| --- | --- |
| Migrationen | `supabase/migrations/20261003000000_phase21_onboarding_and_costing.sql`, `…0001_phase21_catalog_and_wizard.sql`, `…0002_phase21_calculation_workspace.sql` |
| Screens | `apps/web/app/dashboard/einrichtung/` |
| Steps | `apps/web/components/onboarding/steps.tsx` |
| Shared costing fields | `apps/web/components/kalkulation/costing-fields.tsx` |
| Read side | `apps/web/lib/data/onboarding.ts`, `apps/web/lib/service-focus.ts` |
| SQL-Prüfungen | `supabase/test/phase21.test.sql` |
| Browser-Prüfungen | `apps/web/e2e/authenticated/onboarding.spec.ts` |
