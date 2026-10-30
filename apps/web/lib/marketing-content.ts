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
  secondaryCta: { label: 'Anmelden', href: '/admin/login' },
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

/**
 * Der Demofilm.
 *
 * Zwei Wege, je nachdem was produziert wird: `videoUrl` fuer eine Einbettung
 * (YouTube, Vimeo), `videoFile` fuer eine selbst gehostete Datei unter
 * `public/marketing/`. Die eigene Datei ist der bessere Weg -- sie laedt keinen
 * fremden Player nach, setzt kein Cookie und braucht damit keinen Hinweis im
 * Consent-Banner. Ist beides leer, bleibt der Rahmen reserviert und sagt
 * ehrlich, dass der Film noch fehlt; ein Abspielknopf, der nichts tut, waere
 * schlechter als eine klare Bildunterschrift.
 */
export const demo = {
  eyebrow: 'In drei Minuten',
  title: 'Sehen Sie ReinPlan im Einsatz',
  body: 'Ein Durchlauf vom Angebot bis zur Rechnung – ohne Anmeldung, ohne Termin.',
  videoUrl: null as string | null,
  /** z. B. '/marketing/reinplan-demo.mp4' */
  videoFile: null as string | null,
  /** Standbild hinter dem Abspielknopf, bis der Film laeuft. */
  poster: '/brand/dashboard-hero.jpg',
  posterCaption: 'Demo-Video folgt',
} as const;

/**
 * Die Bereiche, die das Karussell zeigt.
 *
 * Ein Eintrag je Bereich, in der Reihenfolge, in der ein Betrieb ihn erlebt:
 * planen, arbeiten, erfassen, nachweisen, abrechnen, Kundin, Qualitaet,
 * Ueberblick. `src` zeigt auf eine schematische Vorschau in den Projektfarben
 * unter `public/marketing/`; sobald es echte Bildschirmfotos gibt, wird hier
 * der Pfad getauscht und sonst nichts -- der Rahmen reserviert sein
 * Seitenverhaeltnis ohnehin.
 */
export const showcase = [
  {
    id: 'planung',
    frame: 'browser',
    title: 'Wochenplanung',
    caption: 'Ab heute sieben Tage, umschaltbar auf die Kalenderwoche.',
    points: ['Automatisch nach freien Wochenstunden', 'Urlaub und Krankheit werden berücksichtigt', 'Nicht besetzt? Der Grund steht am Einsatz'],
    src: '/marketing/planung-preview.svg',
  },
  {
    id: 'einsatz',
    frame: 'phone',
    title: 'Einsatz auf dem Handy',
    caption: 'Die Reinigungskraft sieht genau einen Einsatz – ihren.',
    points: ['Start, Pause, Feierabend', 'Checkliste zum Abhaken', 'Vorher- und Nachher-Foto'],
    src: '/marketing/einsatz-preview.svg',
  },
  {
    id: 'zeiterfassung',
    frame: 'browser',
    title: 'Arbeitszeiten',
    caption: 'Brutto, Pause und Netto – je Tag nachvollziehbar.',
    points: ['Pausen zählen genau einmal', 'Korrekturen bleiben protokolliert', 'Export für das Lohnbüro'],
    src: '/marketing/zeiterfassung-preview.svg',
  },
  {
    id: 'leistungsnachweis',
    frame: 'browser',
    title: 'Leistungsnachweis',
    caption: 'Was geleistet wurde – belegt statt behauptet.',
    points: ['Zeit, Checkliste und Fotos in einem Blatt', 'Notiz der Reinigungskraft', 'Abnahme vor Ort oder im Portal'],
    src: '/marketing/leistungsnachweis-preview.svg',
  },
  {
    id: 'abrechnung',
    frame: 'browser',
    title: 'Rechnung und E-Rechnung',
    caption: 'PDF und XRechnung aus denselben Zahlen.',
    points: ['XRechnung 3.0 nach EN 16931', 'Gegen den KoSIT-Validator geprüft', 'Zahlungsstatus und Mahnstufen'],
    src: '/marketing/abrechnung-preview.svg',
  },
  {
    id: 'kundenportal',
    frame: 'browser',
    title: 'Kundenportal',
    caption: 'Die Kundin sieht ihre Leistungen, ohne anzurufen.',
    points: ['Nachweise und Rechnungen einsehen', 'Abnahme mit einem Klick', 'Reklamation direkt melden'],
    src: '/marketing/kundenportal-preview.svg',
  },
  {
    id: 'qualitaet',
    frame: 'browser',
    title: 'Qualität und Reklamationen',
    caption: 'Kontrolle, Nacharbeit und Nachweis in einem Vorgang.',
    points: ['Bewertung je Kriterium', 'Nacharbeit mit Frist', 'Verlauf bis zur Bestätigung'],
    src: '/marketing/qualitaet-preview.svg',
  },
  {
    id: 'dashboard',
    frame: 'browser',
    title: 'Büro-Dashboard',
    caption: 'Umsatz, offene Rechnungen und die Einsätze von heute.',
    points: ['Offene Beträge und Mahnstufen', 'Stunden im Monat und Auslastung', 'Qualität auf einen Blick'],
    src: '/marketing/dashboard-preview.svg',
  },
] as const;

/** The public SaaS plans. They are mirrored by the server-only Stripe price map. */
export const pricing = {
  note: '30 Tage kostenlos testen. Danach monatlich kündbar.',
  placeholderWarning: false,
  plans: [
    {
      name: 'Start',
      price: '69',
      unit: '/ Monat',
      summary: 'Für kleine Betriebe, die ihr Tagesgeschäft ohne Zettel organisieren wollen.',
      features: ['Bis 5 Mitarbeitende', 'Kunden, Objekte, Leistungspläne', 'Einsatzplanung und Zeiterfassung', 'Rechnungen und Zahlungsstatus'],
      cta: 'Kostenlos testen',
      featured: false,
    },
    {
      name: 'Betrieb',
      price: '119',
      unit: '/ Monat',
      summary: 'Für wachsende Reinigungsunternehmen mit festen Objekten und Verträgen.',
      features: ['Bis 25 Mitarbeitende', 'Alles aus Start', 'Kundenportal und Kundenabnahme', 'Reklamationen und Nacharbeit', 'Angebote und Kalkulation'],
      cta: 'Kostenlos testen',
      featured: true,
    },
    {
      name: 'Unternehmen',
      price: '199',
      unit: '/ Monat',
      summary: 'Für größere Teams, mehrere Standorte und anspruchsvolle Abläufe.',
      features: ['Bis 75 Mitarbeitende', 'Alles aus Betrieb', 'Eigenes Branding auf Dokumenten', 'Mehrere Standorte und Exporte', 'Priorisierter E-Mail-Support'],
      cta: 'Kostenlos testen',
      featured: false,
    },
  ],
} as const;

export const closing = {
  title: 'Bereit für einen Betrieb, der läuft?',
  body: 'Richten Sie ReinPlan in wenigen Schritten ein und planen Sie Ihren ersten Einsatz noch heute.',
  cta: { label: 'Kostenlos testen', href: '/signup' },
  secondary: { label: 'Anmelden', href: '/admin/login' },
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
