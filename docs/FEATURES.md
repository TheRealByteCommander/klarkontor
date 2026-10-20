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
| E-invoice (demo UBL) | ✅ v0.1 | Best-effort UBL subset — **not** certified |
| **Real XRechnung** (EN 16931 / KOSiT) | 🔴 P0 | Pflicht: validierbares XML (UBL **und/oder** CII), Profil XRechnung 3.x |
| **Real ZUGFeRD** (PDF/A-3 + embedded CII) | 🔴 P0 | Pflicht: hybrides PDF+XML, Profile BASIC/EN16931; nicht nur flaches PDF |
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

