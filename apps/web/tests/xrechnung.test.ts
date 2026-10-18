import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Gitignoriert; nur der CI-Job fuer die E-Rechnung liest hier. */
const SAMPLE_DIR = join(__dirname, '..', '.xrechnung');
import { renderXRechnung, validateXRechnung, type XRechnungInput } from '@/lib/billing/xrechnung';
import { invoiceToXRechnungInput } from '@/lib/billing/invoice-xrechnung-data';

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
    phone: '+49 69 1234567',
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

/** Die Form, in der getInvoice eine ausgestellte Rechnung liefert. */
const invoiceShape = {
  status: 'ISSUED',
  invoice_number: base.invoiceNumber,
  issue_date: base.issueDate,
  due_date: base.dueDate,
  service_period_start: base.servicePeriodStart,
  service_period_end: base.servicePeriodEnd,
  currency: base.currency,
  buyer_reference: base.buyerReference,
  net_total_cents: base.netTotalCents,
  vat_total_cents: base.vatTotalCents,
  gross_total_cents: base.grossTotalCents,
  customer_snapshot: base.customer,
  company_snapshot: base.company,
  lines: base.lines,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

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

  it('normalisiert deutsche Laendernamen zu ISO-Codes (BR-CL-14)', () => {
    const result = renderXRechnung({
      ...base,
      company: { ...base.company, country: 'Deutschland' },
      customer: { ...base.customer, country: 'Deutschland' },
    });
    expect(result.match(/<cbc:IdentificationCode>DE<\/cbc:IdentificationCode>/g)).toHaveLength(2);
    expect(result).not.toContain('<cbc:IdentificationCode>Deutschland</cbc:IdentificationCode>');
  });

  it('blockiert ungueltige Laenderangaben vor dem Versand', () => {
    const errors = validateXRechnung({
      ...base,
      customer: { ...base.customer, country: 'unbekanntes Land' },
    });
    expect(errors).toContain('Kundenland: bitte einen ISO-3166-1-Laendercode (z. B. DE) angeben.');
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
describe('XRechnung: die deutschen Geschaeftsregeln', () => {
  it('meldet eine fehlende Telefonnummer des Verkaeufers (BR-DE-6)', () => {
    const { phone, ...ohneTelefon } = base.company as Record<string, unknown>;
    void phone;
    const errors = validateXRechnung({ ...base, company: ohneTelefon });
    expect(errors.join(' ')).toContain('Firmen-Telefonnummer fehlt');
  });

  it('schreibt die Verkaeufer-Kontaktgruppe BG-6 ins Dokument (BR-DE-2)', () => {
    const xmlDocument = renderXRechnung(base);
    expect(xmlDocument).toContain('<cac:Contact>');
    expect(xmlDocument).toContain('<cbc:Telephone>+49 69 1234567</cbc:Telephone>');
    expect(xmlDocument).toContain('<cbc:ElectronicMail>rechnung@example.de</cbc:ElectronicMail>');
  });
});

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

/*
 * Kontaktangaben aus dem Firmenstamm nachreichen.
 *
 * company_snapshot friert beim Ausstellen ein, und das ist richtig. Die
 * Verkaeufer-Kontaktgruppe wurde aber erst mit der XRechnung zur Pflicht:
 * ohne Rueckfall bliebe jede vorher ausgestellte Rechnung fuer immer
 * unvollstaendig — das Buero traegt die Telefonnummer nach, und die Rechnung
 * scheitert weiterhin am eingefrorenen Abzug.
 */
describe('Rueckfall auf den Firmenstamm', () => {
  const ohneTelefon = (() => {
    const { phone, ...rest } = base.company as Record<string, unknown>;
    void phone;
    return rest;
  })();

  it('reicht eine fehlende Telefonnummer aus dem Firmenstamm nach', () => {
    const input = invoiceToXRechnungInput(
      { ...invoiceShape, company_snapshot: ohneTelefon },
      { phone: '+49 40 1234567' },
    );
    expect(input).not.toBeNull();
    expect(validateXRechnung(input!)).toEqual([]);
    expect(renderXRechnung(input!)).toContain('<cbc:Telephone>+49 40 1234567</cbc:Telephone>');
  });

  it('ueberschreibt eine vorhandene Angabe nicht', () => {
    const input = invoiceToXRechnungInput(invoiceShape, { phone: '+49 999 999999' });
    expect(renderXRechnung(input!)).toContain('<cbc:Telephone>+49 69 1234567</cbc:Telephone>');
  });

  it('reicht Betraege und Adressen NICHT nach', () => {
    // Nur Kontaktangaben duerfen nachgereicht werden. Strasse und Ort gehoeren
    // zum Inhalt der Rechnung und bleiben so, wie sie ausgestellt wurde.
    const { street, ...ohneStrasse } = base.company as Record<string, unknown>;
    void street;
    const input = invoiceToXRechnungInput(
      { ...invoiceShape, company_snapshot: ohneStrasse },
      { street: 'Nachtraeglich 9' },
    );
    expect(validateXRechnung(input!).join(' ')).toContain('Firmenstraße fehlt');
  });
});

/*
 * Die DEMO-Rechnung aus supabase/seed/demo-for-account.sql.
 *
 * Genau die Zahlen und Stammdaten, die das Seed in die Datenbank schreibt
 * (nachgeprueft gegen eine frische Datenbank). Damit faellt hier auf, wenn das
 * Seed eine Rechnung erzeugt, die sich nicht als E-Rechnung ausgeben laesst —
 * und nicht erst beim Testversand.
 */
describe('Demo-Rechnung aus dem Seed', () => {
  const seeded = {
    status: 'ISSUED',
    invoice_number: 'RE-2026-0001',
    issue_date: '2026-09-26',
    due_date: '2026-10-10',
    service_period_start: '2026-08-01',
    service_period_end: '2026-08-31',
    currency: 'EUR',
    buyer_reference: '991-01234-56',
    net_total_cents: 648_000,
    vat_total_cents: 123_120,
    gross_total_cents: 771_120,
    company_snapshot: {
      name: 'ReinPlan Demo (Testdaten)',
      legal_form: 'GmbH',
      street: 'Musterweg 3',
      postal_code: '20095',
      city: 'Hamburg',
      country: 'Deutschland',
      phone: '+49 40 1112233',
      email: 'demo@reinplan.test',
      tax_number: '22/815/08154',
      vat_id: 'DE999999999',
      iban: 'DE02120300000000202051',
      bic: 'BYLADEM1001',
    },
    customer_snapshot: {
      name: 'Hausverwaltung Elbe GmbH',
      billing_address: 'Elbchaussee 21',
      postal_code: '22765',
      city: 'Hamburg',
      country: 'Deutschland',
      email: 'kunde-elbe@reinplan.test',
    },
    lines: [
      {
        position: 1,
        description: 'Unterhaltsreinigung Buerohaus Elbpalais, Vormonat',
        quantity: 160,
        unit: 'Std',
        unit_price_cents: 3900,
        vat_rate_basis_points: 1900,
        net_amount_cents: 624_000,
        vat_amount_cents: 118_560,
      },
      {
        position: 2,
        description: 'Glasreinigung innen, Treppenhaus',
        quantity: 1,
        unit: 'Pauschale',
        unit_price_cents: 24_000,
        vat_rate_basis_points: 1900,
        net_amount_cents: 24_000,
        vat_amount_cents: 4560,
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  it('ist ohne Nacharbeit XRechnung-faehig', () => {
    const input = invoiceToXRechnungInput(seeded);
    expect(input).not.toBeNull();
    expect(validateXRechnung(input!)).toEqual([]);
  });

  it('traegt die Leitweg-ID und die Summen der EN 16931', () => {
    const xml = renderXRechnung(invoiceToXRechnungInput(seeded)!);
    // Der CI-Job prueft auch dieses Dokument gegen den KoSIT-Validator, damit
    // die Demo-Rechnung nicht nur unseren eigenen Regeln genuegt.
    mkdirSync(SAMPLE_DIR, { recursive: true });
    writeFileSync(join(SAMPLE_DIR, 'demo-invoice.xml'), xml, 'utf8');
    expect(xml).toContain('<cbc:BuyerReference>991-01234-56</cbc:BuyerReference>');
    expect(xml).toContain('<cbc:TaxExclusiveAmount currencyID="EUR">6480.00</cbc:TaxExclusiveAmount>');
    expect(xml).toContain('<cbc:TaxInclusiveAmount currencyID="EUR">7711.20</cbc:TaxInclusiveAmount>');
    expect(xml).toContain('<cbc:Telephone>+49 40 1112233</cbc:Telephone>');
    expect(xml.match(/<cbc:IdentificationCode>DE<\/cbc:IdentificationCode>/g)).toHaveLength(2);
  });
});
