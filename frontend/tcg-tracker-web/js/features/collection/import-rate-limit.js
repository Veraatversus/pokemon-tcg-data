function resolveErrorStatus(error) {
  return Number(
    error?.status
    ?? error?.code
    ?? error?.result?.error?.code
    ?? error?.response?.status
    ?? NaN
  );
}

export function isSheetsQuotaError(error) {
  const status = resolveErrorStatus(error);
  if (status === 429) return true;

  const message = String(
    error?.result?.error?.message
    ?? error?.message
    ?? error
    ?? ''
  ).toLowerCase();

  return message.includes('quota')
    || message.includes('rate limit')
    || message.includes('too many requests')
    || message.includes('429');
}

export function getImportCooldownMs({
  consecutiveQuotaErrors = 0,
  baseDelayMs = 1200,
  quotaBaseDelayMs = 12000,
  maxDelayMs = 45000,
} = {}) {
  const safeBaseDelay = Math.max(0, Number(baseDelayMs) || 0);
  const safeQuotaDelay = Math.max(safeBaseDelay, Number(quotaBaseDelayMs) || safeBaseDelay);
  const safeMaxDelay = Math.max(safeQuotaDelay, Number(maxDelayMs) || safeQuotaDelay);

  const quotaStreak = Math.max(0, Number(consecutiveQuotaErrors) || 0);
  if (quotaStreak <= 0) return safeBaseDelay;

  const expo = safeQuotaDelay * (2 ** Math.max(0, quotaStreak - 1));
  return Math.min(safeMaxDelay, expo);
}
