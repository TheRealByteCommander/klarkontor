import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(root, 'data', 'test-einvoice.sqlite');
for (const p of [dbPath, dbPath + '-wal', dbPath + '-shm']) {
  try {
    fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}
process.env.KLARKONTOR_DB = dbPath;

const { getDb } = await import('../server/lib/db.mjs');
const { saveDocument } = await import('../server/lib/docs.mjs');
const {
  exportEInvoice,
  buildUblXml,
  buildCiiXml,
  listEInvoiceProfiles,
  uneceUnitCode,
} = await import('../server/lib/einvoice/index.mjs').then(async (m) => ({
  ...m,
  uneceUnitCode: (await import('../server/lib/einvoice/units.mjs')).uneceUnitCode,
}));

getDb();

// Seller with full e-invoice stammdaten
getDb()
  .prepare(
    `UPDATE company SET name=?, street=?, zip=?, city=?, country='DE', email=?, vat_id=?, iban=?, bic=?,
     tax_number=?, electronic_address=?, phone=? WHERE id=1`,
  )
  .run(
    'KlarKontor Test GmbH',
    'Testweg 1',
    '50667',
    'Köln',
    'finance@klarkontor.test',
    'DE123456789',
    'DE89370400440532013000',
    'COBADEFFXXX',
    '123/456/78901',
    'finance@klarkontor.test',
    '+492211234',
  );

const contact = getDb()
  .prepare(
    `INSERT INTO contacts(type, name, email, street, zip, city, country, vat_id, buyer_reference, electronic_address)
     VALUES ('customer', 'Käufer AG', 'buyer@example.test', 'Kaufstr. 2', '10115', 'Berlin', 'DE', 'DE998877665', '04011000-1234512345-06', 'buyer@example.test')`,
  )
  .run();

const invoice = saveDocument({
  kind: 'invoice',
  status: 'sent',
  contact_id: Number(contact.lastInsertRowid),
  issue_date: '2026-10-20',
  due_date: '2026-11-03',
  service_date: '2026-10-19',
  intro: 'Leistungszeitraum Oktober',
  items: [
    {
      title: 'Support Pauschale',
      description: 'SLA',
      quantity: 1,
      unit: 'Mon',
      net_unit_price: 100,
      tax_rate: 19,
    },
    {
      title: 'Beratung',
      quantity: 2,
      unit: 'Std',
      net_unit_price: 90,
      tax_rate: 19,
    },
  ],
});

test('UNECE unit mapping', () => {
  assert.equal(uneceUnitCode('Std'), 'HUR');
  assert.equal(uneceUnitCode('Mon'), 'MON');
  assert.equal(uneceUnitCode('Stk'), 'C62');
  assert.equal(uneceUnitCode('kWh'), 'KWH');
});

test('profiles list includes XRechnung + ZUGFeRD', () => {
  const ids = listEInvoiceProfiles().map((p) => p.id);
  assert.ok(ids.includes('xrechnung-ubl'));
  assert.ok(ids.includes('xrechnung-cii'));
  assert.ok(ids.includes('zugferd-en16931'));
  assert.ok(ids.includes('zugferd-basic'));
});

test('XRechnung UBL contains EN16931 customization and tax subtotals', () => {
  const xml = buildUblXml(invoice.id);
  assert.match(xml, /CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0/);
  assert.match(xml, /<cbc:ID>RE-2026-/);
  assert.match(xml, /BuyerReference>04011000-1234512345-06/);
  assert.match(xml, /TaxSubtotal/);
  assert.match(xml, /PaymentMeansCode>58/);
  assert.match(xml, /unitCode="MON"/);
  assert.match(xml, /unitCode="HUR"/);
  assert.match(xml, /LineExtensionAmount[^>]*>280.00/);
  assert.match(xml, /TaxAmount[^>]*>53.20/);
  assert.match(xml, /PayableAmount[^>]*>333.20/);
  assert.ok(!xml.includes('undefined'));
});

test('XRechnung CII is CrossIndustryInvoice with guideline', () => {
  const xml = buildCiiXml(invoice.id, { profile: 'xrechnung-cii' });
  assert.match(xml, /CrossIndustryInvoice/);
  assert.match(xml, /xeinkauf.de:kosit:xrechnung_3.0/);
  assert.match(xml, /BuyerReference>04011000-1234512345-06/);
  assert.match(xml, /IBANID>DE89370400440532013000/);
  assert.match(xml, /GrandTotalAmount>333.20/);
  assert.match(xml, /DuePayableAmount>333.20/);
});

test('ZUGFeRD PDF embeds factur-x.xml', async () => {
  const exp = await exportEInvoice(invoice.id, 'zugferd-en16931');
  assert.equal(exp.kind, 'pdf');
  assert.equal(exp.contentType, 'application/pdf');
  assert.ok(Buffer.isBuffer(exp.body));
  assert.ok(exp.body.length > 500);
  // PDF header
  assert.equal(exp.body.subarray(0, 5).toString('latin1'), '%PDF-');
  // Embedded XML marker / filename often appears as plain text in PDF body
  const asText = exp.body.toString('latin1');
  assert.ok(asText.includes('factur-x.xml') || asText.includes('CrossIndustryInvoice'));
});

test('Factur-X BASIC profile exports PDF', async () => {
  const exp = await exportEInvoice(invoice.id, 'zugferd-basic');
  assert.equal(exp.profile, 'zugferd-basic');
  assert.equal(exp.kind, 'pdf');
  assert.ok(exp.body.length > 500);
});

test('export rejects incomplete seller (no IBAN)', async () => {
  getDb().prepare(`UPDATE company SET iban = NULL WHERE id = 1`).run();
  await assert.rejects(() => exportEInvoice(invoice.id, 'xrechnung-ubl'), /IBAN/);
  getDb().prepare(`UPDATE company SET iban = ? WHERE id = 1`).run('DE89370400440532013000');
});

test('credit note type code 381', () => {
  const cn = saveDocument({
    kind: 'credit_note',
    status: 'sent',
    contact_id: Number(contact.lastInsertRowid),
    issue_date: '2026-10-20',
    items: [{ title: 'Gutschrift Pos', quantity: 1, unit: 'Stk', net_unit_price: 10, tax_rate: 19 }],
  });
  const xml = buildUblXml(cn.id);
  assert.match(xml, /InvoiceTypeCode>381</);
});
