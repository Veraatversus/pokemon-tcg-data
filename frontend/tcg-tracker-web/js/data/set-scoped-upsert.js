function normalizeKeyPart(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function buildSetScopedKey(setId, entityId) {
  const normalizedSetId = normalizeKeyPart(setId);
  const normalizedEntityId = normalizeKeyPart(entityId);
  if (!normalizedSetId || !normalizedEntityId) return '';
  return `${normalizedSetId}::${normalizedEntityId}`;
}

function collectExistingIndicesByKey(rows, setId) {
  const byKey = new Map();
  const normalizedSetId = normalizeKeyPart(setId);
  if (!normalizedSetId) return byKey;

  (rows || []).forEach((row, rowIndex) => {
    const key = buildSetScopedKey(row?.[0], row?.[1]);
    if (!key || !key.startsWith(`${normalizedSetId}::`)) return;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(rowIndex);
  });

  return byKey;
}

function collectIncomingRowsByKey(incomingRows, setId) {
  const byKey = new Map();
  const normalizedSetId = normalizeKeyPart(setId);
  if (!normalizedSetId) return byKey;

  (incomingRows || []).forEach((row) => {
    const key = buildSetScopedKey(row?.[0], row?.[1]);
    if (!key || !key.startsWith(`${normalizedSetId}::`)) return;
    byKey.set(key, row);
  });

  return byKey;
}

export function planSetScopedUpsert({ rows = [], setId = '', incomingRows = [], clearMissing = false } = {}) {
  const existingIndicesByKey = collectExistingIndicesByKey(rows, setId);
  const incomingByKey = collectIncomingRowsByKey(incomingRows, setId);

  const updates = [];
  const appendRows = [];
  const clearIndices = new Set();

  for (const [key, incomingRow] of incomingByKey.entries()) {
    const existingIndices = existingIndicesByKey.get(key) || [];
    if (existingIndices.length > 0) {
      const keepIndex = existingIndices[existingIndices.length - 1];
      updates.push({ rowIndex: keepIndex, rowValues: incomingRow });
      for (let i = 0; i < existingIndices.length - 1; i += 1) {
        clearIndices.add(existingIndices[i]);
      }
      continue;
    }
    appendRows.push(incomingRow);
  }

  if (clearMissing) {
    for (const [key, existingIndices] of existingIndicesByKey.entries()) {
      if (incomingByKey.has(key)) continue;
      for (const rowIndex of existingIndices) {
        clearIndices.add(rowIndex);
      }
    }
  }

  return {
    updates,
    appendRows,
    clearIndices: Array.from(clearIndices).sort((a, b) => a - b)
  };
}

export function planSetScopedDedup({ rows = [], setId = '' } = {}) {
  const existingIndicesByKey = collectExistingIndicesByKey(rows, setId);
  const clearIndices = [];

  for (const indices of existingIndicesByKey.values()) {
    for (let i = 0; i < indices.length - 1; i += 1) {
      clearIndices.push(indices[i]);
    }
  }

  clearIndices.sort((a, b) => a - b);
  return { clearIndices };
}