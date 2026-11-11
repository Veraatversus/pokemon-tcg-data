import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPokemontcg } from './sources/load-pokemontcg.mjs';
import { loadTcgdexDatabase } from './tcgdex/load-database.mjs';
import { matchSets } from './match/match-sets.mjs';
import { matchCards } from './match/match-cards.mjs';
import { buildMatchingReport, renderMatchingMarkdown } from './report/matching-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function parseArgs(argv) {
  const opts = { minCardMatch: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--min-card-match') {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v)) throw new Error('--min-card-match erwartet eine Zahl');
      opts.minCardMatch = v;
    } else throw new Error(`Unbekanntes Argument: ${argv[i]}`);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const { sets: ptSets, cardsBySet: ptCardsBySet } = loadPokemontcg(path.join(root, 'sources', 'pokemontcg'));
  const db = loadTcgdexDatabase(path.join(root, 'sources', 'tcgdex'));
  const setMap = readJson(path.join(root, 'api', 'mappings', 'set-map.json'));
  const cardMap = readJson(path.join(root, 'api', 'mappings', 'card-map.json'));
  const sources = readJson(path.join(root, 'sources', 'SOURCES.json'));

  const setResult = matchSets({ ptSets, tcgdexSets: db.sets, ptCardsBySet, setMap });
  const tcgdexSetsById = new Map(db.sets.map((s) => [s.id, s]));
  const cardResults = new Map();
  for (const pair of setResult.pairs) {
    cardResults.set(pair.pokemontcgId, matchCards({
      ptCards: ptCardsBySet.get(pair.pokemontcgId) ?? [],
      tcgdexSet: tcgdexSetsById.get(pair.tcgdexId),
      tcgdexSetsById,
      cardMap: cardMap[pair.pokemontcgId],
    }));
  }

  const report = buildMatchingReport({
    setResult, cardResults, sources, ptSets, tcgdexSets: db.sets, ptCardsBySet, warnings: db.warnings,
  });
  const outDir = path.join(root, 'api', 'v3', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'matching.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'matching.md'), `${renderMatchingMarkdown(report)}`);

  const s = report.summary;
  console.log(`Paare ${s.pairedSets}/${s.ptSets}, Karten ${s.matchedCards}/${s.ptCards} (${s.cardMatchRatio}), verdaechtig ${s.suspicious}, primaryOnly ${s.primaryOnly}`);

  let failed = false;
  if (db.errors.length) {
    console.error(`FEHLER: ${db.errors.length} TCGdex-Parse-Fehler`);
    for (const e of db.errors.slice(0, 20)) console.error(`  ${e.file}: ${e.message}`);
    failed = true;
  }
  if (report.doubleAssigned.length) {
    console.error(`FEHLER: ${report.doubleAssigned.length} TCGdex-Karten doppelt zugeordnet`);
    failed = true;
  }
  if (opts.minCardMatch !== null && s.cardMatchRatio < opts.minCardMatch) {
    console.error(`FEHLER: cardMatchRatio ${s.cardMatchRatio} < ${opts.minCardMatch}`);
    failed = true;
  }
  process.exit(failed ? 1 : 0);
}

main();
