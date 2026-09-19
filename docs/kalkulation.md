# Kalkulation

How this system works out what a cleaning contract costs, what it should sell
for, and how that number reaches the invoice without anybody retyping it.

Written for whoever sets the company's assumptions and whoever has to defend a
price to a customer two years later.

## The chain

```
Anfrage → Besichtigung → Kalkulation → Leistungsverzeichnis → Angebot
       → Annahme → Vertrag/Leistungsplan → Einsatzplanung
       → Leistungsnachweis → Kundenabnahme → Abrechnung → Zahlung
```

One commercial figure runs through it. The calculation produces a selling
price; the Angebot carries that price; acceptance writes it into the
Leistungsplan together with the billing mode; the invoice reads it from there.
Nothing is keyed in twice, and nothing is re-derived at a later step.

## Richtleistung: measured area becomes time

Before this, a Besichtigung recorded square metres and then somebody typed in
minutes. The m² were never used for anything.

A service now carries a **Richtleistung** — how much one person gets through in
an hour — and the time follows from it:

| Einheit | Zeit je Einsatz |
| --- | --- |
| `QM` | `Menge ÷ Richtleistung × 60` |
| `STUECK` | `Menge × Minuten je Stück` |
| `STUNDE` | `Menge × 60` |
| `EINSATZ` | `Minuten je Einsatz` (Menge wird ignoriert) |
| `PAUSCHAL` | `0` — a flat amount buys no time |

500 m² at 250 m²/h is 120 minutes.

**A Richtleistung is an estimate, and is treated as one.** Every position can
override the computed time, and an override requires a reason — so a reviewer
can tell judgement ("stark verwinkelt, hoher Publikumsverkehr") from a typo.
The reason is stored on the line.

### Turnus

| `frequency` | Einsätze pro Monat |
| --- | --- |
| `PRO_WOCHE` | `Anzahl × 13/3` |
| `PRO_MONAT` | `Anzahl` |
| `EINMALIG` | `0` |

Weeks per month is **13/3 ≈ 4.333**, not 4. Twelve months of four weeks is 48
weeks and loses four weeks of a year's work *and* four weeks of its cost.

`EINMALIG` positions — a Grundreinigung before the contract starts, a one-off
window clean — are costed and priced **separately** and never enter the monthly
figures. Smearing a one-off into a month makes the recurring contract look more
profitable than it is.

## Personnel cost

Four company-configurable numbers, one formula:

```
Lohn_mit_Nebenkosten     = Kalkulationslohn × (1 + Lohnnebenkosten)
Kosten_je_prod_Stunde    = Lohn_mit_Nebenkosten ÷ produktiver Anteil
Personalkosten_je_Stunde = Kosten_je_prod_Stunde × (1 + Gemeinkosten)
```

Worked through, at 15,00 € / 21 % / 85 % / 10 %:

```
1500 × 1.21 = 1815
1815 ÷ 0.85 = 2135.3
2135.3 × 1.10 = 2349  →  23,49 € je produktiver Stunde
```

**The division is the part people leave out.** If only 85 % of paid time is
spent productively at a customer's site, an hour of work there carries
`1 ÷ 0.85` hours of wage — the rest is travel between objects, briefings,
holiday and sickness, all of which are paid.

> **No default values are supplied.** The fields start at zero, and the
> assumptions screen says why: an invented Lohnnebenkosten percentage that
> looks official is worse than an empty one, because nobody checks it. These
> are your figures, from your own Nachkalkulation or your Steuerberatung.

**This is costing, not Lohnabrechnung.** Nothing here computes anybody's pay,
and none of it is a payroll or tax calculation.

## Other costs

Per position — material, machines, other — each with a basis:

| `cost_basis` | Monatlicher Betrag |
| --- | --- |
| `PRO_EINSATZ` | `Betrag × Einsätze pro Monat` |
| `PRO_MONAT` | `Betrag` |
| `PRO_STUNDE` | `Betrag × Stunden pro Monat` |
| `PRO_QM` | `Betrag × m²` |

Per calculation: **Fahrtkosten je Einsatz**, **Rüstzeit je Einsatz** and
**sonstige Kosten je Monat**. Rüstzeit is paid working time, so it carries
personnel cost exactly like cleaning time does.

## Markup and margin are different numbers

```
Marge     = (Preis − Kosten) ÷ Preis      -- share OF THE PRICE
Aufschlag = (Preis − Kosten) ÷ Kosten     -- uplift ON THE COST

Preis aus Zielmarge    = Kosten ÷ (1 − Marge)
Preis aus Zielaufschlag = Kosten × (1 + Aufschlag)
```

At a 30 % target on 100,00 € of cost:

| | Preis | Marge | Aufschlag |
| --- | --- | --- | --- |
| 30 % **Marge** | 142,86 € | 30,00 % | 42,86 % |
| 30 % **Aufschlag** | 130,00 € | 23,08 % | 30,00 % |

Quoting "Kosten plus 30 %" while believing it carries a 30 % margin costs
6,86 % of every invoice. The engine works from **margin**, stores both, and the
UI labels each one — the two are shown side by side in the KPI band precisely
so they cannot be confused.

Also derived:

- **Deckungsbeitrag** = `Verkaufspreis − Kosten`, per month and per year
- **Mindeststundensatz** = `Kosten pro Monat ÷ produktive Stunden pro Monat` —
  the rate below which the contract loses money

An explicit selling price is allowed to depart from the calculation — an
Einstiegspreis is a legitimate commercial decision — but it requires a reason,
which is stored with it.

## Snapshot and versioning

A calculation is `ENTWURF` while it is being worked on and `FINAL` once frozen.

**The company's assumptions are copied onto the calculation, not referenced.**
The moment it is created it carries its own wage, ancillary rate, productive
share, overhead and target margin. Next spring's wage review therefore cannot
reach back and change what was offered last year.

Once `FINAL`:

- a trigger refuses every commercial change,
- the catalogue can be edited freely without touching it,
- the company assumptions can be changed freely without touching it,
- only an Angebot can be generated from it,
- a correction is a **revision** — a new draft, `version + 1`, pointing at what
  it supersedes, with the original preserved exactly as it was.

`quotes.calculation_id` links an offer back to the numbers behind it.

## Leistungsverzeichnis

Generated from the same positions, through `get_leistungsverzeichnis`, and
carrying only: Bereich, Leistung, Turnus, Menge/Einheit and Hinweistext.

**It has no column for cost, margin, wage or contribution.** That is enforced
by the function's return type rather than by remembering to omit them, and
asserted in the SQL suite.

## Angebot and contract

`create_quote_from_calculation` extends the existing quote system — same
`quotes`, same numbering, same sending, acceptance and snapshotting. The
billing mode chosen when the offer is written decides how the price is
expressed:

| `billing_mode` | Angebotszeile |
| --- | --- |
| `MONATSPAUSCHALE` | 1 × Monat at the monthly price |
| `PAUSCHALE_PRO_EINSATZ` | 1 × Einsatz at `Monatspreis ÷ Einsätze pro Monat` |
| `STUNDENSATZ` | 1 × Std at `Monatspreis ÷ Stunden pro Monat` |

`EINMALIG` positions become their own `ONE_OFF` lines.

On acceptance, `accept_quote` writes the agreed price **and** the agreed
billing mode into the new Leistungsplan, reading the price from the line whose
unit matches the mode.

> **This fixed a live defect.** `accept_quote` previously copied "the first
> recurring line's unit price". Those lines were priced per **hour** (`Std`),
> while phase 19 made every schedule default to `PAUSCHALE_PRO_EINSATZ` — a
> price per **visit**. An accepted offer therefore produced a contract whose
> flat price per visit was really an hourly rate, and the first invoice would
> have been wrong by however many hours the visit took.

The acceptance policy of the new contract (`KEINE_ABNAHME_ERFORDERLICH`,
`VOR_ORT_UNTERSCHRIFT`, `PORTAL_ABNAHME`) is also set at acceptance, so the
phase-19 Kundenabnahme model applies from the first visit.

## Who may see any of this

Wage assumptions, cost, margin and contribution are **OWNER and OFFICE only**.

- **Employees** cannot read `calculations`, `calculation_lines` or
  `company_calculation_defaults`, and cannot call any write function.
- **Customer contacts** are `company_members` too, so a careless "same company"
  policy would have let them through. Every policy uses `is_company_staff`,
  which excludes them, and the SQL suite asserts it explicitly.
- **Other tenants** get "not found" from every function and zero rows from
  every table.
- **Nobody** writes these tables directly: the grants are `select` only, and
  every mutation goes through a `security definer` function that re-derives the
  actor.

## Money and numbers

Integer cents throughout; percentages as basis points (`3000` = 30,00 %). No
floating-point money anywhere.

Customer, object and personnel numbers come from `company_number_counters`, a
per-company monotonic counter allocated with a single atomic
`insert … on conflict do update … returning`.

> **This fixed a second live defect.** All three were allocated as
> `count(*) + 1` while each column carries a per-company unique index. With
> K-0001 … K-0003 on file, deleting K-0002 left two rows, so the next customer
> was offered K-0003 — which was taken. **Deleting one customer permanently
> stopped the company creating any further customers**, and the same held for
> objects and employees. A counter never goes backwards, so a retired number is
> also never reissued to somebody else.

Manually assigned numbers are still respected; the unique index still prevents
duplicates.

## What is deliberately not built

Documented rather than implemented, so scope stays honest — see
`docs/future-modules.md` for the detail:

- **Lohnabrechnung.** Not a payroll system and will not become one. The
  time-tracking data is clean enough to export for a payroll provider later.
- **Lagerverwaltung.** Material is a cost assumption in the calculation, not
  tracked stock.
- **Nachkalkulation.** Comparing calculated hours against recorded hours per
  contract is the obvious next step and is not in this phase.
- **KI-Assistenz.** No AI features. Possible future uses are listed in the
  future-modules document; none of them make financial or legal decisions.
