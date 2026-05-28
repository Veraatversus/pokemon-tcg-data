# Browser-Quickcheck Playbook (Dashboard / Set / Suche)

## Ziel
Ein einheitlicher, reproduzierbarer Quickcheck für die wichtigsten UI-Flows im TCG Tracker:
- Dashboard
- Set-Ansicht
- Suche

## Voraussetzungen
1. Lokaler Web-Server läuft unter http://localhost:8080
2. Abhängigkeiten im Web-Ordner sind installiert
3. Für Live-Checks mit Google-Daten: aktive Login-Session im persistenten Browserprofil

## Standard-Reihenfolge
1. Regression-Basis
2. Full-UI-Smoke
3. Suche-spezifische Smoke-Checks
4. Dashboard-Set-Suche

## Befehle (empfohlen)
Ausführen im Repo-Root mit absoluten Pfaden:

```powershell
node frontend/tcg-tracker-web/tests/regression-smoke.mjs
node frontend/tcg-tracker-web/tests/full-ui-smoke.mjs
node frontend/tcg-tracker-web/tests/search-smoke.mjs
node frontend/tcg-tracker-web/tests/dashboard-set-search-smoke.mjs
```

Alternativ im Web-Ordner über Scripts:

```powershell
node tests/regression-smoke.mjs
node tests/full-ui-smoke.mjs
node tests/search-smoke.mjs
node tests/dashboard-set-search-smoke.mjs
```

## Headed-Modus für manuelle Sichtprüfung

```powershell
node frontend/tcg-tracker-web/tests/regression-smoke.mjs --headed --slowmo=125
node frontend/tcg-tracker-web/tests/full-ui-smoke.mjs --headed --slowmo=125
node frontend/tcg-tracker-web/tests/search-smoke.mjs --headed --slowmo=125
node frontend/tcg-tracker-web/tests/dashboard-set-search-smoke.mjs --headed --slowmo=125
```

## Erwartete Ergebnisse
- Jeder Lauf endet mit Exit-Code 0
- Keine ungeklärten "failed"-Meldungen
- Für nicht eingeloggte Sessions sind Skip-Warnungen erlaubt (z. B. Such-/Dashboard-Live-Checks)

## Troubleshooting Kurzliste
1. Wenn veraltete UI erscheint: Hard-Reload mit nocache-Parameter und erneut starten.
2. Wenn Login-abhängige Checks übersprungen werden: persistenten Browser öffnen, einmal anmelden, danach Smoke erneut ausführen.
3. Wenn Service-Worker verdächtig stale ist: Seite neu laden, bis die aktualisierte SW aktiv ist (controllerchange Reload).

## Checklisten-Eintrag im Refactor
Dieser Playbook-Stand deckt den Punkt "Browser-Quickcheck fuer Dashboard, Set-Ansicht, Suche standardisieren" im Refactor-Plan ab.
