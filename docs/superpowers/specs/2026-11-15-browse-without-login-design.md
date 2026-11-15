# Stöbern ohne Login – Design

Stand: 2026-11-15 · Status: zur Prüfung durch die Nutzerin · Umfang: kleine bis mittlere Änderung (Frontend + ein Workflow)

## Ziel und Warum
Wer zufällig über GitHub auf das Projekt stößt, sieht heute nur „Bitte anmelden“ – und kann sich nicht anmelden, weil die Google-App nur zugelassene Testnutzer kennt. Künftig soll man ohne Login **stöbern** können: alle Sets, Karten, Bilder und Preise. Sammeln bleibt angemeldeten Nutzern vorbehalten. Ein **Schalter** muss den Stöbermodus jederzeit abstellen können (falls der Datenverkehr zu groß wird), damit die zugelassenen Nutzer weiter gut versorgt sind.

## Ziele
- Ohne Login (Schalter an): Dashboard mit allen Sets aus `api/v3/sets.json` (Logo, Serie, Erscheinungsdatum, ohne Fortschritt), Set-Ansicht mit Karten, Bildern und Cardmarket-Preisen, Lightbox, Suche.
- Statt der G/RH-Häkchen: Hinweis „Zum Sammeln anmelden“ (Klick öffnet den Login).
- Statistik ohne Login ausgeblendet (besteht fast nur aus der eigenen Sammlung).
- Einstellungen ohne Login: nur Kartensprache und Preisanzeige (Grundpreis, Preisspanne), gespeichert im Browser wie heute.
- „Google Login“-Knopf bleibt sichtbar; nach dem Login läuft alles wie heute (Sammlung aus dem Sheet).
- Schalter: Datei `frontend/tcg-tracker-web/app-flags.json` mit `{ "browseWithoutLogin": true }`, beim Start frisch geladen (ohne Cache). Dazu ein Workflow „Stöbermodus an/aus“ (manuell, Eingabe an/aus), der die Datei auf `release` (und `dev`) setzt und committet; der Push löst den Pages-Deploy aus.

## Nicht-Ziele
- Keine lokale Sammlung ohne Login (kein Abhaken im Browser-Speicher).
- Keine Änderung an den Google-Berechtigungen (`drive.file`-Umstieg ist ein eigenes, späteres Projekt).
- Keine neuen Daten in der API; alles kommt aus dem bestehenden `api/v3`.

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)
- Angemeldete Nutzer merken eine Verschlechterung (langsamer, anderer Ablauf, andere Daten).
- Schalter aus, aber nicht angemeldete Besucher laden trotzdem API-Daten (Karten, Suchindex).
- Der Schalter springt bei „Promote Dev to Release“ ungewollt um.

## Rahmen
- Reines Frontend auf `dev`, danach Weitergabe an `release`; `scripts/**` bleibt master.
- appVersion-Anhebung bei jeder Auslieferung; Tests (`node --test tests/*.test.mjs`, `check:imports`) grün.
- Fehlt `app-flags.json` oder ist sie nicht lesbar: Stöbermodus **aus** (sicherer Zustand).

## Ansätze (gewählt: 2)
1. Schalterdatei, die die App beim Start liest – Umschalten durch Bearbeiten auf github.com.
2. **Wie 1, plus Workflow-Knopf „Stöbermodus an/aus“ unter GitHub Actions** – ein Klick im Ernstfall; Actions-Zeit nur bei Benutzung. *Gewählt von der Nutzerin.*
3. Fester Wert im Code – Umschalten nur per Codeänderung und Deploy; als Notschalter ungeeignet.

## Festgelegtes zum Wie
- **Start:** Bootstrap lädt `app-flags.json` (mit `cache: 'no-store'` und Zeitstempel-Parameter). Ohne Login und Schalter an → Stöbermodus statt `resetToLoggedOut()`-Leerseite (`js/app.js` `resetToLoggedOut`, `js/app/bootstrap-controller.js`).
- **Sets:** im Stöbermodus aus `fetchAllAvailableSets()` (`js/data/pokemon-api.js`, liest `api/v3`), nicht aus der Sheet-Overview; ausgeschlossene/leere Sets wie heute gefiltert (`js/data/excluded-sets.js`).
- **Karten:** über den bestehenden v3-Pfad (`loadSetCardsV3First` in `js/views/set-view.js`), ohne Sammlungs-Map (leer).
- **Häkchen:** im Stöbermodus nicht rendern, stattdessen der Hinweis; Bulk-Edit, Fehlende-exportieren, Import und Support-Funktionen mit Sheet-Bezug ausgeblendet.
- **Promote:** `promote-dev-to-release.yml` stellt `frontend/tcg-tracker-web/app-flags.json` nach dem Merge aus `release` wieder her (wie heute `deploy-pages.yml`), damit der Schalter auf release nicht vom dev-Wert überschrieben wird.
- **Workflow:** `.github/workflows/toggle-browse-mode.yml`, `workflow_dispatch` mit Eingabe `enabled: true|false` und `target: release|dev|both`; setzt die Datei, committet nur bei Änderung, Push startet den Deploy.

## Dem Bauenden überlassen
- Gestaltung des Hinweises „Zum Sammeln anmelden“ (bestehende Komponenten/Stile nutzen).
- Ob die Suche im Stöbermodus den Sammelstatus-Filter ausblendet oder deaktiviert.
- Kleinere Texte (Statuszeile, z. B. „Stöbermodus – 195 Sets“).
