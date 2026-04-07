# Architektur

← [README.md](README.md)

---

## Schichtenmodell

Die App folgt einem strikten Abhängigkeitsgraphen (keine Zyklen):

```
app.js
  └── features/<feature>/index.js   (öffentliche Feature-API)
        └── features/<feature>/*.js  (Feature-Interna)
              ├── data/              (Datenzugriff)
              │     └── core/        (Fundament)
              └── ui/               (Präsentation, nur DOM)
                    └── core/
```

## Schichten

| Layer | Pfad | Darf importieren |
|-------|------|-----------------|
| **core** | `js/core/` | – (keine Deps) |
| **data** | `js/data/` | `core/` |
| **features** | `js/features/<feature>/` | `core/`, `data/`, andere Features **nur** über `features/<feature>/index.js` |
| **ui** | `js/ui/` | `core/` |
| **app** | `js/app.js` | `features/<feature>/index.js`, `core/`, `data/`, `ui/` |

## Importregeln (verbindlich, Spec §7 Regeln 8–13)

1. `app.js` importiert **nur** `features/<feature>/index.js` für Feature-Code.
2. Keine Deep-Imports: `features/search/engine.js` ist von außen nicht direkt importierbar.
3. Cross-Feature-Kommunikation **nur** über `features/<feature>/index.js`.
4. Verstöße blockieren den Merge.
5. Pro Commit: Suchlauf auf verbotene Importmuster, Ergebnis in [migration-validation.md](migration-validation.md).

## Verzeichnisstruktur

```
frontend/tcg-tracker-web/
  js/
    app.js                  ← Einstiegspunkt
    core/
      auth.js
      cache.js
      config.js
      utils.js
    data/
      sheets-db.js
      pokemon-api.js
    features/
      collection/
        versioning.js
        index.js
      search/
        engine.js
        index.js
      community/
        sync.js
        index.js
      settings/
        index.js
    ui/
      command-palette.js
      components.js
      tools.js
  css/
    main.css
  index.html
```

## Verwandte Seiten

- [data-flow.md](data-flow.md) – Datenfluss durch die Schichten
- [app.md](app.md) – Einstiegspunkt im Detail
- [README.md](README.md) – Übersicht aller Module
