# Regression-Checkliste

← [README.md](README.md)

---

## Zweck

Diese Checkliste deckt die kritischen Flows ab, die zuletzt bei Set-Löschung, Suche und API-only-Reimport regressionsanfällig waren.

---

## Delete -> Search -> API-only Reimport

Verwende bevorzugt ein Set mit möglicher Namensüberschneidung oder Varianten, z. B. `cel25` und `cel25c`.

### Vorbereitung

1. App mit Cache-Bypass laden: `?nocache=1&t=<timestamp>`
2. Sicherstellen, dass das Zielset aktuell importiert ist
3. Dashboard-Ansicht auf `Importiert` stellen

### Testschritte

1. Zielset im Dashboard löschen
2. Direkt im Dashboard prüfen:
   - In `Importiert` darf das Set nicht weiter als importiert angezeigt werden
   - In `Alle` muss das Set als nicht importiert erscheinen
3. Zur Suche wechseln
4. Modus `Alle Sets` wählen
5. Nach einer Karte aus dem gelöschten Set suchen
6. Prüfen:
   - Karte wird gefunden
   - Status ist nicht mehr als lokal importiert markiert
7. Modus `Online-Suche` wählen
8. Dieselbe Karte erneut suchen
9. Prüfen:
   - Karte wird gefunden
   - Status zeigt `🌐 API`
10. Lightbox eines API-only Treffers öffnen
11. `Gesammelt` aktivieren
12. Prüfen:
   - Set wird automatisch wieder importiert
   - Kartenstatus bleibt gespeichert
   - Dashboard zeigt das Set wieder als importiert
   - Fortschritt erhöht sich korrekt, z. B. `1 / 25`

---

## Bekannte Risikozonen

- Set-Kollisionen bei gleichem `setName`
- Stale Search-Cache nach Set-Löschung
- Verzögerte Google-Sheets-Konsistenz direkt nach `upsertOverviewSet(..., false)`
- Summary-Lookups, die versehentlich über `setName` statt `setId` laufen

---

## Erwartetes Verhalten

- Collection-Zugriffe laufen eindeutig über `setId`
- Dashboard reagiert sofort lokal auf Lösch- und Reimport-Aktionen
- `Alle Sets` und `Online-Suche` bleiben nach Löschung funktionsfähig
- API-only Karten können per Lightbox ein Set korrekt zurückimportieren