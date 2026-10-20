const routes = [
  ['dashboard', 'Dashboard'],
  ['invoices', 'Rechnungen'],
  ['quotes', 'Angebote'],
  ['expenses', 'Ausgaben'],
  ['contacts', 'Kontakte'],
  ['products', 'Leistungen'],
  ['banking', 'Banking'],
  ['dunning', 'Mahnwesen'],
  ['reports', 'Berichte'],
  ['exports', 'Exporte'],
  ['company', 'Firma'],
  ['audit', 'Audit'],
];

const state = { route: 'dashboard' };
const $ = (sel) => document.querySelector(sel);
const content = $('#content');
const nav = $('#nav');
const title = $('#page-title');

routes.forEach(([id, label]) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.dataset.route = id;
  b.onclick = () => navigate(id);
  nav.appendChild(b);
});

$('#btn-refresh').onclick = () => render();
navigate('dashboard');

function navigate(route) {
  state.route = route;
  [...nav.querySelectorAll('button')].forEach((b) => b.classList.toggle('active', b.dataset.route === route));
  title.textContent = routes.find((r) => r[0] === route)?.[1] || route;
  render();
}

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {}
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return res;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2800);
}

function euro(n) {
  return Number(n || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

function badge(status) {
  const map = {
    paid: 'ok',
    sent: 'ok',
    accepted: 'ok',
    draft: '',
    partial: 'warn',
    overdue: 'danger',
    open: 'warn',
    unmatched: 'warn',
    matched: 'ok',
  };
  return `<span class="badge ${map[status] || ''}">${status}</span>`;
}

async function render() {
  try {
    if (state.route === 'dashboard') return renderDashboard();
    if (state.route === 'invoices') return renderDocuments('invoice');
    if (state.route === 'quotes') return renderDocuments('quote');
    if (state.route === 'expenses') return renderExpenses();
    if (state.route === 'contacts') return renderContacts();
    if (state.route === 'products') return renderProducts();
    if (state.route === 'banking') return renderBanking();
    if (state.route === 'dunning') return renderDunning();
    if (state.route === 'reports') return renderReports();
    if (state.route === 'exports') return renderExports();
    if (state.route === 'company') return renderCompany();
    if (state.route === 'audit') return renderAudit();
  } catch (e) {
    content.innerHTML = `<div class="card"><strong>Fehler:</strong> ${esc(e.message)}</div>`;
  }
}

async function renderDashboard() {
  const d = await api('/dashboard');
  content.innerHTML = `
    <div class="grid">
      <div class="card"><h3>Offene Forderungen</h3><div class="value">${euro(d.open_receivables)}</div></div>
      <div class="card"><h3>Überfällig</h3><div class="value">${euro(d.overdue_amount)}</div><div class="muted tiny">${d.overdue_count} Rechnungen</div></div>
      <div class="card"><h3>Umsatz Monat (netto)</h3><div class="value">${euro(d.revenue_month_net)}</div></div>
      <div class="card"><h3>Ausgaben Monat (netto)</h3><div class="value">${euro(d.expense_month_net)}</div></div>
      <div class="card"><h3>Ergebnis Monat</h3><div class="value">${euro(d.profit_month_net)}</div></div>
      <div class="card"><h3>Bank ungeklärt</h3><div class="value">${d.unmatched_bank}</div></div>
    </div>
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h3 style="margin:0;color:var(--text)">Letzte Belege</h3>
        <button class="btn" id="quick-invoice">+ Rechnung</button>
      </div>
      <table>
        <thead><tr><th>Nr</th><th>Art</th><th>Status</th><th>Kunde</th><th>Datum</th><th>Brutto</th></tr></thead>
        <tbody>
          ${d.recent_documents.map((x) => `
            <tr>
              <td>${esc(x.number)}</td><td>${esc(x.kind)}</td><td>${badge(x.status)}</td>
              <td>${esc(x.contact_name || '—')}</td><td>${esc(x.issue_date)}</td><td>${euro(x.gross_total)}</td>
            </tr>`).join('') || '<tr><td colspan="6" class="muted">Noch keine Belege</td></tr>'}
        </tbody>
      </table>
    </div>`;
  $('#quick-invoice')?.addEventListener('click', () => navigate('invoices'));
}

async function renderDocuments(kind) {
  const [docs, contacts, products] = await Promise.all([
    api(`/documents?kind=${kind}`),
    api('/contacts'),
    api('/products'),
  ]);
  const label = kind === 'quote' ? 'Angebot' : kind === 'credit_note' ? 'Gutschrift' : 'Rechnung';
  content.innerHTML = `
    <div class="split">
      <div class="card">
        <div class="row" style="justify-content:space-between;margin-bottom:.6rem">
          <strong>${label}en</strong>
        </div>
        <table>
          <thead><tr><th>Nr</th><th>Status</th><th>Kunde</th><th>Datum</th><th>Brutto</th><th></th></tr></thead>
          <tbody>
            ${docs.map((d) => `
              <tr>
                <td>${esc(d.number)}</td><td>${badge(d.status)}</td><td>${esc(d.contact_name || '—')}</td>
                <td>${esc(d.issue_date)}</td><td>${euro(d.gross_total)}</td>
                <td class="row">
                  <a class="btn ghost" href="/api/documents/${d.id}/pdf" target="_blank">PDF</a>
                  ${kind === 'invoice' || kind === 'credit_note' ? `
                  <a class="btn ghost" href="/api/documents/${d.id}/xrechnung-ubl" target="_blank" title="XRechnung UBL">XR-UBL</a>
                  <a class="btn ghost" href="/api/documents/${d.id}/xrechnung-cii" target="_blank" title="XRechnung CII">XR-CII</a>
                  <a class="btn ghost" href="/api/documents/${d.id}/zugferd" target="_blank" title="ZUGFeRD / Factur-X PDF">ZUGFeRD</a>
                  ${kind === 'invoice' ? `<button class="btn ghost" data-pay="${d.id}">Bezahlt</button>` : ''}` : ''}
                </td>
              </tr>`).join('') || `<tr><td colspan="6" class="muted">Keine ${label}en</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="card">
        <strong>Neu: ${label}</strong>
        <form class="form" id="doc-form" style="margin-top:.8rem">
          <div class="form-grid">
            <label>Kunde
              <select name="contact_id">
                <option value="">—</option>
                ${contacts.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
              </select>
            </label>
            <label>Status
              <select name="status">
                <option value="draft">Entwurf</option>
                <option value="sent" selected>Gesendet</option>
                ${kind === 'quote' ? '<option value="accepted">Angenommen</option>' : ''}
              </select>
            </label>
            <label>Datum <input name="issue_date" type="date" required value="${today()}" /></label>
            <label>Fällig <input name="due_date" type="date" value="${addDays(14)}" /></label>
          </div>
          <label>Positionstitel <input name="title" required placeholder="Leistung" list="product-list" /></label>
          <datalist id="product-list">${products.map((p) => `<option value="${esc(p.name)}"></option>`).join('')}</datalist>
          <div class="form-grid">
            <label>Menge <input name="quantity" type="number" step="0.01" value="1" /></label>
            <label>Netto/Einh. <input name="net_unit_price" type="number" step="0.01" value="100" /></label>
            <label>USt % <input name="tax_rate" type="number" step="0.01" value="19" /></label>
          </div>
          <label>Intro <textarea name="intro" placeholder="Optionaler Text"></textarea></label>
          <button class="btn" type="submit">Speichern</button>
        </form>
      </div>
    </div>`;

  content.querySelectorAll('[data-pay]').forEach((btn) => {
    btn.onclick = async () => {
      await api(`/documents/${btn.dataset.pay}/pay`, { method: 'POST', body: '{}' });
      toast('Zahlung gebucht');
      render();
    };
  });

  $('#doc-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const titleVal = String(fd.get('title'));
    const product = products.find((p) => p.name === titleVal);
    const body = {
      kind,
      status: fd.get('status'),
      contact_id: fd.get('contact_id') ? Number(fd.get('contact_id')) : null,
      issue_date: fd.get('issue_date'),
      due_date: fd.get('due_date') || null,
      intro: fd.get('intro') || null,
      items: [
        {
          title: titleVal,
          product_id: product?.id || null,
          quantity: Number(fd.get('quantity')),
          net_unit_price: Number(fd.get('net_unit_price') || product?.net_price || 0),
          tax_rate: Number(fd.get('tax_rate') || product?.tax_rate || 19),
          unit: product?.unit || 'Stk',
        },
      ],
    };
    await api('/documents', { method: 'POST', body: JSON.stringify(body) });
    toast(`${label} erstellt`);
    render();
  };
}

async function renderExpenses() {
  const rows = await api('/expenses');
  content.innerHTML = `
    <div class="split">
      <div class="card">
        <strong>Ausgaben / Eingangsbelege</strong>
        <table>
          <thead><tr><th>Datum</th><th>Lieferant</th><th>Kategorie</th><th>Brutto</th><th>Status</th></tr></thead>
          <tbody>
            ${rows.map((e) => `<tr>
              <td>${esc(e.expense_date)}</td><td>${esc(e.vendor_name || '—')}</td>
              <td>${esc(e.category)}</td><td>${euro(e.gross_amount)}</td><td>${badge(e.payment_status)}</td>
            </tr>`).join('') || '<tr><td colspan="5" class="muted">Keine Ausgaben</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="card">
        <strong>Neue Ausgabe</strong>
        <form class="form" id="exp-form" style="margin-top:.8rem">
          <label>Lieferant <input name="vendor_name" required /></label>
          <label>Datum <input name="expense_date" type="date" value="${today()}" required /></label>
          <label>Kategorie
            <select name="category">
              <option value="buero">Büro</option>
              <option value="raum">Raum</option>
              <option value="weiterbildung">Weiterbildung</option>
              <option value="sonstiges" selected>Sonstiges</option>
            </select>
          </label>
          <label>Beschreibung <input name="description" /></label>
          <div class="form-grid">
            <label>Netto <input name="net_amount" type="number" step="0.01" value="50" required /></label>
            <label>USt % <input name="tax_rate" type="number" step="0.01" value="19" /></label>
          </div>
          <button class="btn" type="submit">Speichern</button>
        </form>
      </div>
    </div>`;
  $('#exp-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = Object.fromEntries(fd.entries());
    body.net_amount = Number(body.net_amount);
    body.tax_rate = Number(body.tax_rate);
    await api('/expenses', { method: 'POST', body: JSON.stringify(body) });
    toast('Ausgabe gebucht');
    render();
  };
}

async function renderContacts() {
  const rows = await api('/contacts');
  content.innerHTML = `
    <div class="split">
      <div class="card">
        <strong>Kontakte</strong>
        <table>
          <thead><tr><th>Name</th><th>Typ</th><th>E-Mail</th><th>Ort</th></tr></thead>
          <tbody>${rows.map((c) => `<tr>
            <td>${esc(c.name)}</td><td>${esc(c.type)}</td><td>${esc(c.email || '—')}</td>
            <td>${esc([c.zip, c.city].filter(Boolean).join(' ') || '—')}</td>
          </tr>`).join('') || '<tr><td colspan="4" class="muted">Keine Kontakte</td></tr>'}</tbody>
        </table>
      </div>
      <div class="card">
        <strong>Neuer Kontakt</strong>
        <form class="form" id="c-form" style="margin-top:.8rem">
          <label>Name <input name="name" required /></label>
          <label>Typ
            <select name="type"><option value="customer">Kunde</option><option value="vendor">Lieferant</option><option value="both">Beides</option></select>
          </label>
          <label>E-Mail <input name="email" type="email" /></label>
          <label>Telefon <input name="phone" /></label>
          <label>Straße <input name="street" /></label>
          <div class="form-grid">
            <label>PLZ <input name="zip" /></label>
            <label>Ort <input name="city" /></label>
          </div>
          <label>USt-IdNr. <input name="vat_id" /></label>
          <button class="btn" type="submit">Speichern</button>
        </form>
      </div>
    </div>`;
  $('#c-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    await api('/contacts', { method: 'POST', body: JSON.stringify(body) });
    toast('Kontakt angelegt');
    render();
  };
}

async function renderProducts() {
  const rows = await api('/products');
  content.innerHTML = `
    <div class="split">
      <div class="card">
        <strong>Leistungen & Artikel</strong>
        <table>
          <thead><tr><th>Name</th><th>Art</th><th>Netto</th><th>USt</th></tr></thead>
          <tbody>${rows.map((p) => `<tr>
            <td>${esc(p.name)}</td><td>${esc(p.kind)}</td><td>${euro(p.net_price)}</td><td>${p.tax_rate}%</td>
          </tr>`).join('') || '<tr><td colspan="4" class="muted">Keine Produkte</td></tr>'}</tbody>
        </table>
      </div>
      <div class="card">
        <strong>Neu</strong>
        <form class="form" id="p-form" style="margin-top:.8rem">
          <label>Name <input name="name" required /></label>
          <label>SKU <input name="sku" /></label>
          <label>Art <select name="kind"><option value="service">Leistung</option><option value="product">Artikel</option></select></label>
          <div class="form-grid">
            <label>Netto <input name="net_price" type="number" step="0.01" value="0" /></label>
            <label>USt % <input name="tax_rate" type="number" step="0.01" value="19" /></label>
            <label>Einheit <input name="unit" value="Stk" /></label>
          </div>
          <label>Beschreibung <textarea name="description"></textarea></label>
          <button class="btn" type="submit">Speichern</button>
        </form>
      </div>
    </div>`;
  $('#p-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    body.net_price = Number(body.net_price);
    body.tax_rate = Number(body.tax_rate);
    await api('/products', { method: 'POST', body: JSON.stringify(body) });
    toast('Produkt gespeichert');
    render();
  };
}

async function renderBanking() {
  const [accounts, txs] = await Promise.all([api('/bank/accounts'), api('/bank/transactions')]);
  const accountId = accounts[0]?.id || '';
  content.innerHTML = `
    <div class="card row" style="justify-content:space-between">
      <div>
        <strong>Banking</strong>
        <div class="muted tiny">CSV-Import + automatischer Abgleich offener Rechnungen/Ausgaben</div>
      </div>
      <div class="row">
        <button class="btn ghost" id="btn-match">Auto-Match</button>
      </div>
    </div>
    <div class="split">
      <div class="card">
        <strong>Umsätze</strong>
        <table>
          <thead><tr><th>Datum</th><th>Betrag</th><th>Gegenseite</th><th>Zweck</th><th>Status</th></tr></thead>
          <tbody>${txs.map((t) => `<tr>
            <td>${esc(t.booking_date)}</td><td>${euro(t.amount)}</td>
            <td>${esc(t.counterparty || '—')}</td><td>${esc(t.purpose || '—')}</td>
            <td>${badge(t.match_status)}</td>
          </tr>`).join('') || '<tr><td colspan="5" class="muted">Keine Umsätze</td></tr>'}</tbody>
        </table>
      </div>
      <div class="card">
        <strong>CSV importieren</strong>
        <div class="muted tiny" style="margin:.4rem 0 .8rem">Format: datum;betrag;gegner;zweck;id</div>
        <form class="form" id="bank-form">
          <label>Konto
            <select name="bank_account_id">
              ${accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}
            </select>
          </label>
          <label>CSV <textarea name="csv" placeholder="2026-10-01;119,00;Kunde GmbH;RE-2026-0001;tx1"></textarea></label>
          <button class="btn" type="submit">Import</button>
        </form>
      </div>
    </div>`;
  $('#btn-match').onclick = async () => {
    const r = await api('/bank/match', { method: 'POST', body: '{}' });
    toast(`${r.matched} Treffer`);
    render();
  };
  $('#bank-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      bank_account_id: Number(fd.get('bank_account_id') || accountId),
      csv: fd.get('csv'),
    };
    const r = await api('/bank/import', { method: 'POST', body: JSON.stringify(body) });
    toast(`Import: ${r.imported} neu, ${r.skipped} übersprungen`);
    render();
  };
}

async function renderDunning() {
  const [overdue, levels] = await Promise.all([api('/dunning/overdue'), api('/dunning/levels')]);
  content.innerHTML = `
    <div class="card">
      <div class="row" style="justify-content:space-between">
        <div>
          <strong>Mahnwesen</strong>
          <div class="muted tiny">Überfällige Rechnungen und Mahnstufen</div>
        </div>
        <button class="btn" id="run-dunning">Mahnlauf starten</button>
      </div>
      <table style="margin-top:1rem">
        <thead><tr><th>Rechnung</th><th>Kunde</th><th>Fällig</th><th>Offen</th></tr></thead>
        <tbody>${overdue.map((d) => `<tr>
          <td>${esc(d.number)}</td><td>${esc(d.contact_name || '—')}</td>
          <td>${esc(d.due_date)}</td><td>${euro(d.gross_total - (d.paid_amount || 0))}</td>
        </tr>`).join('') || '<tr><td colspan="4" class="muted">Nichts überfällig</td></tr>'}</tbody>
      </table>
      <div class="muted tiny" style="margin-top:1rem">Stufen: ${levels.map((l) => l.name).join(' · ')}</div>
    </div>`;
  $('#run-dunning').onclick = async () => {
    const r = await api('/dunning/run', { method: 'POST', body: JSON.stringify({ level_id: levels[0]?.id }) });
    toast(`Mahnlauf: ${r.created} × ${r.level}`);
    render();
  };
}

async function renderReports() {
  const year = new Date().getFullYear();
  const from = `${year}-01-01`;
  const to = today();
  const [euer, vat, guv] = await Promise.all([
    api(`/reports/euer?from=${from}&to=${to}`),
    api(`/reports/vat?from=${from}&to=${to}`),
    api(`/reports/guv?from=${from}&to=${to}`),
  ]);
  content.innerHTML = `
    <div class="grid">
      <div class="card"><h3>EÜR Ergebnis</h3><div class="value">${euro(euer.profit_net)}</div><div class="muted tiny">${from} – ${to}</div></div>
      <div class="card"><h3>USt Zahllast</h3><div class="value">${euro(vat.vat_payable)}</div><div class="muted tiny">USt ${euro(vat.vat_on_sales)} − VSt ${euro(vat.input_vat)}</div></div>
      <div class="card"><h3>GuV Ergebnis</h3><div class="value">${euro(guv.result_net)}</div></div>
    </div>
    <div class="split">
      <div class="card">
        <strong>EÜR Ausgaben nach Kategorie</strong>
        <table>
          <thead><tr><th>Kategorie</th><th>Netto</th></tr></thead>
          <tbody>${euer.expenses_by_category.map((e) => `<tr><td>${esc(e.category)}</td><td>${euro(e.net)}</td></tr>`).join('') || '<tr><td colspan="2" class="muted">—</td></tr>'}</tbody>
        </table>
      </div>
      <div class="card">
        <strong>USt nach Satz</strong>
        <table>
          <thead><tr><th>Satz</th><th>Netto</th><th>USt</th></tr></thead>
          <tbody>${vat.sales_by_rate.map((s) => `<tr><td>${s.rate}%</td><td>${euro(s.net)}</td><td>${euro(s.tax)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">—</td></tr>'}</tbody>
        </table>
        <p class="muted tiny">${esc(vat.note || '')}</p>
      </div>
    </div>`;
}

async function renderExports() {
  const year = new Date().getFullYear();
  content.innerHTML = `
    <div class="card">
      <strong>Exporte</strong>
      <p class="muted">DATEV-ähnlicher Buchungsstapel und E-Rechnung (XRechnung-XML) pro Beleg.</p>
      <div class="row">
        <a class="btn" href="/api/export/datev?from=${year}-01-01&to=${today()}">DATEV-CSV ${year}</a>
      </div>
      <p class="muted tiny" style="margin-top:1rem">Hinweis: Original-Exportformat von KlarKontor — kein zertifiziertes DATEV-Rechenzentrumsprodukt. Steuerberater-Übergabe vor Produktivnutzung prüfen.</p>
    </div>`;
}

async function renderCompany() {
  const c = await api('/company');
  content.innerHTML = `
    <div class="card">
      <strong>Firmendaten</strong>
      <form class="form" id="co-form" style="margin-top:.8rem">
        <div class="form-grid">
          <label>Name <input name="name" value="${escAttr(c.name || '')}" required /></label>
          <label>Rechtsform <input name="legal_form" value="${escAttr(c.legal_form || '')}" /></label>
          <label>E-Mail <input name="email" value="${escAttr(c.email || '')}" /></label>
          <label>Telefon <input name="phone" value="${escAttr(c.phone || '')}" /></label>
          <label>Straße <input name="street" value="${escAttr(c.street || '')}" /></label>
          <label>PLZ <input name="zip" value="${escAttr(c.zip || '')}" /></label>
          <label>Ort <input name="city" value="${escAttr(c.city || '')}" /></label>
          <label>USt-IdNr. <input name="vat_id" value="${escAttr(c.vat_id || '')}" /></label>
          <label>Steuernr. <input name="tax_number" value="${escAttr(c.tax_number || '')}" /></label>
          <label>IBAN <input name="iban" value="${escAttr(c.iban || '')}" /></label>
          <label>BIC <input name="bic" value="${escAttr(c.bic || '')}" /></label>
          <label>Standard-USt % <input name="default_tax_rate" type="number" step="0.01" value="${c.default_tax_rate ?? 19}" /></label>
        </div>
        <button class="btn" type="submit">Speichern</button>
      </form>
    </div>`;
  $('#co-form').onsubmit = async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target).entries());
    body.default_tax_rate = Number(body.default_tax_rate);
    await api('/company', { method: 'PUT', body: JSON.stringify(body) });
    toast('Firma gespeichert');
  };
}

async function renderAudit() {
  const rows = await api('/audit');
  content.innerHTML = `
    <div class="card">
      <strong>Audit-Log (GoBD-orientiert)</strong>
      <table>
        <thead><tr><th>Zeit</th><th>Aktion</th><th>Entity</th><th>Detail</th></tr></thead>
        <tbody>${rows.map((a) => `<tr>
          <td>${esc(a.at)}</td><td>${esc(a.action)}</td><td>${esc(a.entity || '')} ${esc(a.entity_id || '')}</td>
          <td>${esc(a.detail || '')}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
function escAttr(s) {
  return esc(s).replaceAll("'", '&#39;');
}
