import { getDb, money, audit } from './db.mjs';

export function getCompany() {
  return getDb().prepare('SELECT * FROM company WHERE id = 1').get();
}

export function nextDocumentNumber(kind) {
  const db = getDb();
  const company = getCompany();
  const map = {
    invoice: { prefix: company.invoice_prefix, field: 'next_invoice_no' },
    quote: { prefix: company.quote_prefix, field: 'next_quote_no' },
    credit_note: { prefix: company.credit_prefix, field: 'next_credit_no' },
  };
  const conf = map[kind];
  if (!conf) throw new Error(`Unknown kind ${kind}`);
  const n = company[conf.field];
  const year = new Date().getFullYear();
  const number = `${conf.prefix}-${year}-${String(n).padStart(4, '0')}`;
  db.prepare(`UPDATE company SET ${conf.field} = ${conf.field} + 1, updated_at = datetime('now') WHERE id = 1`).run();
  return number;
}

export function calcItem(item) {
  const qty = Number(item.quantity) || 0;
  const netUnit = Number(item.net_unit_price) || 0;
  const taxRate = Number(item.tax_rate);
  const rate = Number.isFinite(taxRate) && taxRate >= 0 ? taxRate : 19;
  const net_total = money(qty * netUnit);
  const tax_total = money(net_total * (rate / 100));
  const gross_total = money(net_total + tax_total);
  return {
    ...item,
    quantity: qty,
    net_unit_price: money(netUnit),
    tax_rate: rate,
    net_total,
    tax_total,
    gross_total,
  };
}

export function calcDocumentTotals(items) {
  let net = 0;
  let tax = 0;
  let gross = 0;
  const normalized = items.map((it, i) => {
    const row = calcItem({ ...it, position: it.position || i + 1 });
    net = money(net + row.net_total);
    tax = money(tax + row.tax_total);
    gross = money(gross + row.gross_total);
    return row;
  });
  return { items: normalized, net_total: net, tax_total: tax, gross_total: gross };
}

export function loadDocument(id) {
  const db = getDb();
  const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
  if (!doc) return null;
  const items = db
    .prepare('SELECT * FROM document_items WHERE document_id = ? ORDER BY position, id')
    .all(id);
  return { ...doc, items };
}

export function saveDocument({ id, kind, status, contact_id, issue_date, due_date, service_date, notes, intro, footer, items, e_invoice_profile, buyer_reference }) {
  const db = getDb();
  const contact = contact_id
    ? db.prepare('SELECT * FROM contacts WHERE id = ?').get(contact_id)
    : null;
  const totals = calcDocumentTotals(items || []);
  if (id) {
    const existing = loadDocument(id);
    if (!existing) throw new Error('Document not found');
    db.prepare(`
      UPDATE documents SET
        status = ?, contact_id = ?, contact_name = ?, issue_date = ?, due_date = ?, service_date = ?,
        notes = ?, intro = ?, footer = ?, net_total = ?, tax_total = ?, gross_total = ?,
        e_invoice_profile = ?, buyer_reference = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      status || existing.status,
      contact_id || null,
      contact?.name || existing.contact_name || null,
      issue_date || existing.issue_date,
      due_date || null,
      service_date || null,
      notes || null,
      intro || null,
      footer || null,
      totals.net_total,
      totals.tax_total,
      totals.gross_total,
      e_invoice_profile || existing.e_invoice_profile || null,
      buyer_reference !== undefined ? buyer_reference : (existing.buyer_reference || null),
      id,
    );
    db.prepare('DELETE FROM document_items WHERE document_id = ?').run(id);
    insertItems(db, id, totals.items);
    audit(db, 'user', 'update', 'document', id, existing.number);
    return loadDocument(id);
  }

  const number = nextDocumentNumber(kind);
  const info = db.prepare(`
    INSERT INTO documents(
      kind, number, status, contact_id, contact_name, issue_date, due_date, service_date,
      notes, intro, footer, net_total, tax_total, gross_total, e_invoice_profile, buyer_reference
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    kind,
    number,
    status || 'draft',
    contact_id || null,
    contact?.name || null,
    issue_date || new Date().toISOString().slice(0, 10),
    due_date || null,
    service_date || null,
    notes || null,
    intro || null,
    footer || null,
    totals.net_total,
    totals.tax_total,
    totals.gross_total,
    e_invoice_profile || null,
    buyer_reference || contact?.buyer_reference || contact?.leitweg_id || null,
  );
  const newId = Number(info.lastInsertRowid);
  insertItems(db, newId, totals.items);
  maybePostJournalForInvoice(newId);
  audit(db, 'user', 'create', 'document', newId, number);
  return loadDocument(newId);
}

function insertItems(db, documentId, items) {
  const stmt = db.prepare(`
    INSERT INTO document_items(
      document_id, position, product_id, title, description, quantity, unit,
      net_unit_price, tax_rate, net_total, tax_total, gross_total
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const it of items) {
    stmt.run(
      documentId,
      it.position,
      it.product_id || null,
      it.title,
      it.description || null,
      it.quantity,
      it.unit || 'Stk',
      it.net_unit_price,
      it.tax_rate,
      it.net_total,
      it.tax_total,
      it.gross_total,
    );
  }
}

export function markDocumentPaid(id, amount) {
  const db = getDb();
  const doc = loadDocument(id);
  if (!doc) throw new Error('Not found');
  const paid = money((doc.paid_amount || 0) + (amount ?? doc.gross_total - (doc.paid_amount || 0)));
  let status = 'partial';
  if (paid <= 0) status = doc.status === 'draft' ? 'draft' : 'sent';
  else if (paid + 0.001 >= doc.gross_total) status = 'paid';
  db.prepare(
    `UPDATE documents SET paid_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(paid, status, id);
  audit(db, 'user', 'payment', 'document', id, `paid=${paid}`);
  return loadDocument(id);
}

function maybePostJournalForInvoice(documentId) {
  const doc = loadDocument(documentId);
  if (!doc || doc.kind !== 'invoice' || doc.status === 'draft') return;
  postRevenueEntry(doc);
}

export function postRevenueEntry(doc) {
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM journal_entries WHERE source_type = 'invoice' AND source_id = ?`)
    .get(doc.id);
  if (existing) return existing.id;

  const info = db.prepare(
    `INSERT INTO journal_entries(entry_date, memo, source_type, source_id) VALUES (?, ?, 'invoice', ?)`,
  ).run(doc.issue_date, `Rechnung ${doc.number}`, doc.id);
  const entryId = Number(info.lastInsertRowid);
  const line = db.prepare(
    `INSERT INTO journal_lines(entry_id, account_code, debit, credit, tax_rate, contact_id) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  // Debit receivables
  line.run(entryId, '1400', doc.gross_total, 0, null, doc.contact_id || null);
  // Credit revenue (split simple: all at first item rate or 19)
  const rate = doc.items[0]?.tax_rate ?? 19;
  const revAccount = rate <= 7 ? '8300' : '8400';
  line.run(entryId, revAccount, 0, doc.net_total, rate, doc.contact_id || null);
  if (doc.tax_total > 0) {
    line.run(entryId, '1776', 0, doc.tax_total, rate, null);
  }
  return entryId;
}

export function postExpenseEntry(expense) {
  const db = getDb();
  const existing = db
    .prepare(`SELECT id FROM journal_entries WHERE source_type = 'expense' AND source_id = ?`)
    .get(expense.id);
  if (existing) return existing.id;
  const info = db.prepare(
    `INSERT INTO journal_entries(entry_date, memo, source_type, source_id) VALUES (?, ?, 'expense', ?)`,
  ).run(expense.expense_date, expense.description || `Ausgabe #${expense.id}`, expense.id);
  const entryId = Number(info.lastInsertRowid);
  const line = db.prepare(
    `INSERT INTO journal_lines(entry_id, account_code, debit, credit, tax_rate, contact_id) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const expenseAccount = categoryAccount(expense.category);
  line.run(entryId, expenseAccount, expense.net_amount, 0, expense.tax_rate, expense.contact_id || null);
  if (expense.tax_amount > 0) {
    line.run(entryId, '1576', expense.tax_amount, 0, expense.tax_rate, null);
  }
  line.run(entryId, '1600', 0, expense.gross_amount, null, expense.contact_id || null);
  return entryId;
}

function categoryAccount(category) {
  const map = {
    buero: '4930',
    raum: '4200',
    weiterbildung: '4980',
    sonstiges: '4900',
  };
  return map[category] || '4900';
}

export function listOverdueInvoices(today = new Date().toISOString().slice(0, 10)) {
  return getDb()
    .prepare(
      `SELECT * FROM documents
       WHERE kind = 'invoice'
         AND status IN ('sent','partial','overdue')
         AND due_date IS NOT NULL
         AND due_date < ?
         AND paid_amount < gross_total
       ORDER BY due_date ASC`,
    )
    .all(today);
}

export function refreshOverdueStatuses() {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(
    `UPDATE documents SET status = 'overdue', updated_at = datetime('now')
     WHERE kind = 'invoice'
       AND status IN ('sent','partial')
       AND due_date IS NOT NULL AND due_date < ?
       AND paid_amount < gross_total`,
  ).run(today);
}
