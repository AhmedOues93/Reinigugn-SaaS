import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CII_GUIDELINE_ID, ciiFileName, renderInvoiceCii } from '@/lib/billing/cii';
import { invoiceToXRechnungInput } from '@/lib/billing/invoice-xrechnung-data';
import { validateXRechnung, type XRechnungInput } from '@/lib/billing/xrechnung';

/**
 * Dieselben Zahlen wie in xrechnung.test.ts, nur in CII.
 *
 * Die beiden Dokumente muessen dieselbe Rechnung beschreiben -- eine
 * Abweichung zwischen UBL und CII waere genau der Fehler, den niemand
 * bemerkt, bis ein Empfaenger die eine Fassung annimmt und die andere nicht.
 *
 * Gitignoriert; nur der CI-Job fuer die E-Rechnung liest hier. Dort laeuft der
 * KoSIT-Validator mit dem Szenario "EN16931 XRechnung (CII)" darueber --
 * XSD, EN16931-Schematron und XRechnung-CIUS-Regeln. Was hier erzeugt wird,
 * wird dort geprueft; es gibt kein von Hand gepflegtes Abbild.
 */
const SAMPLE_DIR = join(__dirname, '..', '.xrechnung');

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

describe('CII (ZUGFeRD/Factur-X-Syntax)', () => {
  it('traegt genau die Kennung, auf die das KoSIT-Szenario greift', () => {
    // Ohne diesen Wert findet der Validator kein Szenario und prueft das
    // Dokument gar nicht. Es waere dann nicht gueltig, sondern ungeprueft --
    // ein Unterschied, der in einem gruenen CI-Lauf untergeht.
    const document = renderInvoiceCii(base);
    mkdirSync(SAMPLE_DIR, { recursive: true });
    writeFileSync(join(SAMPLE_DIR, 'sample-cii.xml'), document, 'utf8');

    expect(document).toContain(`<ram:ID>${CII_GUIDELINE_ID}</ram:ID>`);
    expect(document).toContain('urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100');
  });

  it('datiert im CII-Format 102, nicht als ISO-Datum', () => {
    const document = renderInvoiceCii(base);
    expect(document).toContain('<udt:DateTimeString format="102">20260922</udt:DateTimeString>');
    expect(document).toContain('<udt:DateTimeString format="102">20261006</udt:DateTimeString>');
    expect(document).not.toContain('2026-09-22</udt:DateTimeString>');
  });

  it('beschreibt dieselbe Rechnung wie die UBL-Fassung', () => {
    const document = renderInvoiceCii(base);
    expect(document).toContain('<ram:ID>RE-2026-0042</ram:ID>');
    expect(document).toContain('<ram:BuyerReference>04011000-12345-67</ram:BuyerReference>');
    expect(document).toContain('<ram:LineTotalAmount>100.00</ram:LineTotalAmount>');
    expect(document).toContain('<ram:TaxTotalAmount currencyID="EUR">19.00</ram:TaxTotalAmount>');
    expect(document).toContain('<ram:GrandTotalAmount>119.00</ram:GrandTotalAmount>');
    expect(document).toContain('<ram:DuePayableAmount>119.00</ram:DuePayableAmount>');
  });

  it('schreibt die Verkaeufer-Kontaktgruppe BG-6 (BR-DE-2 bis BR-DE-7)', () => {
    const document = renderInvoiceCii(base);
    expect(document).toContain('<ram:DefinedTradeContact>');
    expect(document).toContain('<ram:CompleteNumber>+49 69 1234567</ram:CompleteNumber>');
    expect(document).toContain('<ram:URIID>rechnung@example.de</ram:URIID>');
  });

  it('normalisiert deutsche Laendernamen zu ISO-Codes (BR-CL-14)', () => {
    const document = renderInvoiceCii({
      ...base,
      company: { ...base.company, country: 'Deutschland' },
      customer: { ...base.customer, country: 'Deutschland' },
    });
    expect(document.match(/<ram:CountryID>DE<\/ram:CountryID>/g)).toHaveLength(2);
    expect(document).not.toContain('<ram:CountryID>Deutschland</ram:CountryID>');
  });

  it('maskiert kundeneigenen Text', () => {
    const document = renderInvoiceCii({
      ...base,
      lines: [{ ...base.lines[0], description: 'Glas & Rahmen <innen>' }],
    });
    expect(document).toContain('Glas &amp; Rahmen &lt;innen&gt;');
  });

  it('verweigert ein Dokument, dem Pflichtangaben fehlen', () => {
    // Dieselbe Pruefung wie UBL: eine zweite Liste waere eine zweite Wahrheit.
    expect(() => renderInvoiceCii({ ...base, buyerReference: null })).toThrow(/Leitweg-ID/);
    expect(validateXRechnung({ ...base, buyerReference: null })).not.toEqual([]);
  });

  it('nennt die Datei beim Einzeldownload sprechend', () => {
    expect(ciiFileName('RE-2026-0042')).toBe('ZUGFeRD-CII-RE-2026-0042.xml');
    expect(ciiFileName('RE/2026\\0042')).toBe('ZUGFeRD-CII-RE_2026_0042.xml');
  });

  it('fuehrt mehrere Steuersaetze als getrennte Gruppen', () => {
    const document = renderInvoiceCii({
      ...base,
      netTotalCents: 20000,
      vatTotalCents: 2600,
      grossTotalCents: 22600,
      lines: [
        base.lines[0],
        {
          position: 2,
          description: 'Vermittelte Leistung',
          quantity: 1,
          unit: 'Pauschale',
          unit_price_cents: 10000,
          vat_rate_basis_points: 700,
          net_amount_cents: 10000,
          vat_amount_cents: 700,
        },
      ],
    });
    expect(document.match(/<ram:ApplicableTradeTax>/g)?.length).toBe(4); // zwei pro Position, zwei im Kopf
    expect(document).toContain('<ram:RateApplicablePercent>19</ram:RateApplicablePercent>');
    expect(document).toContain('<ram:RateApplicablePercent>7</ram:RateApplicablePercent>');
  });
});

/**
 * Die Demo-Rechnung aus supabase/seed/demo-for-account.sql, in CII.
 *
 * Dieselbe Rechnung wie in xrechnung.test.ts, damit der Validator beide
 * Syntaxen an denselben Zahlen prueft.
 */
describe('CII: die Demo-Rechnung', () => {
  const seeded = {
    status: 'ISSUED',
    invoice_number: 'RE-2026-0007',
    issue_date: '2026-10-01',
    due_date: '2026-10-15',
    service_period_start: '2026-09-01',
    service_period_end: '2026-09-30',
    currency: 'EUR',
    buyer_reference: '991-01234-56',
    net_total_cents: 648_000,
    vat_total_cents: 123_120,
    gross_total_cents: 771_120,
    company_snapshot: {
      name: 'Ahmed Gebäudereinigung GmbH',
      street: 'Reinigungsweg 5',
      postal_code: '20095',
      city: 'Hamburg',
      country: 'Deutschland',
      phone: '+49 40 1112233',
      email: 'rechnung@ahmed-reinigung.example',
      vat_id: 'DE987654321',
      iban: 'DE02500105170137075030',
      bic: 'INGDDEFFXXX',
    },
    customer_snapshot: {
      name: 'Hanse Immobilien GmbH',
      billing_address: 'Hafenstraße 12',
      postal_code: '20457',
      city: 'Hamburg',
      country: 'Deutschland',
      email: 'buchhaltung@hanse-immobilien.example',
    },
    lines: [
      {
        position: 1,
        description: 'Unterhaltsreinigung September',
        quantity: 1,
        unit: 'Monat',
        unit_price_cents: 624_000,
        vat_rate_basis_points: 1900,
        net_amount_cents: 624_000,
        vat_amount_cents: 118_560,
      },
      {
        position: 2,
        description: 'Glasreinigung Treppenhaus',
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

  it('ist ohne Nacharbeit CII-faehig und wird vom CI-Job validiert', () => {
    const input = invoiceToXRechnungInput(seeded);
    expect(input).not.toBeNull();
    const document = renderInvoiceCii(input!);

    mkdirSync(SAMPLE_DIR, { recursive: true });
    writeFileSync(join(SAMPLE_DIR, 'demo-invoice-cii.xml'), document, 'utf8');

    expect(document).toContain('<ram:BuyerReference>991-01234-56</ram:BuyerReference>');
    expect(document).toContain('<ram:TaxBasisTotalAmount>6480.00</ram:TaxBasisTotalAmount>');
    expect(document).toContain('<ram:GrandTotalAmount>7711.20</ram:GrandTotalAmount>');
    expect(document).toContain('<ram:CompleteNumber>+49 40 1112233</ram:CompleteNumber>');
    expect(document.match(/<ram:CountryID>DE<\/ram:CountryID>/g)).toHaveLength(2);
  });
});
