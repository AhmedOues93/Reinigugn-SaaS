import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Gitignoriert; nur der CI-Job fuer die E-Rechnung liest hier. */
const SAMPLE_DIR = join(__dirname, '..', '.xrechnung');
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

/*
 * Die Rechenregeln der EN 16931.
 *
 * Ein Empfaenger lehnt eine XRechnung vor allem ab, wenn die Betraege nicht
 * aufgehen. Jede Zusicherung hier prueft, dass genau diese Abweichung vor dem
 * Versand auffaellt — und nicht erst beim Kunden.
 */
describe('EN 16931: die Betraege muessen aufgehen', () => {
  it('meldet eine Nettosumme, die nicht zu den Positionen passt', () => {
    const errors = validateXRechnung({ ...base, netTotalCents: 9900 });
    expect(errors.join(' ')).toContain('Nettosumme stimmt nicht');
  });

  it('meldet einen Steuerbetrag, der nicht zum Steuersatz passt', () => {
    const errors = validateXRechnung({ ...base, vatTotalCents: 2000, grossTotalCents: 12000 });
    expect(errors.join(' ')).toContain('Steuerbetrag stimmt nicht');
  });

  it('meldet eine Bruttosumme, die nicht Netto plus Steuer ist', () => {
    const errors = validateXRechnung({ ...base, grossTotalCents: 11800 });
    expect(errors.join(' ')).toContain('Bruttosumme stimmt nicht');
  });

  it('meldet eine Position, deren Betrag nicht Menge mal Preis ist', () => {
    const errors = validateXRechnung({
      ...base,
      lines: [{ ...base.lines[0]!, quantity: 2, net_amount_cents: 10000 }],
    });
    expect(errors.join(' ')).toContain('Position 1');
  });

  it('meldet ein Faelligkeitsdatum vor dem Rechnungsdatum', () => {
    const errors = validateXRechnung({ ...base, dueDate: '2026-09-01' });
    expect(errors.join(' ')).toContain('Fälligkeitsdatum liegt vor');
  });

  it('rechnet die Steuer je Steuersatz, nicht je Position', () => {
    // Drei Positionen zu 3,33 € ergeben 9,99 € netto. Je Position gerundet
    // waeren das 3 × 63 = 189 Cent, ueber die Kategorie 1899 × 19 % = 190 Cent.
    // Massgeblich ist der Kategoriebetrag; die zweite Rechnung wuerde beim
    // Empfaenger auffallen.
    const line = { ...base.lines[0]!, quantity: 1, unit_price_cents: 333, net_amount_cents: 333 };
    const input: XRechnungInput = {
      ...base,
      netTotalCents: 999,
      vatTotalCents: 190,
      grossTotalCents: 1189,
      lines: [
        { ...line, position: 1 },
        { ...line, position: 2 },
        { ...line, position: 3 },
      ],
    };
    expect(validateXRechnung(input)).toEqual([]);
  });

  it('laesst eine stimmige Rechnung durch und erzeugt sie', () => {
    expect(validateXRechnung(base)).toEqual([]);
    const xmlDocument = renderXRechnung(base);
    expect(xmlDocument).toContain('<cbc:TaxInclusiveAmount');

    /*
     * Das Muster fuer den offiziellen KoSIT-Validator.
     *
     * Diese Datei ist die Bruecke zwischen den Regeln, die hier geprueft
     * werden, und der Pruefung, die zaehlt: der CI-Job "E-Rechnung" laedt den
     * Validator des KoSIT und laesst genau dieses Dokument gegen die
     * XRechnung-Szenarien laufen. Ohne einen solchen Lauf heisst "wir erzeugen
     * XML" nicht, dass ein Empfaenger es annimmt.
     */
    mkdirSync(SAMPLE_DIR, { recursive: true });
    writeFileSync(join(SAMPLE_DIR, 'sample.xml'), xmlDocument, 'utf8');
  });
});
