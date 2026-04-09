# core/cache.js

← [../../README.md](../../README.md) | [config.md](config.md) | [utils.md](utils.md)

---

## Zweck

In-Memory TTL-Cache für API-Daten innerhalb einer Browser-Session.

## Öffentliche API

| Export | Beschreibung |
|---|---|
| `set(key, value, ttlMs)` | Wert mit Ablaufzeit speichern |
| `get(key)` | Wert lesen (`undefined`, wenn abgelaufen) |
| `has(key)` | Prüft gültigen Cache-Eintrag |
| `del(key)` | Einzelnen Eintrag löschen |
| `clearExpired()` | Abgelaufene Einträge bereinigen |
| `clear()` | Gesamten Cache leeren |

## Abhängigkeiten

Keine.

## Grenzen

- Cache lebt nur im RAM (kein Persistenzlayer)
- Daten gehen bei Reload/Tab-Neustart verloren

## Verwandte Seiten

- [../data/pokemon-api.md](../data/pokemon-api.md)
- [../../data-flow.md](../../data-flow.md)
- [../../app.md](../../app.md)

## Validierungsstatus

| Feld | Wert |
|------|------|
| Letzte Prüfung | 2026-03-23 |
| Prüfumfang | Export- und Importpfadprüfung |
| Offene Risiken | Keine |
| Verantwortliche Rolle | Entwickler/Copilot |
