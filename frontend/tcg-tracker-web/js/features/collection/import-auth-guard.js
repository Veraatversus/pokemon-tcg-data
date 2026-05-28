function resolveErrorStatus(error) {
  return Number(
    error?.status
    ?? error?.code
    ?? error?.result?.error?.code
    ?? error?.response?.status
    ?? NaN
  );
}

export function isAuthReloginRequiredError(error) {
  if (String(error?.code || '') === 'AUTH_RELOGIN_REQUIRED') return true;

  const status = resolveErrorStatus(error);
  if (status === 401 || status === 403) return true;

  const message = String(
    error?.result?.error?.message
    ?? error?.message
    ?? error
    ?? ''
  ).toLowerCase();

  return message.includes('anmeldung abgelaufen')
    || message.includes('neu anmelden')
    || message.includes('unauthenticated')
    || message.includes('unauthorized')
    || message.includes('permission denied');
}

export function getAuthReloginImportMessage() {
  return 'Google-Anmeldung abgelaufen. Bitte neu anmelden und dann Import fortsetzen.';
}
