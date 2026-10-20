# KlarKontor

**KlarKontor** is an original German SME office & bookkeeping web app:

- Contacts (customers / vendors)
- Products & services
- Quotes, invoices, credit notes
- PDF documents
- E-invoice: **XRechnung UBL/CII** + **ZUGFeRD/Factur-X** (EN 16931 & BASIC)
- Expenses / incoming receipts
- Banking CSV import + payment matching
- Dunning levels & runs
- Recurring invoice rules
- Simple chart of accounts + journal
- EÜR, GuV, VAT overview
- DATEV-style booking CSV export
- Audit log

> **Not affiliated with Lexware, lexoffice, Haufe, or DATEV.**  
> Feature coverage targets common German SME office workflows from public product categories — implemented from scratch. No reverse engineering of third-party software.

## Requirements

- Node.js **≥ 22.19** (uses built-in `node:sqlite`)
- Optional: `pdfkit` (installed via npm)

## Quick start

```bash
npm install
npm run seed    # optional demo data
npm start       # http://127.0.0.1:8787
```

Environment:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | HTTP port |
| `HOST` | `127.0.0.1` | Bind address |
| `KLARKONTOR_DB` | `./data/klarkontor.sqlite` | SQLite path |
| `KLARKONTOR_DATA` | `./data` | Data directory |

## Scripts

```bash
npm test          # unit tests
npm run smoke     # end-to-end API smoke (spawns temp server)
npm run seed      # demo company + invoice
npm run dev       # node --watch
```

## API (excerpt)

- `GET /api/health`
- `GET /api/dashboard`
- `GET|POST /api/contacts` · `GET|POST /api/products`
- `GET|POST /api/documents` · `GET .../pdf` · `.../xrechnung-ubl` · `.../xrechnung-cii` · `.../zugferd` · `GET /api/einvoice/profiles`
- `GET|POST /api/expenses`
- `POST /api/bank/import` · `POST /api/bank/match`
- `GET /api/reports/euer|vat|guv`
- `GET /api/export/datev?from=&to=`

## Scope vs commercial suites

KlarKontor **v0.1** covers the core daily loop for freelancers and small companies.  
**P0 e-invoice (2026-10-20):** XRechnung UBL+CII and ZUGFeRD/Factur-X shipped in v0.2. **Next P0:** Lexware import (~2015 ASCII/CSV). See [docs/PRIORITIES.md](./docs/PRIORITIES.md).  
Not yet: live bank PSD2, ELSTER filing, certified payroll, multi-company SaaS tenancy, mobile apps, full PEPPOL access points, or tax-advisor real-time collaboration.

Those can grow module-by-module without rewriting the core.

## Synergy

Designed to sit beside other ByteCommander tools (e.g. later import of BC Charge billing exports into KlarKontor invoices/expenses).

## License

MIT — see [LICENSE](./LICENSE).

## Disclaimer

This software is provided as-is. Accounting, VAT, GoBD, and e-invoice compliance for production use must be validated with your tax advisor. Exports are intentionally documented as simplified originals, not certified third-party formats.
