// ══════════════════════════════════════════════════════════════════════════
// REALTIME MULTIPLAYER SYNC (BroadcastChannel + storage fallback)
// ══════════════════════════════════════════════════════════════════════════

import { scopedStorageKey } from './config.js';

const CHANNEL_NAME = scopedStorageKey('tcg-realtime-channel');
const STORAGE_KEY = scopedStorageKey('tcg-realtime-event');

let broadcastChannel = null;
let storageListener = null;
let heartbeatTimer = null;

function nowIso() {
  return new Date().toISOString();
}

function safeParse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function emitStorageEvent(payload) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[RealtimeSync] storage emit failed:', err);
  }
}

export function initRealtimeSync({ clientId, onEvent }) {
  const id = clientId || `client_${Date.now()}`;

  if ('BroadcastChannel' in window) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      const payload = event?.data;
      if (!payload || payload.source === id) return;
      onEvent?.(payload);
    };
  }

  storageListener = (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    const payload = safeParse(event.newValue);
    if (!payload || payload.source === id) return;
    onEvent?.(payload);
  };

  window.addEventListener('storage', storageListener);

  heartbeatTimer = window.setInterval(() => {
    publishRealtimeEvent({
      type: 'presence',
      source: id,
      timestamp: nowIso()
    });
  }, 30000);

  publishRealtimeEvent({ type: 'presence', source: id, timestamp: nowIso() });

  return {
    clientId: id,
    publish: (payload) => publishRealtimeEvent({ ...payload, source: id, timestamp: nowIso() }),
    destroy: () => {
      if (broadcastChannel) {
        broadcastChannel.close();
        broadcastChannel = null;
      }
      if (storageListener) {
        window.removeEventListener('storage', storageListener);
        storageListener = null;
      }
      if (heartbeatTimer) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    }
  };
}

export function publishRealtimeEvent(payload) {
  if (!payload) return;

  if (broadcastChannel) {
    broadcastChannel.postMessage(payload);
  }

  emitStorageEvent(payload);
}

export function buildCollectionUpdateEvent({ setId, setName, cardNumber, g, rh, actor }) {
  return {
    type: 'collection-update',
    setId,
    setName,
    cardNumber: String(cardNumber || ''),
    g: Boolean(g),
    rh: Boolean(rh),
    actor: actor || 'Unbekannt'
  };
}
