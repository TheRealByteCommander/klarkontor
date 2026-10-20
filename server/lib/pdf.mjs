import PDFDocument from 'pdfkit';
import { getCompany, loadDocument } from './docs.mjs';

export function buildInvoicePdf(documentId) {
  const docData = loadDocument(documentId);
  if (!docData) throw new Error('Not found');
  const company = getCompany();

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const title =
      docData.kind === 'quote'
        ? 'Angebot'
        : docData.kind === 'credit_note'
          ? 'Gutschrift'
          : 'Rechnung';

    doc.fillColor('#0f766e').fontSize(22).text('KlarKontor', { continued: false });
    doc.fillColor('#111').fontSize(16).text(title, { align: 'right' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#333');
    doc.text(company.name || '');
    if (company.street) doc.text(company.street);
    if (company.zip || company.city) doc.text(`${company.zip || ''} ${company.city || ''}`.trim());
    if (company.vat_id) doc.text(`USt-IdNr. ${company.vat_id}`);
    if (company.iban) doc.text(`IBAN ${company.iban}`);

    doc.moveDown();
    doc.fontSize(11).fillColor('#111');
    doc.text(`Nummer: ${docData.number}`);
    doc.text(`Datum: ${docData.issue_date}`);
    if (docData.due_date) doc.text(`Fällig: ${docData.due_date}`);
    doc.text(`Status: ${docData.status}`);
    doc.moveDown();
    doc.text(`Empfänger: ${docData.contact_name || '—'}`);
    if (docData.intro) {
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#444').text(docData.intro);
    }

    doc.moveDown();
    doc.fontSize(10).fillColor('#0f766e').text('Positionen', { underline: true });
    doc.moveDown(0.3);
    doc.fillColor('#111');

    for (const it of docData.items) {
      doc.text(
        `${it.position}. ${it.title}  |  ${it.quantity} ${it.unit} × ${fmt(it.net_unit_price)}  USt ${it.tax_rate}%  = ${fmt(it.gross_total)} €`,
      );
      if (it.description) doc.fillColor('#555').text(`   ${it.description}`).fillColor('#111');
    }

    doc.moveDown();
    doc.text(`Netto: ${fmt(docData.net_total)} €`);
    doc.text(`USt: ${fmt(docData.tax_total)} €`);
    doc.fontSize(12).text(`Brutto: ${fmt(docData.gross_total)} €`);

    if (docData.notes) {
      doc.moveDown();
      doc.fontSize(9).fillColor('#444').text(docData.notes);
    }
    if (docData.footer) {
      doc.moveDown();
      doc.fontSize(8).fillColor('#666').text(docData.footer);
    }

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#888').text('Erstellt mit KlarKontor — originale Software, nicht mit Lexware/Haufe verbunden.');
    doc.end();
  });
}

function fmt(n) {
  return Number(n || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
