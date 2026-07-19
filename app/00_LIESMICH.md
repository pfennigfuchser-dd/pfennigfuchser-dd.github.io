# Pfennigfuchser App — Quellcode & Betrieb

**Live:** https://pfennigfuchser-dd.github.io/app/ · Stand: 19.07.2026 (Sprint S1 + S2 fertig)

Eine **PWA** (installierbare Web-App, kein App-Store) über der täglichen `today.json` —
genau der Datei, die der Tageslauf ohnehin für Website & Postings baut. **Kein Backend,
kein Konto, kein Tracker, keine Fremd-Requests** (per CSP erzwungen).

## Was die App kann (Stand jetzt)

- **🧾 Heute** — der Tagesbon: je Produkt der günstigste belegte Laden, Ersparnis (grün),
  aufklappbarer Preisverlauf (Sparkline). „Warenkorb bis X € günstiger" als ehrliche Summe.
- **🛒 Meine Liste** — die 21 Produkte antippen, die man regelmäßig kauft (lokal gespeichert).
  Ergebnis: „N von M heute im Angebot", je Produkt günstigster Laden, Lücken = **„heute kein Beleg"**.
  **Korb-Tipp:** welcher Laden bei den meisten deiner Produkte heute am günstigsten ist —
  **ohne erfundene Korbsumme** (die kommt erst mit Normalpreisen aller Ketten, siehe Sprintplan §
  „Einkaufswagen vergleicht Läden").

## Architektur (Effizienz-Prinzip)

```
04_Pipeline (Tageslauf)
   └─ web/today.json  ──►  repo/today.json         (Website liest Root)
                      └─►  repo/app/today.json      (App liest in-scope)
```

- **Eine Quelle, zwei Ziele.** `daily_run.ps1` kopiert `web/today.json` beim Website-Push nach
  Root **und** `/app/today.json`. Die App aktualisiert sich damit jeden Morgen automatisch —
  keine Zusatzarbeit, kein zweiter Datenweg.
- **Warum `today.json` in-scope (`/app/`)?** Der Service Worker unter `/app/sw.js` hat Scope
  `/app/` und kann nur Dateien darunter offline cachen. Läge die Daten-JSON in der Root, wäre der
  Offline-Fallback tot. Darum liegt eine Kopie neben der App; `../today.json` ist nur Notfall-Fallback.
- **today.json braucht `catalog`** (alle 21 Produkte) — kommt aus `web_export.py`. Ohne den Block
  bleibt die Merkliste leer.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | Shell: Topbar, Heute-/Liste-View, USP-Footer, Tabs, CSP |
| `app.js` | Lädt `today.json`, rendert Bon + Liste + Korb-Tipp, Merkliste (localStorage) |
| `styles.css` | Kassenzettel-CI (02_Design/CI.md): Mono, Papier, Kettenfarben, Kontrast (WCAG AA) |
| `sw.js` | Service Worker: Shell cache-first, Navigation→index.html, `today.json` network-first |
| `manifest.webmanifest` | PWA-Manifest (installierbar) |
| `today.json` | LOKALE Testkopie (nicht deployt — im Repo wird sie täglich überschrieben) |
| `icons/`, `fonts/` | App-Icons + DejaVu-Mono |

## Deploy

Quellcode ist hier (`10_App/`). Deploy = spiegeln nach `…/repos/website/app/` (today.json außen vor,
wird separat aus der Pipeline gesetzt), committen, per SSH pushen:

```powershell
robocopy "G:\Meine Ablage\Lebensmittel-Vergleichsapp\10_App" "C:\Users\Pierre\.pfennigfuchser\repos\website\app" /MIR /XF today.json
Copy-Item "...\04_Pipeline\web\today.json" "...\repos\website\app\today.json" -Force
# git add app; commit; push  (SSH-Deploy-Key, entkoppelt vom privaten GitHub-Login)
```

**Wichtig bei Shell-Änderungen:** in `sw.js` die `CACHE`-Version hochzählen (z. B. `pf-app-v3` → `v4`),
sonst sehen installierte Nutzer die alte Version. (Review-Finding; künftig im Deploy automatisieren.)

## Geprüft (Sprint-Feedback-Loop)

Adversarialer Review (3 Agenten, 21 Findings) eingearbeitet — u. a.: Offline-Start (Navigation +
Cache-Buster) repariert, leere/entkernte `today.json` → ehrliche Leeransicht statt „undefined",
keine erfundene Quelle/„21", deutsche Zahlen (Tausenderpunkt), Tastatur-/Screenreader-Bedienung,
WCAG-Kontrast (Netto-Gold & --muted abgedunkelt), Grün nur für Ersparnis, CSP same-origin.

## Sprints — Stand

- **S1 ✅** PWA-Shell + Tagesbon · **S2 ✅** Meine Liste + Korb-Tipp
- **S3 ✅** Angebots-Radar (Tab 📡) + Produkt-Detail-Sheet (SVG-Verlauf, Einheiten-Beweis)
- **S4 ✅** Onboarding (Info-Bon) + „So funktioniert's" + Teilen (Web Share/Clipboard)

**spark sauber ✅** (19.07.): `_cheapest_history_clean` in `rank.py` baut den Verlauf aus demselben
gefilterten (Blocklist + aktive Ketten + keine Demo) und normalisierten Tagespreis wie der Bon. Dadurch
gilt `spark[-1]` == angezeigter Grundpreis für alle Produkte → Kaffee/Butter haben jetzt einen Chart, und
die Historie zeigt nur echte Eigenmarken-Tage (mit ehrlichen Datumslücken). Test sichert die Invariante
(`tests/test_pipeline.py`). Produkte mit nur 1 Eigenmarken-Tag (Joghurt/Zucker) zeigen ehrlich „1 Messpunkt".

**Später (gated):** Push, Kassenbon-light, OCR, **Korb-Router** (echte Korbsumme je Laden — braucht Normalpreise aller Ketten).
