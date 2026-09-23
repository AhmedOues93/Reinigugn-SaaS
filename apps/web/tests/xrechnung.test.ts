import { describe, expect, it } from 'vitest';
import { renderXRechnung, validateXRechnung, type XRechnungInput } from '@/lib/billing/xrechnung';

const base: XRechnungInput = {
  invoiceNumber: 'RE-2026-0042',
  issueDate: '2026-09-22',
  dueDate: '2026-10-06',
  servicePeriodStart: '2026-09-01',
  servicePeriodEnd: '2026-09-30',
  currency: 'EUR',
  buyerReference: '04011000-12345-67',
  netTotalCents: 10000,
  vatTotalCents: 1900,
  grossTotalCents: 11900,
  company: {
    name: 'ReinPlan Reinigung GmbH',
    street: 'Musterstr. 1',
    postal_code: '60311',
    city: 'Frankfurt am Main',
    country: 'DE',
    email: 'rechnung@example.de',
    vat_id: 'DE123456789',
    iban: 'DE02120300000000202051',
    bic: 'BYLADEM1001',
  },
  customer: {
    name: 'Kunde GmbH',
    billing_address: 'Kundenweg 2',
    postal_code: '60313',
    city: 'Frankfurt am Main',
    country: 'DE',
    email: 'buchhaltung@kunde.de',
  },
  lines: [{
    position: 1,
    description: 'Unterhaltsreinigung September',
    quantity: 1,
    unit: 'Monat',
    unit_price_cents: 10000,
    vat_rate_basis_points: 1900,
    net_amount_cents: 10000,
    vat_amount_cents: 1900,
  }],
};

describe('XRechnung', () => {
  it('requires the XRechnung buyer reference instead of inventing one', () => {
    const errors = validateXRechnung({ ...base, buyerReference: null });
    expect(errors).toContain('Käuferreferenz / Leitweg-ID fehlt.');
  });

  it('renders the XRechnung 3 UBL identifiers and invoice totals', () => {
    const xml = renderXRechnung(base);
    expect(xml).toContain('urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0');
    expect(xml).toContain('urn:fdc:peppol.eu:2017:poacc:billing:01:1.0');
    expect(xml).toContain('<cbc:ID>RE-2026-0042</cbc:ID>');
    expect(xml).toContain('<cbc:BuyerReference>04011000-12345-67</cbc:BuyerReference>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">119.00</cbc:PayableAmount>');
  });

  it('escapes customer-controlled text in XML', () => {
    const xml = renderXRechnung({
      ...base,
      lines: [{ ...base.lines[0], description: 'Glas & Rahmen <innen>' }],
    });
    expect(xml).toContain('Glas &amp; Rahmen &lt;innen&gt;');
  });
});
