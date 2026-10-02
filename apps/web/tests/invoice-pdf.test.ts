import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { invoiceFileName, renderInvoicePdf, safe, type InvoicePdfInput } from '@/lib/billing/invoice-pdf';

const base: InvoicePdfInput = {
  invoiceNumber: 'RE-2026-0007',
  status: 'ISSUED',
  issueDate: '2026-09-01',
  dueDate: '2026-09-15',
  servicePeriodStart: '2026-08-01',
  servicePeriodEnd: '2026-08-31',
  currency: 'EUR',
  netTotalCents: 87500,
  vatTotalCents: 16625,
  grossTotalCents: 104125,
  customerNote: 'Vielen Dank für Ihren Auftrag.',
  cancelledAt: null,
  customer: { name: 'Hausverwaltung Nord GmbH', billing_address: 'Große Straße 1', postal_code: '20095', city: 'Hamburg', customer_number: 'K-0001' },
  company: { name: 'Glanz & Co. Gebäudereinigung', street: 'Weg 2', postal_code: '10115', city: 'Berlin', tax_number: '12/345/67890', vat_id: 'DE123456789', iban: 'DE02120300000000202051' },
  lines: [
    { position: 1, description: 'Unterhaltsreinigung August', quantity: 12.5, unit: 'Std', unit_price_cents: 4200, vat_rate_basis_points: 1900, net_amount_cents: 52500 },
    { position: 2, description: 'Grundreinigung Treppenhaus', quantity: 1, unit: 'Pausch', unit_price_cents: 35000, vat_rate_basis_points: 1900, net_amount_cents: 35000 },
  ],
};


/** The visible text of a rendered PDF, for asserting on the figures it prints. */
async function pdfText(bytes: Uint8Array) {
  // Content streams are deflate-compressed and the renderer writes text as hex
  // strings (`<52656368…> Tj`), so inflate each stream and decode those.
  const raw = Buffer.from(bytes);
  const marker = Buffer.from('stream');
  const chunks: string[] = [];
  for (let at = raw.indexOf(marker); at !== -1; at = raw.indexOf(marker, at + 1)) {
    let from = at + marker.length;
    if (raw[from] === 0x0d) from += 1;
    if (raw[from] === 0x0a) from += 1;
    const to = raw.indexOf(Buffer.from('endstream'), from);
    if (to === -1) continue;
    try {
      chunks.push(inflateSync(raw.subarray(from, to)).toString('latin1'));
    } catch {
      /* an embedded font rather than a content stream — nothing to read */
    }
  }
  return [...chunks.join('\n').matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)]
    .map(([, hex]) => Buffer.from(hex!, 'hex').toString('latin1'))
    .join(' ');
}

describe('invoice PDF', () => {
  it('renders a valid, titled PDF from the snapshot', async () => {
    const bytes = await renderInvoicePdf(base);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getTitle()).toBe('Rechnung RE-2026-0007');
  });

  it('paginates long invoices instead of overflowing', async () => {
    const lines = Array.from({ length: 80 }, (_, index) => ({ ...base.lines[0]!, position: index + 1, description: `Einsatz ${index + 1} – Unterhaltsreinigung mit einer längeren Beschreibung der erbrachten Leistung` }));
    const doc = await PDFDocument.load(await renderInvoicePdf({ ...base, lines }));
    expect(doc.getPageCount()).toBeGreaterThan(1);
  });

  it('never fails on characters outside the PDF standard font', async () => {
    expect(safe('Müller € – “ok”')).toBe('Müller € – “ok”');
    expect(safe('Иванов')).toBe('??????');
    const bytes = await renderInvoicePdf({ ...base, customer: { ...base.customer, name: 'ООО Чистота' } });
    expect(bytes.length).toBeGreaterThan(1000);
  });

  /*
   * A printed total that disagrees with the stored one is the worst kind of
   * billing bug: the customer and the ledger hold different numbers and nobody
   * notices until a dispute. The document must render the stored figures, never
   * re-derive them.
   */
  it('prints exactly the stored totals, including awkward rounding', async () => {
    // 3.333 x 41.67 and 7.77 x 13.33 both round unhappily; the stored integers win.
    const awkward: InvoicePdfInput = {
      ...base,
      netTotalCents: 24246,
      vatTotalCents: 3364,
      grossTotalCents: 27610,
      lines: [
        { position: 1, description: 'Glasreinigung', quantity: 3.333, unit: 'Std', unit_price_cents: 4167, vat_rate_basis_points: 1900, net_amount_cents: 13889 },
        { position: 2, description: 'Sonderposten', quantity: 7.77, unit: 'm²', unit_price_cents: 1333, vat_rate_basis_points: 700, net_amount_cents: 10357 },
      ],
    };
    const text = await pdfText(await renderInvoicePdf(awkward));

    // The stored minor units, formatted — never recomputed from floats.
    expect(text).toContain('242,46'); // net total
    expect(text).toContain('276,10'); // gross total
    // VAT is broken down per rate, as a German invoice must: 26,39 + 7,25 = 33,64.
    expect(text).toContain('26,39');
    expect(text).toContain('7,25');
    // A float recomputation of line 1 would print 138,90 rather than the stored 138,89.
    expect(text).toContain('138,89');
    expect(text).not.toContain('138,90');
  });

  it('labels corrections and builds a header-safe file name', async () => {
    const doc = await PDFDocument.load(await renderInvoicePdf({ ...base, correctsInvoiceNumber: 'RE-2026-0003' }));
    expect(doc.getTitle()).toBe('Korrekturrechnung RE-2026-0007');
    expect(invoiceFileName('RE-2026-0007')).toBe('Rechnung-RE-2026-0007.pdf');
    expect(invoiceFileName('RE/2026"7', true)).toBe('Korrekturrechnung-RE_2026_7.pdf');
  });
});
