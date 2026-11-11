import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPokemontcg } from './sources/load-pokemontcg.mjs';
import { loadTcgdexDatabase } from './tcgdex/load-database.mjs';
import { runMatching } from './match/run-matching.mjs';
import { belowMinCardMatch, comparePairDrift } from './report/gates.mjs';
import { buildMatchingReport, renderMatchingMarkdown } from './report/matching-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function parseArgs(argv) {
  const opts = { minCardMatch: null, failOnPairDrift: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--min-card-match') {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v)) throw new Error('--min-card-match erwartet eine Zahl');
      opts.minCardMatch = v;
    } else if (argv[i] === '--fail-on-pair-drift') opts.failOnPairDrift = true;
    else throw new Error(`Unbekanntes Argument: ${argv[i]}`);
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

  const { setResult, cardResults } = runMatching({ ptSets, ptCardsBySet, tcgdexSets: db.sets, setMap, cardMap });

  const report = buildMatchingReport({
    setResult, cardResults, sources, ptSets, tcgdexSets: db.sets, ptCardsBySet, warnings: db.warnings,
    generatedAt: sources.tcgdex?.fetchedAt ?? new Date().toISOString(),
  });
  const outDir = path.join(root, 'api', 'v3', 'reports');
  const jsonFile = path.join(outDir, 'matching.json');
  if (opts.failOnPairDrift) {
    const prev = fs.existsSync(jsonFile) ? readJson(jsonFile) : { sets: [] };
    const drift = comparePairDrift(prev, report);
    if (drift.drift) {
      console.error(`FEHLER: Paar-Drift gegenueber dem letzten Report (${drift.messages.length} Abweichungen); Reports werden nicht ueberschrieben:`);
      for (const m of drift.messages) console.error(`  ${m}`);
      process.exitCode = 1;
      return;
    }
  }
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(jsonFile, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, 'matching.md'), renderMatchingMarkdown(report));

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
  if (opts.minCardMatch !== null && belowMinCardMatch(s, opts.minCardMatch)) {
    console.error(`FEHLER: cardMatchRatio ${s.cardMatchRatio} < ${opts.minCardMatch}`);
    failed = true;
  }
  if (report.unresolvedAliases.length) {
    console.error(`FEHLER: ${report.unresolvedAliases.length} unaufgeloeste Karten-Aliase`);
    for (const a of report.unresolvedAliases) console.error(`  ${a.pokemontcgId} #${a.ptNumber} -> ${a.target.setId}/${a.target.localId}: ${a.reason}`);
    failed = true;
  }
  process.exitCode = failed ? 1 : 0;
}

main();
