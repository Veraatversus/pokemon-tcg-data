import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSetRecordFromSources } from '../js/data/schema-contract.js';
import { resolveTcgdexImageUrl } from '../js/pokecode-compat.js';

test('buildSetRecordFromSources keeps tcgdex logo/symbol URLs without forced webp suffix', () => {
  const record = buildSetRecordFromSources({
    setId: 'sv1',
    tcgdexSet: {
      id: 'sv1',
      logo: 'https://assets.tcgdex.net/en/sv/sv1/logo',
      symbol: 'https://assets.tcgdex.net/en/sv/sv1/symbol'
    }
  });

  assert.equal(record.tcgdex_logo, 'https://assets.tcgdex.net/en/sv/sv1/logo');
  assert.equal(record.tcgdex_symbol, 'https://assets.tcgdex.net/en/sv/sv1/symbol');
});

test('resolveTcgdexImageUrl preserves existing image extension while switching quality', () => {
  const high = resolveTcgdexImageUrl('sv1', {
    localId: '15',
    set: { serie: { id: 'sv' } },
    image: 'https://assets.tcgdex.net/en/sv/sv1/15/low.jpg'
  }, { quality: 'high' });

  assert.equal(high, 'https://assets.tcgdex.net/en/sv/sv1/15/high.jpg');
});