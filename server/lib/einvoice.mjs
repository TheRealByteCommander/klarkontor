import { getCompany, loadDocument } from './docs.mjs';

/**
 * Minimal original XRechnung-inspired UBL subset for demo/interop experiments.
 * Not a certified PEPPOL validator substitute — structure is intentionally simple
 * and documented as best-effort export for German B2B e-invoicing workflows.
 */
export function buildXRechnungXml(documentId) {
  const doc = loadDocument(documentId);
  if (!doc) throw new Error('Document not found');
  if (doc.kind !== 'invoice' && doc.kind !== 'credit_note') {
    throw new Error('E-Invoice only for invoice/credit_note');
  }
  const company = getCompany();
  const issue = doc.issue_date;
  const due = doc.due_date || doc.issue_date;
  const typeCode = doc.kind === 'credit_note' ? '381' : '380';
  const lines = doc.items
    .map(
      (it, idx) => `
    <cac:InvoiceLine>
      <cbc:ID>${idx + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="C62">${esc(it.quantity)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${esc(doc.currency)}">${esc(it.net_total)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Name>${esc(it.title)}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>${esc(it.tax_rate)}</cbc:Percent>
          <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${esc(doc.currency)}">${esc(it.net_unit_price)}</cbc:PriceAmount>
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
  <cbc:ID>${esc(doc.number)}</cbc:ID>
  <cbc:IssueDate>${esc(issue)}</cbc:IssueDate>
  <cbc:DueDate>${esc(due)}</cbc:DueDate>
  <cbc:InvoiceTypeCode>${typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${esc(doc.currency)}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc(company.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${esc(company.street || '')}</cbc:StreetName>
        <cbc:CityName>${esc(company.city || '')}</cbc:CityName>
        <cbc:PostalZone>${esc(company.zip || '')}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${esc(company.country || 'DE')}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(company.vat_id || '')}</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:Contact>
        <cbc:ElectronicMail>${esc(company.email || '')}</cbc:ElectronicMail>
      </cac:Contact>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${esc(doc.contact_name || 'Kunde')}</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cac:PayeeFinancialAccount>
      <cbc:ID>${esc(company.iban || '')}</cbc:ID>
      <cac:FinancialInstitutionBranch>
        <cbc:ID>${esc(company.bic || '')}</cbc:ID>
      </cac:FinancialInstitutionBranch>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${esc(doc.currency)}">${esc(doc.tax_total)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${esc(doc.currency)}">${esc(doc.net_total)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${esc(doc.currency)}">${esc(doc.net_total)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${esc(doc.currency)}">${esc(doc.gross_total)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${esc(doc.currency)}">${esc(moneyLeft(doc))}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${lines}
</Invoice>
`;
}

function moneyLeft(doc) {
  return Math.round((doc.gross_total - (doc.paid_amount || 0)) * 100) / 100;
}

function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
