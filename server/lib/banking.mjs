import { getDb, money, audit } from './db.mjs';
import { markDocumentPaid } from './docs.mjs';

/** Parse simple bank CSV: date;amount;counterparty;purpose;id */
export function importBankCsv(bankAccountId, csvText) {
  const db = getDb();
  const account = db.prepare('SELECT * FROM bank_accounts WHERE id = ?').get(bankAccountId);
  if (!account) throw new Error('Bank account not found');

  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#') && !/^booking_date|datum|date/i.test(l));

  let imported = 0;
  let skipped = 0;
  const insert = db.prepare(`
    INSERT OR IGNORE INTO bank_transactions(
      bank_account_id, booking_date, value_date, amount, currency, counterparty, purpose, external_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const line of lines) {
    const parts = splitCsv(line);
    if (parts.length < 2) {
      skipped += 1;
      continue;
    }
    const booking_date = normalizeDate(parts[0]);
    const amount = parseAmount(parts[1]);
    if (!booking_date || !Number.isFinite(amount)) {
      skipped += 1;
      continue;
    }
    const counterparty = parts[2] || null;
    const purpose = parts[3] || null;
    const external_id = parts[4] || `${booking_date}|${amount}|${counterparty || ''}|${purpose || ''}`;
    const info = insert.run(
      bankAccountId,
      booking_date,
      parts[5] || booking_date,
      amount,
      account.currency || 'EUR',
      counterparty,
      purpose,
      external_id,
    );
    if (info.changes > 0) imported += 1;
    else skipped += 1;
  }

  audit(db, 'user', 'import', 'bank_transactions', bankAccountId, `imported=${imported};skipped=${skipped}`);
  return { imported, skipped };
}

export function autoMatchBank() {
  const db = getDb();
  const openInvoices = db
    .prepare(
      `SELECT id, number, gross_total, paid_amount, contact_name
       FROM documents
       WHERE kind='invoice' AND status IN ('sent','partial','overdue')
       ORDER BY issue_date`,
    )
    .all();
  const openExpenses = db
    .prepare(
      `SELECT id, number, gross_amount, paid_amount, vendor_name, description
       FROM expenses WHERE payment_status IN ('open','partial')`,
    )
    .all();
  const txs = db
    .prepare(`SELECT * FROM bank_transactions WHERE match_status='unmatched' ORDER BY booking_date`)
    .all();

  let matched = 0;
  for (const tx of txs) {
    if (tx.amount > 0) {
      const inv = openInvoices.find((d) => {
        const open = money(d.gross_total - (d.paid_amount || 0));
        if (Math.abs(open - tx.amount) > 0.02) return false;
        const hay = `${tx.purpose || ''} ${tx.counterparty || ''}`.toLowerCase();
        return (
          hay.includes(String(d.number).toLowerCase()) ||
          (d.contact_name && hay.includes(String(d.contact_name).toLowerCase()))
        );
      });
      if (inv) {
        db.prepare(
          `UPDATE bank_transactions SET matched_document_id=?, match_status='matched' WHERE id=?`,
        ).run(inv.id, tx.id);
        markDocumentPaid(inv.id, tx.amount);
        matched += 1;
        continue;
      }
    } else if (tx.amount < 0) {
      const pay = money(Math.abs(tx.amount));
      const exp = openExpenses.find((e) => {
        const open = money(e.gross_amount - (e.paid_amount || 0));
        if (Math.abs(open - pay) > 0.02) return false;
        const hay = `${tx.purpose || ''} ${tx.counterparty || ''}`.toLowerCase();
        return (
          (e.number && hay.includes(String(e.number).toLowerCase())) ||
          (e.vendor_name && hay.includes(String(e.vendor_name).toLowerCase())) ||
          (e.description && hay.includes(String(e.description).toLowerCase()))
        );
      });
      if (exp) {
        db.prepare(
          `UPDATE bank_transactions SET matched_expense_id=?, match_status='matched' WHERE id=?`,
        ).run(exp.id, tx.id);
        const paid = money((exp.paid_amount || 0) + pay);
        const status = paid + 0.001 >= exp.gross_amount ? 'paid' : 'partial';
        db.prepare(`UPDATE expenses SET paid_amount=?, payment_status=? WHERE id=?`).run(
          paid,
          status,
          exp.id,
        );
        matched += 1;
      }
    }
  }
  audit(db, 'user', 'match', 'bank_transactions', null, `matched=${matched}`);
  return { matched };
}

function splitCsv(line) {
  // supports ; or ,
  if (line.includes(';')) return line.split(';').map((s) => s.trim().replace(/^"|"$/g, ''));
  return line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''));
}

function normalizeDate(s) {
  const t = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function parseAmount(s) {
  const t = String(s).trim().replace(/\s/g, '').replace('€', '');
  if (t.includes(',') && t.includes('.')) {
    // 1.234,56
    return Number(t.replace(/\./g, '').replace(',', '.'));
  }
  if (t.includes(',')) return Number(t.replace(',', '.'));
  return Number(t);
}
