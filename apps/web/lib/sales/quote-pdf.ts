import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';

export type QuotePdfInput = {
  quoteNumber: string;
  title: string;
  intro: string | null;
  createdAt: string;
  validUntil: string | null;
  currency: string;
  netTotalCents: number;
  vatTotalCents: number;
  grossTotalCents: number;
  recurringNetMonthlyCents: number;
  acceptancePolicy?: 'KEINE_ABNAHME_ERFORDERLICH' | 'VOR_ORT_UNTERSCHRIFT' | 'PORTAL_ABNAHME' | null;
  billingMode?: 'MONATSPAUSCHALE' | 'PAUSCHALE_PRO_EINSATZ' | 'STUNDENSATZ' | null;
  orderType?: 'EINMALAUFTRAG' | 'BEFRISTET' | 'DAUERAUFTRAG' | null;
  serviceStart?: string | null;
  serviceEnd?: string | null;
  terminationNotice?: string | null;
  acceptedAt?: string | null;
  acceptedByName?: string | null;
  recipient: Record<string, unknown> | null;
  company: Record<string, unknown> | null;
  logo?: { bytes: Uint8Array; type: 'png' | 'jpg' } | null;
  lines: {
    position: number;
    description: string;
    quantity: number;
    unit: string;
    unit_price_cents: number;
    vat_rate_basis_points: number;
    net_amount_cents: number;
  }[];
};

const A4 = { width: 595.28, height: 841.89 };
const mx = 54;
const top = 56;
const bottom = 76;
const ink = rgb(0.04, 0.32, 0.23);
const text = rgb(0.10, 0.14, 0.15);
const muted = rgb(0.40, 0.45, 0.46);
const line = rgb(0.84, 0.87, 0.86);

const safe = (value: unknown) =>
  String(value ?? '')
    .replace(/[\u202f\u2009\u2007]/g, ' ')
    .replace(/−/g, '-')
    .replace(/•/g, '·')
    .replace(/[\r\t]/g, ' ')
    .replace(/[^\x0A\x20-\x7E\xA0-\xFF€]/g, '');
const str = (record: Record<string, unknown> | null, key: string) => {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};
const money = (cents: number, currency: string) => safe(new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(cents / 100));
const date = (value: string | null) => value ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value)) : '—';
const percent = (bp: number) => safe(new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 2 }).format(bp / 10000));

function wrap(value: string, font: PDFFont, size: number, width: number) {
  const out: string[] = [];
  for (const paragraph of safe(value).split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= width) current = next;
      else {
        if (current) out.push(current);
        current = word;
      }
    }
    if (current) out.push(current);
  }
  return out.length ? out : [''];
}

export async function renderQuotePdf(input: QuotePdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle(`Angebot ${input.quoteNumber}`);
  pdf.setAuthor(safe(str(input.company, 'name') ?? ''));
  pdf.setCreator('ReinPlan');
  pdf.setProducer('ReinPlan');
  pdf.setLanguage('de-DE');

  let logo: PDFImage | null = null;
  if (input.logo) {
    try {
      logo = input.logo.type === 'png' ? await pdf.embedPng(input.logo.bytes) : await pdf.embedJpg(input.logo.bytes);
    } catch {
      logo = null;
    }
  }

  const pages: PDFPage[] = [];
  let page = pdf.addPage([A4.width, A4.height]);
  pages.push(page);
  let y = A4.height - top;
  const width = A4.width - mx * 2;

  const draw = (value: string, x: number, yy: number, opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? 9.5;
    const v = safe(value);
    const dx = opts.right ? x - font.widthOfTextAtSize(v, size) : x;
    page.drawText(v, { x: dx, y: yy, font, size, color: opts.color ?? text });
  };

  const companyName = str(input.company, 'name') ?? '';
  if (logo) {
    const scale = Math.min(150 / logo.width, 42 / logo.height, 1);
    page.drawImage(logo, { x: mx, y: y - logo.height * scale + 8, width: logo.width * scale, height: logo.height * scale });
  } else {
    draw(companyName, mx, y, { font: bold, size: 17, color: ink });
  }
  const right = [
    str(input.company, 'street'),
    [str(input.company, 'postal_code'), str(input.company, 'city')].filter(Boolean).join(' '),
    str(input.company, 'phone'),
    str(input.company, 'email'),
    str(input.company, 'website'),
  ].filter((v): v is string => Boolean(v));
  right.forEach((v, i) => draw(v, A4.width - mx, y - i * 11, { size: 8.5, color: muted, right: true }));
  y -= 70;

  const recipient = [
    str(input.recipient, 'name') ?? str(input.recipient, 'organisation'),
    str(input.recipient, 'contact_person'),
    str(input.recipient, 'billing_address') ?? str(input.recipient, 'street'),
    [str(input.recipient, 'postal_code'), str(input.recipient, 'city')].filter(Boolean).join(' '),
  ].filter((v): v is string => Boolean(v));
  recipient.forEach((v, i) => draw(v, mx, y - i * 13, { font: i === 0 ? bold : regular, size: 10 }));

  const objectDetails = [
    str(input.recipient, 'object_name'),
    str(input.recipient, 'object_street'),
    [str(input.recipient, 'object_postal_code'), str(input.recipient, 'object_city')].filter(Boolean).join(' '),
  ].filter((v): v is string => Boolean(v));

  draw('Angebotsnr.', A4.width - mx - 170, y, { size: 8.5, color: muted });
  draw(input.quoteNumber, A4.width - mx, y, { font: bold, size: 9, right: true });
  draw('Datum', A4.width - mx - 170, y - 14, { size: 8.5, color: muted });
  draw(date(input.createdAt), A4.width - mx, y - 14, { size: 9, right: true });
  draw('Gültig bis', A4.width - mx - 170, y - 28, { size: 8.5, color: muted });
  draw(date(input.validUntil), A4.width - mx, y - 28, { size: 9, right: true });
  y -= Math.max(70, recipient.length * 13 + 28);

  if (objectDetails.length > 0) {
    draw('Objekt', mx, y, { font: bold, size: 8.5, color: muted });
    y -= 14;
    objectDetails.forEach((v, i) => draw(v, mx, y - i * 12, { size: 9.2 }));
    y -= objectDetails.length * 12 + 10;
  }

  draw(`Angebot ${input.quoteNumber}`, mx, y, { font: bold, size: 16, color: ink });
  y -= 20;
  draw(input.title, mx, y, { font: bold, size: 11 });
  y -= 20;
  if (input.intro) {
    for (const l of wrap(input.intro, regular, 9.5, width)) { draw(l, mx, y); y -= 13; }
    y -= 6;
  }

  const newPage = () => {
    page = pdf.addPage([A4.width, A4.height]);
    pages.push(page);
    y = A4.height - top;
    draw(`Angebot ${input.quoteNumber} – Fortsetzung`, mx, y, { size: 9, color: muted });
    y -= 28;
  };

  page.drawRectangle({ x: mx, y: y - 4, width, height: 20, color: rgb(0.94, 0.97, 0.95) });
  draw('Pos.', mx + 5, y + 2, { font: bold, size: 8 });
  draw('Leistung', mx + 38, y + 2, { font: bold, size: 8 });
  draw('Menge', mx + 330, y + 2, { font: bold, size: 8, right: true });
  draw('Einzelpreis', mx + 415, y + 2, { font: bold, size: 8, right: true });
  draw('Netto', A4.width - mx - 5, y + 2, { font: bold, size: 8, right: true });
  y -= 24;

  for (const item of input.lines) {
    const desc = wrap(item.description, regular, 9.3, 235);
    const h = Math.max(26, desc.length * 12 + 10);
    if (y - h < bottom + 80) newPage();
    draw(String(item.position), mx + 5, y, { size: 9, color: muted });
    desc.forEach((v, i) => draw(v, mx + 38, y - i * 12, { size: 9.3 }));
    draw(`${safe(item.quantity)} ${item.unit}`, mx + 330, y, { size: 9.3, right: true });
    draw(money(item.unit_price_cents, input.currency), mx + 415, y, { size: 9.3, right: true });
    draw(money(item.net_amount_cents, input.currency), A4.width - mx - 5, y, { size: 9.3, right: true });
    y -= h;
    page.drawLine({ start: { x: mx, y: y + 5 }, end: { x: A4.width - mx, y: y + 5 }, thickness: 0.4, color: line });
  }

  if (y < bottom + 125) newPage();
  y -= 8;
  draw('Summe netto', A4.width - mx - 200, y, { color: muted });
  draw(money(input.netTotalCents, input.currency), A4.width - mx, y, { right: true });
  y -= 15;
  draw('USt.', A4.width - mx - 200, y, { color: muted });
  draw(money(input.vatTotalCents, input.currency), A4.width - mx, y, { right: true });
  y -= 18;
  page.drawLine({ start: { x: A4.width - mx - 210, y: y + 8 }, end: { x: A4.width - mx, y: y + 8 }, thickness: 1, color: ink });
  draw('Gesamtbetrag', A4.width - mx - 200, y, { font: bold, size: 11, color: ink });
  draw(money(input.grossTotalCents, input.currency), A4.width - mx, y, { font: bold, size: 11, color: ink, right: true });
  y -= 25;
  if (input.recurringNetMonthlyCents > 0) {
    draw('Monatlich netto', A4.width - mx - 200, y, { font: bold });
    draw(money(input.recurringNetMonthlyCents, input.currency), A4.width - mx, y, { font: bold, right: true });
    y -= 24;
  }

  if (input.acceptedAt && input.acceptedByName) {
    if (y < bottom + 115) newPage();
    y -= 12;
    page.drawRectangle({ x: mx, y: y - 58, width, height: 70, color: rgb(0.94, 0.97, 0.95) });
    draw('Digital angenommen', mx + 12, y - 4, { font: bold, size: 10, color: ink });
    draw(`Name: ${input.acceptedByName}`, mx + 12, y - 21, { size: 9 });
    draw(`Zeitpunkt: ${new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Berlin' }).format(new Date(input.acceptedAt))}`, A4.width - mx - 12, y - 21, { size: 8.5, color: muted, right: true });
    y -= 78;
  }

  const paymentDays = Number(input.company?.default_payment_terms_days ?? 0);
  if (y < bottom + 150) newPage();
  y -= 8;
  draw('Vertragsgrundlagen', mx, y, { font: bold, size: 10.5, color: ink });
  y -= 18;

  const acceptanceText = {
    KEINE_ABNAHME_ERFORDERLICH: 'Keine gesonderte Kundenabnahme erforderlich',
    VOR_ORT_UNTERSCHRIFT: 'Unterschrift des Kunden vor Ort',
    PORTAL_ABNAHME: 'Bestätigung durch den Kunden im Kundenportal',
  }[input.acceptancePolicy ?? 'KEINE_ABNAHME_ERFORDERLICH'];

  const orderTypeText = input.orderType === 'EINMALAUFTRAG'
    ? 'Einmalauftrag'
    : input.orderType === 'BEFRISTET'
      ? 'Befristeter Auftrag'
      : input.orderType === 'DAUERAUFTRAG'
        ? 'Laufender Auftrag'
        : null;

  const commercialTerms = [
    ['Angebotsgültigkeit', date(input.validUntil)],
    ...(orderTypeText ? [['Auftragsart', orderTypeText] as const] : []),
    ...(input.serviceStart ? [['Leistungsbeginn', date(input.serviceStart)] as const] : []),
    ...(input.serviceEnd ? [['Vertragsende', date(input.serviceEnd)] as const] : []),
    ...(input.terminationNotice ? [['Kündigungsfrist', input.terminationNotice] as const] : []),
    ...(input.billingMode ? [['Abrechnung', {
      MONATSPAUSCHALE: 'Monatspauschale',
      PAUSCHALE_PRO_EINSATZ: 'Pauschale pro Einsatz',
      STUNDENSATZ: 'Nach tatsächlichem Zeitaufwand',
    }[input.billingMode]] as const] : []),
    ['Kundenabnahme', acceptanceText],
    ['Zahlungsziel', paymentDays > 0 ? `${paymentDays} Tage ab Rechnungsdatum` : 'gemäß Rechnung'],
    ['Umsatzsteuer', 'gemäß den oben ausgewiesenen Steuersätzen'],
    ['Leistungsumfang', 'maßgeblich sind die oben aufgeführten Leistungen und Leistungsbeschreibungen'],
    ['Turnus', 'ergibt sich aus den angebotenen Leistungen bzw. dem nach Annahme eingerichteten Leistungsplan'],
  ] as const;

  for (const [label, value] of commercialTerms) {
    draw(label, mx, y, { font: bold, size: 8.8 });
    const lines = wrap(value, regular, 8.8, width - 120);
    lines.forEach((lineText, index) => draw(lineText, mx + 120, y - index * 11, { size: 8.8, color: muted }));
    y -= Math.max(14, lines.length * 11 + 3);
  }

  pages.forEach((p, i) => {
    const footerY = 42;
    p.drawLine({ start: { x: mx, y: footerY + 18 }, end: { x: A4.width - mx, y: footerY + 18 }, thickness: 0.5, color: line });
    const footer = [
      companyName,
      str(input.company, 'tax_number') ? `St-Nr.: ${str(input.company, 'tax_number')}` : null,
      str(input.company, 'vat_id') ? `USt-IdNr.: ${str(input.company, 'vat_id')}` : null,
      str(input.company, 'iban') ? `IBAN: ${str(input.company, 'iban')}` : null,
      str(input.company, 'bic') ? `BIC: ${str(input.company, 'bic')}` : null,
    ].filter((v): v is string => Boolean(v)).join(' · ');
    p.drawText(safe(footer), { x: mx, y: footerY, font: regular, size: 7.2, color: muted });
    const pn = `Seite ${i + 1} von ${pages.length}`;
    p.drawText(pn, { x: A4.width - mx - regular.widthOfTextAtSize(pn, 7.2), y: 24, font: regular, size: 7.2, color: muted });
    p.drawRectangle({ x: 0, y: A4.height - 4, width: A4.width, height: 4, color: ink });
  });

  return pdf.save();
}

export function quoteFileName(number: string) {
  return `Angebot-${number.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
}
