# Design-Spezifikation: TCG Tracker Web Restrukturierung

- **Datum:** 22.03.2026
- **Projekt:** `frontend/tcg-tracker-web`
- **Ziel:** Logische Aufteilung, selbsterklärende Benennung, Reduktion auf notwendige Inhalte, vollständige Markdown-Wiki-Dokumentation mit interner Verlinkung.

## 1. Kontext und Problem

Der aktuelle Zustand des Frontends ist funktional, aber strukturell schwer wartbar:

- `js/app.js` ist monolithisch (ca. 5.000+ Zeilen)
- `css/main.css` ist monolithisch (ca. 4.000+ Zeilen)
- Gemischte Verantwortlichkeiten (Datenzugriff, UI, Domänenlogik, Hilfsfunktionen)
- Mehrere Module sind ganz oder teilweise ungenutzt
- Benennungen wie `advanced-*`, `social-*`, `community-*` überlappen semantisch

Folgen:

- Erhöhte Einarbeitungszeit
- Höhere Fehlerwahrscheinlichkeit bei Änderungen
- Schlechtere Testbarkeit einzelner Einheiten
- Unklare Modulgrenzen und Abhängigkeiten

## 2. Ziele und Nicht-Ziele

### Ziele

1. **Klare, selbsterklärende Ordner- und Dateistruktur** im `tcg-tracker-web`.
2. **Fokussierte Dateien** mit enger Verantwortung (Single Responsibility).
3. **Entfernung von Dead Code**, sofern verlässlich ungenutzt.
4. **Stabile öffentliche Schnittstellen** für zentrale Module.
  Änderungen an Exportnamen/-signaturen erfolgen nur mit Kompatibilitätslayer für einen Migrationszyklus oder mit dokumentiertem Breaking-Change-Eintrag in `migration-validation.md`.
5. **Vollständige Dokumentation als Markdown-Wiki** mit Unterverlinkung.

### Nicht-Ziele

- Keine funktionale Neuentwicklung am Produktumfang.
- Kein Redesign der UI/UX.
- Kein Build-Tool- oder Framework-Wechsel.

## 3. Architekturentscheidung

Es wird ein **Hybrid-Modell** genutzt:

- **Layer für Infrastruktur:** `core`, `data`
- **Feature-Slices für Domäne:** `features/*`
- **Getrennte UI-Schicht:** `ui`

### Begründung

- Verhindert unkontrollierte Querverbindungen
- Trennt technische Infrastruktur von fachlicher Logik
- Erhöht Lesbarkeit und Wartbarkeit
- Bleibt für eine statische ES-Module-App einfach genug

## 4. Zielstruktur JavaScript

```text
frontend/tcg-tracker-web/js/
  app.js
  core/
    auth.js
    cache.js
    config.js
    utils.js
  data/
    pokemon-api.js
    sheets-db.js
  features/
    collection/
      index.js
      export.js
      stats.js
      value.js
      versioning.js
    search/
      index.js
      engine.js
      favorites.js
      filters.js
      history.js
    community/
      index.js
      profiles.js
      sync.js
    settings/
      index.js
      settings.js
  ui/
    command-palette.js
    components.js
    panels.js
    tools.js
  deprecated/
    ... (nur Quarantäne, keine produktiven Imports)
```

## 5. Zielstruktur CSS

```text
frontend/tcg-tracker-web/css/
  main.css
  base/
    reset.css
    variables.css
  layout/
    grid.css
    modal.css
    sidebar.css
    topbar.css
  components/
    button.css
    card.css
    dropdown.css
    spinner.css
    toast.css
  views/
    dashboard.css
    search.css
    set-view.css
    stats.css
  features/
    community.css
  themes/
    dark.css
  deprecated/
    ... (optional für temporär stillgelegte Styles, keine Referenz aus `main.css`)
```

`main.css` enthält künftig nur strukturierte `@import`-Anweisungen in stabiler Reihenfolge.

## 6. Modul-Mapping Alt → Neu

### Beibehalten (nur verschieben)

- `auth.js` → `core/auth.js`
- `cache.js` → `core/cache.js`
- `config.js` → `core/config.js`
- `utils.js` → `core/utils.js`
- `sheets-db.js` → `data/sheets-db.js`
- `pokemon-api.js` → `data/pokemon-api.js`
- `smart-engine.js` → `features/search/engine.js`
- `collection-versioning.js` → `features/collection/versioning.js`
- `command-palette.js` → `ui/command-palette.js`
- `ui-components.js` → `ui/components.js`
- `advanced-tools.js` → `ui/tools.js`
- `realtime-sync.js` → `features/community/sync.js`

### Aufteilen

- `enhanced-features.js` → `features/collection/stats.js`, `features/search/{favorites,history,filters}.js`, `features/settings/settings.js`
- `advanced-features.js` → `features/collection/export.js` (enthält ausschließlich: `downloadJson`, `createLocalBackup`, `getLocalBackups`; alle übrigen Funktionen werden klar umgezogen oder entfernt)
- `social-ui.js` → `ui/panels.js` (nur genutzte Panel-Fabriken)
- `trading-ui.js` → `ui/panels.js` (genutzte Teile) + `deprecated/trading-ui.js` (Quarantäne-Rest, Löschung im Folge-Release)
- `community-features.js` → `features/community/profiles.js` (nur aktiv genutzte Profile/Share-Funktionen)
- `card-filters.js` → `features/collection/value.js` (nur benötigte Bewertungs-/Wertlogik)

### Quarantäne (Release N)

- `pokecode-compat.js`
- `trading-system.js`
- `community-ui.js`
- ungenutzte Teile in `social-ui.js`, `community-features.js`, `trading-ui.js`, `advanced-features.js`, `card-filters.js`

Alle Kandidaten werden zunächst nach `deprecated/` verschoben, mit `remove-by-version` markiert und dürfen nicht mehr produktiv importiert werden.

### Endgültige Löschung (Release N+1)

Dateien/Funktionsblöcke werden erst im Folge-Release endgültig gelöscht, wenn der erneute Kernflow-Nachweis und das Validierungsprotokoll vorliegen.

**Verbindliche Löschkriterien pro Datei/Funktionsblock:**

1. 0 statische Treffer in Import-/Aufrufsuche
2. 0 Treffer in Runtime-Referenzliste während Kernflows
3. Kernflow-Sanity-Check vollständig bestanden
4. Löschentscheidung in `docs/tcg-tracker-web/migration-validation.md` protokolliert
5. Prüfung auf implizite Nutzung ohne Treffer (`dynamic import`, string-basierte Handler, globale/window-Zugriffe, HTML-Event-Attribute)
6. Quarantäne über 1 Release-Zyklus im Ordner `deprecated/` mit klarer Remove-by-Version; endgültige Löschung im Folge-Release nach erneutem Kernflow-Nachweis

## 7. Regeln für Abhängigkeiten

1. `core` darf von allen importiert werden.
2. `data` darf `core` importieren, aber nicht `ui`.
3. `features/*` dürfen `core` und `data` nutzen, aber keine Kreisabhängigkeiten untereinander erzeugen.
4. `ui` darf `core` und Feature-Public-APIs konsumieren, jedoch keine `data`-Module direkt importieren; Persistenzzugriffe laufen ausschließlich über Features.
5. `app.js` ist Orchestrator (Bootstrap, Routing, Event-Wiring), keine schwere Fachlogik.
6. JavaScript-Imports sind ausschließlich relative Browser-Imports (`./`, `../`) mit expliziter Dateiendung `.js`.
7. Keine Bare Specifiers, keine Alias-Pfade, keine bundlerspezifischen Resolver-Annahmen.
8. Feature-Module dürfen keine Implementierungsdateien anderer Features importieren.
9. Cross-Feature-Kommunikation ist nur über `features/<feature>/index.js` erlaubt; zulässige Imports auf Feature-Ebene sind ausschließlich diese Index-Dateien.
10. `app.js` darf pro Feature ausschließlich `features/<feature>/index.js` importieren, keine Feature-Implementierungsdateien.
11. Deep-Imports in Features sind verboten (`features/*/*.js`), außer `features/<feature>/index.js`.
12. Pro Commit ist ein Suchlauf auf verbotene Importmuster verpflichtend; Ergebnis wird in `docs/tcg-tracker-web/migration-validation.md` protokolliert.
13. Verstöße gegen Regel 8–12 blockieren den Merge.

## 8. Migrationsstrategie

### Phase 1 — Sicherheitsnetz

- Baseline erfassen (App lokal starten, Hauptflows klicktesten)
- Importgraph und tatsächlich verwendete Exports prüfen
- Snapshot-Artefakte erfassen: Importgraph, Export-Liste, initiale Flow-Checkliste
- Validierungsprotokoll initialisieren (`docs/tcg-tracker-web/migration-validation.md`): Datum, Prüferrolle, Commit, Prüfumfang
- Pflicht-Check: HTTP-Serve-Test ohne Bundler, Browser-Konsole auf ESM-Resolve/404/TypeError, `index.html`-Scriptpfade gegen Ist-Dateien prüfen, MIME-Type für `.js` validieren

### Phase 2 — Struktur einführen

- Zielordner anlegen
- Bestehende Module verschieben
- Relative Importe in allen betroffenen Dateien anpassen
- Cluster `core` und `data` separat migrieren (jeweils eigener Commit + Sanity-Check)
- Pflicht-Check: HTTP-Serve-Test ohne Bundler, Browser-Konsole auf ESM-Resolve/404/TypeError, `index.html`-Scriptpfade gegen Ist-Dateien prüfen, MIME-Type für `.js` validieren

### Phase 3 — Logik aufteilen

- `app.js` in Domänen-/UI-Funktionen zerlegen
- Größere Utility-Dateien in fokussierte Module splitten
- Unnötige Funktionen entfernen
- Pro Feature-Cluster separat migrieren (`collection`, `search`, `community`, `settings`) mit eigenem Commit + Sanity-Check
- Pflicht-Check: HTTP-Serve-Test ohne Bundler, Browser-Konsole auf ESM-Resolve/404/TypeError, `index.html`-Scriptpfade gegen Ist-Dateien prüfen, MIME-Type für `.js` validieren

### Phase 4 — CSS entflechten

- Themenblöcke aus `main.css` in neue Dateien extrahieren
- `main.css` auf `@import` reduzieren
- Deprecated-Styles aus aktiven Bundles/Imports entfernen; physische Löschung nur gemäß Quarantäne-Regel (Release N+1)
- CSS-Cluster (`base`, `layout`, `components`, `views`, `features`, `themes`) schrittweise mit eigenem Commit + Sanity-Check
- Pflicht-Check: HTTP-Serve-Test ohne Bundler, Browser-Konsole auf ESM-Resolve/404/TypeError, `index.html`-Scriptpfade gegen Ist-Dateien prüfen, MIME-Type für `.js` validieren

### Phase 5 — Bereinigung & Validierung

- Tote Dateien löschen
- Referenzen erneut prüfen
- App-End-to-End-Sanity-Check
- Rollback-Prozedur pro Cluster vorhalten: Move rückgängig, Importpfade zurücksetzen, erneuter Sanity-Check
- Go/No-Go-Regel: nur freigeben bei 100% Kernflow-Passrate, 0 ESM-Resolve-Fehlern, 0 neuen ungefangenen Laufzeitfehlern
- Browser-Hard-Reload-Test ohne Cache durchführen (inkl. DevTools „Disable cache“)
- Service-Worker- und Cache-Validierung durchführen (keine veralteten Modulpfade; bei Bedarf Versionierung/Invalidierung anheben)
- Verifizieren, dass `index.html` nur existierende Modulpfade lädt und keine alten Pfade im Cache aktiv sind
- Pflicht-Check: HTTP-Serve-Test ohne Bundler, Browser-Konsole auf ESM-Resolve/404/TypeError, `index.html`-Scriptpfade gegen Ist-Dateien prüfen, MIME-Type für `.js` validieren

## 9. Risikoanalyse und Gegenmaßnahmen

### Risiko: Versteckte Laufzeitabhängigkeit

- **Gegenmaßnahme:** vor Löschung Referenzsuche + Laufzeittest der Kernflows

### Risiko: Importpfadfehler nach Verschiebung

- **Gegenmaßnahme:** schrittweise Migration, jeweils nach Cluster validieren

### Risiko: CSS-Reihenfolge bricht Stil

- **Gegenmaßnahme:** feste Importreihenfolge und visuelle Regressionen in Kernansichten

### Risiko: Unklare Modulgrenzen kehren zurück

- **Gegenmaßnahme:** verbindliche Modulregeln in Dokumentation festhalten

### Risiko: ESM-Auflösung im Browser schlägt fehl

- **Gegenmaßnahme:** Import-Checkliste für relative `.js`-Pfade, Browser-Konsole muss frei von „Failed to resolve module specifier“ bleiben

### Risiko: Feature-Querkopplung

- **Gegenmaßnahme:** direkte Cross-Slice-Imports in Review-Checkliste explizit verbieten und bei Verstoß blockieren

## 10. Akzeptanzkriterien

1. `app.js` ist signifikant reduziert und enthält primär Orchestrierung.
2. JS-Module liegen in selbsterklärender Struktur (`core`, `data`, `features`, `ui`).
3. `main.css` enthält keine großen Stilblöcke mehr, nur Imports.
4. Nach Bereinigung verbleiben keine aktiv referenzierten Legacy-Dateien; quarantänierte Deprecated-Dateien sind nur in einem klar gekennzeichneten `deprecated/`-Ordner zulässig und müssen im Folge-Release entfernt werden.
5. Kernflows funktionieren weiterhin (Login, Set laden, Karte toggeln, Suche, Stats, Export/Backup).
6. Dokumentation ist vollständig, intern verlinkt und für neue Entwickler nutzbar.
7. Für jeden Kernflow existiert ein Schritt-für-Schritt-Testfall mit erwarteten Ergebnissen.
8. Keine 404/TypeError/„Failed to resolve module specifier“-Fehler in Browser-Konsole beim Start und in Kernflows.
9. Dead-Code-Löschliste ist vollständig und mit Nachweis (Suche + Laufzeittest) dokumentiert.
10. Für jede Migrationsphase liegen Evidenzartefakte vor: Importgraph (vor/nach), Export-Diff, Browser-Konsole-Log, Flow-Checkliste.
11. Alle Cluster wurden separat committet und einzeln verifiziert (`core`, `data`, je Feature-Cluster, CSS-Cluster).
12. Nach Hard-Reload und im privaten Browserfenster treten keine veralteten Modulimporte, 404 auf verschobene JS-Dateien oder cachebedingte Resolve-Fehler auf.
13. Es gibt 0 Verstöße gegen die Importregeln 8–12 im finalen Such-/Review-Protokoll.
14. Alle `deprecated`-Artefakte besitzen `remove-by-version` und sind nicht aktiv importiert.

## 11. Markdown-Wiki-Struktur

```text
docs/tcg-tracker-web/
  README.md
  architecture.md
  data-flow.md
  app.md
  navigation.md
  migration-validation.md
  modules/
    core/
      auth.md
      cache.md
      config.md
      utils.md
    data/
      pokemon-api.md
      sheets-db.md
    features/
      collection/
        index.md
        export.md
        stats.md
        value.md
        versioning.md
      search/
        index.md
        engine.md
        favorites.md
        filters.md
        history.md
      community/
        index.md
        profiles.md
        sync.md
      settings/
        index.md
        settings.md
    ui/
      command-palette.md
      components.md
      panels.md
      tools.md
  css/
    overview.md
    variables.md
  changelog/
    removed-code.md
```

**Navigationsregeln (verbindlich):**

- `README.md` ist zentrale Landing-Page und verlinkt alle Unterseiten.
- Jede Unterseite enthält Rücklink auf `README.md`.
- `migration-validation.md` enthält Testmatrix, Protokollvorlage und Abnahmeregeln.
- Pro Feature existiert genau eine Übersichtsseite `modules/features/<feature>/index.md`; keine parallele gleichrangige Duplicate-Übersichtsseite.

**Navigationsmatrix (verbindlich):**

- `README.md`: kein Rücklink erforderlich, vollständige Outlinks auf alle Hauptbereiche
- Modulseiten (`modules/**/{*.md}` ohne `index.md`): Rücklink + mindestens 2 Nachbarlinks
- Feature-Indexseiten (`modules/features/*/index.md`): Rücklink + 1 bis 2 Nachbarlinks
- `changelog/removed-code.md`: Rücklink empfohlen, Nachbarlinks optional

## 12. Seiten-Template für alle Wiki-Seiten

Jede Modulseite nutzt dieselbe Struktur:

1. **Zweck**
2. **Öffentliche API (Exports)**
3. **Abhängigkeiten**
4. **Datenfluss / Aufrufkontext**
5. **Fehlerfälle / Grenzen**
6. **Änderungshinweise**
7. **Verlinkungen zu benachbarten Modulen**
8. **Validierungsstatus** (letzte Prüfung, Prüfumfang, offene Risiken, verantwortliche Rolle)

## 13. Implementierungsreihenfolge (für nachfolgende Planungsphase)

1. Struktur + Datei-Moves ohne Logikänderung
2. `app.js` modularisieren
3. `enhanced-features.js`/`advanced-features.js`/`social-ui.js` aufteilen
4. Dead-Code-Entfernung
5. CSS-Aufteilung + Bereinigung
6. Wiki vollständig schreiben
7. Finaler Sanity-Check

---

## Entscheidung

Dieses Design priorisiert **Wartbarkeit, Lesbarkeit und sichere Migration** bei minimalem Funktionsrisiko und ohne Technologiewechsel.
