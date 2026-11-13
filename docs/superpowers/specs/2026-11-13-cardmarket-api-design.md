# Cardmarket als Teil der API – Design

Stand: 2026-11-13 · Status: zur Prüfung durch die Nutzerin

## 1. Ziel und Rahmen

Die Cardmarket-Daten werden zu einer weiteren Quelle der statischen API (neben TCGdex und dem eingefrorenen pokemontcg-Stand). Der tägliche Lauf soll so selbstständig wie möglich arbeiten: neue Sets werden automatisch zugeordnet und mit Preisen versorgt; manuelle Eingriffe (Cardmarket-HTML, Einzelzuordnungen) dienen nur zum Reparieren von Fällen, die die Automatik nicht eindeutig lösen kann.

**Umfang (entschieden):**
- Nur Einzelkarten: pro Karte Cardmarket-Produkt-ID, Link und aktuelle Preise. Kein Preisverlauf, keine Sealed-Produkte, kein automatisches Abrufen von Cardmarket-Webseiten.
- Daten bleiben pro v3-Set geordnet (wenige, kleine Abrufe im Frontend).
- Ein täglicher Workflow statt zwei gekoppelter.
- `cardmarket/` (Altformat für die heutige release-Seite) wird nicht mehr erzeugt, sondern bleibt eingefroren liegen, bis release auf das neue Frontend umgestellt ist; danach wird es gelöscht. Veraltete Preise auf release für einige Tage sind akzeptiert.
- Meldungen: nur bei groben Problemen ein selbstpflegendes GitHub-Issue; kleine Lücken stehen im Report.

**Leitregel:** Ein falscher Link ist schlimmer als kein Link. Im Zweifel bleibt eine Karte ohne ID und erscheint im Report.

## 2. Datenablage

### 2.1 Rohdaten `sources/cardmarket/`
- `catalog.jsonl` – alle Pokémon-Einzelkarten aus Cardmarkets Produktliste (Kategorie 51), ohne Preise. Eine Zeile pro Produkt, nach Produkt-ID sortiert: `{id, name, expansionId, collectorNumber, metacardId, dateAdded}`. Ändert sich nur bei neuen/geänderten Produkten.
- `expansions.json` – Cardmarket-Erweiterungen (`id`, `name`, Produktanzahl).
- `custom-sets/<expansionId>.json` – Set-Zuordnungen aus Cardmarket-HTML (Datenformat statt Skript): Liste `{productId, collectorNumber}`, `collectorNumber` mit Varianten-Zusatz (`4`, `4V2`, `224a`, `H1`). Die vier bestehenden Skripte (1536, 1537, 1538, 5241) werden einmalig umgewandelt.
- `meta.json` – Zeitstempel der Downloads (Einzelkarten, Preisguide), Anzahl Produkte/Preise.
- Der Preisguide wird nicht roh gespeichert.

### 2.2 Manuelle Einzelkorrekturen
`api/mappings/cardmarket-overrides.json` bleibt wie bisher (`"<setId>/<cardId>": productId | null`, mit Warnungen bei fragwürdigen Einträgen).

### 2.3 API-Ausgabe
- `api/v3/cards/<setId>.json` – unverändert: `ids.cardmarket` (erste = Haupt-Produkt), `ids.cardmarketSource`, `variants[].cardmarketId` für Stempel-/Jumbo-Varianten.
- `api/v3/prices/<setId>.json` (neu, kompakt) – pro Karten-ID: `{productId, trend, avg1, avg7, avg30, low, trendHolo, avg1Holo, avg7Holo, avg30Holo, lowHolo}` (nur vorhandene Felder) des Haupt-Produkts. Größenrichtwert: alle Dateien zusammen ≈ 3 MB.
- `api/v3/prices/meta.json` – `generatedAt`, `priceGuideCreatedAt`, Abdeckung (Karten mit ID / mit Preis).
- `api/v3/reports/cardmarket-ids.json` (+ lesbare `cardmarket-ids.md`) – Abdeckung pro Set inkl. Herkunft je Stufe, offene Karten mit bis zu 5 Kandidaten und Hinweisen, Cardmarket-Erweiterung, fertige Such-URL (nach Nummer sortiert, 100 pro Seite) für den HTML-Import, Stabilitätshinweise.

## 3. Zuordnung (eine Stelle, im API-Build)

### 3.1 Set → Cardmarket-Erweiterung
Reihenfolge: Zuordnungsdatei → `ids.cardmarket` aus TCGdex/pokemontcg (wenn im Katalog vorhanden) → Mehrheit der Karten-IDs (≥ 80 %). Galerie-Subsets (TG/GG/SV) dürfen ihre eigene Erweiterung zusätzlich haben. Unklar → Set ohne Preise und Meldung (Abschnitt 4).

### 3.2 Karte → Produkt (erste eindeutige Stufe gewinnt)
1. Zuordnungsdatei (`null` entfernt gezielt).
2. `custom-sets` der Erweiterung: Kartennummer ↔ Produkt; Basisnummer = normale Karte, Zusätze (`V2`, `a`, `H`) sind Varianten und nie die normale Karte.
3. TCGdex-ID, wenn sie zur Erweiterung passt und von keiner anderen Karte beansprucht wird (sonst bestehende Korrekturregeln).
4. Regeln (bestehend): Nummer+Name, Attackennamen, Energie-Kürzel, eindeutiger Name ohne Nummer, Left/Right, Reihenfolge mit Nachbarprüfung; Produkte mit `[Oversized]` sind immer ausgeschlossen.
5. Sonst leer + Report.

### 3.3 Haupt-Produkt
Erste ungestempelte Nicht-Jumbo-Variante → Nicht-Jumbo → ungestempelt → beliebige Variante → `ids.cardmarket[0]` (gleiche Regel in Build und Frontend).

### 3.4 Herkunft und Stabilität
- Jede ID trägt ihre Quelle (`override`, `custom-set`, `tcgdex`, `matched`, `corrected`, `corrected-expansion`, `ordered`, `energySymbol`, `leftRight`).
- **Stabilitätsregel:** Eine über Stufe 3–4 vergebene ID bleibt erhalten, wenn die Regeln sie am Folgetag nicht mehr eindeutig liefern (z. B. neues gleichnamiges Produkt); Hinweis im Report. Sie ändert sich nur, wenn das Produkt aus dem Katalog verschwindet oder eine höhere Stufe (1–2) anders entscheidet. Grundlage ist die zuletzt veröffentlichte Ausgabe (`api/v3/cards`).

### 3.5 Entfällt
`tracker.json`, `tcgdex-helper`, Matching im alten Cardmarket-Build, Rest-Matcher im Frontend.

## 4. Täglicher Workflow und Fehlerfälle

Ein Workflow („Daily Sync“, master, täglich + manuell):
1. Tests 2. TCGdex-Sync 3. Set-Logos prüfen 4. Cardmarket laden (Einzelkarten + Preisguide; 30 s Timeout, 1 Wiederholung) → `sources/cardmarket/` 5. TCGdex-Matching-Prüfung 6. API-Build (Karten, Registry, Cardmarket-IDs, Preise, Reports) 7. ein Commit, Push mit Wiederholung, Weitergabe an dev/release 8. Meldung.

Fehlerfälle:
- Cardmarket nicht erreichbar/defekt → Lauf geht weiter; Katalog bleibt, Preisdateien unverändert (Vortagespreise), `prices/meta.json` behält das alte Datum. Ab 3 Tagen in Folge: Issue.
- Preisguide mit > 20 % weniger Einträgen als zuletzt → wie defekt behandeln.
- TCGdex-Teil scheitert → wie heute (Lauf scheitert, Issue „TCGdex-Sync fehlgeschlagen“).
- Grobe Zuordnungsprobleme → ein Issue „Cardmarket-Zuordnung prüfen“, bei jedem Lauf aktualisiert, schließt sich selbst: neues Set < 80 % Abdeckung, Set ohne ermittelbare Erweiterung, Eintrag in Zuordnungsdatei/`custom-sets` mit nicht mehr vorhandenem Produkt.

Der alte Workflow „Build Cardmarket Data“ entfällt (samt Zeitplan und Kopplung). Laufzeit ≈ 3 Minuten/Tag.

## 5. Frontend
- Set-Ansicht: `api/v3/prices/<setId>.json` laden, Preise über Karten-ID; kein Cardmarket-Index, kein Matching im Browser.
- Suche: Produkt-ID aus `cm`; Preise nur für angezeigte Treffer, je betroffenem Set eine Preisdatei (gesammelt, gecacht).
- Statistik/Preisliste: Produkt-ID aus dem Suchindex (bestehende Anreicherung), Preise aus den Set-Preisdateien.
- Links wie bisher (`cardmarket.com/<de|en>/Pokemon/Products?idProduct=…`, `isReverseHolo=Y` bei Reverse).
- Frische: `prices/meta.json` immer frisch (offline: Cache); Preisdateien mit `?v=<generatedAt>`; „Preise neu laden“ leert nur Preis-Caches.
- Ohne Preisdaten: kein Preis, kein Link (keine Suchseite); Rückfall nur auf eine gespeicherte Tabellen-URL mit Produkt-ID.
- Entfällt: Zugriffe auf `cardmarket/`, `products.json`/`tracker.json`-Logik in `cardmarket-data.js`, Rest-Matcher.
- Jede Auslieferung hebt `appVersion` an.

## 6. Werkzeug für HTML-Korrekturen
- `scripts/api/cardmarket/import-html.mjs <seiten.html …>` (Weiterentwicklung von `generate-custom-set.mjs`): liest Erweiterung, Produkt-IDs, Nummern und Varianten aus gespeicherten Cardmarket-Suchseiten, schreibt `sources/cardmarket/custom-sets/<expansionId>.json`, baut das Set neu und zeigt Vorher/Nachher (geschlossene/offene Lücken, Widersprüche zu bestehenden Zuordnungen).
- Optional Vorschlag eines Einzeleintrags für `cardmarket-overrides.json`.
- HTML-Eingaben liegen in `.local/cardmarket-html/` (ignoriert); nur Ergebnisse kommen ins Repo.

## 7. Tests
- Unit: Stufenreihenfolge, Erweiterungs-Ermittlung, Oversize-Ausschluss, Varianten-Zusätze, gleichnamige Produkte, Stabilitätsregel, Preisdatei-Format, Ausfall-/Defekt-Erkennung, Issue anlegen/aktualisieren/schließen (Stub).
- Regression gegen echte Daten: alle heute zugeordneten Karten behalten ihre ID außer ausdrücklich gelisteten Abweichungen durch höhere Stufen; Umwandlung der vier `custom-sets` ändert keine Zuordnung.
- Frontend: Preise aus Set-Datei, Suche, Statistik, Tag-1/Tag-2-Frische, offline.
- Abschluss: Browser-Test auf /dev mit Kopien beider Tabellen.

## 8. Umsetzungsreihenfolge
- **Teil A (master):** (1) `sources/cardmarket/` + Download + Ausfallschutz (2) Matching auf Katalog + `custom-sets` + Stabilitätsregel (3) Preisdateien + `prices/meta.json` (4) Report + Such-URLs + Issue-Meldung (5) Import-Skript + Umwandlung der `custom-sets` (6) Workflow zusammenlegen, alten Cardmarket-Workflow entfernen.
- **Teil B (dev):** (1) Frontend auf `api/v3/prices` (2) Altcode entfernen (3) App-Version.
- **Nach der release-Umstellung (eigener Schritt):** `cardmarket/` und nicht mehr benötigte Teile von `scripts/cardmarket/` löschen; Abschluss von Phase 4 (alte Hauptverzeichnis-Ordner `sets/`, `cards/` verschieben/entfernen, sobald nichts sie mehr liest).

## 9. Nicht enthalten
Preisverlauf, Sealed-Produkte, automatisches Abrufen von Cardmarket-Seiten.
