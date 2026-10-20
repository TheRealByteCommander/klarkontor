import {
  amt,
  escXml as esc,
  facturXConformance,
  guidelineIdForProfile,
  isXRechnung,
  projectEInvoice,
} from './projection.mjs';

/**
 * UN/CEFACT Cross Industry Invoice (CII) for:
 * - XRechnung CII
 * - ZUGFeRD / Factur-X (embedded XML)
 */
export function buildCiiXml(documentId, opts = {}) {
  const inv = projectEInvoice(documentId, {
    profile: opts.profile || 'xrechnung-cii',
  });
  return renderCii(inv);
}

export function renderCii(inv) {
  const guideline = guidelineIdForProfile(inv.profile);
  const sellerTaxId = inv.seller.vatId || inv.seller.taxNumber;
  const sellerScheme = inv.seller.vatId ? 'VA' : 'FC';

  const taxXml = inv.taxBreakdown
    .map(
      (t) => `
        <ram:ApplicableTradeTax>
          <ram:CalculatedAmount>${amt(t.tax)}</ram:CalculatedAmount>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:BasisAmount>${amt(t.taxable)}</ram:BasisAmount>
          <ram:CategoryCode>${esc(t.category)}</ram:CategoryCode>
          <ram:RateApplicablePercent>${amt(t.rate)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>`,
    )
    .join('');

  const lines = inv.lines
    .map(
      (line) => `
      <ram:IncludedSupplyChainTradeLineItem>
        <ram:AssociatedDocumentLineDocument>
          <ram:LineID>${esc(line.id)}</ram:LineID>
        </ram:AssociatedDocumentLineDocument>
        <ram:SpecifiedTradeProduct>
          <ram:Name>${esc(line.name)}</ram:Name>
          ${line.description ? `<ram:Description>${esc(line.description)}</ram:Description>` : ''}
        </ram:SpecifiedTradeProduct>
        <ram:SpecifiedLineTradeAgreement>
          <ram:NetPriceProductTradePrice>
            <ram:ChargeAmount>${amt(line.netUnitPrice)}</ram:ChargeAmount>
          </ram:NetPriceProductTradePrice>
        </ram:SpecifiedLineTradeAgreement>
        <ram:SpecifiedLineTradeDelivery>
          <ram:BilledQuantity unitCode="${esc(line.unitCode)}">${amt(line.quantity)}</ram:BilledQuantity>
        </ram:SpecifiedLineTradeDelivery>
        <ram:SpecifiedLineTradeSettlement>
          <ram:ApplicableTradeTax>
            <ram:TypeCode>VAT</ram:TypeCode>
            <ram:CategoryCode>${esc(line.taxCategory)}</ram:CategoryCode>
            <ram:RateApplicablePercent>${amt(line.taxRate)}</ram:RateApplicablePercent>
          </ram:ApplicableTradeTax>
          <ram:SpecifiedTradeSettlementLineMonetarySummation>
            <ram:LineTotalAmount>${amt(line.netTotal)}</ram:LineTotalAmount>
          </ram:SpecifiedTradeSettlementLineMonetarySummation>
        </ram:SpecifiedLineTradeSettlement>
      </ram:IncludedSupplyChainTradeLineItem>`,
    )
    .join('');

  const buyerRef = inv.buyer.buyerReference || (isXRechnung(inv.profile) ? inv.buyer.name : null);
  const buyerRefXml = buyerRef
    ? `\n        <ram:BuyerReference>${esc(buyerRef)}</ram:BuyerReference>`
    : '';

  const dueXml = inv.dueDate
    ? `
          <ram:SpecifiedTradePaymentTerms>
            <ram:Description>${esc(inv.paymentTermsNote || `Fällig ${inv.dueDate}`)}</ram:Description>
            <ram:DueDateDateTime>
              <udt:DateTimeString format="102">${esc(inv.dueDate.replaceAll('-', ''))}</udt:DateTimeString>
            </ram:DueDateDateTime>
          </ram:SpecifiedTradePaymentTerms>`
    : '';

  const serviceXml = inv.serviceDate
    ? `
        <ram:ActualDeliverySupplyChainEvent>
          <ram:OccurrenceDateTime>
            <udt:DateTimeString format="102">${esc(inv.serviceDate.replaceAll('-', ''))}</udt:DateTimeString>
          </ram:OccurrenceDateTime>
        </ram:ActualDeliverySupplyChainEvent>`
    : '';

  const noteXml = inv.notes
    ? `
    <ram:IncludedNote>
      <ram:Content>${esc(inv.notes)}</ram:Content>
    </ram:IncludedNote>`
    : '';

  const buyerTax = inv.buyer.vatId
    ? `
          <ram:SpecifiedTaxRegistration>
            <ram:ID schemeID="VA">${esc(inv.buyer.vatId)}</ram:ID>
          </ram:SpecifiedTaxRegistration>`
    : '';

  const prepaidXml =
    inv.prepaid > 0
      ? `\n          <ram:TotalPrepaidAmount>${amt(inv.prepaid)}</ram:TotalPrepaidAmount>`
      : '';

  // Business process: for XRechnung often "urn:fdc:peppol.eu:2017:poacc:billing:01:1.0"
  const businessProcess = isXRechnung(inv.profile)
    ? 'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0'
    : 'A1';

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100"
  xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:BusinessProcessSpecifiedDocumentContextParameter>
      <ram:ID>${esc(businessProcess)}</ram:ID>
    </ram:BusinessProcessSpecifiedDocumentContextParameter>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>${esc(guideline)}</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(inv.number)}</ram:ID>
    <ram:TypeCode>${esc(inv.typeCode)}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${esc(inv.issueDate.replaceAll('-', ''))}</udt:DateTimeString>
    </ram:IssueDateTime>${noteXml}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lines}
    <ram:ApplicableHeaderTradeAgreement>${buyerRefXml}
      <ram:SellerTradeParty>
        <ram:Name>${esc(inv.seller.name)}</ram:Name>
        <ram:DefinedTradeContact>
          ${inv.seller.phone ? `<ram:TelephoneUniversalCommunication><ram:CompleteNumber>${esc(inv.seller.phone)}</ram:CompleteNumber></ram:TelephoneUniversalCommunication>` : ''}
          ${inv.seller.email ? `<ram:EmailURIUniversalCommunication><ram:URIID>${esc(inv.seller.email)}</ram:URIID></ram:EmailURIUniversalCommunication>` : ''}
        </ram:DefinedTradeContact>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(inv.seller.zip)}</ram:PostcodeCode>
          <ram:LineOne>${esc(inv.seller.street)}</ram:LineOne>
          <ram:CityName>${esc(inv.seller.city)}</ram:CityName>
          <ram:CountryID>${esc(inv.seller.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="${esc(inv.seller.electronicScheme)}">${esc(inv.seller.electronicAddress || inv.seller.email || 'seller@example.invalid')}</ram:URIID>
        </ram:URIUniversalCommunication>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="${esc(sellerScheme)}">${esc(sellerTaxId)}</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(inv.buyer.name)}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(inv.buyer.zip)}</ram:PostcodeCode>
          <ram:LineOne>${esc(inv.buyer.street)}</ram:LineOne>
          <ram:CityName>${esc(inv.buyer.city)}</ram:CityName>
          <ram:CountryID>${esc(inv.buyer.country)}</ram:CountryID>
        </ram:PostalTradeAddress>
        <ram:URIUniversalCommunication>
          <ram:URIID schemeID="${esc(inv.buyer.electronicScheme)}">${esc(inv.buyer.electronicAddress || inv.buyer.email || 'buyer@example.invalid')}</ram:URIID>
        </ram:URIUniversalCommunication>${buyerTax}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>${serviceXml}
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>${esc(inv.currency)}</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>${esc(inv.paymentMeansCode)}</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${esc(inv.seller.iban)}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
        ${inv.seller.bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution><ram:BICID>${esc(inv.seller.bic)}</ram:BICID></ram:PayeeSpecifiedCreditorFinancialInstitution>` : ''}
      </ram:SpecifiedTradeSettlementPaymentMeans>${taxXml}${dueXml}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${amt(inv.netTotal)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${amt(inv.netTotal)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="${esc(inv.currency)}">${amt(inv.taxTotal)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${amt(inv.grossTotal)}</ram:GrandTotalAmount>${prepaidXml}
        <ram:DuePayableAmount>${amt(inv.payable)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}

export function ciiXmlFileName(profile) {
  // Factur-X / ZUGFeRD convention
  if (String(profile).startsWith('zugferd') || String(profile).startsWith('factur')) {
    return 'factur-x.xml';
  }
  return 'xrechnung-cii.xml';
}

export { facturXConformance };
