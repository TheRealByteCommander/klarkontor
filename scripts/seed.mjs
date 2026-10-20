import { getDb, money } from '../server/lib/db.mjs';
import { saveDocument, postRevenueEntry, postExpenseEntry } from '../server/lib/docs.mjs';

const db = getDb();

db.prepare(`
  UPDATE company SET
    name = ?, street = ?, zip = ?, city = ?, country = 'DE', email = ?, vat_id = ?, iban = ?, bic = ?,
    phone = ?, tax_number = ?, electronic_address = ?, register_court = ?, register_number = ?,
    updated_at = datetime('now')
  WHERE id = 1
`).run(
  'ByteCommander Muster GmbH',
  'Innovationsweg 1',
  '50667',
  'Köln',
  'buero@example.com',
  'DE123456789',
  'DE89370400440532013000',
  'COBADEFFXXX',
  '+49 221 000000',
  '123/456/78901',
  'buero@example.com',
  'Amtsgericht Köln',
  'HRB 12345',
);

const customer = db.prepare(`
  INSERT INTO contacts(type, number, name, email, street, zip, city, country, vat_id, payment_terms_days, buyer_reference, electronic_address)
  VALUES ('customer', 'K-100', 'Stadtwerke Demo AG', 'einkauf@demo.example', 'Hauptstr. 10', '10115', 'Berlin', 'DE', 'DE998877665', 14, '04011000-1234512345-06', 'einkauf@demo.example')
`).run();

const vendor = db.prepare(`
  INSERT INTO contacts(type, number, name, email, city)
  VALUES ('vendor', 'L-20', 'Büroexpress GmbH', 'rechnung@bueroexpress.example', 'München')
`).run();

const product = db.prepare(`
  INSERT INTO products(sku, name, description, unit, net_price, tax_rate, kind)
  VALUES ('SVC-CHARGE', 'Ladeinfrastruktur-Support', 'Monatlicher Support', 'Mon', 890, 19, 'service')
`).run();

const today = new Date().toISOString().slice(0, 10);
const due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

const invoice = saveDocument({
  kind: 'invoice',
  status: 'sent',
  contact_id: Number(customer.lastInsertRowid),
  issue_date: today,
  due_date: due,
  intro: 'Vielen Dank für Ihren Auftrag.',
  footer: 'Zahlbar ohne Abzug. Es gelten unsere AGB.',
  items: [
    {
      product_id: Number(product.lastInsertRowid),
      title: 'Ladeinfrastruktur-Support',
      description: 'SLA Business',
      quantity: 1,
      unit: 'Mon',
      net_unit_price: 890,
      tax_rate: 19,
    },
  ],
});
postRevenueEntry(invoice);

const quote = saveDocument({
  kind: 'quote',
  status: 'sent',
  contact_id: Number(customer.lastInsertRowid),
  issue_date: today,
  due_date: due,
  items: [
    {
      title: 'Setup & Onboarding',
      quantity: 1,
      unit: 'Pausch',
      net_unit_price: 450,
      tax_rate: 19,
    },
  ],
});

const expInfo = db.prepare(`
  INSERT INTO expenses(contact_id, vendor_name, number, expense_date, category, description,
    net_amount, tax_rate, tax_amount, gross_amount, payment_status)
  VALUES (?, 'Büroexpress GmbH', 'BE-7781', ?, 'buero', 'Büromaterial', ?, 19, ?, ?, 'open')
`).run(
  Number(vendor.lastInsertRowid),
  today,
  money(42),
  money(42 * 0.19),
  money(42 * 1.19),
);
const expense = db.prepare('SELECT * FROM expenses WHERE id=?').get(expInfo.lastInsertRowid);
postExpenseEntry(expense);

console.log(JSON.stringify({
  invoice: invoice.number,
  quote: quote.number,
  expense_id: expense.id,
  customer_id: Number(customer.lastInsertRowid),
}, null, 2));
