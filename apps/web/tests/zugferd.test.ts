import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';

import { CII_PROFILE_LABEL, renderInvoiceCii } from '@/lib/billing/cii';
import { renderInvoicePdf, type InvoicePdfInput } from '@/lib/billing/invoice-pdf';
import { FACTUR_X_FILENAME } from '@/lib/billing/pdfa';
import type { XRechnungInput } from '@/lib/billing/xrechnung';

/**
 * Die ZUGFeRD-Hybridrechnung.
 *
 * Was hier erzeugt wird, prueft der CI-Job "E-Rechnung" anschliessend mit
 * veraPDF 1.26.1 gegen PDF/A-3B und mit dem KoSIT-Validator gegen die
 * EN 16931 -- beides gegen genau diese Datei, nicht gegen ein von Hand
 * gepflegtes Abbild. Die Behauptung "PDF/A-3B" steht und faellt mit diesem
 * Lauf; die Zusicherungen unten sind nur die schnelle Leitung davor.
 */
const SAMPLE_DIR = join(__dirname, '..', '.xrechnung');

const xml: XRechnungInput = {
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

/** Dieselbe Rechnung als PDF-Eingabe -- gleiche Nummer, gleiche Zahlen. */
const pdfInput: InvoicePdfInput = {
  invoiceNumber: xml.invoiceNumber,
  status: 'ISSUED',
  issueDate: xml.issueDate,
  dueDate: xml.dueDate,
  servicePeriodStart: xml.servicePeriodStart,
  servicePeriodEnd: xml.servicePeriodEnd,
  currency: xml.currency,
  netTotalCents: xml.netTotalCents,
  vatTotalCents: xml.vatTotalCents,
  grossTotalCents: xml.grossTotalCents,
  customerNote: 'Zahlbar ohne Abzug.',
  buyerReference: xml.buyerReference,
  cancelledAt: null,
  customer: xml.customer as Record<string, unknown>,
  company: xml.company as Record<string, unknown>,
  lines: xml.lines.map((line) => ({ ...line })),
};

/** Der rohe Inhalt der Datei als Text, um auf PDF-Strukturen zu greifen. */
function raw(bytes: Uint8Array) {
  return Buffer.from(bytes).toString('latin1');
}

/** Der Inhalt aller unkomprimierten und aller Flate-Stroeme der Datei. */
function streams(bytes: Uint8Array) {
  const buffer = Buffer.from(bytes);
  const marker = Buffer.from('stream');
  const out: string[] = [];
  for (let at = buffer.indexOf(marker); at !== -1; at = buffer.indexOf(marker, at + 1)) {
    let from = at + marker.length;
    if (buffer[from] === 0x0d) from += 1;
    if (buffer[from] === 0x0a) from += 1;
    const to = buffer.indexOf(Buffer.from('endstream'), from);
    if (to === -1) continue;
    const slice = buffer.subarray(from, to);
    out.push(slice.toString('latin1'));
    try {
      out.push(inflateSync(slice).toString('utf8'));
    } catch {
      /* kein Flate-Strom -- der rohe Inhalt steht schon oben */
    }
  }
  return out;
}

async function renderPair() {
  mkdirSync(SAMPLE_DIR, { recursive: true });
  const plain = await renderInvoicePdf(pdfInput);
  writeFileSync(join(SAMPLE_DIR, 'plain-invoice.pdf'), plain);
  const cii = renderInvoiceCii(xml);
  const hybrid = await renderInvoicePdf({ ...pdfInput, facturX: { xml: cii, profile: CII_PROFILE_LABEL } });
  writeFileSync(join(SAMPLE_DIR, 'zugferd-invoice.pdf'), hybrid);
  return { plain, hybrid, cii };
}

describe('ZUGFeRD-Hybridrechnung', () => {
  it('legt das CII-XML als factur-x.xml mit AFRelationship /Data ab', async () => {
    const { hybrid, cii } = await renderPair();
    const text = raw(hybrid);

    // Der von der Spezifikation vorgeschriebene Name. Ein anderer Name wird
    // von Lesesoftware nicht gefunden -- die Datei waere dann ein PDF mit
    // einem Anhang, keine ZUGFeRD-Rechnung.
    expect(text).toContain(FACTUR_X_FILENAME);
    expect(FACTUR_X_FILENAME).toBe('factur-x.xml');
    expect(text).toContain('/AFRelationship /Data');
    // Das /AF-Array im Katalog: ohne es ist die Datei nach PDF/A-3 kein
    // Dokument mit zugehoeriger Datei, sondern nur eines mit einem Anhang.
    expect(text).toMatch(/\/AF \[/);

    // Und darin wirklich dieselben Daten, nicht irgendein XML.
    const embedded = streams(hybrid).find((entry) => entry.includes('CrossIndustryInvoice'));
    expect(embedded).toBeTruthy();
    expect(embedded).toContain('<ram:ID>RE-2026-0042</ram:ID>');
    expect(cii).toContain('<ram:ID>RE-2026-0042</ram:ID>');
  });

  it('kennzeichnet sich im XMP als PDF/A-3B und als Factur-X', async () => {
    const { hybrid } = await renderPair();
    const text = raw(hybrid);

    expect(text).toContain('<pdfaid:part>3</pdfaid:part>');
    expect(text).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
    expect(text).toContain('urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#');
    expect(text).toContain(`<fx:DocumentFileName>${FACTUR_X_FILENAME}</fx:DocumentFileName>`);
    expect(text).toContain('<fx:DocumentType>INVOICE</fx:DocumentType>');
    // Das Profil ist die CIUS der XRechnung, nicht die weitere EN 16931 --
    // genau die Kennung, die auch im XML steht.
    expect(text).toContain(`<fx:ConformanceLevel>${CII_PROFILE_LABEL}</fx:ConformanceLevel>`);
    // Ohne das Erweiterungsschema sind die vier fx:-Felder nicht deklariert.
    expect(text).toContain('Factur-X PDFA Extension Schema');
  });

  it('erfuellt die vier PDF/A-Punkte, die ein gewoehnliches PDF verletzt', async () => {
    const { plain, hybrid } = await renderPair();

    for (const bytes of [plain, hybrid]) {
      const text = raw(bytes);
      // 6.1.3 -- /ID im Trailer.
      expect(text).toMatch(/\/ID \[ <[0-9a-f]{32}> <[0-9a-f]{32}> \]/i);
      // 6.6.2.1 -- Metadatenstrom im Katalog.
      expect(text).toContain('/Metadata');
      expect(text).toContain('/Type /Metadata');
      // 6.2.4.3 -- OutputIntent mit eingebettetem Profil.
      expect(text).toContain('/OutputIntents');
      expect(text).toContain('/S /GTS_PDFA1');
      expect(text).toContain('/DestOutputProfile');
      // 6.2.11.4.1 -- eingebettete Schriften. Die Standard-14 sind genau das,
      // was PDF/A nicht erlaubt: ein Verweis auf eine Schrift, die der Leser
      // schon haben soll.
      expect(text).not.toContain('/BaseFont /Helvetica');
      expect(text).toMatch(/\/FontFile2/);
    }
  });

  it('ergibt fuer dieselbe Rechnung zweimal dieselbe Datei', async () => {
    // Sonst waere jeder erneute Download ein anderes Dokument -- und bei einer
    // Rechnung, die unveraenderlich sein soll, ist das kein Detail.
    const first = await renderInvoicePdf(pdfInput);
    const second = await renderInvoicePdf(pdfInput);
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('bleibt ohne CII-XML ein gewoehnliches PDF/A, ohne Factur-X-Angaben', async () => {
    const { plain } = await renderPair();
    const text = raw(plain);
    expect(text).toContain('<pdfaid:part>3</pdfaid:part>');
    expect(text).not.toContain(FACTUR_X_FILENAME);
    expect(text).not.toContain('urn:factur-x:pdfa');
  });

  it('bleibt lesbar: das PDF traegt die Rechnungsnummer und ist eine Seite', async () => {
    const { hybrid } = await renderPair();
    const document = await PDFDocument.load(hybrid);
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toBe('Rechnung RE-2026-0042');
    // Die Zeitstempel muessen zum XMP passen, sonst beanstandet PDF/A sie.
    expect(document.getCreationDate()?.toISOString()).toBe('2026-09-22T00:00:00.000Z');
  });
});
