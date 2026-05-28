# Frontend Refactor Quality Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Frontend-Refactoring auf Sicherheits-, Stabilitäts- und Wartbarkeitsniveau bringen, ohne sichtbare Regressionen in Kernflows.

**Architecture:** Wir härten zuerst unsichere Renderpfade (XSS), korrigieren datenlogische Fehler und beseitigen risikoarme Refactor-Reste. Danach folgt ein kontrollierter Orchestrierungs- und Zustandsabbau in kleinen, testbaren Paketen.

**Tech Stack:** Vanilla ESM, Browser DOM APIs, Service Worker, Node test runner.

---

## Paket 1: Security-Hardening (XSS)

**Files:**
- Modify: `frontend/tcg-tracker-web/js/views/search-results-view.js`
- Modify: `frontend/tcg-tracker-web/js/ui/components.js`

- [x] Escape für dynamische Suchtexte im Result-/Toolbar-Rendering eingeführt.
- [x] Search-History-Widget von `innerHTML` auf sichere DOM-Erzeugung umgestellt.
- [x] Export-Dialog-JSON vor DOM-Injektion escaped.
- [ ] Ergänzende Security-Regressionstests für bösartige Payloads hinzufügen.

## Paket 2: Datenkorrektheit

**Files:**
- Modify: `frontend/tcg-tracker-web/js/app/bootstrap-controller.js`

- [x] Backup-Export `imported`-Feld korrigiert (`Boolean(set.imported)` statt erzwungen `true`).
- [ ] Unit-Test ergänzen, der `imported=false` im Export absichert.

## Paket 3: Stabilität Service Worker

**Files:**
- Modify: `frontend/tcg-tracker-web/service-worker.js`

- [x] `CLEAR_CACHE`-Antwort auf fehlenden Message-Port abgesichert.
- [x] SW-Message-Handling mit und ohne `MessageChannel` testen.

## Paket 4: Refactor-Cleanup

**Files:**
- Modify: `frontend/tcg-tracker-web/js/app.js`

- [x] Unbenutzten Alias-Import entfernt.
- [ ] Weitere tote Imports und doppelte Zustandsquellen (`SEARCH_HISTORY`) schrittweise konsolidieren.

## Paket 5: Orchestrierungs-Konsolidierung (nächster Durchlauf)

**Files:**
- Modify: `frontend/tcg-tracker-web/js/app.js`
- Modify: `frontend/tcg-tracker-web/js/app/bootstrap-init.js`
- Modify: `frontend/tcg-tracker-web/js/app/pwa-init.js`

- [x] Bootstrap/PWA auf eine Source-of-Truth verdichten (PWA-Initialisierung aus `app.js` nach `app/pwa-init.js` zentralisiert).
- [x] Startup-/Auth-/Offline-Flows regressionssicher verifiziert (Unit-Test + Import-Health + Cardmarket-Suite).

---

## Verifikation (ausgeführt)

- [x] `node frontend/tcg-tracker-web/scripts/check-import-health.mjs`
- [x] `node --test scripts/cardmarket/cardmarket-ui-helpers.test.mjs frontend/tcg-tracker-web/tests/cardmarket-data.test.mjs`

## Akzeptanzkriterien

- Keine bekannten DOM-XSS-Pfade in Suche/History/Export.
- Backup-Export überträgt `imported` korrekt.
- Service Worker wirft keinen Fehler bei `CLEAR_CACHE` ohne Message-Port.
- Import-Health und bestehende Frontend-/Cardmarket-Tests bleiben grün.
