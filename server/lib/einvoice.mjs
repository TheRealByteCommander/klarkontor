/** Backward-compatible facade — implementation lives in ./einvoice/ */
export {
  buildXRechnungXml,
  buildUblXml,
  buildCiiXml,
  buildZugferdPdf,
  exportEInvoice,
  listEInvoiceProfiles,
  normalizeProfile,
  projectEInvoice,
} from './einvoice/index.mjs';
