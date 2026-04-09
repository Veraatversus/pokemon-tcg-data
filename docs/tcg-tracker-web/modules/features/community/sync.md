# features/community/sync.js

← [../../../README.md](../../../README.md) | [index.md](index.md)

---

## Zweck

Realtime-Synchronisation zwischen Tabs/Fenstern via `BroadcastChannel` mit localStorage-Fallback.

## Öffentliche API

| Export |
|---|
| `initRealtimeSync({ clientId, onEvent })` |
| `publishRealtimeEvent(payload)` |
| `buildCollectionUpdateEvent({ setId, setName, cardNumber, g, rh, actor })` |

## Abhängigkeiten

- `core/config.js` (`scopedStorageKey`)
- Browser APIs: `BroadcastChannel`, `storage`-Events

## Verwandte Seiten

- [../../../navigation.md](../../../navigation.md)
- [../../../app.md](../../../app.md)
