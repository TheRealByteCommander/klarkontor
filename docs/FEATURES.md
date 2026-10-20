# Feature map (public SME office categories → KlarKontor)

Original implementation. No third-party binaries were analyzed.

| Capability | KlarKontor v0.1 | Notes |
|---|---|---|
| Company profile | ✅ | Stammdaten, IBAN, USt-Id |
| Contacts | ✅ | customer / vendor / both |
| Products & services | ✅ | net price + tax |
| Quotes | ✅ | PDF |
| Invoices | ✅ | numbering, status, PDF |
| Credit notes | ✅ API/data model | UI focuses invoice/quote first |
| Recurring invoices | ✅ API | rules + run endpoint |
| **XRechnung UBL 3.0** | ✅ v0.2 | EN 16931 customization, TaxSubtotals, BuyerReference, SEPA PaymentMeans |
| **XRechnung CII 3.0** | ✅ v0.2 | UN/CEFACT CrossIndustryInvoice, same projection |
| **ZUGFeRD / Factur-X EN 16931** | ✅ v0.2 | PDF + embedded `factur-x.xml` (CII), AF Alternative, fx XMP |
| **ZUGFeRD / Factur-X BASIC** | ✅ v0.2 | same packager, BASIC guideline |
| KOSiT/Schematron CI gate | 🟡 next | structural tests green; external validator still optional |
| Full ISO PDF/A-3b engine | 🟡 next | XMP pdfaid part=3 set; dedicated PDF/A normalizer optional |
| **Lexware-Import** (Desktop ~2015+) | 🔴 P0 | Import von Lexware-Exporten: Stammdaten (Personenkonten/Artikel) + optional Buchungen via öffentliche ASCII/CSV-Schnittstelle; auch ältere Layouts ca. 2015 |
| Lexware Office (Cloud) Interop | 🟡 P1 | ZUGFeRD/XRechnung Roundtrip + DATEV-CSV wo sinnvoll; kein RE von Lexware |
| Expenses / Belege | ✅ | categories + journal |
| Banking | ✅ | CSV import + match |
| Live bank PSD2 | ❌ | future |
| Dunning | ✅ | levels + runs |
| EÜR | ✅ | simplified |
| GuV | ✅ | from journal |
| USt overview | ✅ | no ELSTER submit |
| DATEV export | ✅ | simplified CSV |
| Payroll | ❌ | future module |
| Tax advisor live access | ❌ | export-based for now |
| Audit log | ✅ | append-only style log |
| GoBD archive certification | ❌ | log foundation only |
| Mobile apps | ❌ | responsive web |

