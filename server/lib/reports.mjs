import { getDb, money } from './db.mjs';
import { refreshOverdueStatuses } from './docs.mjs';

export function dashboard() {
  refreshOverdueStatuses();
  const db = getDb();
  const openInvoices = db
    .prepare(
      `SELECT COALESCE(SUM(gross_total - paid_amount),0) AS v
       FROM documents WHERE kind='invoice' AND status IN ('sent','partial','overdue')`,
    )
    .get().v;
  const overdue = db
    .prepare(
      `SELECT COUNT(*) AS c, COALESCE(SUM(gross_total - paid_amount),0) AS v
       FROM documents WHERE kind='invoice' AND status='overdue'`,
    )
    .get();
  const month = new Date().toISOString().slice(0, 7);
  const revenueMonth = db
    .prepare(
      `SELECT COALESCE(SUM(net_total),0) AS v FROM documents
       WHERE kind='invoice' AND status != 'cancelled' AND status != 'draft'
         AND issue_date LIKE ?`,
    )
    .get(`${month}%`).v;
  const expenseMonth = db
    .prepare(
      `SELECT COALESCE(SUM(net_amount),0) AS v FROM expenses WHERE expense_date LIKE ?`,
    )
    .get(`${month}%`).v;
  const unmatchedBank = db
    .prepare(`SELECT COUNT(*) AS c FROM bank_transactions WHERE match_status='unmatched'`)
    .get().c;
  const contacts = db.prepare(`SELECT COUNT(*) AS c FROM contacts WHERE active=1`).get().c;
  const recentDocs = db
    .prepare(
      `SELECT id, kind, number, status, contact_name, issue_date, gross_total
       FROM documents ORDER BY id DESC LIMIT 8`,
    )
    .all();
  return {
    open_receivables: money(openInvoices),
    overdue_count: overdue.c,
    overdue_amount: money(overdue.v),
    revenue_month_net: money(revenueMonth),
    expense_month_net: money(expenseMonth),
    profit_month_net: money(revenueMonth - expenseMonth),
    unmatched_bank: unmatchedBank,
    active_contacts: contacts,
    recent_documents: recentDocs,
  };
}

/** Einnahmen-Überschuss-Rechnung (vereinfacht, cash-oriented on invoice paid + expenses paid). */
export function euerReport({ from, to }) {
  const db = getDb();
  const income = db
    .prepare(
      `
      SELECT COALESCE(SUM(CASE WHEN d.paid_amount > 0 THEN d.net_total * (MIN(d.paid_amount, d.gross_total)/d.gross_total) ELSE 0 END),0) AS v
      FROM documents d
      WHERE d.kind='invoice' AND d.status != 'cancelled'
        AND d.issue_date >= ? AND d.issue_date <= ?
    `,
    )
    .get(from, to).v;

  // simpler reliable: sum net of paid invoices in range by issue_date
  const incomePaid = db
    .prepare(
      `SELECT COALESCE(SUM(net_total),0) AS v FROM documents
       WHERE kind='invoice' AND status='paid' AND issue_date >= ? AND issue_date <= ?`,
    )
    .get(from, to).v;

  const expenses = db
    .prepare(
      `SELECT category, COALESCE(SUM(net_amount),0) AS net, COALESCE(SUM(tax_amount),0) AS tax
       FROM expenses
       WHERE expense_date >= ? AND expense_date <= ?
       GROUP BY category ORDER BY category`,
    )
    .all(from, to);

  const expenseTotal = money(expenses.reduce((s, e) => s + e.net, 0));
  const revenue = money(incomePaid || income);
  return {
    from,
    to,
    revenue_net: revenue,
    expenses_by_category: expenses.map((e) => ({
      category: e.category,
      net: money(e.net),
      tax: money(e.tax),
    })),
    expense_net: expenseTotal,
    profit_net: money(revenue - expenseTotal),
    method: 'paid_invoices_and_booked_expenses',
  };
}

export function vatReport({ from, to }) {
  const db = getDb();
  const sales = db
    .prepare(
      `
      SELECT di.tax_rate AS rate,
             COALESCE(SUM(di.net_total),0) AS net,
             COALESCE(SUM(di.tax_total),0) AS tax
      FROM document_items di
      JOIN documents d ON d.id = di.document_id
      WHERE d.kind IN ('invoice','credit_note')
        AND d.status NOT IN ('draft','cancelled')
        AND d.issue_date >= ? AND d.issue_date <= ?
      GROUP BY di.tax_rate
      ORDER BY di.tax_rate
    `,
    )
    .all(from, to);

  // credit notes reduce
  const normalized = sales.map((s) => ({
    rate: s.rate,
    net: money(s.net),
    tax: money(s.tax),
  }));

  const pretax = db
    .prepare(
      `SELECT COALESCE(SUM(tax_amount),0) AS v FROM expenses
       WHERE expense_date >= ? AND expense_date <= ?`,
    )
    .get(from, to).v;

  const taxOnSales = money(normalized.reduce((s, r) => s + r.tax, 0));
  const inputTax = money(pretax);
  return {
    from,
    to,
    sales_by_rate: normalized,
    vat_on_sales: taxOnSales,
    input_vat: inputTax,
    vat_payable: money(taxOnSales - inputTax),
    note: 'Vereinfachte USt-Auswertung zur Vorbereitung der UStVA — kein ELSTER-Versand.',
  };
}

export function guvReport({ from, to }) {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT coa.code, coa.name, coa.kind,
             COALESCE(SUM(jl.credit - jl.debit),0) AS balance
      FROM chart_of_accounts coa
      LEFT JOIN journal_lines jl ON jl.account_code = coa.code
      LEFT JOIN journal_entries je ON je.id = jl.entry_id
        AND je.entry_date >= ? AND je.entry_date <= ?
      WHERE coa.kind IN ('revenue','expense')
      GROUP BY coa.code
      ORDER BY coa.code
    `,
    )
    .all(from, to);

  let revenue = 0;
  let expense = 0;
  const detail = rows.map((r) => {
    // revenue credits positive; expense debits positive => invert
    const bal = money(r.kind === 'revenue' ? r.balance : -r.balance);
    if (r.kind === 'revenue') revenue = money(revenue + Math.max(0, bal));
    else expense = money(expense + Math.max(0, bal));
    return { code: r.code, name: r.name, kind: r.kind, amount: bal };
  });
  return {
    from,
    to,
    detail,
    revenue_net: revenue,
    expense_net: expense,
    result_net: money(revenue - expense),
  };
}
