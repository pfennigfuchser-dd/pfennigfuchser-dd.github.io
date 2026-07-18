# 08_Website — Quellcode der Pfennigfuchser-Website

**Live:** https://pfennigfuchser-dd.github.io (GitHub Pages, Repo `pfennigfuchser-dd/pfennigfuchser-dd.github.io`)
**Stand:** 17.07.2026 — ersetzt die reine Linkseite (Version 1 liegt in der Git-Historie und in `05_Linkseite/`).

## Was die Seite kann

- **Tagesbon auf der Startseite:** rendert `today.json` (Export der Pipeline) als Kassenzettel —
  Produkte, Tagessieger, Ersparnis, ausklappbare Ketten-Preise + Preisverlauf-Sparkline, Fuchs-Fakt.
  `is_demo: true` zeigt einen unübersehbaren DEMO-Banner. Veralteter Stand wird als solcher beschriftet.
- **so-funktionierts.html:** die Methode als Vertrauensseite (4 Regeln, Quellen, „lieber Lücke als Lüge",
  Korrektur-Versprechen, Melde-Mail).
- **Linkseiten-Funktion:** WhatsApp-/Instagram-Buttons, Impressum (`/#impressum` — in Kanal-Bios
  verlinkt, Anker nie entfernen!), Datenschutz.
- Kein Tracking, keine Fremd-Requests, Fonts (DejaVu Sans Mono woff2) selbst gehostet.

## Deploy

Quelle der Wahrheit ist DIESER Ordner. Deployment = Kopie ins lokale Repo + Push:

```
cd C:\Users\Pierre\.pfennigfuchser\repos\website
git pull
cp -r "G:\Meine Ablage\Lebensmittel-Vergleichsapp\08_Website\." .
git add -A && git commit -m "<was geändert wurde>" && git push
```

`today.json` wird **täglich automatisch** von der Tagesredaktion gepusht
(Runbook `06_Betrieb/TAGESREDAKTION.md` §5b) — nie von Hand pflegen.

## Regeln

- Design-Werte kommen aus `02_Design/CI.md` + Design System — nichts erfinden.
- Impressums-/Datenschutztexte nur nach Rücksprache mit Pierre ändern.
- Nur im Code-Editor bearbeiten (nie TextEdit/Word — hat am 10.07. schon einmal das Design zerstört).
- `README.md` wird nicht mit deployt (schadet aber auch nicht).
