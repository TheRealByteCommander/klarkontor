import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = path.join(root, 'data', 'test.sqlite');
for (const p of [dbPath, dbPath + '-wal', dbPath + '-shm']) {
  try { fs.unlinkSync(p); } catch {}
}
process.env.KLARKONTOR_DB = dbPath;

const { money } = await import('../server/lib/db.mjs');
const { calcDocumentTotals, saveDocument, loadDocument } = await import('../server/lib/docs.mjs');

test('money rounds to cents', () => {
  assert.equal(money(10.005), 10.01);
  assert.equal(money(1.999), 2);
});

test('document totals with 19% VAT', () => {
  const t = calcDocumentTotals([
    { title: 'A', quantity: 2, net_unit_price: 50, tax_rate: 19 },
  ]);
  assert.equal(t.net_total, 100);
  assert.equal(t.tax_total, 19);
  assert.equal(t.gross_total, 119);
});

test('save invoice persists items', () => {
  const doc = saveDocument({
    kind: 'invoice',
    status: 'draft',
    issue_date: '2026-10-20',
    items: [{ title: 'Test', quantity: 1, net_unit_price: 10, tax_rate: 7 }],
  });
  const loaded = loadDocument(doc.id);
  assert.equal(loaded.items.length, 1);
  assert.equal(loaded.tax_total, 0.7);
  assert.equal(loaded.gross_total, 10.7);
  assert.match(loaded.number, /^RE-/);
});
