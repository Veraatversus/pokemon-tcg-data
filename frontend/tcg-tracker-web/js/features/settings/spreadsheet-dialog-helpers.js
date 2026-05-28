function extractErrorStatus(error) {
  const status = Number(
    error?.status
      ?? error?.result?.error?.code
      ?? error?.result?.status
      ?? 0
  );
  return Number.isFinite(status) ? status : 0;
}

function extractErrorReason(error) {
  return String(
    error?.result?.error?.status
      ?? error?.result?.error?.reason
      ?? error?.statusText
      ?? ''
  ).toUpperCase();
}

export function normalizeSpreadsheetDisplayText(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  return raw
    .replace(/\uFFFD+/g, ' - ')
    .replace(/\s+-\s+-\s+/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function formatSpreadsheetOptionLabel(name, source) {
  const safeName = (normalizeSpreadsheetDisplayText(name) || 'Unbenannte Tabelle')
    .replace(/\s*-\s*$/, '')
    .trim();
  const safeSource = normalizeSpreadsheetDisplayText(source);
  return safeSource ? `${safeName} - ${safeSource}` : safeName;
}

export function isSpreadsheetAccessDeniedError(error) {
  const status = extractErrorStatus(error);
  const reason = extractErrorReason(error);
  return status === 401 || status === 403 || reason === 'PERMISSION_DENIED';
}

export function resolveSpreadsheetSelectionErrorMessage(error, spreadsheetId = '') {
  const id = String(spreadsheetId || '').trim();
  if (isSpreadsheetAccessDeniedError(error)) {
    const suffix = id ? ` (ID: ${id})` : '';
    return `Kein Zugriff auf diese Tabelle${suffix}. Bitte Tabelle fuer dein Google-Konto freigeben oder mit einem berechtigten Konto anmelden.`;
  }

  const detail = String(error?.message || error || '').trim();
  if (!detail) return 'Tabelle konnte nicht verwendet werden.';
  return `Tabelle konnte nicht verwendet werden: ${detail}`;
}
