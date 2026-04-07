import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  withBrowser,
  gotoReady,
  waitForSelectorStable,
  isLoggedIn,
  BASE_URL,
} from './smoke-utils.mjs';

const normalizeSearchText = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

function collectSearchStrings(values = []) {
  const seen = new Set();
  const result = [];

  const visit = (value) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object') {
      Object.values(value).forEach(visit);
      return;
    }

    const raw = String(value || '').trim();
    if (!raw || /^https?:\/\//i.test(raw)) return;
    const normalized = normalizeSearchText(raw).replace(/\s+/g, ' ').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    result.push(normalized);
  };

  values.forEach(visit);
  return result;
}

function matchesTokensInValues(tokens = [], values = []) {
  if (!tokens.length) return false;
  return tokens.every((token) => values.some((value) => value.includes(token)));
}

function buildSetSearchContext(set = null) {
  const nameValues = collectSearchStrings([
    set?.name,
    set?.setName,
    set?.vera_name,
    set?.tcgdex_name,
  ]);

  const seriesValues = collectSearchStrings([
    set?.series,
    set?.vera_series,
    set?.tcgdex_serie_name,
    set?.tcgdex_serie_id,
  ]);

  const codeValues = collectSearchStrings([
    set?.id,
    set?.setId,
    set?.ptcgoCode,
    set?.vera_ptcgoCode,
    set?.tcgdex_abbreviation_official,
  ]);

  return {
    nameValues,
    seriesValues,
    codeValues,
    fullText: [...nameValues, ...seriesValues, ...codeValues].join(' '),
  };
}

function scoreDashboardSetMatch(set, rawQuery = '') {
  const normalizedQuery = normalizeSearchText(rawQuery).replace(/\s+/g, ' ').trim();
  if (!normalizedQuery) return 0;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const context = buildSetSearchContext(set);
  const weightedGroups = [
    { values: context.codeValues, exact: 280, prefix: 240, includes: 180 },
    { values: context.nameValues, exact: 230, prefix: 180, includes: 125 },
    { values: context.seriesValues, exact: 120, prefix: 90, includes: 70 },
  ];

  let bestScore = -1;

  weightedGroups.forEach(({ values, exact, prefix, includes }) => {
    values.forEach((value) => {
      if (!value) return;
      if (value === normalizedQuery) bestScore = Math.max(bestScore, exact);
      else if (value.startsWith(normalizedQuery)) bestScore = Math.max(bestScore, prefix);
      else if (value.includes(normalizedQuery)) bestScore = Math.max(bestScore, includes);
    });
  });

  if (tokens.length && matchesTokensInValues(tokens, context.codeValues)) {
    bestScore = Math.max(bestScore, 160 + (tokens.length * 12));
  }
  if (tokens.length && matchesTokensInValues(tokens, context.nameValues)) {
    bestScore = Math.max(bestScore, 135 + (tokens.length * 11));
  }
  if (tokens.length && matchesTokensInValues(tokens, context.seriesValues)) {
    bestScore = Math.max(bestScore, 85 + (tokens.length * 8));
  } else if (tokens.length && tokens.every((token) => context.fullText.includes(token))) {
    bestScore = Math.max(bestScore, 50 + (tokens.length * 8));
  }

  return bestScore;
}

async function verifyDatasetQueries() {
  const setsPath = resolve(process.cwd(), '..', '..', 'sets', 'en.json');
  const raw = await readFile(setsPath, 'utf8');
  const sets = JSON.parse(raw);

  const cases = [
    { name: 'ptcgo_code_svi', query: 'SVI', expectedId: 'sv1', expectedLabel: 'Scarlet & Violet' },
    { name: 'loose_punctuation_scarlet_violet', query: 'scarlet violet', expectedId: 'sv1', expectedLabel: 'Scarlet & Violet' },
    { name: 'legacy_code_b2', query: 'B2', expectedId: 'base4', expectedLabel: 'Base Set 2' },
  ];

  return cases.map((testCase) => {
    const matches = sets
      .map((set) => ({
        setId: set.id || set.setId || '',
        setName: set.name || set.setName || '',
        score: scoreDashboardSetMatch(set, testCase.query),
      }))
      .filter((entry) => entry.score >= 0)
      .sort((left, right) => {
        if (right.score !== left.score) return right.score - left.score;
        return String(left.setName || '').localeCompare(String(right.setName || ''), 'de', { sensitivity: 'base' });
      });

    const bestMatch = matches[0];
    if (!bestMatch) {
      throw new Error(`[${testCase.name}] Kein Treffer für "${testCase.query}" gefunden.`);
    }
    if (bestMatch.setId !== testCase.expectedId) {
      throw new Error(`[${testCase.name}] Erwartet ${testCase.expectedId}/${testCase.expectedLabel}, erhalten: ${bestMatch.setId}/${bestMatch.setName}`);
    }

    return {
      ...testCase,
      bestMatch,
      topMatches: matches.slice(0, 5),
    };
  });
}

async function verifyLiveDashboardIfLoggedIn() {
  let liveResult = { skipped: true, reason: 'Keine aktive Login-Session.' };

  await withBrowser(async (page) => {
    await gotoReady(page, `${BASE_URL}?nocache=${Date.now()}#dashboard`);
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      console.log('⚠️ Dashboard Set Search Smoke: Live-Dashboard-Check übersprungen (keine aktive Login-Session).');
      return;
    }

    await waitForSelectorStable(page, '#dash-filter');
    await page.locator('[data-dashboard-view="all"]').click().catch(() => {});

    const runLiveCase = async (query, expectedText) => {
      await page.locator('#dash-filter').fill(query);
      await page.waitForTimeout(450);
      const state = await page.evaluate(() => ({
        names: Array.from(document.querySelectorAll('.dash-set-name')).slice(0, 12).map((node) => node.textContent?.trim() || ''),
        series: Array.from(document.querySelectorAll('.dash-set-series')).slice(0, 12).map((node) => node.textContent?.trim() || ''),
        emptyText: document.querySelector('#dashboard-grid .empty-state')?.textContent?.trim() || '',
      }));

      const haystacks = [...state.names, ...state.series].map((value) => normalizeSearchText(value));
      if (!haystacks.some((value) => value.includes(normalizeSearchText(expectedText)))) {
        throw new Error(`Live-Dashboard-Treffer für "${query}" fehlt: ${state.emptyText || JSON.stringify(state.names)}`);
      }

      return { query, expectedText, ...state };
    };

    liveResult = {
      skipped: false,
      checks: [
        await runLiveCase('SVI', 'Scarlet & Violet'),
        await runLiveCase('scarlet violet', 'Scarlet & Violet'),
      ],
    };

    await page.locator('#dash-filter').fill('');
    await page.waitForTimeout(150);
  });

  return liveResult;
}

async function run() {
  const datasetChecks = await verifyDatasetQueries();
  const liveCheck = await verifyLiveDashboardIfLoggedIn();

  console.log('✅ Dashboard Set Search Smoke OK');
  console.log(JSON.stringify({ datasetChecks, liveCheck }, null, 2));
}

run().catch((err) => {
  console.error('❌ Dashboard Set Search Smoke fehlgeschlagen:', err);
  process.exitCode = 1;
});
