import assert from 'node:assert/strict';
import { findMatchingTcgdexSet } from '../js/pokecode-compat.js';

function testDoesNotFalseMatchSubsetName() {
  const result = findMatchingTcgdexSet(
    { id: 'ex7', name: 'Team Rocket Returns', ptcgoCode: '' },
    [
      {
        id: 'base5',
        name: 'Team Rocket',
        abbreviation: { official: 'RO' }
      }
    ],
    {}
  );

  assert.equal(
    result,
    null,
    'A subset-name fallback must not map Team Rocket Returns (ex7) to Team Rocket (base5).'
  );
}

function testDirectIdWinsWhenEnglishFallbackSetExists() {
  const result = findMatchingTcgdexSet(
    { id: 'ex7', name: 'Team Rocket Returns', ptcgoCode: 'TRR' },
    [
      {
        id: 'base5',
        name: 'Team Rocket',
        abbreviation: { official: 'RO' }
      },
      {
        id: 'ex7',
        name: 'Team Rocket Returns',
        abbreviation: { official: 'TRR' }
      }
    ],
    {}
  );

  assert.equal(result?.id, 'ex7');
}

try {
  testDoesNotFalseMatchSubsetName();
  testDirectIdWinsWhenEnglishFallbackSetExists();
  console.log('set-match-regression: ok');
} catch (error) {
  console.error('set-match-regression: failed');
  console.error(error);
  process.exit(1);
}
