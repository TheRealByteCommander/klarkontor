import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(root, 'data', 'smoke.sqlite');
try { fs.unlinkSync(dbPath); } catch {}
try { fs.unlinkSync(dbPath + '-wal'); } catch {}
try { fs.unlinkSync(dbPath + '-shm'); } catch {}

const child = spawn(process.execPath, ['server/index.mjs'], {
  cwd: root,
  env: { ...process.env, PORT: '8799', HOST: '127.0.0.1', KLARKONTOR_DB: dbPath },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let out = '';
child.stdout.on('data', (d) => { out += d.toString(); });
child.stderr.on('data', (d) => { out += d.toString(); });

await sleep(800);

const base = 'http://127.0.0.1:8799';
async function j(pathname, opts) {
  const res = await fetch(base + pathname, opts);
  if (!res.ok) throw new Error(`${pathname} ${res.status}`);
  return res.json();
}

try {
  const health = await j('/api/health');
  if (!health.ok) throw new Error('health');

  await j('/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Smoke Kunde', type: 'customer' }),
  });
  const contacts = await j('/api/contacts');
  const contactId = contacts[0].id;

  const inv = await j('/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'invoice',
      status: 'sent',
      contact_id: contactId,
      issue_date: '2026-10-20',
      due_date: '2026-11-03',
      items: [{ title: 'Smoke Leistung', quantity: 2, net_unit_price: 50, tax_rate: 19 }],
    }),
  });
  if (Math.abs(inv.gross_total - 119) > 0.01) throw new Error(`gross ${inv.gross_total}`);

  const dash = await j('/api/dashboard');
  const vat = await j('/api/reports/vat?from=2026-01-01&to=2026-12-31');
  const accounts = await j('/api/bank/accounts');
  await j('/api/bank/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bank_account_id: accounts[0].id,
      csv: `2026-10-20;119,00;Smoke Kunde;${inv.number};smoke-1`,
    }),
  });
  const match = await j('/api/bank/match', { method: 'POST', body: '{}' });
  if (match.matched < 1) throw new Error('match failed');

  const pdfRes = await fetch(`${base}/api/documents/${inv.id}/pdf`);
  if (!pdfRes.ok || !(pdfRes.headers.get('content-type') || '').includes('pdf')) {
    throw new Error('pdf failed');
  }
  const xmlRes = await fetch(`${base}/api/documents/${inv.id}/xrechnung`);
  const xml = await xmlRes.text();
  if (!xml.includes('Invoice') || !xml.includes(inv.number)) throw new Error('xrechnung failed');

  console.log(JSON.stringify({
    ok: true,
    invoice: inv.number,
    dashboard_open: dash.open_receivables,
    vat_payable: vat.vat_payable,
    matched: match.matched,
  }, null, 2));
} finally {
  child.kill('SIGTERM');
}
