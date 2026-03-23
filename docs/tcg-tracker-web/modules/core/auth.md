# core/auth.js

← [../../README.md](../../README.md) | [config.md](config.md) | [cache.md](cache.md)

---

## Zweck

Kapselt Google-Authentifizierung (GIS + GAPI), Token-Persistenz und Login-Status.

## Öffentliche API (Exports)

| Export | Signatur | Beschreibung |
|--------|----------|-------------|
| `loadDiscoveryDocs()` | `async () => void` | Lädt Sheets-/Drive-Discovery-Dokumente |
| `initAuth()` | `async () => boolean` | Initialisiert GAPI + GIS und versucht Token-Restore |
| `signIn(options?)` | `({ forceConsent?: boolean }) => Promise<boolean>` | OAuth-Token anfordern |
| `signOut()` | `() => void` | Token widerrufen und löschen |
| `isSignedIn()` | `() => boolean` | Gibt Loginstatus zurück |

## Abhängigkeiten

- `core/config.js` (`CONFIG`, `scopedStorageKey`)
- Extern via `index.html`: `gapi`, `google.accounts.oauth2`

## Datenfluss / Aufrufkontext

`app.js -> initAuth() -> gapiLoadClient() -> GIS TokenClient -> tryRestoreToken()`

Token-Key: `poke:<scope>:tcg_tracker_token`

## Fehlerfälle / Grenzen

- Timeout bei GAPI/GIS-Verfügbarkeit
- Abgelaufene Tokens werden verworfen; Nutzer bleibt ausgeloggt bis `signIn()`

## Verwandte Seiten

- [config.md](config.md)
- [../data/sheets-db.md](../data/sheets-db.md)
- [../../data-flow.md](../../data-flow.md)
