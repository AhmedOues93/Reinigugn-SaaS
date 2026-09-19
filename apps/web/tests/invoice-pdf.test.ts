import { describe, expect, it } from 'vitest';
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

  it('labels corrections and builds a header-safe file name', async () => {
    const doc = await PDFDocument.load(await renderInvoicePdf({ ...base, correctsInvoiceNumber: 'RE-2026-0003' }));
    expect(doc.getTitle()).toBe('Korrekturrechnung RE-2026-0007');
    expect(invoiceFileName('RE-2026-0007')).toBe('Rechnung-RE-2026-0007.pdf');
    expect(invoiceFileName('RE/2026"7', true)).toBe('Korrekturrechnung-RE_2026_7.pdf');
  });
});
