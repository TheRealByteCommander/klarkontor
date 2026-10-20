import {
  amt,
  escXml as esc,
  guidelineIdForProfile,
  projectEInvoice,
} from './projection.mjs';

/** XRechnung 3.x UBL Invoice (EN 16931). */
export function buildUblXml(documentId, opts = {}) {
  const inv = projectEInvoice(documentId, {
    profile: opts.profile || 'xrechnung-ubl',
  });
  return renderUbl(inv);
}

export function renderUbl(inv) {
  const guideline = guidelineIdForProfile('xrechnung-ubl');
  const sellerTaxId = inv.seller.vatId || inv.seller.taxNumber;
  const sellerTaxScheme = inv.seller.vatId ? 'VAT' : 'FC';

  const taxSubtotals = inv.taxBreakdown
    .map(
      (t) => `
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${esc(inv.currency)}">${amt(t.taxable)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${esc(inv.currency)}">${amt(t.tax)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${esc(t.category)}</cbc:ID>
        <cbc:Percent>${amt(t.rate)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`,
    )
    .join('');

  const lines = inv.lines
    .map(
      (line) => `
  <cac:InvoiceLine>
    <cbc:ID>${esc(line.id)}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${esc(line.unitCode)}">${amt(line.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${esc(inv.currency)}">${amt(line.netTotal)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Description>${esc(line.description || line.name)}</cbc:Description>
      <cbc:Name>${esc(line.name)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${esc(line.taxCategory)}</cbc:ID>
        <cbc:Percent>${amt(line.taxRate)}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${esc(inv.currency)}">${amt(line.netUnitPrice)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`,
    )
    .join('');

  const buyerRef = inv.buyer.buyerReference
    ? `\n  <cbc:BuyerReference>${esc(inv.buyer.buyerReference)}</cbc:BuyerReference>`
    : `\n  <cbc:BuyerReference>${esc(inv.buyer.name)}</cbc:BuyerReference>`;

  const due = inv.dueDate ? `\n  <cbc:DueDate>${esc(inv.dueDate)}</cbc:DueDate>` : '';
  const note = inv.notes ? `\n  <cbc:Note>${esc(inv.notes)}</cbc:Note>` : '';
  const period = inv.serviceDate
    ? `
  <cac:InvoicePeriod>
    <cbc:StartDate>${esc(inv.serviceDate)}</cbc:StartDate>
    <cbc:EndDate>${esc(inv.serviceDate)}</cbc:EndDate>
  </cac:InvoicePeriod>`
    : '';

  const buyerVat = inv.buyer.vatId
    ? `
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(inv.buyer.vatId)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>`
    : '';

  const paymentTerms = inv.paymentTermsNote
    ? `
  <cac:PaymentTerms>
    <cbc:Note>${esc(inv.paymentTermsNote)}</cbc:Note>
  </cac:PaymentTerms>`
    : '';

  const prepaid =
    inv.prepaid > 0
      ? `\n    <cbc:PrepaidAmount currencyID="${esc(inv.currency)}">${amt(inv.prepaid)}</cbc:PrepaidAmount>`
      : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>${esc(guideline)}</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(inv.number)}</cbc:ID>
  <cbc:IssueDate>${esc(inv.issueDate)}</cbc:IssueDate>${due}
  <cbc:InvoiceTypeCode>${esc(inv.typeCode)}</cbc:InvoiceTypeCode>${note}
  <cbc:DocumentCurrencyCode>${esc(inv.currency)}</cbc:DocumentCurrencyCode>${buyerRef}${period}
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="${esc(inv.seller.electronicScheme)}">${esc(inv.seller.electronicAddress || inv.seller.email || 'seller@example.invalid')}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${esc(inv.seller.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(inv.seller.street)}</cbc:StreetName>
        <cbc:CityName>${esc(inv.seller.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(inv.seller.zip)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${esc(inv.seller.country)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(sellerTaxId)}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>${esc(sellerTaxScheme)}</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(inv.seller.name)}</cbc:RegistrationName>
        ${inv.seller.registerNumber ? `<cbc:CompanyID>${esc(inv.seller.registerNumber)}</cbc:CompanyID>` : ''}
      </cac:PartyLegalEntity>
      <cac:Contact>
        ${inv.seller.email ? `<cbc:ElectronicMail>${esc(inv.seller.email)}</cbc:ElectronicMail>` : ''}
        ${inv.seller.phone ? `<cbc:Telephone>${esc(inv.seller.phone)}</cbc:Telephone>` : ''}
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="${esc(inv.buyer.electronicScheme)}">${esc(inv.buyer.electronicAddress || inv.buyer.email || 'buyer@example.invalid')}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${esc(inv.buyer.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(inv.buyer.street)}</cbc:StreetName>
        <cbc:CityName>${esc(inv.buyer.city)}</cbc:CityName>
        <cbc:PostalZone>${esc(inv.buyer.zip)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${esc(inv.buyer.country)}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>${buyerVat}
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(inv.buyer.name)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>${esc(inv.paymentMeansCode)}</cbc:PaymentMeansCode>
    ${inv.dueDate ? `<cbc:PaymentDueDate>${esc(inv.dueDate)}</cbc:PaymentDueDate>` : ''}
    <cac:PayeeFinancialAccount>
      <cbc:ID>${esc(inv.seller.iban)}</cbc:ID>
      ${inv.seller.bic ? `<cac:FinancialInstitutionBranch><cbc:ID>${esc(inv.seller.bic)}</cbc:ID></cac:FinancialInstitutionBranch>` : ''}
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>${paymentTerms}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${esc(inv.currency)}">${amt(inv.taxTotal)}</cbc:TaxAmount>${taxSubtotals}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${esc(inv.currency)}">${amt(inv.netTotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${esc(inv.currency)}">${amt(inv.netTotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${esc(inv.currency)}">${amt(inv.grossTotal)}</cbc:TaxInclusiveAmount>${prepaid}
    <cbc:PayableAmount currencyID="${esc(inv.currency)}">${amt(inv.payable)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lines}
</Invoice>
`;
}
