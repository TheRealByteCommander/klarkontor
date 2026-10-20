import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const dataDir = process.env.KLARKONTOR_DATA || path.join(root, 'data');
const dbPath = process.env.KLARKONTOR_DB || path.join(dataDir, 'klarkontor.sqlite');

fs.mkdirSync(dataDir, { recursive: true });

/** @type {DatabaseSync | null} */
let db;

export function getDb() {
  if (!db) {
    db = new DatabaseSync(dbPath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    migrate(db);
  }
  return db;
}

export function dbPathInfo() {
  return { dataDir, dbPath };
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL DEFAULT 'Meine Firma',
      legal_form TEXT,
      street TEXT,
      zip TEXT,
      city TEXT,
      country TEXT DEFAULT 'DE',
      email TEXT,
      phone TEXT,
      vat_id TEXT,
      tax_number TEXT,
      iban TEXT,
      bic TEXT,
      bank_name TEXT,
      default_tax_rate REAL NOT NULL DEFAULT 19,
      invoice_prefix TEXT NOT NULL DEFAULT 'RE',
      quote_prefix TEXT NOT NULL DEFAULT 'AN',
      credit_prefix TEXT NOT NULL DEFAULT 'GS',
      next_invoice_no INTEGER NOT NULL DEFAULT 1,
      next_quote_no INTEGER NOT NULL DEFAULT 1,
      next_credit_no INTEGER NOT NULL DEFAULT 1,
      fiscal_year_start TEXT NOT NULL DEFAULT '01-01',
      currency TEXT NOT NULL DEFAULT 'EUR',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('customer','vendor','both')),
      number TEXT,
      name TEXT NOT NULL,
      company_name TEXT,
      email TEXT,
      phone TEXT,
      street TEXT,
      zip TEXT,
      city TEXT,
      country TEXT DEFAULT 'DE',
      vat_id TEXT,
      payment_terms_days INTEGER NOT NULL DEFAULT 14,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT,
      name TEXT NOT NULL,
      description TEXT,
      unit TEXT NOT NULL DEFAULT 'Stk',
      net_price REAL NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 19,
      kind TEXT NOT NULL DEFAULT 'service' CHECK (kind IN ('service','product')),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK (kind IN ('quote','invoice','credit_note')),
      number TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft','sent','paid','partial','overdue','cancelled','accepted','rejected')),
      contact_id INTEGER REFERENCES contacts(id),
      contact_name TEXT,
      issue_date TEXT NOT NULL,
      due_date TEXT,
      service_date TEXT,
      currency TEXT NOT NULL DEFAULT 'EUR',
      net_total REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      gross_total REAL NOT NULL DEFAULT 0,
      notes TEXT,
      intro TEXT,
      footer TEXT,
      recurring_cron TEXT,
      parent_document_id INTEGER REFERENCES documents(id),
      paid_amount REAL NOT NULL DEFAULT 0,
      e_invoice_profile TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS document_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 1,
      product_id INTEGER REFERENCES products(id),
      title TEXT NOT NULL,
      description TEXT,
      quantity REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT 'Stk',
      net_unit_price REAL NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 19,
      net_total REAL NOT NULL DEFAULT 0,
      tax_total REAL NOT NULL DEFAULT 0,
      gross_total REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER REFERENCES contacts(id),
      vendor_name TEXT,
      number TEXT,
      expense_date TEXT NOT NULL,
      due_date TEXT,
      category TEXT NOT NULL DEFAULT 'sonstiges',
      description TEXT,
      net_amount REAL NOT NULL DEFAULT 0,
      tax_rate REAL NOT NULL DEFAULT 19,
      tax_amount REAL NOT NULL DEFAULT 0,
      gross_amount REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'open' CHECK (payment_status IN ('open','paid','partial')),
      paid_amount REAL NOT NULL DEFAULT 0,
      receipt_path TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS bank_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      iban TEXT,
      bic TEXT,
      currency TEXT NOT NULL DEFAULT 'EUR',
      opening_balance REAL NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS bank_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_account_id INTEGER NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
      booking_date TEXT NOT NULL,
      value_date TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'EUR',
      counterparty TEXT,
      purpose TEXT,
      external_id TEXT,
      matched_document_id INTEGER REFERENCES documents(id),
      matched_expense_id INTEGER REFERENCES expenses(id),
      match_status TEXT NOT NULL DEFAULT 'unmatched'
        CHECK (match_status IN ('unmatched','matched','ignored')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(bank_account_id, external_id)
    );

    CREATE TABLE IF NOT EXISTS dunning_levels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      days_after_due INTEGER NOT NULL,
      fee_net REAL NOT NULL DEFAULT 0,
      interest_rate REAL NOT NULL DEFAULT 0,
      template_text TEXT
    );

    CREATE TABLE IF NOT EXISTS dunning_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      level_id INTEGER NOT NULL REFERENCES dunning_levels(id),
      run_date TEXT NOT NULL,
      fee_net REAL NOT NULL DEFAULT 0,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS recurring_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      interval_unit TEXT NOT NULL CHECK (interval_unit IN ('month','quarter','year')),
      interval_count INTEGER NOT NULL DEFAULT 1,
      next_run TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      last_generated_document_id INTEGER REFERENCES documents(id)
    );

    CREATE TABLE IF NOT EXISTS chart_of_accounts (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('asset','liability','equity','revenue','expense','vat')),
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date TEXT NOT NULL,
      memo TEXT,
      source_type TEXT,
      source_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS journal_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_code TEXT NOT NULL REFERENCES chart_of_accounts(code),
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      tax_rate REAL,
      contact_id INTEGER REFERENCES contacts(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      at TEXT NOT NULL DEFAULT (datetime('now')),
      actor TEXT NOT NULL DEFAULT 'system',
      action TEXT NOT NULL,
      entity TEXT,
      entity_id TEXT,
      detail TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_documents_kind_status ON documents(kind, status);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
    CREATE INDEX IF NOT EXISTS idx_bank_tx_date ON bank_transactions(booking_date);
    CREATE INDEX IF NOT EXISTS idx_contacts_type ON contacts(type);
  `);

  const row = database.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
  if (!row) {
    database.prepare('INSERT INTO meta(key, value) VALUES(?, ?)').run('schema_version', '1');
    seedDefaults(database);
  }
  migrateEInvoiceFields(database);
}

/** Additive columns for EN 16931 / XRechnung / ZUGFeRD (idempotent). */
function migrateEInvoiceFields(database) {
  const cols = (table) =>
    new Set(database.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));

  const companyCols = cols('company');
  const addCompany = [
    ['electronic_address', 'TEXT'],
    ['electronic_scheme', "TEXT DEFAULT 'EM'"],
    ['register_court', 'TEXT'],
    ['register_number', 'TEXT'],
  ];
  for (const [name, type] of addCompany) {
    if (!companyCols.has(name)) {
      database.exec(`ALTER TABLE company ADD COLUMN ${name} ${type}`);
    }
  }

  const contactCols = cols('contacts');
  const addContact = [
    ['buyer_reference', 'TEXT'],
    ['leitweg_id', 'TEXT'],
    ['electronic_address', 'TEXT'],
    ['electronic_scheme', "TEXT DEFAULT 'EM'"],
  ];
  for (const [name, type] of addContact) {
    if (!contactCols.has(name)) {
      database.exec(`ALTER TABLE contacts ADD COLUMN ${name} ${type}`);
    }
  }

  const docCols = cols('documents');
  if (!docCols.has('buyer_reference')) {
    database.exec('ALTER TABLE documents ADD COLUMN buyer_reference TEXT');
  }

  const ver = database.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version');
  if (ver && Number(ver.value) < 2) {
    database.prepare('UPDATE meta SET value = ? WHERE key = ?').run('2', 'schema_version');
  }
}

function seedDefaults(database) {
  database.prepare(`
    INSERT OR IGNORE INTO company (id, name) VALUES (1, 'Meine Firma GmbH')
  `).run();

  const accounts = [
    ['1000', 'Kasse', 'asset'],
    ['1200', 'Bank', 'asset'],
    ['1400', 'Forderungen aus L+L', 'asset'],
    ['1600', 'Verbindlichkeiten aus L+L', 'liability'],
    ['1776', 'Umsatzsteuer 19%', 'vat'],
    ['1576', 'Vorsteuer 19%', 'vat'],
    ['8400', 'Erlöse 19%', 'revenue'],
    ['8300', 'Erlöse 7%', 'revenue'],
    ['4900', 'Sonstige betriebliche Aufwendungen', 'expense'],
    ['4930', 'Bürobedarf', 'expense'],
    ['4980', 'Weiterbildung', 'expense'],
    ['4200', 'Raumkosten', 'expense'],
    ['1800', 'Privatentnahmen', 'equity'],
    ['1890', 'Privateinlagen', 'equity'],
  ];
  const insAcc = database.prepare(
    'INSERT OR IGNORE INTO chart_of_accounts(code, name, kind) VALUES(?, ?, ?)',
  );
  for (const a of accounts) insAcc.run(...a);

  const levels = [
    ['Zahlungserinnerung', 7, 0, 0, 'Freundliche Erinnerung an die offene Rechnung {number}.'],
    ['1. Mahnung', 14, 5, 5, '1. Mahnung zu Rechnung {number}. Bitte um umgehenden Ausgleich.'],
    ['2. Mahnung', 28, 10, 5, '2. Mahnung zu Rechnung {number}. Gebühren und Verzugszinsen möglich.'],
  ];
  const insLvl = database.prepare(
    'INSERT INTO dunning_levels(name, days_after_due, fee_net, interest_rate, template_text) VALUES(?,?,?,?,?)',
  );
  for (const l of levels) insLvl.run(...l);

  database.prepare(
    `INSERT INTO bank_accounts(name, iban, bic, opening_balance) VALUES(?, ?, ?, ?)`,
  ).run('Geschäftskonto', '', '', 0);

  audit(database, 'system', 'seed', 'meta', '1', 'Initial defaults');
}

export function audit(database, actor, action, entity, entityId, detail) {
  database.prepare(
    `INSERT INTO audit_log(actor, action, entity, entity_id, detail) VALUES(?, ?, ?, ?, ?)`,
  ).run(actor || 'system', action, entity || null, entityId != null ? String(entityId) : null, detail || null);
}

export function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round((x + Number.EPSILON) * 100) / 100;
}
