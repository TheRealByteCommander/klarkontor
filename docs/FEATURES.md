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
| E-invoice | ✅ | XRechnung-inspired UBL export |
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

