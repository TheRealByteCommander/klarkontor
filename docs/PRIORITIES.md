# KlarKontor — locked product priorities (2026-10-20)

Owner decision (Matthias): **echtes ZUGFeRD + echtes X-Rechnung** gehören zu den **wichtigsten Features**. Zusätzlich muss **Import von Lexware** möglich sein — **auch ältere Versionen ca. 2015**.

## Non-negotiables (P0)

### 1. Echtes X-Rechnung
- EN 16931–konformes XML
- Customization/Profile wie XRechnung 3.x (nicht nur „UBL-inspiriert“)
- Pflichtfelder: Lieferant/Kunde Adresse+USt, Leitweg-ID wo B2G, PaymentMeans, TaxBreakdown, Line items mit Einheit/Steuer
- Ziel: KOSiT-/Schematron-validierbar (CI-Gate sobald Fixture da)
- Ausgabe: reines `.xml` (UBL und/oder CII Cross Industry Invoice)

### 2. Echtes ZUGFeRD
- **PDF/A-3** mit **eingebettetem** CII-XML (nicht PDF + separater XML-Download)
- Profile mindestens: **BASIC** und **EN 16931** (Comfort-Äquivalent)
- Sichtbares PDF und maschinenlesbares XML müssen dieselben Beträge/Positionen tragen
- Abwärts: ZUGFeRD 2.x EN16931; optional später 1.0 nur wenn ein Alt-Import es braucht

### 3. Import von Lexware (auch ~2015)
- **Richtung:** Daten **aus** Lexware **in** KlarKontor
- Zielprodukte der Alt-Welt: Desktop-Linie (buchhaltung / faktura+auftrag / warenwirtschaft) mit **Datei → Export/Import → ASCII/CSV** (~2014/2015 Dokus)
- Mindestens:
  1. **Personenkonten** (Debitoren/Kreditoren → contacts)
  2. **Artikel/Leistungen** → products
  3. Optional P0.5: **Buchungsstapel** ASCII → journal/expenses (mit Mapping-UI)
- Regeln öffentlich dokumentierter Schnittstellen (Semikolon, TT.MM.JJJJ, Komma-Dezimal, ANSI/Windows-1252)
- **Kein** Reverse Engineering von Lexware-Binaries/DB — nur dokumentierte/exportierte Textformate + User-Samples
- Cloud **Lexware Office**: zusätzlich ZUGFeRD/XRechnung- und DATEV-CSV-Pfade (P1), nicht Ersatz für Desktop-ASCII-Import

## Explicit non-goals (now)
- Lexware-UI klonen / Feature-Parität 1:1
- Zertifizierte PEPPOL Access Point Betreiberrolle (kann später angeschlossen werden)
- Payroll / ELSTER Submit

## IST (v0.1 @ `91dc0e3`)
- PDF: normales pdfkit-PDF (**kein** PDF/A-3, **kein** Embedded XML) → **kein ZUGFeRD**
- E-Invoice: `server/lib/einvoice.mjs` = **minimaler UBL-Subset**, Label „XRechnung-inspired“ → **kein echtes XRechnung**
- Lexware-Import: **fehlt**
- DATEV-style CSV Export: vorhanden (vereinfacht)

## Next implementation slices
1. **Domain model harden** for e-invoice (Leitweg-ID, buyer ref, unit codes UNECE, tax category codes, BT- Pflichtmapping)
2. **CII builder** + **UBL builder** sharing one invoice projection
3. **XRechnung validator gate** (fixture + schematron or kosit validator in CI when available)
4. **ZUGFeRD packager**: PDF/A-3 + embed `factur-x.xml` / ZUGFeRD CII
5. **Lexware ASCII import adapters** v2015-tolerant: contacts → products → bookings
6. Sample pack: anonymisierte User-Exports 2015 + modern for golden tests

## Synergy
- BC Charge billing exports → KlarKontor invoices/expenses (already noted in README)
- Shared money/tax helpers; one e-invoice core usable later for BC Charge B2B invoices if needed
