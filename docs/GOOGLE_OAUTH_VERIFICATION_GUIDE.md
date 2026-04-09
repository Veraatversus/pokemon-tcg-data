# Google OAuth-Verifizierung & GitHub-Pages-Checkliste

Stand: 6. April 2026

Diese Anleitung ist auf dieses Repository zugeschnitten (`frontend/tcg-tracker-web`) und beschreibt, was nötig ist, damit die öffentliche GitHub-Pages-Version den Google-**Testmodus** verlassen kann und für die OAuth-Nutzung geprüft wird.

---

## 1. Ausgangslage in diesem Repo

Aktuell verwendet die App in `frontend/tcg-tracker-web/js/core/config.js` diese Scopes:

- `https://www.googleapis.com/auth/spreadsheets`
- `https://www.googleapis.com/auth/drive.metadata.readonly`

Wichtig:
- `spreadsheets` ist **sensitiv**.
- `drive.metadata.readonly` ist für Drive **restricted** und macht die Verifizierung deutlich strenger.

**Empfehlung:** Wenn möglich, `drive.metadata.readonly` entfernen oder auf einen engeren, nicht-restricted Flow umstellen. Für eine reine Spreadsheet-App ist das der wichtigste Hebel, um die Freigabe einfacher zu machen.

---

## 2. Was vor der Google-Einreichung im Projekt fertig sein muss

### Pflicht
- Öffentliche **Homepage** unter GitHub Pages (kein reiner Redirect, kein reiner Login-Screen)
- Öffentliche **Datenschutzerklärung** auf derselben Domain
- Sauberer **App-Name** + Support-E-Mail
- Öffentliche **Live-App-URL**
- GitHub-Pages-Domain in **Google Search Console** verifiziert
- OAuth-Client für **localhost** und **GitHub Pages** korrekt eingetragen

### Für dieses Repo konkret
- `index.html` darf für die Verifizierung **nicht nur automatisch weiterleiten**. Die Startseite sollte sichtbar bleiben und die App beschreiben.
- Es gibt aktuell **keine** dedizierten Dateien für Datenschutz / Impressum. Diese sollten ergänzt werden.
- Auf der Homepage sollte klar stehen:
  - was die App macht
  - dass sie Google Sheets nutzt
  - dass sie **inoffiziell / nicht mit The Pokémon Company verbunden** ist
  - Links zu Datenschutz und optional Nutzungsbedingungen / Impressum

---

## 3. GitHub-Pages-URLs festlegen

Ersetze in allen Texten diese Platzhalter:

- `{{PAGES_HOME}}` → z. B. `https://<username>.github.io/pokemon-tcg-data/`
- `{{PAGES_APP}}` → z. B. `https://<username>.github.io/pokemon-tcg-data/frontend/tcg-tracker-web/`
- `{{PRIVACY_URL}}` → z. B. `https://<username>.github.io/pokemon-tcg-data/privacy.html`
- `{{IMPRINT_URL}}` → z. B. `https://<username>.github.io/pokemon-tcg-data/impressum.html`
- `{{SUPPORT_EMAIL}}` → deine Support-Mail
- `{{DEVELOPER_NAME}}` → dein Name / Projektname

---

## 4. Google Cloud Console – exakte Klickpfade

### A. Branding einrichten
1. `console.cloud.google.com`
2. Projekt wählen
3. **Google Auth Platform** → **Branding**
4. Eintragen:
   - **App name:** `Vera's Pokémon TCG Tracker`
   - **User support email:** `{{SUPPORT_EMAIL}}`
   - **App logo:** optional
   - **Application home page:** `{{PAGES_HOME}}`
   - **Application privacy policy link:** `{{PRIVACY_URL}}`
   - **Developer contact information:** `{{SUPPORT_EMAIL}}`

### B. Audience / Veröffentlichungsstatus
1. **Google Auth Platform** → **Audience**
2. **User type:** `External`
3. Während des Testens: Testnutzer hinzufügen
4. Wenn alles fertig ist: **Publish app** / **In Produktion**

### C. Data access / Scopes
1. **Google Auth Platform** → **Data access**
2. Nur die wirklich benötigten Scopes eintragen
3. Für dieses Projekt aktuell:
   - `.../auth/spreadsheets`
   - `.../auth/drive.metadata.readonly` *(nur wenn technisch zwingend nötig)*

### D. OAuth Client konfigurieren
1. **Google Auth Platform** → **Clients**
2. Web-Client öffnen
3. Unter **Authorized JavaScript origins** eintragen:
   - `http://localhost:8080`
   - `https://<username>.github.io`
4. Unter **Authorized redirect URIs** eintragen:
   - `http://localhost:8080/`
   - `{{PAGES_APP}}`

> Bei GitHub Pages muss die Redirect-URI die **exakte Live-URL** der App sein.

---

## 5. Search Console – Domain verifizieren

Für GitHub Pages am einfachsten per **URL-Präfix**:

1. `https://search.google.com/search-console/`
2. **Property hinzufügen**
3. `URL prefix` wählen
4. `{{PAGES_HOME}}` eintragen
5. Methode **HTML-Tag** wählen
6. Den Meta-Tag in die öffentliche Startseite (`index.html`) einbauen
7. Deploy auf GitHub Pages
8. In Search Console auf **Verify** klicken

---

## 6. Reihenfolge, damit Google die App akzeptieren kann

1. GitHub Pages live und öffentlich erreichbar machen
2. Homepage **ohne Auto-Redirect** nutzbar machen
3. Datenschutzseite veröffentlichen
4. Search-Console-Verifizierung abschließen
5. Branding, Audience, Data Access sauber eintragen
6. OAuth-Client für Live-URL prüfen
7. Unlisted Demo-Video aufnehmen
8. Erst dann **Submit for verification**

---

## 7. Vorschlag für Homepage-Text (DE)

## Vera's Pokémon TCG Tracker

Vera's Pokémon TCG Tracker ist eine inoffizielle Web-App zur Verwaltung einer persönlichen Pokémon-Sammelkarten-Sammlung mit Google Sheets als Datenbasis. Nutzer können ihre Sets und Kartenbestände durchsuchen, Sammlungsstände pflegen und ihre eigene Tabellenstruktur mit der Weboberfläche synchron nutzen.

Die App verwendet Google OAuth ausschließlich, um nach ausdrücklicher Zustimmung des Nutzers auf das jeweils verbundene Google Spreadsheet und die dafür nötigen Metadaten zuzugreifen.

**Hinweis:** Dies ist ein inoffizielles Fan-/Privatprojekt und steht in keiner Verbindung zu Nintendo, GAME FREAK, Creatures Inc. oder The Pokémon Company.

Links:
- App starten: `{{PAGES_APP}}`
- Datenschutzerklärung: `{{PRIVACY_URL}}`
- Impressum / Kontakt: `{{IMPRINT_URL}}`

---

## 8. Vorschlag für Homepage-Text (EN, für Google Review konsistent)

## Vera's Pokémon TCG Tracker

Vera's Pokémon TCG Tracker is an unofficial web application for managing a personal Pokémon trading card collection using Google Sheets as the user-controlled data source. Users can browse sets and cards, maintain collection status, and sync their own spreadsheet-based collection workflow with the web interface.

The app uses Google OAuth only after explicit user consent in order to access the connected Google Spreadsheet and the minimum related metadata required for the app to function.

**Disclaimer:** This is an unofficial fan/personal project and is not affiliated with Nintendo, GAME FREAK, Creatures Inc., or The Pokémon Company.

---

## 9. Datenschutztext – Vorlage (DE)

# Datenschutzerklärung

## 1. Verantwortliche Stelle
`{{DEVELOPER_NAME}}`
Kontakt: `{{SUPPORT_EMAIL}}`

## 2. Zweck der Anwendung
Diese Web-Anwendung dient dazu, eine persönliche Pokémon-TCG-Sammlung mit Hilfe eines vom Nutzer verbundenen Google Spreadsheets zu verwalten.

## 3. Welche Google-Daten verarbeitet werden
Nach ausdrücklicher Zustimmung des Nutzers kann die Anwendung auf folgende Daten zugreifen:
- Inhalte des vom Nutzer verwendeten Google Spreadsheets
- technisch erforderliche Metadaten zur Identifikation und Auswahl des verbundenen Spreadsheets

## 4. Wofür die Daten verwendet werden
Die Daten werden ausschließlich verwendet, um:
- Karten- und Set-Informationen im Tracker anzuzeigen,
- Sammlungsstände zu speichern,
- Änderungen des Nutzers im verbundenen Spreadsheet zu lesen und zu schreiben.

Die Daten werden nicht für Werbung, Profiling, Datenverkauf oder Tracking an Dritte verwendet.

## 5. Speicherung und Weitergabe
Die Anwendung läuft als statische Web-App über GitHub Pages. Google-Zugriffsdaten und nutzerbezogene Einstellungen werden nur insoweit verarbeitet, wie es technisch für die OAuth-Anmeldung und die Nutzung des verbundenen Spreadsheets erforderlich ist.

Es erfolgt keine absichtliche Weitergabe von Google-Nutzerdaten an Dritte, außer wenn dies gesetzlich erforderlich ist.

## 6. Widerruf
Nutzer können den Zugriff der Anwendung jederzeit im Google-Konto unter den Sicherheits- und Drittanbieterzugriffs-Einstellungen widerrufen.

## 7. Kontakt
Bei Fragen zum Datenschutz: `{{SUPPORT_EMAIL}}`

---

## 10. Scope-Begründungen für die Google-Einreichung (EN, copy-paste)

### Scope 1 – Google Sheets
**Scope:** `https://www.googleapis.com/auth/spreadsheets`

**Justification:**
This app allows users to manage their personal trading card collection directly in their own Google Spreadsheet. The app must read existing spreadsheet data and write user changes such as collection status, imported sets, settings, and card-related updates. Read-only access is not sufficient because the core user-facing functionality includes saving edits back to the spreadsheet.

### Scope 2 – Drive metadata (only if you keep it)
**Scope:** `https://www.googleapis.com/auth/drive.metadata.readonly`

**Justification:**
This scope is used only to let the user identify and select their Google Spreadsheet within the app and to read minimal file metadata needed to display and connect the correct spreadsheet. The app does not use this scope to access file contents beyond what is required for the user-selected spreadsheet workflow.

**Important note:**
If this scope is removed from the app, the verification burden is lower. Keep it only if the spreadsheet selection flow truly depends on it.

---

## 11. Kurzbeschreibung für Google (EN)

**App description:**
Vera's Pokémon TCG Tracker is an unofficial spreadsheet-based collection tracker that helps users manage their own Pokémon trading card collection in Google Sheets through a web interface.

---

## 12. Demo-Video – was Google sehen will

Das Video sollte **unlisted auf YouTube** sein und möglichst auf **Englisch** aufgenommen werden.

### Reihenfolge im Video
1. Öffentliche Homepage öffnen (`{{PAGES_HOME}}`)
2. Datenschutzseite zeigen (`{{PRIVACY_URL}}`)
3. Live-App öffnen (`{{PAGES_APP}}`)
4. Klick auf den Google-Login / Connect-Button
5. Vollständigen Consent Screen zeigen
6. Im Browser sichtbar machen:
   - App-Name
   - angefragte Scopes
   - URL / Client-Kontext
7. Nach Login zeigen:
   - Spreadsheet auswählen oder öffnen
   - Set-/Kartendaten lesen
   - einen sichtbaren Sammlungswert ändern
   - zeigen, dass diese Änderung im Spreadsheet ankommt
8. Kurz erklären, dass die Daten nur für diese Funktion genutzt werden

---

## 13. Was du selbst manuell machen musst

Diese Punkte kann ich dir nicht direkt abnehmen:

- Google-Cloud-Projekt im Browser auswählen
- OAuth-Consent-Screen absenden
- Search-Console-Domain-Verifizierung bestätigen
- Support-/Kontakt-E-Mail festlegen
- das Unlisted-Demo-Video hochladen
- ggf. Rückfragen von Google beantworten

---

## 14. Realistische Empfehlung für dieses Projekt

Wenn du die Freigabe möglichst reibungslos willst:

1. Öffentliche Landing-Page + Datenschutz zuerst bauen
2. In der App prüfen, ob `drive.metadata.readonly` wirklich unverzichtbar ist
3. Falls nicht zwingend nötig: Scope entfernen und nur `spreadsheets` beantragen
4. Erst danach Google-Verifizierung starten

---

## 15. Interne Abhakliste

- [ ] GitHub Pages live
- [ ] Öffentliche Homepage ohne Redirect-Schleife
- [ ] Datenschutzseite veröffentlicht
- [ ] Impressum / Kontaktseite veröffentlicht
- [ ] Search Console bestätigt
- [ ] Branding ausgefüllt
- [ ] Audience = External
- [ ] Test users gepflegt
- [ ] OAuth-Client mit Live-URL korrekt
- [ ] Demo-Video aufgenommen
- [ ] Scope-Begründungen in Englisch eingefügt
- [ ] App veröffentlicht / Verifizierung eingereicht
