# Pokemon TCG Tracker - Verbesserungsplan

## ✅ Bereits implementiert
- Script-Version-Tracking (v2.0.0)
- Verbesserte Duplikats-Erkennung (60s Fenster)
- isScriptEditing Rekursions-Schutz
- Lock-basierte Synchronisation
- Detailliertes Logging

## 🚀 Nächste Schritte (Priorität HOCH)

### 1. **Backup vor Komplett-Reset** ✅ IN ARBEIT
- Automatisches Backup aller Properties vor deleteAllPersistentData()
- Backup-Key: backup_TIMESTAMP
- Wiederherstellungs-Funktion

### 2. **API Retry-Logik**
```javascript
// Implementierung in fetchApiData():
- 3 Wiederholungsversuche
- Exponentielles Backoff (1s, 2s, 4s)
- Detailliertes Error-Logging
```

### 3. **TCGDex Sets Caching**
```javascript
// Cache für 1 Stunde:
- loadTcgdexSetsWithCache() Funktion
- Reduziert API-Calls bei Sortier-Operationen
- Automatische Cache-Invalidierung beim Setup
```

### 4. **Fortschrittsanzeige verbessern**
```javascript
// Für lange Operationen:
- "Importiere Set 5/10 (50%)..."
- "Verbleibende Zeit: ~3min"
- Toast-Updates alle 3 Sekunden
```

### 5. **Export-Funktion (CSV)**
```javascript
// Menüpunkt: "📤 Sammlung exportieren (CSV)"
- Exportiert alle gesammelten Karten
- Format: Set,Karte,Normal,ReverseHolo
- Download als CSV-Datei
```

## 📋 Weitere Verbesserungen (Priorität MITTEL)

### 6. **Batch-Import-Dialog**
- Multi-Select für mehrere Sets
- Fortschrittsbalken für Batch-Import

### 7. **Statistiken erweitern**
- Sammlungs-Wert (falls Preise verfügbar)
- Seltenheits-Verteilung
- Abschluss-Trend (über Zeit)

### 8. **Custom Sidebar aktivieren**
- Schnellzugriff auf häufige Funktionen
- Set-Suche
- Schnell-Import

## 🔮 Zukünftige Features (Priorität NIEDRIG)

### 9. **Cardmarket Integration**
- Preis-Abfragen via API
- Sammlungs-Wert-Berechnung

### 10. **Wunschliste-Feature**
- Markierung gewünschter Karten
- Eigenes Wunschlisten-Sheet

### 11. **Bulk-Edit-Funktion**
- Mehrere Karten auf einmal markieren
- Filter: "Zeige nur ungesammelte"

### 12. **CSV-Import**
- Bestehende Sammlung importieren
- Format-Validator

## 📊 Performance-Metriken (Ziel)

| Operation | Aktuell | Ziel | Status |
|-----------|---------|------|--------|
| Set-Import | ~15s | ~10s | 🟡 Optimierbar |
| Sortierung | ~5s | ~2s | 🟢 OK mit Cache |
| API-Call | ~2s | ~1s | 🟢 OK mit Retry |
| Komplett-Reset | ~20s | ~25s | 🟡 +Backup |

## 🐛 Bekannte Issues
- [ ] ~~Doppelte Trigger-Ausführung~~ ✅ BEHOBEN
- [ ] Properties Service 9KB Limit bei vielen Sets
- [ ] Lange Wartezeiten bei "Alle Sets neu laden"

## 💡 Implementierungs-Reihenfolge

1. ✅ Backup vor Reset
2. API Retry-Logik
3. TCGDex Caching
4. CSV Export
5. Fortschrittsanzeige
6. Batch-Import
7. Statistiken
8. Custom Sidebar
9. Weitere Features nach Bedarf

---

**Version**: 2.0.0  
**Stand**: 01.02.2026  
**Nächste Review**: Nach Implementierung Top 5
