/**
 * Every word and number on the public landing page, in one module.
 *
 * The sections render this; they hold no copy of their own. Changing a
 * headline, a price or a screenshot caption is an edit here, not a hunt
 * through nine components — which is the difference between marketing copy
 * that gets kept current and marketing copy that quietly goes stale.
 *
 * The voice is the one already established on the signed-out screens in
 * `lib/i18n.ts` ("Gebäudereinigung einfach digital.", "Gemeinsam. Sauber.
 * Besser."). The landing page is the same company speaking, so it borrows that
 * language rather than inventing a second one.
 *
 * German only, deliberately. The product is sold to German cleaning companies;
 * the app itself stays multilingual for the people who work in it.
 */

export const hero = {
  eyebrow: 'Für eine saubere Zukunft',
  headline: 'Gebäudereinigung einfach digital.',
  /** Rendered in Gischt. Must appear verbatim in `headline`. */
  headlineAccent: 'digital.',
  subline:
    'Von der Anfrage bis zur bezahlten Rechnung: ReinPlan führt Angebot, Planung, Einsatz und Abrechnung in einem Ablauf zusammen – für Büro, Objektleitung und Reinigungskräfte.',
  primaryCta: { label: 'Kostenlos testen', href: '/signup' },
  secondaryCta: { label: 'Anmelden', href: '/login' },
  /** Short, checkable claims. Nothing here promises what the product cannot do. */
  assurances: ['Ohne Kreditkarte starten', 'Daten in der EU', 'Deutsch, Englisch, Türkisch, Arabisch, Ukrainisch'],
} as const;

/**
 * The steps are the product's real spine, taken from the routes that exist:
 * Anfrage → Kalkulation → Angebot → Leistungsplan → Einsatz → Abrechnung.
 * Five, because a sixth stops being read.
 */
export const steps = [
  {
    title: 'Anfrage und Kalkulation',
    body: 'Anfrage erfassen, Besichtigung dokumentieren und mit Leistungskatalog, Richtleistungen und Stundensätzen sauber kalkulieren.',
  },
  {
    title: 'Angebot und Annahme',
    body: 'Angebot als PDF erzeugen und digital annehmen lassen. Aus der Annahme entstehen Kunde, Objekt und Leistungsplan automatisch.',
  },
  {
    title: 'Leistungsplan und Planung',
    body: 'Turnus, Preis, Abrechnungsart und Kundenabnahme stehen im Plan. Daraus entstehen die Einsätze für die Wochenplanung.',
  },
  {
    title: 'Einsatz vor Ort',
    body: 'Die Reinigungskraft sieht ihren Einsatz auf dem Handy: Zeiterfassung, Checkliste, Fotos – und die Unterschrift des Kunden, wenn der Vertrag sie vorsieht.',
  },
  {
    title: 'Leistungsnachweis und Rechnung',
    body: 'Aus dem abgeschlossenen Einsatz entsteht der Leistungsnachweis. Erst er macht die Leistung abrechenbar – mit fortlaufender Rechnungsnummer aus der Datenbank.',
  },
] as const;

export const features = [
  {
    icon: 'office',
    title: 'Büro und Verwaltung',
    body: 'Kunden, Objekte, Verträge, Aufträge und Abrechnung an einem Ort. Offene Aufgaben stehen auf dem Dashboard – nur die, bei denen wirklich etwas zu tun ist.',
  },
  {
    icon: 'employee',
    title: 'Mitarbeiter-App',
    body: 'Läuft im Browser und lässt sich auf dem Handy installieren. Einsatz, Zeiten, Checkliste und Fotos in fünf Sprachen, auch bei schlechter Verbindung.',
  },
  {
    icon: 'portal',
    title: 'Kundenportal',
    body: 'Ihre Kunden sehen Objekte, erbrachte Leistungen und Rechnungen selbst – und bestätigen die Abnahme direkt im Portal, wenn es so vereinbart ist.',
  },
  {
    icon: 'planning',
    title: 'Einsatzplanung',
    body: 'Wochenplan je Objekt und Mitarbeiter. Wiederkehrende Einsätze entstehen aus dem Leistungsplan, statt jede Woche neu angelegt zu werden.',
  },
  {
    icon: 'billing',
    title: 'Rechnungsstellung',
    body: 'Rechnung aus dem Leistungsnachweis, per E-Mail versendet, mit Zahlungsstatus und Zahlungserinnerung. Beträge und Nummern kommen aus der Datenbank, nicht aus dem Browser.',
  },
  {
    icon: 'proof',
    title: 'Nachweis und Qualität',
    body: 'Zeiten, Checkliste, Fotos und Unterschrift hängen am Einsatz. Reklamationen und Nacharbeit laufen als Vorgang weiter – nachvollziehbar bis zur Rechnung.',
  },
] as const;

export const demo = {
  eyebrow: 'In drei Minuten',
  title: 'Sehen Sie ReinPlan im Einsatz',
  body: 'Ein Durchlauf vom Angebot bis zur Rechnung – ohne Anmeldung, ohne Termin.',
  /** Swap for the real embed (or a poster + <video>) once it is produced. */
  videoUrl: null as string | null,
  posterCaption: 'Demo-Video folgt',
} as const;

/**
 * Screenshot slots. `src` stays null until the real captures land in
 * `public/marketing/`; each frame then renders the image instead of the
 * placeholder without any layout change.
 */
export const screenshots = [
  { id: 'dashboard', frame: 'browser', title: 'Büro-Dashboard', caption: 'Offene Aufgaben, Umsatz und heutige Einsätze auf einen Blick.', src: null as string | null },
  { id: 'planung', frame: 'browser', title: 'Wochenplanung', caption: 'Einsätze je Objekt und Mitarbeiter, Woche für Woche.', src: null as string | null },
  { id: 'einsatz', frame: 'phone', title: 'Einsatz auf dem Handy', caption: 'Zeiterfassung, Checkliste und Fotos für die Reinigungskraft.', src: null as string | null },
] as const;

/**
 * PLACEHOLDER PRICING — confirm before launch.
 *
 * The figures below are stand-ins so the section can be designed and reviewed.
 * They are not an offer. Replace them, and have the net/VAT wording checked,
 * before this page goes live.
 */
export const pricing = {
  note: 'Alle Preise netto zzgl. MwSt., monatlich kündbar.',
  placeholderWarning: true,
  plans: [
    {
      name: 'Start',
      price: '49',
      unit: '/ Monat',
      summary: 'Für kleine Betriebe, die Planung und Abrechnung zusammenführen wollen.',
      features: ['Bis 5 Mitarbeitende', 'Kunden, Objekte, Leistungspläne', 'Einsatzplanung und Zeiterfassung', 'Rechnungen und Zahlungsstatus'],
      cta: 'Kostenlos testen',
      featured: false,
    },
    {
      name: 'Betrieb',
      price: '129',
      unit: '/ Monat',
      summary: 'Für wachsende Reinigungsunternehmen mit festen Objekten und Verträgen.',
      features: ['Bis 25 Mitarbeitende', 'Alles aus Start', 'Kundenportal und Kundenabnahme', 'Reklamationen und Nacharbeit', 'Angebote und Kalkulation'],
      cta: 'Kostenlos testen',
      featured: true,
    },
    {
      name: 'Unternehmen',
      price: 'Auf Anfrage',
      unit: '',
      summary: 'Für größere Betriebe mit mehreren Standorten und eigenen Anforderungen.',
      features: ['Unbegrenzt Mitarbeitende', 'Alles aus Betrieb', 'Eigenes Branding auf Dokumenten', 'Einrichtung und Datenübernahme', 'Persönlicher Ansprechpartner'],
      cta: 'Kontakt aufnehmen',
      featured: false,
    },
  ],
} as const;

export const closing = {
  title: 'Bereit für einen Betrieb, der läuft?',
  body: 'Richten Sie ReinPlan in wenigen Schritten ein und planen Sie Ihren ersten Einsatz noch heute.',
  cta: { label: 'Kostenlos testen', href: '/signup' },
  secondary: { label: 'Anmelden', href: '/login' },
  signature: 'Gemeinsam.\nSauber.\nBesser.',
} as const;

export const nav = [
  { label: 'Ablauf', href: '#ablauf' },
  { label: 'Funktionen', href: '#funktionen' },
  { label: 'Demo', href: '#demo' },
  { label: 'Preise', href: '#preise' },
] as const;

export const legalLinks = [
  { label: 'Impressum', href: '/impressum' },
  { label: 'Datenschutzerklärung', href: '/datenschutz' },
  { label: 'AGB', href: '/agb' },
] as const;
