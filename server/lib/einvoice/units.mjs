/** Map free-text German units → UNECE Recommendation 20 codes. */
const MAP = new Map([
  ['stk', 'C62'],
  ['stück', 'C62'],
  ['stueck', 'C62'],
  ['st', 'C62'],
  ['pcs', 'C62'],
  ['pc', 'C62'],
  ['ea', 'C62'],
  ['pausch', 'C62'],
  ['pauschale', 'C62'],
  ['psch', 'C62'],
  ['h', 'HUR'],
  ['std', 'HUR'],
  ['stunde', 'HUR'],
  ['stunden', 'HUR'],
  ['hour', 'HUR'],
  ['hours', 'HUR'],
  ['tag', 'DAY'],
  ['tage', 'DAY'],
  ['day', 'DAY'],
  ['days', 'DAY'],
  ['mon', 'MON'],
  ['monat', 'MON'],
  ['monate', 'MON'],
  ['month', 'MON'],
  ['months', 'MON'],
  ['kg', 'KGM'],
  ['g', 'GRM'],
  ['t', 'TNE'],
  ['m', 'MTR'],
  ['m2', 'MTK'],
  ['m²', 'MTK'],
  ['m3', 'MTQ'],
  ['m³', 'MTQ'],
  ['l', 'LTR'],
  ['ltr', 'LTR'],
  ['liter', 'LTR'],
  ['km', 'KMT'],
  ['kwh', 'KWH'],
  ['kw', 'KWT'],
  ['set', 'SET'],
  ['paket', 'PK'],
  ['pack', 'PK'],
  ['box', 'BX'],
  ['paar', 'PR'],
]);

export function uneceUnitCode(unit) {
  const key = String(unit || 'Stk')
    .trim()
    .toLowerCase()
    .replaceAll('ü', 'ue')
    .replaceAll('ö', 'oe')
    .replaceAll('ä', 'ae');
  return MAP.get(key) || 'C62';
}

export function taxCategoryCode(rate, { exempt = false } = {}) {
  const r = Number(rate);
  if (exempt) return 'E';
  if (!Number.isFinite(r) || r === 0) return 'Z';
  return 'S';
}
