import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';

/**
 * Server-side invoice PDF.
 *
 * Rendered only from the snapshots taken at issue time, so the file always
 * reproduces the document as issued — a later change of customer or company
 * master data can never alter a delivered invoice. The layout carries the
 * elements § 14 UStG asks for (both parties, tax number or VAT ID, issue date,
 * sequential number, quantity and description, service period, net per rate,
 * rate and VAT amount, gross). Whether a given tenant's data is complete is a
 * matter of its master data; the document does not invent anything.
 *
 * Fonts are the PDF standard Helvetica family (WinAnsi). German text including
 * umlauts, ß and € is covered; characters outside that set (e.g. Cyrillic
 * names) are replaced rather than failing the whole document — see `safe()`.
 */

export type InvoicePdfInput = {
  invoiceNumber: string;
  status: string;
  issueDate: string | null;
  dueDate: string | null;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  currency: string;
  netTotalCents: number;
  vatTotalCents: number;
  grossTotalCents: number;
  customerNote: string | null;
  cancelledAt: string | null;
  correctsInvoiceNumber?: string | null;
  customer: Record<string, unknown> | null;
  company: Record<string, unknown> | null;
  lines: {
    position: number;
    description: string;
    quantity: number;
    unit: string;
    unit_price_cents: number;
    vat_rate_basis_points: number;
    net_amount_cents: number;
    vat_amount_cents?: number;
  }[];
  logo?: { bytes: Uint8Array; type: 'png' | 'jpg' } | null;
};

const A4 = { width: 595.28, height: 841.89 };
const margin = { x: 56, top: 56, bottom: 88 };
const ink = rgb(0.043, 0.165, 0.2); // Tiefsee
const text = rgb(0.09, 0.15, 0.17);
const muted = rgb(0.38, 0.44, 0.46);
const line = rgb(0.82, 0.86, 0.87);
const petrol = rgb(0.05, 0.43, 0.49);

const winAnsiExtras = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

/** Keep what Helvetica/WinAnsi can draw; normalise spaces; replace the rest. */
export function safe(value: unknown): string {
  const input = String(value ?? '')
    .replace(/[\u202f\u2009\u2007]/g, ' ')
    .replace(/\u2212/g, '-')
    .replace(/[\r\t]/g, ' ');
  let out = '';
  for (const char of input) {
    const code = char.codePointAt(0)!;
    if (char === '\n' || (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || winAnsiExtras.has(char)) out += char;
    else out += '?';
  }
  return out;
}

const money = (cents: number, currency: string) =>
  safe(new Intl.NumberFormat('de-DE', { style: 'currency', currency }).format(cents / 100));
const date = (value: string | null) =>
  value ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value)) : '—';
const percent = (basisPoints: number) =>
  safe(new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 2 }).format(basisPoints / 10000));
const quantity = (value: number) => safe(new Intl.NumberFormat('de-DE', { maximumFractionDigits: 3 }).format(Number(value)));
const str = (record: Record<string, unknown> | null, key: string) => {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

function wrap(value: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of safe(value).split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      // A single word longer than the column is hard-broken.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      current = rest;
    }
    lines.push(current);
  }
  return lines.length ? lines : [''];
}

export async function renderInvoicePdf(input: InvoicePdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const company = input.company;
  const customer = input.customer;
  const companyName = str(company, 'name') ?? '';
  const title = input.correctsInvoiceNumber ? 'Korrekturrechnung' : 'Rechnung';

  pdf.setTitle(`${title} ${input.invoiceNumber}`);
  pdf.setAuthor(safe(companyName));
  pdf.setSubject(`${title} ${input.invoiceNumber}`);
  pdf.setCreator('SauberWerk');
  pdf.setProducer('SauberWerk');
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
  const contentWidth = A4.width - margin.x * 2;
  let page = pdf.addPage([A4.width, A4.height]);
  pages.push(page);
  let y = A4.height - margin.top;

  const draw = (value: string, x: number, atY: number, options: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; align?: 'left' | 'right' } = {}) => {
    const font = options.font ?? regular;
    const size = options.size ?? 9.5;
    const content = safe(value);
    const drawX = options.align === 'right' ? x - font.widthOfTextAtSize(content, size) : x;
    page.drawText(content, { x: drawX, y: atY, font, size, color: options.color ?? text });
  };

  // ---- Letterhead -------------------------------------------------------
  if (logo) {
    const scale = Math.min(150 / logo.width, 42 / logo.height, 1);
    page.drawImage(logo, { x: margin.x, y: y - logo.height * scale + 8, width: logo.width * scale, height: logo.height * scale });
  } else {
    draw(companyName, margin.x, y - 6, { font: bold, size: 15, color: ink });
  }
  const letterhead = [
    companyName,
    str(company, 'street'),
    [str(company, 'postal_code'), str(company, 'city')].filter(Boolean).join(' '),
    str(company, 'phone'),
    str(company, 'email'),
    str(company, 'website'),
  ].filter((entry): entry is string => Boolean(entry));
  letterhead.forEach((entry, index) =>
    draw(entry, A4.width - margin.x, y - index * 11.5, { size: 8.5, color: index === 0 ? text : muted, font: index === 0 ? bold : regular, align: 'right' }),
  );
  y -= Math.max(56, letterhead.length * 11.5 + 14);

  // ---- Address window and meta block ----------------------------------
  const senderLine = [companyName, str(company, 'street'), [str(company, 'postal_code'), str(company, 'city')].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' · ');
  draw(senderLine, margin.x, y, { size: 7, color: muted });
  page.drawLine({ start: { x: margin.x, y: y - 3 }, end: { x: margin.x + Math.min(250, regular.widthOfTextAtSize(safe(senderLine), 7)), y: y - 3 }, thickness: 0.4, color: line });

  const recipient = [
    str(customer, 'name'),
    str(customer, 'contact_person'),
    str(customer, 'billing_address'),
    [str(customer, 'postal_code'), str(customer, 'city')].filter(Boolean).join(' '),
  ].filter((entry): entry is string => Boolean(entry));
  recipient.forEach((entry, index) => draw(entry, margin.x, y - 18 - index * 13, { size: 10.5, font: index === 0 ? bold : regular }));

  const meta: [string, string][] = [
    ['Rechnungsnr.', input.invoiceNumber],
    ['Rechnungsdatum', date(input.issueDate)],
    ['Leistungszeitraum', `${date(input.servicePeriodStart)} – ${date(input.servicePeriodEnd)}`],
    ['Fällig am', date(input.dueDate)],
  ];
  const customerNumber = str(customer, 'customer_number');
  if (customerNumber) meta.push(['Kundennummer', customerNumber]);
  const metaLabelX = A4.width - margin.x - 210;
  meta.forEach(([label, value], index) => {
    draw(label, metaLabelX, y - 18 - index * 14, { size: 9, color: muted });
    draw(value, A4.width - margin.x, y - 18 - index * 14, { size: 9, font: index === 0 ? bold : regular, align: 'right' });
  });
  y -= 18 + Math.max(recipient.length * 13, meta.length * 14) + 30;

  // ---- Title ------------------------------------------------------------
  draw(`${title} ${input.invoiceNumber}`, margin.x, y, { font: bold, size: 16, color: ink });
  y -= 18;
  if (input.correctsInvoiceNumber) {
    draw(`Korrektur zur stornierten Rechnung ${input.correctsInvoiceNumber}`, margin.x, y, { size: 9.5, color: muted });
    y -= 14;
  }
  if (input.cancelledAt) {
    page.drawRectangle({ x: margin.x, y: y - 8, width: contentWidth, height: 22, color: rgb(1, 0.95, 0.88) });
    draw(`Diese Rechnung wurde am ${date(input.cancelledAt)} storniert.`, margin.x + 8, y - 1, { font: bold, size: 9.5, color: rgb(0.6, 0.3, 0.02) });
    y -= 26;
  }
  y -= 12;

  // ---- Line items -------------------------------------------------------
  const cols = {
    pos: margin.x,
    desc: margin.x + 26,
    qty: margin.x + 300,
    price: margin.x + 370,
    vat: margin.x + 418,
    net: A4.width - margin.x,
  };
  const descWidth = cols.qty - cols.desc - 58;

  const tableHeader = () => {
    page.drawRectangle({ x: margin.x - 6, y: y - 6, width: contentWidth + 12, height: 20, color: rgb(0.94, 0.96, 0.96) });
    draw('Pos.', cols.pos, y, { size: 8, font: bold, color: muted });
    draw('Beschreibung', cols.desc, y, { size: 8, font: bold, color: muted });
    draw('Menge', cols.qty, y, { size: 8, font: bold, color: muted, align: 'right' });
    draw('Einzelpreis', cols.price + 12, y, { size: 8, font: bold, color: muted, align: 'right' });
    draw('USt.', cols.vat + 6, y, { size: 8, font: bold, color: muted, align: 'right' });
    draw('Netto', cols.net, y, { size: 8, font: bold, color: muted, align: 'right' });
    y -= 22;
  };

  const newPage = () => {
    page = pdf.addPage([A4.width, A4.height]);
    pages.push(page);
    y = A4.height - margin.top;
    draw(`${title} ${input.invoiceNumber} – Fortsetzung`, margin.x, y, { size: 9, color: muted });
    y -= 26;
    tableHeader();
  };

  tableHeader();
  for (const item of input.lines) {
    const descLines = wrap(item.description, regular, 9.5, descWidth);
    const height = descLines.length * 12 + 8;
    if (y - height < margin.bottom + 20) newPage();
    draw(String(item.position), cols.pos, y, { size: 9.5, color: muted });
    descLines.forEach((entry, index) => draw(entry, cols.desc, y - index * 12, { size: 9.5 }));
    draw(`${quantity(item.quantity)} ${item.unit}`, cols.qty, y, { size: 9.5, align: 'right' });
    draw(money(item.unit_price_cents, input.currency), cols.price + 12, y, { size: 9.5, align: 'right' });
    draw(percent(item.vat_rate_basis_points), cols.vat + 6, y, { size: 9.5, align: 'right', color: muted });
    draw(money(item.net_amount_cents, input.currency), cols.net, y, { size: 9.5, align: 'right' });
    y -= height;
    page.drawLine({ start: { x: margin.x - 6, y: y + 5 }, end: { x: A4.width - margin.x + 6, y: y + 5 }, thickness: 0.4, color: line });
  }

  // ---- Totals -----------------------------------------------------------
  // Per rate: net and VAT summed from the stored line amounts, so the rate lines
  // always add up to the stored totals (the database rounds VAT per line).
  const vatGroups = new Map<number, { net: number; vat: number }>();
  for (const item of input.lines) {
    const group = vatGroups.get(item.vat_rate_basis_points) ?? { net: 0, vat: 0 };
    group.net += item.net_amount_cents;
    group.vat += item.vat_amount_cents ?? Math.round((item.net_amount_cents * item.vat_rate_basis_points) / 10000);
    vatGroups.set(item.vat_rate_basis_points, group);
  }
  const totalsHeight = 26 + vatGroups.size * 14 + 30;
  if (y - totalsHeight < margin.bottom + 10) newPage();
  y -= 10;
  const labelX = A4.width - margin.x - 230;
  draw('Summe netto', labelX, y, { size: 9.5, color: muted });
  draw(money(input.netTotalCents, input.currency), cols.net, y, { size: 9.5, align: 'right' });
  y -= 14;
  for (const [rate, group] of vatGroups) {
    draw(`zzgl. USt. ${percent(rate)} auf ${money(group.net, input.currency)}`, labelX, y, { size: 9.5, color: muted });
    draw(money(group.vat, input.currency), cols.net, y, { size: 9.5, align: 'right' });
    y -= 14;
  }
  page.drawLine({ start: { x: labelX, y: y + 4 }, end: { x: cols.net, y: y + 4 }, thickness: 1.2, color: ink });
  y -= 12;
  draw('Gesamtbetrag', labelX, y, { size: 11.5, font: bold, color: ink });
  draw(money(input.grossTotalCents, input.currency), cols.net, y, { size: 11.5, font: bold, color: ink, align: 'right' });
  y -= 34;

  // ---- Notes and payment terms -----------------------------------------
  const paragraphs: string[] = [];
  if (input.customerNote) paragraphs.push(input.customerNote);
  if (input.dueDate && !input.cancelledAt && input.status !== 'PAID') {
    paragraphs.push(
      `Bitte überweisen Sie den Gesamtbetrag bis zum ${date(input.dueDate)} unter Angabe der Rechnungsnummer ${input.invoiceNumber}.`,
    );
  }
  if (input.status === 'PAID') paragraphs.push('Der Rechnungsbetrag wurde bereits beglichen. Vielen Dank.');
  for (const paragraph of paragraphs) {
    for (const entry of wrap(paragraph, regular, 9.5, contentWidth)) {
      if (y < margin.bottom + 10) newPage();
      draw(entry, margin.x, y, { size: 9.5 });
      y -= 13;
    }
    y -= 6;
  }

  // ---- Footer on every page ----------------------------------------------
  const footerColumns = [
    [companyName, companyName.endsWith(str(company, 'legal_form') ?? '\u0000') ? null : str(company, 'legal_form'), str(company, 'street'), [str(company, 'postal_code'), str(company, 'city')].filter(Boolean).join(' ')],
    [
      str(company, 'tax_number') ? `Steuernummer: ${str(company, 'tax_number')}` : null,
      str(company, 'vat_id') ? `USt-IdNr.: ${str(company, 'vat_id')}` : null,
      str(company, 'email'),
    ],
    [str(company, 'iban') ? `IBAN: ${str(company, 'iban')}` : null, str(company, 'bic') ? `BIC: ${str(company, 'bic')}` : null],
  ].map((column) => column.filter((entry): entry is string => Boolean(entry)));

  pages.forEach((current, index) => {
    const footerTop = margin.bottom - 22;
    current.drawLine({ start: { x: margin.x, y: footerTop + 12 }, end: { x: A4.width - margin.x, y: footerTop + 12 }, thickness: 0.5, color: line });
    footerColumns.forEach((column, columnIndex) => {
      column.forEach((entry, row) =>
        current.drawText(safe(entry), {
          x: margin.x + columnIndex * (contentWidth / 3),
          y: footerTop - row * 10,
          font: row === 0 && columnIndex === 0 ? bold : regular,
          size: 7.5,
          color: muted,
        }),
      );
    });
    const label = `Seite ${index + 1} von ${pages.length}`;
    current.drawText(label, { x: A4.width - margin.x - regular.widthOfTextAtSize(label, 7.5), y: 28, font: regular, size: 7.5, color: muted });
    current.drawRectangle({ x: 0, y: A4.height - 4, width: A4.width, height: 4, color: petrol });
  });

  return pdf.save();
}

/** File name that is safe in a Content-Disposition header. */
export function invoiceFileName(invoiceNumber: string, corrected = false) {
  return `${corrected ? 'Korrekturrechnung' : 'Rechnung'}-${invoiceNumber.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
}

/** Fetches the tenant logo from its signed URL so it can be embedded. Best effort. */
export async function fetchLogo(url: string | null): Promise<InvoicePdfInput['logo']> {
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') ?? '';
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (type.includes('png')) return { bytes, type: 'png' };
    if (type.includes('jpeg') || type.includes('jpg')) return { bytes, type: 'jpg' };
    return null;
  } catch {
    return null;
  }
}
