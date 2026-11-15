/**
 * Angezeigter Sammlungsstatus einer Karte (Spec §5.3, Plan Task 7 "Spaeter").
 * Kandidat einer mehrdeutigen Altzeile ohne eigene Zeile: der gemeinsame Altstatus (g/rh der Altzeile) gilt
 * als besessen (`shared: true`, nur lesend, Badge "nicht zugeordnet"), bis die Migration entschieden hat.
 * Hat die Karte eine eigene Zeile, ist sie zugeordnet und nur ihr eigener Status zaehlt.
 * @returns {{ g: boolean, rh: boolean, shared: boolean }}
 */
export function effectiveCollectionStatus(db = {}) {
  const ownCells = (Array.isArray(db?.cells) && db.cells.length > 0) || Boolean(db?.gCell || db?.rhCell);
  const amb = db?.ambiguous;
  if (!ownCells && !db?.g && !db?.rh && amb && (amb.g || amb.rh)) {
    return { g: true, rh: Boolean(amb.rh), shared: true };
  }
  return { g: Boolean(db?.g), rh: Boolean(db?.rh), shared: false };
}

export function getCollectionUiState(db = {}, { isEditable = true } = {}) {
  const status = effectiveCollectionStatus(db);
  return {
    gChecked: status.g,
    rhChecked: status.rh,
    // Geteilter Altstatus: G bleibt klickbar (oeffnet den Migrationsdialog, schreibt nichts).
    gDisabled: !isEditable,
    rhDisabled: !isEditable || !Boolean(db?.rhCell),
    sharedLegacy: status.shared
  };
}

export function resolveCollectionToggleState(db = {}, { isG = false, checked = false } = {}) {
  const currentG = Boolean(db?.g);
  const currentRh = Boolean(db?.rh);

  if (isG) {
    return {
      g: Boolean(checked),
      rh: checked ? currentRh : false
    };
  }

  return {
    g: checked ? true : currentG,
    rh: Boolean(checked)
  };
}

export function shouldAutoImportForCollectionToggle({ checked = false, pendingSearchSetImport = false, currentSetImported = true } = {}) {
  return Boolean(checked) && (Boolean(pendingSearchSetImport) || !Boolean(currentSetImported));
}
