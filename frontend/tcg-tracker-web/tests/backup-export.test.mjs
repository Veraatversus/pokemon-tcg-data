// Final-Review Finding 7: Backup-Export liest strikt und bricht bei Lesefehlern ab (kein unvollstaendiges Backup).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCollectionBackupSets, BackupExportError } from '../js/features/collection/backup-export.js';

const SETS = [{ setId: 'me5', setName: 'ME5' }, { setId: 'base1', setName: 'Base' }, { setId: 'sv1', setName: 'SV1' }];
const entry = (g, rh = false) => ({ g, rh });

test('Erfolg: nur Sets mit Haken werden gelesen, Schluessel = collectionKey', async () => {
  const read = [];
  const sets = await buildCollectionBackupSets(SETS, {
    listSetIds: async () => new Set(['me5', 'sv1']),
    ensureResolver: async () => {},
    readMap: async (set) => {
      read.push(set.setId);
      return new Map(set.setId === 'me5' ? [['1', entry(true, true)], ['2', entry(false)]] : [['11g', entry(true)]]);
    }
  });
  assert.deepEqual(read, ['me5', 'sv1']);
  assert.deepEqual(sets, [
    { setId: 'me5', setName: 'ME5', cards: [{ cardId: '1', g: true, rh: true }] },
    { setId: 'base1', setName: 'Base', cards: [] },
    { setId: 'sv1', setName: 'SV1', cards: [{ cardId: '11g', g: true, rh: false }] }
  ]);
});

test('Lesefehler der Set-Liste -> Abbruch mit klarer Meldung', async () => {
  await assert.rejects(buildCollectionBackupSets(SETS, {
    listSetIds: async () => { throw new Error('Backend Error'); },
    ensureResolver: async () => {},
    readMap: async () => new Map()
  }), (err) => err instanceof BackupExportError && /db_collection.*Backend Error.*kein Backup/.test(err.message));
});

test('Lesefehler eines Sets oder Registry nicht erreichbar -> Abbruch, kein Teil-Backup', async () => {
  for (const failing of ['read', 'registry']) {
    await assert.rejects(buildCollectionBackupSets(SETS, {
      listSetIds: async () => new Set(['me5', 'sv1']),
      ensureResolver: async (setId) => { if (failing === 'registry' && setId === 'sv1') throw new Error('v3 API error 503'); },
      readMap: async (set) => { if (failing === 'read' && set.setId === 'sv1') throw new Error('quota'); return new Map(); }
    }), (err) => err.code === 'BACKUP_READ_FAILED' && err.setId === 'sv1' && /SV1.*kein Backup/.test(err.message), failing);
  }
});
