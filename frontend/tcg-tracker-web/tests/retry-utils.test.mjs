import test from 'node:test';
import assert from 'node:assert/strict';

import { isRetryableError, runWithRetry } from '../js/core/retry.js';

test('isRetryableError erkennt 429 und 5xx als retry-fähig', () => {
  assert.equal(isRetryableError({ status: 429 }), true);
  assert.equal(isRetryableError({ status: 503 }), true);
  assert.equal(isRetryableError({ result: { error: { code: 500 } } }), true);
});

test('isRetryableError erkennt 4xx ohne rate-limit als nicht retry-fähig', () => {
  assert.equal(isRetryableError({ status: 400, message: 'Bad request' }), false);
  assert.equal(isRetryableError({ status: 404, message: 'Not found' }), false);
});

test('runWithRetry liefert Ergebnis nach transienten Fehlern', async () => {
  let attempts = 0;
  const result = await runWithRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      const err = new Error('temporarily unavailable');
      err.status = 503;
      throw err;
    }
    return 'ok';
  }, {
    attempts: 3,
    baseDelayMs: 1,
    maxDelayMs: 3,
  });

  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
});

test('runWithRetry bricht bei nicht retry-fähigem Fehler sofort ab', async () => {
  let attempts = 0;

  await assert.rejects(
    runWithRetry(async () => {
      attempts += 1;
      const err = new Error('validation failed');
      err.status = 400;
      throw err;
    }, {
      attempts: 4,
      baseDelayMs: 1,
      maxDelayMs: 3,
    }),
    /validation failed/
  );

  assert.equal(attempts, 1);
});
