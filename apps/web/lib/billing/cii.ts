import { type XRechnungInput, validateXRechnung } from '@/lib/billing/xrechnung';

/**
 * Dieselbe Rechnung in CII, nicht in UBL.
 *
 * EN 16931 erlaubt zwei Syntaxen, und das ist keine Geschmacksfrage: eine
 * XRechnung wird in Deutschland meist als UBL verschickt, ZUGFeRD und
 * Factur-X verlangen dagegen zwingend CII (UN/CEFACT CrossIndustryInvoice),
 * weil genau das in das PDF eingebettet wird. Wer ZUGFeRD will, braucht also
 * beide -- dieselben Zahlen, zwei Formate.
 *
 * Geprueft wird das hier nicht anders als UBL: mit dem Szenario
 * "EN16931 XRechnung (CII)" des KoSIT-Validators, das XSD, die
 * EN16931-Schematron-Regeln und die XRechnung-CIUS-Regeln hintereinander
 * anwendet. Eine Datei, die dort durchfaellt, faellt beim Empfaenger auch
 * durch -- darum laeuft der Validator in CI und nicht nur hier.
 *
 * Die Pflichtfelder sind dieselben wie in UBL, also wird `validateXRechnung`
 * wiederverwendet. Eine zweite Liste waere eine zweite Wahrheit, und die
 * beiden wuerden auseinanderlaufen.
 */

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

/** Stammdaten tragen deutsche Laendernamen; EN 16931 verlangt ISO 3166-1 alpha-2. */
const countryCode = (value: string | null): string => {
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
  return /^[A-Z]{2}$/.test(code) ? code : 'DE';
};

const amount = (cents: number) => (cents / 100).toFixed(2);
const pct = (basisPoints: number) => (basisPoints / 100).toFixed(2).replace(/\.00$/, '');

/** CII datiert im Format 102: YYYYMMDD, ohne Trenner. */
const day = (iso: string) => iso.slice(0, 10).replaceAll('-', '');

const quantity = (value: number) =>
  Number(value).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');

const unitCode = (unit: string) => {
  const normalized = unit.trim().toLowerCase();
  if (normalized === 'std' || normalized.startsWith('stunde')) return 'HUR';
  if (normalized === 'monat') return 'MON';
  if (normalized === 'm²' || normalized === 'm2') return 'MTK';
  if (normalized === 'einsatz') return 'E48';
  return 'C62';
};

/**
 * Die Kennung, auf die das KoSIT-Szenario greift. Ohne genau diesen Wert in
 * `GuidelineSpecifiedDocumentContextParameter` findet der Validator kein
 * Szenario und prueft das Dokument gar nicht -- es waere dann nicht "gueltig",
 * sondern ungeprueft.
 */
export const CII_GUIDELINE_ID =
  'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';

/**
 * Das Profil, das im XMP-Feld `fx:ConformanceLevel` der ZUGFeRD-Datei steht.
 *
 * Nicht "EN 16931": die oben gesetzte Kennung ist die CIUS der XRechnung 3.0,
 * also die engere deutsche Auspraegung der EN 16931. ZUGFeRD 2.x kennt dafuer
 * genau dieses Profil. Ein zu weit gefasster Wert waere eine Angabe, die das
 * Dokument nicht einhaelt -- nur umgekehrt ist es unproblematisch.
 */
export const CII_PROFILE_LABEL = 'XRECHNUNG';

export function renderInvoiceCii(input: XRechnungInput): string {
  const errors = validateXRechnung(input);
  if (errors.length) throw new Error(errors.join(' '));

  const company = input.company;
  const customer = input.customer;

  const vatGroups = new Map<number, { net: number; vat: number }>();
  for (const line of input.lines) {
    const group = vatGroups.get(line.vat_rate_basis_points) ?? { net: 0, vat: 0 };
    group.net += line.net_amount_cents;
    group.vat += line.vat_amount_cents;
    vatGroups.set(line.vat_rate_basis_points, group);
  }

  // Die Reihenfolge der Kinder ist im CII-Schema eine `sequence`, nicht eine
  // Auswahl: eine richtige Angabe an falscher Stelle laesst das Dokument am
  // XSD scheitern, bevor eine einzige Geschaeftsregel geprueft wird.
  const sellerTaxRegistrations = [
    str(company, 'vat_id')
      ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${xml(str(company, 'vat_id'))}</ram:ID></ram:SpecifiedTaxRegistration>`
      : '',
    str(company, 'tax_number')
      ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${xml(str(company, 'tax_number'))}</ram:ID></ram:SpecifiedTaxRegistration>`
      : '',
  ].join('');

  const lines = input.lines
    .map(
      (line) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${line.position}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${xml(line.description)}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${amount(line.unit_price_cents)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${unitCode(line.unit)}">${quantity(line.quantity)}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:RateApplicablePercent>${pct(line.vat_rate_basis_points)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${amount(line.net_amount_cents)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`,
    )
    .join('');

  const tradeTaxes = [...vatGroups.entries()]
    .map(
      ([rate, group]) => `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${amount(group.vat)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${amount(group.net)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>${pct(rate)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`,
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <!--
      BT-23. Die XRechnung-CIUS verlangt den Geschaeftsprozess; ohne ihn
      meldet der KoSIT-Validator "Business process MUST be provided." Im
      Schema steht dieses Element vor dem Guideline-Parameter; die
      Reihenfolge ist dort festgelegt, nicht freigestellt.
    -->
    <ram:BusinessProcessSpecifiedDocumentContextParameter>
      <ram:ID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</ram:ID>
    </ram:BusinessProcessSpecifiedDocumentContextParameter>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${CII_GUIDELINE_ID}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${xml(input.invoiceNumber)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${day(input.issueDate)}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lines}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${xml(input.buyerReference)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${xml(str(company, 'name'))}</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:TradingBusinessName>${xml(str(company, 'name'))}</ram:TradingBusinessName>
        </ram:SpecifiedLegalOrganization>
        <!--
          BG-6 SELLER CONTACT. Fuer die XRechnung nicht optional: BR-DE-2
          verlangt die Gruppe, BR-DE-5 bis BR-DE-7 Name, Telefon und E-Mail
          darin. Das gilt in CII genauso wie in UBL.
        -->
        <ram:DefinedTradeContact>
          <ram:PersonName>${xml(str(company, 'name'))}</ram:PersonName>
          <ram:TelephoneUniversalCommunication>
            <ram:CompleteNumber>${xml(str(company, 'phone'))}</ram:CompleteNumber>
          </ram:TelephoneUniversalCommunication>
          <ram:EmailURIUniversalCommunication>
            <ram:URIID>${xml(str(company, 'email'))}</ram:URIID>
          </ram:EmailURIUniversalCommunication>
        </ram:DefinedTradeContact>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${xml(str(company, 'postal_code'))}</ram:PostcodeCode>
          <ram:LineOne>${xml(str(company, 'street'))}</ram:LineOne>
          <ram:CityName>${xml(str(company, 'city'))}</ram:CityName>
          <ram:CountryID>${countryCode(str(company, 'country'))}</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${xml(str(company, 'email'))}</ram:URIID>
        </ram:URIUniversalCommunication>${sellerTaxRegistrations}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${xml(str(customer, 'name'))}</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:TradingBusinessName>${xml(str(customer, 'name'))}</ram:TradingBusinessName>
        </ram:SpecifiedLegalOrganization>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${xml(str(customer, 'postal_code'))}</ram:PostcodeCode>
          <ram:LineOne>${xml(str(customer, 'billing_address'))}</ram:LineOne>
          <ram:CityName>${xml(str(customer, 'city'))}</ram:CityName>
          <ram:CountryID>${countryCode(str(customer, 'country'))}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${str(customer, 'email') ? `<ram:URIUniversalCommunication><ram:URIID schemeID="EM">${xml(str(customer, 'email'))}</ram:URIID></ram:URIUniversalCommunication>` : ''}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${xml(input.invoiceNumber)}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>${xml(input.currency)}</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${xml(str(company, 'iban'))}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
      </ram:SpecifiedTradeSettlementPaymentMeans>${tradeTaxes}
      <ram:BillingSpecifiedPeriod>
        <ram:StartDateTime>
          <udt:DateTimeString format="102">${day(input.servicePeriodStart)}</udt:DateTimeString>
        </ram:StartDateTime>
        <ram:EndDateTime>
          <udt:DateTimeString format="102">${day(input.servicePeriodEnd)}</udt:DateTimeString>
        </ram:EndDateTime>
      </ram:BillingSpecifiedPeriod>
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${day(input.dueDate)}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${amount(input.netTotalCents)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${amount(input.netTotalCents)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${xml(input.currency)}">${amount(input.vatTotalCents)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${amount(input.grossTotalCents)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${amount(input.grossTotalCents)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}

/**
 * Der Dateiname im PDF ist bei ZUGFeRD 2.x und Factur-X festgelegt:
 * `factur-x.xml`. Ein anderer Name wird von Empfaengersoftware nicht
 * gefunden. Der Name fuer den einzelnen Download darf dagegen sprechen.
 */
export const ZUGFERD_ATTACHMENT_NAME = 'factur-x.xml';

export function ciiFileName(invoiceNumber: string) {
  return `ZUGFeRD-CII-${invoiceNumber.replace(/[^A-Za-z0-9._-]/g, '_')}.xml`;
}
