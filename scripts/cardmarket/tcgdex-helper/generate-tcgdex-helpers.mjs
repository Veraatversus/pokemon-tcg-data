import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const DEFAULT_REPO_URL = 'https://github.com/tcgdex/cards-database.git';
const DEFAULT_REF = 'master';
const MANUAL_CARDMARKET_SET_ID_BY_TCGDEX_SET_ID = Object.freeze({
  '2011bw': 1623,
  '2012bw': 1624,
  '2013bw': 2352,
  '2014xy': 1625,
  '2015xy': 1741,
  '2016xy': 1752,
  '2017sm': 1845,
  '2018sm': 2404,
  '2019sm': 2829,
  '2019sm-fr': 3354,
  '2021swsh': 3738,
  '2022swsh': 5135,
  '2023sv': 5430,
  '2024sv': 5978,
  mfb: 5526,
  sv10: 6096,
  dpp: 1609,
});

function toNumberOrNull(value) {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stripQuotes(value) {
  const trimmed = String(value || '').trim();
  const match = trimmed.match(/^['\"]([\s\S]*)['\"]$/);
  return match ? match[1] : trimmed;
}

function extractObjectBlock(content, key) {
  const keyRegex = new RegExp(`${key}\\s*:\\s*{`, 'm');
  const keyMatch = keyRegex.exec(content);
  if (!keyMatch) return '';

  const openBraceIndex = content.indexOf('{', keyMatch.index);
  if (openBraceIndex < 0) return '';

  let depth = 0;
  for (let index = openBraceIndex; index < content.length; index += 1) {
    const char = content[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return content.slice(openBraceIndex + 1, index);
      }
    }
  }

  return '';
}

function extractStringProperty(content, key) {
  const keyRegex = new RegExp(`${key}\\s*:\\s*([\"'][^\"']*[\"'])`, 'm');
  const match = keyRegex.exec(content);
  if (!match) return null;
  return stripQuotes(match[1]);
}

function extractNumberProperty(content, key) {
  const keyRegex = new RegExp(`${key}\\s*:\\s*(-?\\d+)`, 'm');
  const match = keyRegex.exec(content);
  if (!match) return null;
  return toNumberOrNull(match[1]);
}

function extractName(content) {
  const nameBlock = extractObjectBlock(content, 'name');
  return {
    en: extractStringProperty(nameBlock, 'en'),
    de: extractStringProperty(nameBlock, 'de'),
  };
}

function parseSetFileContent(content) {
  const setId = extractStringProperty(content, 'id');
  if (!setId) return null;

  const name = extractName(content);
  const abbreviationsBlock = extractObjectBlock(content, 'abbreviations');
  const thirdPartyBlock = extractObjectBlock(content, 'thirdParty');

  return {
    tcgdexSetId: setId,
    name: {
      en: name.en,
      de: name.de,
    },
    officialAbbreviation: extractStringProperty(abbreviationsBlock, 'official'),
    cardmarketSetId: extractNumberProperty(thirdPartyBlock, 'cardmarket'),
    tcgplayerSetId: extractNumberProperty(thirdPartyBlock, 'tcgplayer'),
  };
}

function parseCardFileContent(content, localId) {
  const name = extractName(content);
  const thirdPartyBlock = extractObjectBlock(content, 'thirdParty');

  return {
    number: localId,
    name: {
      en: name.en,
      de: name.de,
    },
    cardmarketId: extractNumberProperty(thirdPartyBlock, 'cardmarket'),
    tcgplayerId: extractNumberProperty(thirdPartyBlock, 'tcgplayer'),
  };
}

function splitLocalId(value) {
  const text = String(value || '').trim();
  const match = /^([A-Za-z]*)(\d+)([A-Za-z]*)$/i.exec(text);
  if (!match) {
    return {
      prefix: text.toLowerCase(),
      numeric: Number.MAX_SAFE_INTEGER,
      suffix: '',
      raw: text,
    };
  }

  return {
    prefix: match[1].toLowerCase(),
    numeric: Number(match[2]),
    suffix: match[3].toLowerCase(),
    raw: text,
  };
}

export function sortLocalIds(left, right) {
  const leftParts = splitLocalId(left);
  const rightParts = splitLocalId(right);

  if (leftParts.prefix !== rightParts.prefix) {
    if (!leftParts.prefix) return -1;
    if (!rightParts.prefix) return 1;
    return leftParts.prefix.localeCompare(rightParts.prefix, 'en');
  }

  if (leftParts.numeric !== rightParts.numeric) {
    return leftParts.numeric - rightParts.numeric;
  }

  if (leftParts.suffix !== rightParts.suffix) {
    if (!leftParts.suffix) return -1;
    if (!rightParts.suffix) return 1;
    return leftParts.suffix.localeCompare(rightParts.suffix, 'en');
  }

  return leftParts.raw.localeCompare(rightParts.raw, 'en', { numeric: true });
}

async function listFilesRecursive(rootDir) {
  const files = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return files;
}

function bySetSorting(left, right) {
  const leftId = left.cardmarketSetId;
  const rightId = right.cardmarketSetId;

  if (leftId === null && rightId !== null) return 1;
  if (leftId !== null && rightId === null) return -1;
  if (leftId !== null && rightId !== null && leftId !== rightId) return leftId - rightId;
  return left.tcgdexSetId.localeCompare(right.tcgdexSetId, 'en');
}

async function readCardFilesForSet(setFilePath) {
  const setDir = path.dirname(setFilePath);
  const setBaseName = path.basename(setFilePath, '.ts');
  const cardsDir = path.join(setDir, setBaseName);

  let cardEntries = [];
  try {
    const dirEntries = await fs.readdir(cardsDir, { withFileTypes: true });
    cardEntries = dirEntries.filter((entry) => entry.isFile() && entry.name.endsWith('.ts'));
  } catch {
    return [];
  }

  const cards = [];
  for (const entry of cardEntries) {
    const localId = path.basename(entry.name, '.ts');
    const cardPath = path.join(cardsDir, entry.name);
    const content = await fs.readFile(cardPath, 'utf8');
    cards.push(parseCardFileContent(content, localId));
  }

  return cards.sort((left, right) => sortLocalIds(left.number, right.number));
}

export async function collectTcgdexHelperData({ sourceDir } = {}) {
  if (!sourceDir) {
    throw new Error('collectTcgdexHelperData requires sourceDir');
  }

  const dataDir = path.join(sourceDir, 'data');
  const allFiles = await listFilesRecursive(dataDir);
  const setFiles = allFiles.filter((filePath) => {
    if (!filePath.endsWith('.ts')) return false;
    const relativeParts = path.relative(dataDir, filePath).split(path.sep);
    return relativeParts.length === 2;
  });

  const sets = [];
  const cardsByTcgdexSetId = {};

  for (const setFilePath of setFiles) {
    const setContent = await fs.readFile(setFilePath, 'utf8');
    const parsedSet = parseSetFileContent(setContent);
    if (!parsedSet) continue;

    parsedSet.name.en = parsedSet.name.en ?? null;
    parsedSet.name.de = parsedSet.name.de ?? null;
    parsedSet.officialAbbreviation = parsedSet.officialAbbreviation ?? null;
    parsedSet.cardmarketSetId = parsedSet.cardmarketSetId ?? null;
    parsedSet.tcgplayerSetId = parsedSet.tcgplayerSetId ?? null;

    const cards = await readCardFilesForSet(setFilePath);
    const normalizedCards = cards.map((card) => ({
      number: card.number,
      name: {
        en: card.name.en ?? null,
        de: card.name.de ?? null,
      },
      cardmarketId: card.cardmarketId ?? null,
      tcgplayerId: card.tcgplayerId ?? null,
    }));

    sets.push(parsedSet);
    cardsByTcgdexSetId[parsedSet.tcgdexSetId] = normalizedCards;
  }

  sets.sort(bySetSorting);

  return {
    sets,
    cardsByTcgdexSetId,
  };
}

async function writeJsonAtomic(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(payload), 'utf8');
  await fs.rename(tempPath, filePath);
}

export async function writeTcgdexHelperArtifacts({ outputDir, collected, source }) {
  if (!outputDir) throw new Error('writeTcgdexHelperArtifacts requires outputDir');
  if (!collected?.sets || !collected?.cardsByTcgdexSetId) {
    throw new Error('writeTcgdexHelperArtifacts requires collected data');
  }

  const meta = {
    generatedAt: new Date().toISOString(),
    source: {
      repoUrl: source?.repoUrl || DEFAULT_REPO_URL,
      ref: source?.ref || DEFAULT_REF,
    },
    setCount: collected.sets.length,
    cardCount: Object.values(collected.cardsByTcgdexSetId).reduce((sum, cards) => sum + cards.length, 0),
  };

  const exportedSets = collected.sets.map((set) => {
    const manualCardmarketSetId = MANUAL_CARDMARKET_SET_ID_BY_TCGDEX_SET_ID[set.tcgdexSetId] ?? null;
    return {
      ...set,
      cardmarketSetId: set.cardmarketSetId ?? manualCardmarketSetId,
    };
  });

  await writeJsonAtomic(path.join(outputDir, 'sets-master.json'), {
    meta,
    sets: exportedSets,
  });

  for (const set of exportedSets) {
    const cards = collected.cardsByTcgdexSetId[set.tcgdexSetId] || [];
    const payload = {
      tcgdexSetId: set.tcgdexSetId,
      cardmarketSetId: set.cardmarketSetId,
      tcgplayerSetId: set.tcgplayerSetId,
      officialAbbreviation: set.officialAbbreviation,
      name: set.name,
      cards,
    };

    if (set.cardmarketSetId !== null) {
      await writeJsonAtomic(path.join(outputDir, 'sets', `${set.cardmarketSetId}.json`), payload);
    } else {
      await writeJsonAtomic(path.join(outputDir, 'unmatched', `${set.tcgdexSetId}.json`), payload);
    }
  }
}

async function runGitClone({ repoUrl, ref, cloneDir }) {
  await execFileAsync('git', ['clone', '--depth', '1', '--branch', ref, repoUrl, cloneDir], {
    windowsHide: true,
  });
}

function parseArgs(argv) {
  const options = {
    repoUrl: DEFAULT_REPO_URL,
    ref: DEFAULT_REF,
    outDir: '',
    workDir: '',
    sourceDir: '',
    keepTemp: false,
    dryRun: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--repo-url':
        options.repoUrl = argv[index + 1] || options.repoUrl;
        index += 1;
        break;
      case '--ref':
        options.ref = argv[index + 1] || options.ref;
        index += 1;
        break;
      case '--out-dir':
        options.outDir = argv[index + 1] || options.outDir;
        index += 1;
        break;
      case '--work-dir':
        options.workDir = argv[index + 1] || options.workDir;
        index += 1;
        break;
      case '--source-dir':
        options.sourceDir = argv[index + 1] || options.sourceDir;
        index += 1;
        break;
      case '--keep-temp':
        options.keepTemp = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      default:
        break;
    }
  }

  return options;
}

export async function runTcgdexHelperCli(rawArgs = process.argv.slice(2)) {
  const args = parseArgs(rawArgs);
  const moduleFilePath = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(moduleFilePath), '..', '..', '..');
  const defaultOutDir = path.join(repoRoot, 'scripts', 'cardmarket', 'helpers', 'tcgdex-data');
  const outputDir = path.resolve(args.outDir || defaultOutDir);

  let tempDir = '';
  let effectiveSourceDir = args.sourceDir ? path.resolve(args.sourceDir) : '';

  if (!effectiveSourceDir) {
    if (args.workDir) {
      effectiveSourceDir = path.resolve(args.workDir);
    } else {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tcgdex-clone-'));
      await runGitClone({
        repoUrl: args.repoUrl,
        ref: args.ref,
        cloneDir: tempDir,
      });
      effectiveSourceDir = tempDir;
    }
  }

  const collected = await collectTcgdexHelperData({ sourceDir: effectiveSourceDir });

  if (!args.dryRun) {
    await writeTcgdexHelperArtifacts({
      outputDir,
      collected,
      source: {
        repoUrl: args.repoUrl,
        ref: args.ref,
      },
    });
  }

  if (tempDir && !args.keepTemp) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  return {
    outputDir,
    dryRun: args.dryRun,
    setCount: collected.sets.length,
    cardCount: Object.values(collected.cardsByTcgdexSetId).reduce((sum, cards) => sum + cards.length, 0),
  };
}

const isDirectRun = process.argv[1]
  && path.basename(process.argv[1]).toLowerCase() === path.basename(fileURLToPath(import.meta.url)).toLowerCase();

if (isDirectRun) {
  runTcgdexHelperCli()
    .then((summary) => {
      console.log(`tcgdex-helper complete: ${summary.setCount} sets, ${summary.cardCount} cards${summary.dryRun ? ' (dry-run)' : ''} -> ${summary.outputDir}`);
    })
    .catch((error) => {
      console.error('[tcgdex-helper] failed:', error);
      process.exitCode = 1;
    });
}
