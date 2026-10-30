type InvoiceLine = {
  position: number;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number;
  vat_rate_basis_points: number;
  net_amount_cents: number;
  vat_amount_cents: number;
};

export type XRechnungInput = {
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  servicePeriodStart: string;
  servicePeriodEnd: string;
  currency: string;
  buyerReference: string | null;
  netTotalCents: number;
  vatTotalCents: number;
  grossTotalCents: number;
  customer: Record<string, unknown> | null;
  company: Record<string, unknown> | null;
  lines: InvoiceLine[];
};

const str = (record: Record<string, unknown> | null, key: string) => {
  const value = record?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const xml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

// Stammdaten verwenden deutsche Laendernamen; EN 16931 erwartet ISO 3166-1 alpha-2.
const countryCode = (value: string | null): string | null => {
  const country = (value ?? 'DE').trim();
  const aliases: Record<string, string> = {
    deutschland: 'DE', germany: 'DE',
    oesterreich: 'AT', österreich: 'AT', austria: 'AT',
    schweiz: 'CH', switzerland: 'CH',
    frankreich: 'FR', france: 'FR',
    niederlande: 'NL', netherlands: 'NL',
    belgien: 'BE', belgium: 'BE',
    polen: 'PL', poland: 'PL',
    italien: 'IT', italy: 'IT',
    spanien: 'ES', spain: 'ES',
    tunesien: 'TN', tunisia: 'TN',
  };
  const code = aliases[country.toLocaleLowerCase('de-DE')] ?? country.toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
};

const amount = (cents: number) => (cents / 100).toFixed(2);
const pct = (basisPoints: number) => (basisPoints / 100).toFixed(2).replace(/\.00$/, '');

const unitCode = (unit: string) => {
  const normalized = unit.trim().toLowerCase();
  if (normalized === 'std' || normalized.startsWith('stunde')) return 'HUR';
  if (normalized === 'monat') return 'MON';
  if (normalized === 'm²' || normalized === 'm2') return 'MTK';
  if (normalized === 'einsatz') return 'E48';
  if (normalized === 'stück' || normalized === 'stueck' || normalized === 'stk') return 'C62';
  return 'C62';
};

export function validateXRechnung(input: XRechnungInput): string[] {
  const errors: string[] = [];
  const company = input.company;
  const customer = input.customer;

  if (!input.invoiceNumber) errors.push('Rechnungsnummer fehlt.');
  if (!input.issueDate) errors.push('Rechnungsdatum fehlt.');
  if (!input.dueDate) errors.push('Fälligkeitsdatum fehlt.');
  if (!input.buyerReference) errors.push('Käuferreferenz / Leitweg-ID fehlt.');
  if (!input.lines.length) errors.push('Mindestens eine Leistung ist erforderlich.');

  for (const [label, record, key] of [
    ['Firmenname', company, 'name'],
    ['Firmenstraße', company, 'street'],
    ['Firmen-PLZ', company, 'postal_code'],
    ['Firmenort', company, 'city'],
    ['Firmen-E-Mail', company, 'email'],
    // BR-DE-6: die Telefonnummer des Verkaeufers ist fuer die XRechnung
    // Pflicht. Fehlt sie, lehnt der Empfaenger ab — das muss hier auffallen
    // und nicht beim Kunden.
    ['Firmen-Telefonnummer', company, 'phone'],
    ['IBAN', company, 'iban'],
    ['Kundenname', customer, 'name'],
    ['Kundenadresse', customer, 'billing_address'],
    ['Kunden-PLZ', customer, 'postal_code'],
    ['Kundenort', customer, 'city'],
    ['Kunden-E-Mail', customer, 'email'],
  ] as const) {
    if (!str(record, key)) errors.push(`${label} fehlt.`);
  }

  for (const [label, record] of [
    ['Firmenland', company],
    ['Kundenland', customer],
  ] as const) {
    if (!countryCode(str(record, 'country'))) {
      errors.push(`${label}: bitte einen ISO-3166-1-Laendercode (z. B. DE) angeben.`);
    }
  }

  if (!str(company, 'vat_id') && !str(company, 'tax_number')) {
    errors.push('USt-IdNr. oder Steuernummer fehlt.');
  }

  if (input.lines.some((line) => line.vat_rate_basis_points <= 0)) {
    errors.push('XRechnung mit 0 % USt. braucht eine explizite Steuerkategorie/Steuerbefreiung.');
  }

  /*
   * Die Rechenregeln der EN 16931.
   *
   * Bis hierher wurde nur geprueft, ob Felder da sind. Ein Empfaenger lehnt
   * eine XRechnung aber vor allem dann ab, wenn die Betraege nicht aufgehen —
   * das ist der haeufigste Grund, und er faellt ohne diese Pruefung erst beim
   * Kunden auf, nicht beim Versenden.
   *
   * Geprueft wird gegen die Summen, die tatsaechlich ins XML geschrieben
   * werden, nicht gegen eine zweite Rechnung daneben. Die Steuer wird je
   * Steuersatz gerechnet und nicht je Position aufsummiert: bei mehreren
   * Positionen mit demselben Satz weichen beide Wege um Rundungscent
   * voneinander ab, und massgeblich ist der Kategoriebetrag.
   */
  const money = (cents: number) => (cents / 100).toFixed(2);

  const lineNetSum = input.lines.reduce((total, line) => total + line.net_amount_cents, 0);
  if (lineNetSum !== input.netTotalCents) {
    errors.push(
      `Nettosumme stimmt nicht: Positionen ergeben ${money(lineNetSum)}, angegeben ist ${money(input.netTotalCents)}.`,
    );
  }

  const byRate = new Map<number, number>();
  for (const line of input.lines) {
    byRate.set(line.vat_rate_basis_points, (byRate.get(line.vat_rate_basis_points) ?? 0) + line.net_amount_cents);
  }
  const categoryVatSum = [...byRate.entries()].reduce(
    (total, [rate, net]) => total + Math.round((net * rate) / 10_000),
    0,
  );
  if (categoryVatSum !== input.vatTotalCents) {
    errors.push(
      `Steuerbetrag stimmt nicht: aus den Steuersaetzen ergeben sich ${money(categoryVatSum)}, angegeben ist ${money(input.vatTotalCents)}.`,
    );
  }

  if (input.netTotalCents + input.vatTotalCents !== input.grossTotalCents) {
    errors.push(
      `Bruttosumme stimmt nicht: ${money(input.netTotalCents)} + ${money(input.vatTotalCents)} ergibt nicht ${money(input.grossTotalCents)}.`,
    );
  }

  for (const line of input.lines) {
    const expected = Math.round(line.quantity * line.unit_price_cents);
    if (expected !== line.net_amount_cents) {
      errors.push(
        `Position ${line.position}: ${line.quantity} × ${money(line.unit_price_cents)} ergibt ${money(expected)}, angegeben ist ${money(line.net_amount_cents)}.`,
      );
    }
  }

  if (input.dueDate && input.issueDate && input.dueDate < input.issueDate) {
    errors.push('Das Fälligkeitsdatum liegt vor dem Rechnungsdatum.');
  }

  return errors;
}

export function renderXRechnung(input: XRechnungInput): string {
  const errors = validateXRechnung(input);
  if (errors.length) throw new Error(errors.join(' '));

  const company = input.company;
  const customer = input.customer;
  const companyCountry = countryCode(str(company, 'country'))!;
  const customerCountry = countryCode(str(customer, 'country'))!;

  const vatGroups = new Map<number, { net: number; vat: number }>();
  for (const line of input.lines) {
    const group = vatGroups.get(line.vat_rate_basis_points) ?? { net: 0, vat: 0 };
    group.net += line.net_amount_cents;
    group.vat += line.vat_amount_cents;
    vatGroups.set(line.vat_rate_basis_points, group);
  }

  const sellerTax = [
    str(company, 'vat_id')
      ? `<cac:PartyTaxScheme><cbc:CompanyID>${xml(str(company, 'vat_id'))}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
      : '',
    str(company, 'tax_number')
      ? `<cac:PartyTaxScheme><cbc:CompanyID>${xml(str(company, 'tax_number'))}</cbc:CompanyID><cac:TaxScheme><cbc:ID>FC</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`
      : '',
  ].join('');

  const taxSubtotals = [...vatGroups.entries()]
    .map(
      ([rate, group]) => `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${xml(input.currency)}">${amount(group.net)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${xml(input.currency)}">${amount(group.vat)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${pct(rate)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`,
    )
    .join('');

  const lines = input.lines
    .map(
      (line) => `
  <cac:InvoiceLine>
    <cbc:ID>${line.position}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${unitCode(line.unit)}">${Number(line.quantity).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${xml(input.currency)}">${amount(line.net_amount_cents)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${xml(line.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>${pct(line.vat_rate_basis_points)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${xml(input.currency)}">${amount(line.unit_price_cents)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${xml(input.invoiceNumber)}</cbc:ID>
  <cbc:IssueDate>${xml(input.issueDate)}</cbc:IssueDate>
  <cbc:DueDate>${xml(input.dueDate)}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${xml(input.currency)}</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>${xml(input.buyerReference)}</cbc:BuyerReference>
  <cac:InvoicePeriod>
    <cbc:StartDate>${xml(input.servicePeriodStart)}</cbc:StartDate>
    <cbc:EndDate>${xml(input.servicePeriodEnd)}</cbc:EndDate>
  </cac:InvoicePeriod>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="EM">${xml(str(company, 'email'))}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${xml(str(company, 'name'))}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${xml(str(company, 'street'))}</cbc:StreetName>
        <cbc:CityName>${xml(str(company, 'city'))}</cbc:CityName>
        <cbc:PostalZone>${xml(str(company, 'postal_code'))}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${xml(companyCountry)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${sellerTax}
      <cac:PartyLegalEntity><cbc:RegistrationName>${xml(str(company, 'name'))}</cbc:RegistrationName></cac:PartyLegalEntity>
      <!--
        BG-6 SELLER CONTACT. Fuer die XRechnung nicht optional: BR-DE-2
        verlangt die Gruppe, BR-DE-5 bis BR-DE-7 verlangen Name, Telefon und
        E-Mail darin. Ohne sie besteht das Dokument zwar das XSD-Schema, wird
        aber vom KoSIT-Validator abgelehnt — genau daran ist der erste Lauf
        dieses Dokuments gescheitert.
      -->
      <cac:Contact>
        <cbc:Name>${xml(str(company, 'name'))}</cbc:Name>
        <cbc:Telephone>${xml(str(company, 'phone'))}</cbc:Telephone>
        <cbc:ElectronicMail>${xml(str(company, 'email'))}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="EM">${xml(str(customer, 'email'))}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${xml(str(customer, 'name'))}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${xml(str(customer, 'billing_address'))}</cbc:StreetName>
        <cbc:CityName>${xml(str(customer, 'city'))}</cbc:CityName>
        <cbc:PostalZone>${xml(str(customer, 'postal_code'))}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${xml(customerCountry)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>${xml(str(customer, 'name'))}</cbc:RegistrationName></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cbc:PaymentID>${xml(input.invoiceNumber)}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${xml(str(company, 'iban'))}</cbc:ID>
      ${str(company, 'bic') ? `<cac:FinancialInstitutionBranch><cbc:ID>${xml(str(company, 'bic'))}</cbc:ID></cac:FinancialInstitutionBranch>` : ''}
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${xml(input.currency)}">${amount(input.vatTotalCents)}</cbc:TaxAmount>
    ${taxSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${xml(input.currency)}">${amount(input.netTotalCents)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${xml(input.currency)}">${amount(input.netTotalCents)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${xml(input.currency)}">${amount(input.grossTotalCents)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${xml(input.currency)}">${amount(input.grossTotalCents)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${lines}
</Invoice>`;
}

export function xrechnungFileName(invoiceNumber: string) {
  return `XRechnung-${invoiceNumber.replace(/[^A-Za-z0-9._-]/g, '_')}.xml`;
}
