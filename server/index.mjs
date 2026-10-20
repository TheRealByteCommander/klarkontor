import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, money, audit, dbPathInfo } from './lib/db.mjs';
import {
  getCompany,
  loadDocument,
  saveDocument,
  markDocumentPaid,
  listOverdueInvoices,
  refreshOverdueStatuses,
  postExpenseEntry,
  postRevenueEntry,
} from './lib/docs.mjs';
import { dashboard, euerReport, vatReport, guvReport } from './lib/reports.mjs';
import { importBankCsv, autoMatchBank } from './lib/banking.mjs';
import { buildDatevCsv } from './lib/datev.mjs';
import { exportEInvoice, listEInvoiceProfiles } from './lib/einvoice.mjs';
import { buildInvoicePdf } from './lib/pdf.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const webRoot = path.join(root, 'web');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';

getDb(); // ensure migrate

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error(err);
    json(res, 500, { error: err.message || String(err) });
  }
});

server.listen(PORT, HOST, () => {
  const info = dbPathInfo();
  console.log(`KlarKontor http://${HOST}:${PORT}`);
  console.log(`DB ${info.dbPath}`);
});

async function handleApi(req, res, url) {
  const db = getDb();
  const method = req.method || 'GET';
  const p = url.pathname.replace(/^\/api/, '');

  if (method === 'GET' && p === '/health') {
    return json(res, 200, { ok: true, service: 'klarkontor', version: '0.2.0' });
  }

  if (method === 'GET' && p === '/einvoice/profiles') {
    return json(res, 200, listEInvoiceProfiles());
  }

  if (method === 'GET' && p === '/dashboard') {
    return json(res, 200, dashboard());
  }

  if (p === '/company') {
    if (method === 'GET') return json(res, 200, getCompany());
    if (method === 'PUT') {
      const body = await readJson(req);
      const fields = [
        'name','legal_form','street','zip','city','country','email','phone','vat_id','tax_number',
        'iban','bic','bank_name','default_tax_rate','invoice_prefix','quote_prefix','credit_prefix','currency',
        'electronic_address','electronic_scheme','register_court','register_number',
      ];
      const sets = [];
      const vals = [];
      for (const f of fields) {
        if (body[f] !== undefined) {
          sets.push(`${f} = ?`);
          vals.push(body[f]);
        }
      }
      if (!sets.length) return json(res, 400, { error: 'no fields' });
      sets.push(`updated_at = datetime('now')`);
      db.prepare(`UPDATE company SET ${sets.join(', ')} WHERE id = 1`).run(...vals);
      audit(db, 'user', 'update', 'company', '1', null);
      return json(res, 200, getCompany());
    }
  }

  if (p === '/contacts') {
    if (method === 'GET') {
      const type = url.searchParams.get('type');
      const rows = type
        ? db.prepare(`SELECT * FROM contacts WHERE active=1 AND (type=? OR type='both') ORDER BY name`).all(type)
        : db.prepare(`SELECT * FROM contacts WHERE active=1 ORDER BY name`).all();
      return json(res, 200, rows);
    }
    if (method === 'POST') {
      const b = await readJson(req);
      if (!b.name) return json(res, 400, { error: 'name required' });
      const info = db.prepare(`
        INSERT INTO contacts(type, number, name, company_name, email, phone, street, zip, city, country, vat_id, payment_terms_days, notes, buyer_reference, leitweg_id, electronic_address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        b.type || 'customer', b.number || null, b.name, b.company_name || null, b.email || null, b.phone || null,
        b.street || null, b.zip || null, b.city || null, b.country || 'DE', b.vat_id || null,
        b.payment_terms_days ?? 14, b.notes || null, b.buyer_reference || null, b.leitweg_id || null,
        b.electronic_address || b.email || null,
      );
      audit(db, 'user', 'create', 'contact', info.lastInsertRowid, b.name);
      return json(res, 201, db.prepare('SELECT * FROM contacts WHERE id=?').get(info.lastInsertRowid));
    }
  }

  if (p.startsWith('/contacts/') && method === 'PUT') {
    const id = Number(p.split('/')[2]);
    const b = await readJson(req);
    db.prepare(`
      UPDATE contacts SET type=?, number=?, name=?, company_name=?, email=?, phone=?, street=?, zip=?, city=?,
        country=?, vat_id=?, payment_terms_days=?, notes=?, active=?, buyer_reference=?, leitweg_id=?, electronic_address=?,
        updated_at=datetime('now')
      WHERE id=?
    `).run(
      b.type, b.number || null, b.name, b.company_name || null, b.email || null, b.phone || null,
      b.street || null, b.zip || null, b.city || null, b.country || 'DE', b.vat_id || null,
      b.payment_terms_days ?? 14, b.notes || null, b.active ?? 1,
      b.buyer_reference || null, b.leitweg_id || null, b.electronic_address || b.email || null, id,
    );
    return json(res, 200, db.prepare('SELECT * FROM contacts WHERE id=?').get(id));
  }

  if (p === '/products') {
    if (method === 'GET') return json(res, 200, db.prepare('SELECT * FROM products WHERE active=1 ORDER BY name').all());
    if (method === 'POST') {
      const b = await readJson(req);
      const info = db.prepare(`
        INSERT INTO products(sku, name, description, unit, net_price, tax_rate, kind)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(b.sku || null, b.name, b.description || null, b.unit || 'Stk', money(b.net_price), b.tax_rate ?? 19, b.kind || 'service');
      return json(res, 201, db.prepare('SELECT * FROM products WHERE id=?').get(info.lastInsertRowid));
    }
  }

  if (p === '/documents') {
    if (method === 'GET') {
      const kind = url.searchParams.get('kind');
      const rows = kind
        ? db.prepare('SELECT * FROM documents WHERE kind=? ORDER BY id DESC').all(kind)
        : db.prepare('SELECT * FROM documents ORDER BY id DESC LIMIT 200').all();
      return json(res, 200, rows);
    }
    if (method === 'POST') {
      const b = await readJson(req);
      if (!b.kind) return json(res, 400, { error: 'kind required' });
      const doc = saveDocument(b);
      if (b.status && b.status !== 'draft' && doc.kind === 'invoice') {
        postRevenueEntry(doc);
      }
      return json(res, 201, doc);
    }
  }

  if (p.startsWith('/documents/') && method === 'GET') {
    const parts = p.split('/');
    const id = Number(parts[2]);
    if (parts[3] === 'pdf') {
      const buf = await buildInvoicePdf(id);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="document-${id}.pdf"`,
      });
      res.end(buf);
      return;
    }
    // E-invoice formats: xrechnung | xrechnung-ubl | xrechnung-cii | zugferd | factur-x | einvoice?profile=
    if (
      parts[3] === 'xrechnung' ||
      parts[3] === 'xrechnung-ubl' ||
      parts[3] === 'xrechnung-cii' ||
      parts[3] === 'zugferd' ||
      parts[3] === 'factur-x' ||
      parts[3] === 'einvoice'
    ) {
      const profileMap = {
        xrechnung: 'xrechnung-ubl',
        'xrechnung-ubl': 'xrechnung-ubl',
        'xrechnung-cii': 'xrechnung-cii',
        zugferd: 'zugferd-en16931',
        'factur-x': 'factur-x-en16931',
      };
      const profile =
        url.searchParams.get('profile') ||
        profileMap[parts[3]] ||
        'xrechnung-ubl';
      try {
        const exp = await exportEInvoice(id, profile);
        res.writeHead(200, {
          'Content-Type': exp.contentType,
          'Content-Disposition': `attachment; filename="${exp.filename}"`,
          'X-KlarKontor-EInvoice-Profile': exp.profile,
        });
        res.end(exp.body);
      } catch (err) {
        return json(res, 400, { error: err.message || String(err), profile });
      }
      return;
    }
    const doc = loadDocument(id);
    if (!doc) return json(res, 404, { error: 'not found' });
    return json(res, 200, doc);
  }

  if (p.startsWith('/documents/') && method === 'PUT') {
    const id = Number(p.split('/')[2]);
    const b = await readJson(req);
    const doc = saveDocument({ ...b, id });
    if (doc.kind === 'invoice' && doc.status !== 'draft') postRevenueEntry(doc);
    return json(res, 200, doc);
  }

  if (p.match(/^\/documents\/\d+\/pay$/) && method === 'POST') {
    const id = Number(p.split('/')[2]);
    const b = await readJson(req).catch(() => ({}));
    return json(res, 200, markDocumentPaid(id, b.amount));
  }

  if (p === '/expenses') {
    if (method === 'GET') return json(res, 200, db.prepare('SELECT * FROM expenses ORDER BY expense_date DESC, id DESC').all());
    if (method === 'POST') {
      const b = await readJson(req);
      const net = money(b.net_amount);
      const rate = b.tax_rate ?? 19;
      const tax = money(b.tax_amount ?? net * (rate / 100));
      const gross = money(b.gross_amount ?? net + tax);
      const info = db.prepare(`
        INSERT INTO expenses(contact_id, vendor_name, number, expense_date, due_date, category, description,
          net_amount, tax_rate, tax_amount, gross_amount, payment_status, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        b.contact_id || null, b.vendor_name || null, b.number || null, b.expense_date,
        b.due_date || null, b.category || 'sonstiges', b.description || null,
        net, rate, tax, gross, b.payment_status || 'open', b.notes || null,
      );
      const row = db.prepare('SELECT * FROM expenses WHERE id=?').get(info.lastInsertRowid);
      postExpenseEntry(row);
      return json(res, 201, row);
    }
  }

  if (p === '/bank/accounts') {
    if (method === 'GET') return json(res, 200, db.prepare('SELECT * FROM bank_accounts WHERE active=1').all());
    if (method === 'POST') {
      const b = await readJson(req);
      const info = db.prepare(
        `INSERT INTO bank_accounts(name, iban, bic, currency, opening_balance) VALUES (?,?,?,?,?)`,
      ).run(b.name, b.iban || null, b.bic || null, b.currency || 'EUR', money(b.opening_balance || 0));
      return json(res, 201, db.prepare('SELECT * FROM bank_accounts WHERE id=?').get(info.lastInsertRowid));
    }
  }

  if (p === '/bank/transactions' && method === 'GET') {
    return json(res, 200, db.prepare('SELECT * FROM bank_transactions ORDER BY booking_date DESC, id DESC LIMIT 500').all());
  }

  if (p === '/bank/import' && method === 'POST') {
    const b = await readJson(req);
    if (!b.bank_account_id || !b.csv) return json(res, 400, { error: 'bank_account_id and csv required' });
    return json(res, 200, importBankCsv(Number(b.bank_account_id), b.csv));
  }

  if (p === '/bank/match' && method === 'POST') {
    return json(res, 200, autoMatchBank());
  }

  if (p === '/dunning/overdue' && method === 'GET') {
    refreshOverdueStatuses();
    return json(res, 200, listOverdueInvoices());
  }

  if (p === '/dunning/run' && method === 'POST') {
    const b = await readJson(req);
    const levels = db.prepare('SELECT * FROM dunning_levels ORDER BY days_after_due').all();
    const level = levels.find((l) => l.id === Number(b.level_id)) || levels[0];
    const docs = listOverdueInvoices();
    const created = [];
    const today = new Date().toISOString().slice(0, 10);
    for (const d of docs) {
      const info = db.prepare(
        `INSERT INTO dunning_runs(document_id, level_id, run_date, fee_net, note) VALUES (?,?,?,?,?)`,
      ).run(d.id, level.id, today, level.fee_net, (level.template_text || '').replace('{number}', d.number));
      created.push(Number(info.lastInsertRowid));
    }
    return json(res, 200, { created: created.length, level: level.name });
  }

  if (p === '/dunning/levels' && method === 'GET') {
    return json(res, 200, db.prepare('SELECT * FROM dunning_levels ORDER BY days_after_due').all());
  }

  if (p === '/reports/euer' && method === 'GET') {
    return json(res, 200, euerReport(range(url)));
  }
  if (p === '/reports/vat' && method === 'GET') {
    return json(res, 200, vatReport(range(url)));
  }
  if (p === '/reports/guv' && method === 'GET') {
    return json(res, 200, guvReport(range(url)));
  }

  if (p === '/export/datev' && method === 'GET') {
    const r = range(url);
    const csv = buildDatevCsv(r);
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="datev-${r.from}_${r.to}.csv"`,
    });
    res.end(csv);
    return;
  }

  if (p === '/accounts' && method === 'GET') {
    return json(res, 200, db.prepare('SELECT * FROM chart_of_accounts WHERE active=1 ORDER BY code').all());
  }

  if (p === '/audit' && method === 'GET') {
    return json(res, 200, db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 100').all());
  }

  if (p === '/recurring' && method === 'GET') {
    return json(res, 200, db.prepare('SELECT * FROM recurring_rules ORDER BY id DESC').all());
  }

  if (p === '/recurring' && method === 'POST') {
    const b = await readJson(req);
    const info = db.prepare(
      `INSERT INTO recurring_rules(template_document_id, interval_unit, interval_count, next_run, active)
       VALUES (?, ?, ?, ?, 1)`,
    ).run(b.template_document_id, b.interval_unit || 'month', b.interval_count || 1, b.next_run);
    return json(res, 201, db.prepare('SELECT * FROM recurring_rules WHERE id=?').get(info.lastInsertRowid));
  }

  if (p === '/recurring/run' && method === 'POST') {
    const today = new Date().toISOString().slice(0, 10);
    const rules = db.prepare(`SELECT * FROM recurring_rules WHERE active=1 AND next_run <= ?`).all(today);
    const created = [];
    for (const rule of rules) {
      const tpl = loadDocument(rule.template_document_id);
      if (!tpl) continue;
      const doc = saveDocument({
        kind: 'invoice',
        status: 'sent',
        contact_id: tpl.contact_id,
        issue_date: today,
        due_date: addDays(today, 14),
        notes: tpl.notes,
        intro: tpl.intro,
        footer: tpl.footer,
        items: tpl.items.map(({ product_id, title, description, quantity, unit, net_unit_price, tax_rate }) => ({
          product_id, title, description, quantity, unit, net_unit_price, tax_rate,
        })),
      });
      postRevenueEntry(doc);
      const next = bumpDate(rule.next_run, rule.interval_unit, rule.interval_count);
      db.prepare(
        `UPDATE recurring_rules SET next_run=?, last_generated_document_id=? WHERE id=?`,
      ).run(next, doc.id, rule.id);
      created.push(doc.number);
    }
    return json(res, 200, { created });
  }

  return json(res, 404, { error: 'not found', path: p });
}

function range(url) {
  const now = new Date();
  const y = now.getFullYear();
  const from = url.searchParams.get('from') || `${y}-01-01`;
  const to = url.searchParams.get('to') || now.toISOString().slice(0, 10);
  return { from, to };
}

function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function bumpDate(iso, unit, count) {
  const d = new Date(iso + 'T00:00:00Z');
  const n = count || 1;
  if (unit === 'year') d.setUTCFullYear(d.getUTCFullYear() + n);
  else if (unit === 'quarter') d.setUTCMonth(d.getUTCMonth() + 3 * n);
  else d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function json(res, status, body) {
  const data = JSON.stringify(body, null, 0);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(data);
}

async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  rel = decodeURIComponent(rel.split('?')[0]);
  if (rel.includes('..')) {
    res.writeHead(400).end('bad path');
    return;
  }
  const filePath = path.join(webRoot, rel);
  if (!filePath.startsWith(webRoot)) {
    res.writeHead(400).end('bad path');
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    // SPA fallback
    const index = path.join(webRoot, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(index));
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.png': 'image/png',
  };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(filePath));
}
