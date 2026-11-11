// Laedt die TCGdex-Kartendatenbank (data/<Serie>.ts, data/<Serie>/<Set>.ts,
// data/<Serie>/<Set>/<localId>.ts). Dateien werden nur als Text gelesen und
// vom sicheren Parser ausgewertet, nie ausgefuehrt.
import fs from 'node:fs';
import path from 'node:path';
import { parseTcgdexModule } from './parse-module.mjs';
import { sortLocalIds } from '../../cardmarket/tcgdex-helper/generate-tcgdex-helpers.mjs';

function readModule(filePath) {
  return parseTcgdexModule(fs.readFileSync(filePath, 'utf8'), filePath).exports.default;
}

function listDir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

const tsBaseNames = (dir) => listDir(dir)
  .filter((e) => e.isFile() && e.name.endsWith('.ts'))
  .map((e) => e.name.slice(0, -3))
  .sort();

const numberOrNull = (v) => (typeof v === 'number' ? v : null);

export function loadTcgdexDatabase(rootDir, { excludeSerieIds = ['tcgp'] } = {}) {
  const dataDir = path.join(rootDir, 'data');
  const sets = [];
  const errors = [];
  const record = (file, e) => errors.push({ file, message: e instanceof Error ? e.message : String(e) });

  for (const serieName of tsBaseNames(dataDir)) {
    const serieFile = path.join(dataDir, `${serieName}.ts`);
    let serie;
    try {
      serie = readModule(serieFile);
      if (!serie || typeof serie.id !== 'string') throw new Error('Serie ohne id');
    } catch (e) {
      record(serieFile, e);
      continue;
    }
    if (excludeSerieIds.includes(serie.id)) continue;

    const serieDir = path.join(dataDir, serieName);
    for (const setName of tsBaseNames(serieDir)) {
      const setFile = path.join(serieDir, `${setName}.ts`);
      let set;
      try {
        set = readModule(setFile);
        if (!set || typeof set.id !== 'string') throw new Error('Set ohne id');
      } catch (e) {
        record(setFile, e);
        continue;
      }

      const cards = [];
      const cardDir = path.join(serieDir, setName);
      for (const localId of tsBaseNames(cardDir)) {
        const cardFile = path.join(cardDir, `${localId}.ts`);
        try {
          const card = readModule(cardFile);
          if (!card || typeof card !== 'object') throw new Error('Karte ist kein Objekt');
          const { set: _set, ...rest } = card;
          cards.push({ localId, ...rest });
        } catch (e) {
          record(cardFile, e);
        }
      }
      cards.sort((a, b) => sortLocalIds(a.localId, b.localId));

      const rd = set.releaseDate;
      sets.push({
        id: set.id,
        serieId: serie.id,
        serieName: serie.name,
        name: set.name,
        abbreviationOfficial: set.abbreviations?.official ?? null,
        cardCountOfficial: numberOrNull(set.cardCount?.official),
        releaseDate: typeof rd === 'string' ? rd : (typeof rd?.en === 'string' ? rd.en : null),
        cardmarketId: numberOrNull(set.thirdParty?.cardmarket),
        tcgplayerId: numberOrNull(set.thirdParty?.tcgplayer),
        cards,
      });
    }
  }
  return { sets, errors };
}
