import { buildUblXml } from './ubl.mjs';
import { buildCiiXml } from './cii.mjs';
import { buildZugferdPdf } from './zugferd.mjs';
import {
  isZugferd,
  listEInvoiceProfiles,
  normalizeProfile,
  projectEInvoice,
} from './projection.mjs';

export {
  buildUblXml,
  buildCiiXml,
  buildZugferdPdf,
  listEInvoiceProfiles,
  normalizeProfile,
  projectEInvoice,
};

/** @deprecated use buildUblXml — kept for older imports/smoke */
export function buildXRechnungXml(documentId, opts = {}) {
  return buildUblXml(documentId, { profile: opts.profile || 'xrechnung-ubl' });
}

/**
 * Unified export entry.
 * @returns {Promise<{ kind: 'xml'|'pdf', profile: string, filename: string, contentType: string, body: string|Buffer, warnings?: string[] }>}
 */
export async function exportEInvoice(documentId, profileRaw = 'xrechnung-ubl') {
  const profile = normalizeProfile(profileRaw);
  const inv = projectEInvoice(documentId, { profile });

  if (isZugferd(profile)) {
    const body = await buildZugferdPdf(documentId, { profile });
    const safeNo = String(inv.number).replaceAll(/[^\w.-]+/g, '_');
    return {
      kind: 'pdf',
      profile,
      filename: `zugferd-${safeNo}.pdf`,
      contentType: 'application/pdf',
      body,
    };
  }

  if (profile === 'xrechnung-cii') {
    const body = buildCiiXml(documentId, { profile });
    const safeNo = String(inv.number).replaceAll(/[^\w.-]+/g, '_');
    return {
      kind: 'xml',
      profile,
      filename: `xrechnung-cii-${safeNo}.xml`,
      contentType: 'application/xml; charset=utf-8',
      body,
    };
  }

  const body = buildUblXml(documentId, { profile: 'xrechnung-ubl' });
  const safeNo = String(inv.number).replaceAll(/[^\w.-]+/g, '_');
  return {
    kind: 'xml',
    profile: 'xrechnung-ubl',
    filename: `xrechnung-ubl-${safeNo}.xml`,
    contentType: 'application/xml; charset=utf-8',
    body,
  };
}
