import { getCompany, loadDocument } from '../docs.mjs';
import { getDb, money } from '../db.mjs';
import { taxCategoryCode, uneceUnitCode } from './units.mjs';

/**
 * Canonical EN 16931–oriented invoice projection shared by UBL / CII / ZUGFeRD.
 * @param {number} documentId
 * @param {{ profile?: string }} [opts]
 */
export function projectEInvoice(documentId, opts = {}) {
  const doc = loadDocument(documentId);
  if (!doc) throw new Error('Document not found');
  if (doc.kind !== 'invoice' && doc.kind !== 'credit_note') {
    throw new Error('E-invoice only for invoice/credit_note');
  }
  if (!doc.items?.length) throw new Error('E-invoice requires at least one line item');

  const company = getCompany();
  const contact = doc.contact_id
    ? getDb().prepare('SELECT * FROM contacts WHERE id = ?').get(doc.contact_id)
    : null;

  const profile = normalizeProfile(opts.profile || doc.e_invoice_profile || 'xrechnung-ubl');
  const currency = doc.currency || company.currency || 'EUR';
  const typeCode = doc.kind === 'credit_note' ? '381' : '380';

  const seller = {
    name: required(company.name, 'Firmenname (Verkäufer)'),
    tradingName: company.name,
    street: required(company.street, 'Straße Straße'),
    zip: required(company.zip, 'Firma PLZ'),
    city: required(company.city, 'Firma Ort'),
    country: (company.country || 'DE').toUpperCase(),
    email: company.email || null,
    phone: company.phone || null,
    vatId: cleanVat(company.vat_id),
    taxNumber: company.tax_number || null,
    iban: cleanIban(company.iban),
    bic: company.bic || null,
    bankName: company.bank_name || null,
    electronicAddress: company.email || company.electronic_address || null,
    electronicScheme: company.electronic_scheme || 'EM',
    registerCourt: company.register_court || null,
    registerNumber: company.register_number || null,
  };

  if (!seller.vatId && !seller.taxNumber) {
    throw new Error('Firma braucht USt-IdNr. oder Steuernummer für E-Rechnung');
  }
  if (!seller.iban) {
    throw new Error('Firma braucht IBAN (PaymentMeans / BT-84) für E-Rechnung');
  }

  const buyerName = contact?.name || doc.contact_name;
  const buyer = {
    name: required(buyerName, 'Kundenname'),
    street: contact?.street || null,
    zip: contact?.zip || null,
    city: contact?.city || null,
    country: (contact?.country || 'DE').toUpperCase(),
    email: contact?.email || null,
    vatId: cleanVat(contact?.vat_id),
    buyerReference:
      doc.buyer_reference ||
      contact?.buyer_reference ||
      contact?.leitweg_id ||
      null,
    electronicAddress: contact?.email || contact?.electronic_address || null,
    electronicScheme: contact?.electronic_scheme || 'EM',
  };

  // XRechnung requires full postal address for buyer (BG-8).
  if (isXRechnung(profile)) {
    buyer.street = required(buyer.street, 'Kunde Straße (für XRechnung)');
    buyer.zip = required(buyer.zip, 'Kunde PLZ (für XRechnung)');
    buyer.city = required(buyer.city, 'Kunde Ort (für XRechnung)');
  } else {
    buyer.street = buyer.street || '—';
    buyer.zip = buyer.zip || '00000';
    buyer.city = buyer.city || 'Unbekannt';
  }

  const lines = doc.items.map((it, idx) => {
    const rate = Number(it.tax_rate);
    const taxRate = Number.isFinite(rate) && rate >= 0 ? rate : 19;
    return {
      id: String(it.position || idx + 1),
      name: required(it.title, `Position ${idx + 1} Titel`),
      description: it.description || null,
      quantity: money(it.quantity),
      unitCode: uneceUnitCode(it.unit),
      unitLabel: it.unit || 'Stk',
      netUnitPrice: money(it.net_unit_price),
      netTotal: money(it.net_total),
      taxTotal: money(it.tax_total),
      grossTotal: money(it.gross_total),
      taxRate,
      taxCategory: taxCategoryCode(taxRate),
    };
  });

  /** @type {Map<string, { category: string, rate: number, taxable: number, tax: number }>} */
  const taxMap = new Map();
  for (const line of lines) {
    const key = `${line.taxCategory}:${line.taxRate}`;
    const cur = taxMap.get(key) || {
      category: line.taxCategory,
      rate: line.taxRate,
      taxable: 0,
      tax: 0,
    };
    cur.taxable = money(cur.taxable + line.netTotal);
    cur.tax = money(cur.tax + line.taxTotal);
    taxMap.set(key, cur);
  }
  const taxBreakdown = [...taxMap.values()];

  const netTotal = money(doc.net_total);
  const taxTotal = money(doc.tax_total);
  const grossTotal = money(doc.gross_total);
  const paid = money(doc.paid_amount || 0);
  const payable = money(Math.max(0, grossTotal - paid));

  const issueDate = required(doc.issue_date, 'Rechnungsdatum');
  const dueDate = doc.due_date || null;
  const serviceDate = doc.service_date || null;

  const notes = [doc.intro, doc.notes, doc.footer].filter(Boolean).join('\n\n') || null;

  return {
    profile,
    documentId: doc.id,
    number: doc.number,
    kind: doc.kind,
    typeCode,
    currency,
    issueDate,
    dueDate,
    serviceDate,
    seller,
    buyer,
    lines,
    taxBreakdown,
    netTotal,
    taxTotal,
    grossTotal,
    paid,
    payable,
    prepaid: paid > 0 ? paid : 0,
    notes,
    paymentMeansCode: '58', // SEPA credit transfer
    paymentTermsNote: dueDate ? `Zahlbar bis ${dueDate}` : null,
  };
}

export function listEInvoiceProfiles() {
  return [
    { id: 'xrechnung-ubl', label: 'XRechnung 3.0 (UBL)', kind: 'xml' },
    { id: 'xrechnung-cii', label: 'XRechnung 3.0 (CII)', kind: 'xml' },
    { id: 'zugferd-en16931', label: 'ZUGFeRD / Factur-X EN 16931 (PDF)', kind: 'pdf' },
    { id: 'zugferd-basic', label: 'ZUGFeRD / Factur-X BASIC (PDF)', kind: 'pdf' },
    { id: 'factur-x-en16931', label: 'Factur-X EN 16931 (PDF)', kind: 'pdf' },
  ];
}

export function normalizeProfile(raw) {
  const p = String(raw || 'xrechnung-ubl').toLowerCase().trim();
  if (p === 'xrechnung' || p === 'xr' || p === 'ubl') return 'xrechnung-ubl';
  if (p === 'xrechnung-cii' || p === 'cii-xr' || p === 'xr-cii') return 'xrechnung-cii';
  if (p === 'zugferd' || p === 'zugferd-en16931' || p === 'en16931') return 'zugferd-en16931';
  if (p === 'zugferd-basic' || p === 'basic') return 'zugferd-basic';
  if (p === 'factur-x' || p === 'facturx' || p === 'factur-x-en16931') return 'factur-x-en16931';
  if (
    p === 'xrechnung-ubl' ||
    p === 'xrechnung-cii' ||
    p === 'zugferd-en16931' ||
    p === 'zugferd-basic' ||
    p === 'factur-x-en16931'
  ) {
    return p;
  }
  throw new Error(`Unknown e-invoice profile: ${raw}`);
}

export function isXRechnung(profile) {
  return profile === 'xrechnung-ubl' || profile === 'xrechnung-cii';
}

export function isZugferd(profile) {
  return (
    profile === 'zugferd-en16931' ||
    profile === 'zugferd-basic' ||
    profile === 'factur-x-en16931'
  );
}

export function guidelineIdForProfile(profile) {
  switch (normalizeProfile(profile)) {
    case 'xrechnung-ubl':
    case 'xrechnung-cii':
      return 'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';
    case 'zugferd-basic':
      return 'urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic';
    case 'zugferd-en16931':
    case 'factur-x-en16931':
    default:
      return 'urn:cen.eu:en16931:2017#conformant#urn:factur-x.eu:1p0:en16931';
  }
}

export function facturXConformance(profile) {
  const p = normalizeProfile(profile);
  if (p === 'zugferd-basic') return 'BASIC';
  return 'EN 16931';
}

function required(v, label) {
  const s = v == null ? '' : String(v).trim();
  if (!s) throw new Error(`E-Rechnung: Pflichtfeld fehlt — ${label}`);
  return s;
}

function cleanVat(v) {
  if (!v) return null;
  return String(v).replaceAll(/\s+/g, '').toUpperCase();
}

function cleanIban(v) {
  if (!v) return null;
  return String(v).replaceAll(/\s+/g, '').toUpperCase();
}

/** Format money for XML (dot decimal, 2 places). */
export function amt(n) {
  return money(n).toFixed(2);
}

export function escXml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
