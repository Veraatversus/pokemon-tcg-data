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
  const warnings = [];
  const setsByKey = new Map(); // aufgeloester Set-Pfad (ohne .ts) -> cards[]
  const pendingCardDirs = [];
  const failedSetKeys = new Set(); // Set-Datei nicht parsebar (Fehler bereits erfasst)
  const setKey = (p) => path.resolve(p).replace(/\.ts$/, '');
  const relPath = (f) => path.relative(rootDir, f).split(path.sep).join('/');
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
        failedSetKeys.add(setKey(setFile));
        continue;
      }

      const cards = [];
      const cardDir = path.join(serieDir, setName);
      pendingCardDirs.push(cardDir);
      setsByKey.set(setKey(setFile), { cards, ownDir: path.resolve(cardDir), byLocalId: new Map() });

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

  // Karten dem Set zuordnen, auf das ihr `set`-Import zeigt (nicht dem Ordner).
  for (const cardDir of pendingCardDirs) {
    for (const localId of tsBaseNames(cardDir)) {
      const cardFile = path.join(cardDir, `${localId}.ts`);
      try {
        const card = readModule(cardFile);
        if (!card || typeof card !== 'object') throw new Error('Karte ist kein Objekt');
        const { set: setRef, ...rest } = card;
        const spec = setRef?.$import;
        if (typeof spec !== 'string') throw new Error('Karte ohne set-Import');
        const key = setKey(path.resolve(cardDir, spec));
        if (failedSetKeys.has(key)) continue;
        const target = setsByKey.get(key);
        if (!target) throw new Error(`set-Import "${spec}" zeigt auf kein geladenes Set`);
        const entry = { card: { ...rest, localId }, file: cardFile };
        const prev = target.byLocalId.get(localId);
        if (!prev) {
          target.byLocalId.set(localId, entry);
          target.cards.push(entry.card);
          continue;
        }
        // Doppelte (Set, localId): Kopie im eigenen Set-Ordner gewinnt.
        const own = (e) => path.resolve(path.dirname(e.file)) === target.ownDir;
        const keepNew = own(entry) !== own(prev) ? own(entry) : relPath(entry.file) < relPath(prev.file);
        const [kept, dropped] = keepNew ? [entry, prev] : [prev, entry];
        if (keepNew) {
          target.cards[target.cards.indexOf(prev.card)] = entry.card;
          target.byLocalId.set(localId, entry);
        }
        warnings.push({ file: dropped.file, message: `doppelte Karte ${localId} im Set; behalten wird ${kept.file}` });
      } catch (e) {
        record(cardFile, e);
      }
    }
  }
  for (const { cards } of setsByKey.values()) cards.sort((x, y) => sortLocalIds(x.localId, y.localId));
  return { sets, errors, warnings };
}
