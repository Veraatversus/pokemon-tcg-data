import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const { toSetRecord } = await import('../js/data/v3-records.js');
const {
  resolveSetSeriesLabel,
  resolveSetTotalCards,
  applyDeSeriesFallback,
  resolveDisplaySet
} = await import('../js/data/schema-contract.js');

const SETS = JSON.parse(readFileSync(fileURLToPath(new URL('../../../api/v3/sets.json', import.meta.url)), 'utf8'));
const me6 = SETS.find((s) => s.id === 'me6');

test('resolveSetSeriesLabel prefers DE series in de, EN in en', () => {
  const rec = toSetRecord(me6);
  assert.equal(resolveSetSeriesLabel(rec, 'de'), 'Mega-Entwicklung');
  assert.equal(resolveSetSeriesLabel(rec, 'en'), 'Mega Evolution');
  // Fallbacks: leerer tcgdex-Name -> i18n_de.series -> Map -> vera_series
  const bare = { setId: 'me6', vera_series: 'Mega Evolution', tcgdex_serie_name: '' };
  assert.equal(resolveSetSeriesLabel(bare, 'de'), 'Mega Evolution');
  assert.equal(resolveSetSeriesLabel(bare, 'de', new Map([['me6', 'Mega-Entwicklung']])), 'Mega-Entwicklung');
  assert.equal(resolveSetSeriesLabel({ ...bare, i18n_de: { series: 'Mega-Entwicklung' } }, 'de'), 'Mega-Entwicklung');
  assert.equal(resolveSetSeriesLabel({ series: 'Only' }, 'en'), 'Only');
});

test('imported and not-imported sets of one series share one group', () => {
  const notImported = resolveDisplaySet(toSetRecord(me6));
  // Importierte Zeile aus altem Alias-Import: ohne DE-Serie (nur EN)
  const oldRow = { setId: 'me6', imported: true, vera_series: 'Mega Evolution', vera_name: 'Phantasmal Flames', tcgdex_serie_name: '' };
  const fixed = resolveDisplaySet(applyDeSeriesFallback(oldRow, new Map([['me6', 'Mega-Entwicklung']])));
  assert.equal(fixed.series, 'Mega-Entwicklung');
  assert.equal(fixed.seriesGroupKey, notImported.seriesGroupKey);
  assert.equal(fixed.seriesGroupLabel, notImported.seriesGroupLabel);
  // vorhandener Wert bleibt unberuehrt
  const keep = applyDeSeriesFallback({ ...oldRow, tcgdex_serie_name: 'X' }, new Map([['me6', 'Y']]));
  assert.equal(keep.tcgdex_serie_name, 'X');
});

test('Gesamtzahl: nicht importiert nutzt total (141), nicht printedTotal', () => {
  const d = resolveDisplaySet(toSetRecord(me6));
  assert.equal(resolveSetTotalCards(d), 141);
  assert.equal(resolveSetTotalCards({ totalCards: 5 }), 5);
});

test('resolveSeriesGroupInfo (Pfad von Dashboard und Import-Selector) nutzt die gemeinsame DE-Map', async () => {
  const { resolveSeriesGroupInfo, setDeSeriesBySetId } = await import('../js/data/schema-contract.js');
  const imported = { setId: 'me6', imported: true, vera_series: 'Mega Evolution', series: 'Mega Evolution', tcgdex_serie_name: '' };
  const notImported = resolveDisplaySet(toSetRecord(me6));
  try {
    setDeSeriesBySetId(new Map([['me6', 'Mega-Entwicklung']]));
    const a = resolveSeriesGroupInfo(imported);
    const b = resolveSeriesGroupInfo(notImported);
    assert.equal(a.label, 'Mega-Entwicklung');
    assert.equal(a.key, b.key);
    assert.equal(a.label, b.label);
    // Selector-Gruppierung: eine Gruppe fuer beide
    const groups = new Set([imported, notImported].map((s) => resolveSeriesGroupInfo(s).key));
    assert.equal(groups.size, 1);
    // resolveDisplaySet nutzt denselben Resolver
    assert.equal(resolveDisplaySet(imported).series, 'Mega-Entwicklung');
  } finally {
    setDeSeriesBySetId(null);
  }
});

test('Mega-Entwicklung: Sets mit und ohne tcgdex_serie_id landen in einer Gruppe (Task 11)', async () => {
  const { resolveSeriesGroupInfo, setDeSeriesBySetId } = await import('../js/data/schema-contract.js');
  const base = { vera_series: 'Mega Evolution', tcgdex_serie_name: 'Mega-Entwicklung' };
  const rows = [
    { ...base, setId: 'me4' },
    { ...base, setId: 'mep' },
    // TCGDEX-mee / me55c: Serien-ID gesetzt, Rest identisch
    { ...base, setId: 'TCGDEX-mee', tcgdex_serie_id: 'me', tcgdex_name: 'Mega-Entwicklung Energie' },
    { ...base, setId: 'me55c', tcgdex_serie_id: 'me', vera_name: '30th Celebration: Classic Collection' },
    // ganz ohne DE-Serie, nur ueber die gemeinsame Map
    { setId: 'me2', vera_series: 'Mega Evolution', tcgdex_serie_name: '' }
  ];
  try {
    setDeSeriesBySetId(new Map([['me2', 'Mega-Entwicklung']]));
    const keys = new Set(rows.map((r) => resolveSeriesGroupInfo(r).key));
    assert.equal(keys.size, 1, [...keys].join(','));
  } finally {
    setDeSeriesBySetId(null);
  }
});

test('Set-Name: leerer tcgdex_name faellt in DE auf den Namen aus api/v3 (gemeinsame Set-Meta-Map)', async () => {
  const { setV3SetMeta, resolveDisplaySet, resolveFieldValue } = await import('../js/data/schema-contract.js');
  const row = { setId: 'me55c', vera_name: '30th Celebration: Classic Collection', tcgdex_name: '' };
  try {
    setV3SetMeta(new Map([['me55c', { deName: '30 Jahre: Klassische Sammlung', deSeries: 'Mega-Entwicklung' }]]));
    assert.equal(resolveFieldValue(row, 'set', 'setName', 'de'), '30 Jahre: Klassische Sammlung');
    assert.equal(resolveFieldValue(row, 'set', 'setName', 'en'), '30th Celebration: Classic Collection');
    assert.equal(resolveFieldValue({ ...row, tcgdex_name: 'Eigener' }, 'set', 'setName', 'de'), 'Eigener');
    assert.equal(resolveDisplaySet(row).series, 'Mega-Entwicklung');
  } finally {
    setV3SetMeta(null);
  }
  assert.equal(resolveFieldValue(row, 'set', 'setName', 'de'), '30th Celebration: Classic Collection');
});

test('fetchV3SetMeta liefert DE-Name und DE-Serie je Set', async () => {
  const { fetchV3SetMeta } = await import('../js/data/pokemon-api.js');
  const meta = await fetchV3SetMeta({ loadSets: async () => SETS });
  assert.equal(meta.get('me55c').deName, '30 Jahre: Klassische Sammlung');
  assert.equal(meta.get('me6').deSeries, 'Mega-Entwicklung');
  assert.equal((await fetchV3SetMeta({ loadSets: async () => { throw new Error('x'); } })).size, 0);
});

const SETTINGS_KEY = (await import('../js/core/config.js')).scopedStorageKey('user-settings');

test('Gruppenschluessel ist sprachunabhaengig fuer v3-Sets (Pocket, Platinum, Mega Evolution)', async () => {
  const { resolveSeriesGroupInfo, setV3SetMeta } = await import('../js/data/schema-contract.js');
  const { fetchV3SetMeta } = await import('../js/data/pokemon-api.js');
  const { scopedStorageKey } = await import('../js/core/config.js');
  const sets = [
    { id: 'pa1', series: 'Pokémon TCG Pocket', i18n: { de: { series: 'Pokémon‑Sammelkartenspiel‑Pocket' } } },
    { id: 'pa2', series: 'Pokémon TCG Pocket' },
    { id: 'pl1', series: 'Platinum', i18n: { de: { series: 'Platin' } } },
    { id: 'pl2', series: 'Platinum' },
    { id: 'me1', series: 'Mega Evolution', i18n: { de: { series: 'Mega-Entwicklung' } } },
    { id: 'me2', series: 'Mega Evolution' }
  ];
  const meta = await fetchV3SetMeta({ loadSets: async () => sets });
  const store2 = globalThis.localStorage;
  try {
    setV3SetMeta(meta);
    for (const lang of ['en', 'de']) {
      globalThis.localStorage.setItem(SETTINGS_KEY, JSON.stringify({ cardLanguage: lang }));
      for (const [a, b, serEn, serDe] of [['pa1', 'pa2', 'Pokémon TCG Pocket', 'Pokémon‑Sammelkartenspiel‑Pocket'], ['pl1', 'pl2', 'Platinum', 'Platin'], ['me1', 'me2', 'Mega Evolution', 'Mega-Entwicklung']]) {
        const withDe = { setId: a, vera_series: serEn, tcgdex_serie_name: serDe };
        const without = { setId: b, vera_series: serEn, tcgdex_serie_name: '' };
        assert.equal(resolveSeriesGroupInfo(withDe).key, resolveSeriesGroupInfo(without).key, `${lang} ${a}`);
      }
    }
  } finally {
    setV3SetMeta(null);
    store2.removeItem(SETTINGS_KEY);
  }
});

test('Sammelserien Other/Miscellaneous: Schluessel aus DE-Serie, sonst Set-Fallback (DE und EN)', async () => {
  const { resolveSeriesGroupInfo, setV3SetMeta } = await import('../js/data/schema-contract.js');
  const { fetchV3SetMeta } = await import('../js/data/pokemon-api.js');
  const mk = (id, series, de) => ({ id, series, ...(de ? { i18n: { de: { series: de } } } : {}) });
  const sets = [
    mk('neo1', 'Neo', 'Neo'), mk('si1', 'Other', 'Neo'),
    mk('pl1', 'Platinum', 'Platin'), mk('ru1', 'Other', 'Platin'),
    mk('base6', 'Other', 'Ruf der Legenden'), mk('bp', 'Other', 'e-Card'),
    mk('mcd11', 'Other'), mk('mcd12', 'Other'), mk('miscp', 'Miscellaneous')
  ];
  const meta = await fetchV3SetMeta({ loadSets: async () => sets });
  const info = (id, vera, de) => resolveSeriesGroupInfo({ setId: id, vera_series: vera, tcgdex_serie_name: de });
  try {
    setV3SetMeta(meta);
    for (const lang of ['de', 'en']) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ cardLanguage: lang }));
      assert.equal(info('si1', 'Other', 'Neo').key, info('neo1', 'Neo', 'Neo').key, lang);
      assert.equal(info('ru1', 'Other', 'Platin').key, info('pl1', 'Platinum', 'Platin').key, lang);
      assert.notEqual(info('base6', 'Other', 'Ruf der Legenden').key, info('bp', 'Other', 'e-Card').key, lang);
      assert.notEqual(info('base6', 'Other', 'Ruf der Legenden').key, info('mcd11', 'Other', '').key, lang);
      assert.equal(info('mcd11', 'Other', '').key, info('mcd12', 'Other', '').key, lang);
      assert.notEqual(info('miscp', 'Miscellaneous', '').key, info('mcd11', 'Other', '').key, lang);
    }
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ cardLanguage: 'de' }));
    assert.equal(info('base6', 'Other', 'Ruf der Legenden').label, 'Ruf der Legenden');
    // unbekanntes Pocket-Set (nicht in v3) joint die v3-Pocket-Gruppe
    assert.equal(info('unknown-pocket', 'Pokémon TCG Pocket', '').key, (await import('../js/data/schema-contract.js')).seriesGroupKeyForName('Pokémon TCG Pocket'));
  } finally {
    setV3SetMeta(null);
    localStorage.removeItem(SETTINGS_KEY);
  }
});

test('np/pop und tk1a/Trainer Kits: DE-Serie der Zeile schlaegt die EN-Serie aus v3 (echte sets.json)', async () => {
  const { resolveSeriesGroupInfo, setV3SetMeta } = await import('../js/data/schema-contract.js');
  const { fetchV3SetMeta } = await import('../js/data/pokemon-api.js');
  const meta = await fetchV3SetMeta({ loadSets: async () => SETS });
  const row = (id, vera, de) => ({ setId: id, vera_series: vera, tcgdex_serie_name: de });
  try {
    setV3SetMeta(meta);
    for (const lang of ['de', 'en']) {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ cardLanguage: lang }));
      assert.equal(resolveSeriesGroupInfo(row('np', 'NP', 'POP')).key, resolveSeriesGroupInfo(row('pop1', 'POP', 'POP')).key, lang);
      assert.equal(resolveSeriesGroupInfo(row('tk1a', 'EX', 'Trainer Kits')).key, resolveSeriesGroupInfo(row('TCGDEX-tk-dp-l', 'Trainer kits', 'Trainer Kits')).key, lang);
      assert.notEqual(resolveSeriesGroupInfo(row('tk1a', 'EX', 'Trainer Kits')).key, resolveSeriesGroupInfo(row('ex1', 'EX', 'EX')).key, lang);
    }
  } finally {
    setV3SetMeta(null);
    localStorage.removeItem(SETTINGS_KEY);
  }
});
