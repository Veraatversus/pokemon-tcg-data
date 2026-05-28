function resolveErrorStatus(error) {
  return Number(
    error?.status
    ?? error?.code
    ?? error?.result?.error?.code
    ?? error?.response?.status
    ?? NaN
  );
}

export function isRetryableError(error) {
  const status = resolveErrorStatus(error);
  if (Number.isFinite(status)) {
    if (status === 429) return true;
    if (status >= 500) return true;
  }

  const message = String(error?.message || error || '').toLowerCase();
  if (!message) return false;

  return (
    message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('timeout')
    || message.includes('temporar')
    || message.includes('rate limit')
    || message.includes('quota')
    || message.includes('unavailable')
    || message.includes('429')
    || message.includes('503')
  );
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function computeBackoffDelay(attemptIndex, baseDelayMs, maxDelayMs) {
  const expo = Math.min(maxDelayMs, baseDelayMs * (2 ** attemptIndex));
  const jitter = Math.floor(Math.random() * Math.min(250, Math.floor(expo * 0.2)));
  return Math.min(maxDelayMs, expo + jitter);
}

export async function runWithRetry(task, options = {}) {
  const {
    attempts = 3,
    baseDelayMs = 350,
    maxDelayMs = 2200,
    shouldRetry = isRetryableError,
    onRetry = null,
  } = options;

  const totalAttempts = Math.max(1, Number(attempts) || 1);

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      const isLastAttempt = attempt >= totalAttempts;
      const retryAllowed = !isLastAttempt && shouldRetry(error) === true;
      if (!retryAllowed) {
        throw error;
      }

      const delayMs = computeBackoffDelay(attempt - 1, baseDelayMs, maxDelayMs);
      if (typeof onRetry === 'function') {
        onRetry(error, {
          attempt,
          attempts: totalAttempts,
          nextDelayMs: delayMs,
        });
      }
      await wait(delayMs);
    }
  }

  throw new Error('runWithRetry reached unreachable state');
}
