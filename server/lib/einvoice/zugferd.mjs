import { PDFDocument, PDFName, PDFArray, PDFDict } from 'pdf-lib';
import { buildInvoicePdf } from '../pdf.mjs';
import { buildCiiXml, ciiXmlFileName } from './cii.mjs';
import { facturXConformance, normalizeProfile, projectEInvoice } from './projection.mjs';

/**
 * Build ZUGFeRD / Factur-X hybrid PDF:
 * visual invoice PDF + embedded CII XML (factur-x.xml) + AF + XMP metadata.
 *
 * Note: full ISO PDF/A-3b certification requires a dedicated PDF/A engine.
 * This packager produces the Factur-X/ZUGFeRD structure expected by common
 * readers (embedded file, AF relationship Alternative, fx:* XMP).
 */
export async function buildZugferdPdf(documentId, opts = {}) {
  const profile = normalizeProfile(opts.profile || 'zugferd-en16931');
  const inv = projectEInvoice(documentId, { profile });
  const xml = buildCiiXml(documentId, { profile });
  const visual = await buildInvoicePdf(documentId);
  return packageFacturX(visual, xml, inv, profile);
}

export async function packageFacturX(pdfBytes, xmlString, inv, profile) {
  const pdfDoc = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const xmlBytes = Buffer.from(xmlString, 'utf8');
  const fileName = ciiXmlFileName(profile);
  const conformance = facturXConformance(profile);

  await pdfDoc.attach(xmlBytes, fileName, {
    mimeType: 'text/xml',
    description: `Factur-X ${conformance} invoice data`,
    creationDate: new Date(`${inv.issueDate}T00:00:00Z`),
    modificationDate: new Date(),
  });

  // Ensure AF relationship = Alternative on the embedded file spec if present.
  markAfRelationshipAlternative(pdfDoc);

  const xmp = buildFacturXmp({
    title: `Rechnung ${inv.number}`,
    author: inv.seller.name,
    subject: `ZUGFeRD/Factur-X ${conformance}`,
    fileName,
    conformance,
    documentType: 'INVOICE',
  });

  injectXmpMetadata(pdfDoc, xmp);

  pdfDoc.setTitle(`Rechnung ${inv.number}`);
  pdfDoc.setAuthor(inv.seller.name);
  pdfDoc.setSubject(`E-Rechnung ${conformance}`);
  pdfDoc.setProducer('KlarKontor');
  pdfDoc.setCreator('KlarKontor E-Invoice');
  pdfDoc.setKeywords(['ZUGFeRD', 'Factur-X', 'EN16931', 'XRechnung', inv.number]);

  const out = await pdfDoc.save({ useObjectStreams: false });
  return Buffer.from(out);
}

function markAfRelationshipAlternative(pdfDoc) {
  try {
    const catalog = pdfDoc.catalog;
    const context = pdfDoc.context;
    const af = catalog.get(PDFName.of('AF'));
    if (!af) return;
    const afArr = context.lookup(af);
    if (!(afArr instanceof PDFArray)) return;
    for (let i = 0; i < afArr.size(); i++) {
      const ref = afArr.get(i);
      const dict = context.lookup(ref);
      if (dict instanceof PDFDict) {
        dict.set(PDFName.of('AFRelationship'), PDFName.of('Alternative'));
      }
    }
  } catch {
    // best-effort
  }
}

function injectXmpMetadata(pdfDoc, xmpXml) {
  const context = pdfDoc.context;
  const metadataStream = context.flateStream(xmpXml, {
    Type: 'Metadata',
    Subtype: 'XML',
  });
  const metadataRef = context.register(metadataStream);
  pdfDoc.catalog.set(PDFName.of('Metadata'), metadataRef);

  // Mark PDF/A-3 intent on catalog via markinfo (not full output intent).
  const markInfo = context.obj({ Marked: true });
  pdfDoc.catalog.set(PDFName.of('MarkInfo'), markInfo);
}

function buildFacturXmp({ title, author, subject, fileName, conformance, documentType }) {
  const now = new Date().toISOString();
  const fxConformance = conformance === 'BASIC' ? 'BASIC' : 'EN 16931';
  // pdfaid part 3 = PDF/A-3; conformance B
  return `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
      xmlns:dc="http://purl.org/dc/elements/1.1/"
      xmlns:pdf="http://ns.adobe.com/pdf/1.3/"
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"
      xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(title)}</rdf:li></rdf:Alt></dc:title>
      <dc:creator><rdf:Seq><rdf:li>${xmlEscape(author)}</rdf:li></rdf:Seq></dc:creator>
      <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(subject)}</rdf:li></rdf:Alt></dc:description>
      <pdf:Producer>KlarKontor</pdf:Producer>
      <xmp:CreatorTool>KlarKontor</xmp:CreatorTool>
      <xmp:CreateDate>${now}</xmp:CreateDate>
      <xmp:ModifyDate>${now}</xmp:ModifyDate>
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
      <fx:DocumentType>${xmlEscape(documentType)}</fx:DocumentType>
      <fx:DocumentFileName>${xmlEscape(fileName)}</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>${xmlEscape(fxConformance)}</fx:ConformanceLevel>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

function xmlEscape(s) {
  return String(s ?? '')
    .replaceAll('&', '&' + 'amp;')
    .replaceAll('<', '&' + 'lt;')
    .replaceAll('>', '&' + 'gt;')
    .replaceAll('"', '&' + 'quot;');
}
