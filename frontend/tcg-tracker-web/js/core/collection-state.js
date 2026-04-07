export function getCollectionUiState(db = {}, { isEditable = true } = {}) {
  return {
    gChecked: Boolean(db?.g),
    rhChecked: Boolean(db?.rh),
    gDisabled: !isEditable,
    rhDisabled: !isEditable || !Boolean(db?.rhCell)
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
