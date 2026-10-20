import { getDb } from './db.mjs';
import { getCompany } from './docs.mjs';

/** DATEV-style booking batch CSV (EXTF-inspired, simplified original export). */
export function buildDatevCsv({ from, to }) {
  const db = getDb();
  const company = getCompany();
  const lines = db
    .prepare(
      `
      SELECT je.entry_date, je.memo, jl.account_code, jl.debit, jl.credit, jl.tax_rate, c.name AS contact_name
      FROM journal_lines jl
      JOIN journal_entries je ON je.id = jl.entry_id
      LEFT JOIN contacts c ON c.id = jl.contact_id
      WHERE je.entry_date >= ? AND je.entry_date <= ?
      ORDER BY je.entry_date, je.id, jl.id
    `,
    )
    .all(from, to);

  const header = [
    'Umsatz (ohne Soll/Haben-Kz)',
    'Soll/Haben-Kennzeichen',
    'WKZ Umsatz',
    'Kurs',
    'Basis-Umsatz',
    'WKZ Basis-Umsatz',
    'Konto',
    'Gegenkonto (ohne BU-Schlüssel)',
    'BU-Schlüssel',
    'Belegdatum',
    'Belegfeld 1',
    'Belegfeld 2',
    'Skonto',
    'Buchungstext',
  ].join(';');

  const rows = lines.map((l) => {
    const amount = l.debit > 0 ? l.debit : l.credit;
    const sh = l.debit > 0 ? 'S' : 'H';
    const date = (l.entry_date || '').slice(5, 7) + (l.entry_date || '').slice(8, 10);
    return [
      deNum(amount),
      sh,
      company.currency || 'EUR',
      '',
      '',
      '',
      l.account_code,
      '',
      l.tax_rate != null ? String(Math.round(l.tax_rate)) : '',
      date,
      '',
      '',
      '',
      csv(l.memo || l.contact_name || ''),
    ].join(';');
  });

  const meta = [
    `# KlarKontor DATEV-Export`,
    `# Firma: ${company.name}`,
    `# Zeitraum: ${from} .. ${to}`,
    `# Hinweis: Original-Export, kein zertifiziertes DATEV-Rechenzentrumsformat.`,
  ].join('\n');

  return `${meta}\n${header}\n${rows.join('\n')}\n`;
}

function deNum(n) {
  return Number(n).toFixed(2).replace('.', ',');
}

function csv(s) {
  const t = String(s ?? '').replaceAll('"', '""');
  return `"${t}"`;
}
