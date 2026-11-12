// Migration mehrdeutiger Altschluessel (Spec §5.3, §7.1): eine alte db_collection-Zeile (z. B. '15') gilt
// fuer mehrere Karten (15_A1..15_A4). Die alte Zeile wird nie geloescht, nur auf false gesetzt.
//
// - planAmbiguousMigration: rein; Altzeile ohne Haken -> stille neue Zeilen (false), mit Haken -> Dialog.
// - applyAmbiguousMigration: Snapshot, dann gewaehlte Karten schreiben, danach Altzeile auf false.
//   Idempotent: ueber deps.readMap() wird vor dem Schreiben frisch gelesen, vorhandene Zeilen werden
//   aktualisiert statt dupliziert.
// - showAmbiguousMigrationDialog (DOM): Kartenbilder, Mehrfachauswahl, "Uebernehmen"/"Spaeter".
import { cellsForUpdate } from '../../data/collection-aliases.js';

const str = (value) => String(value ?? '').trim();

function hasCells(entry) {
  return Array.isArray(entry?.cells) && entry.cells.length > 0;
}

/** Eindeutige Altzeilen-Gruppen aus Eintraegen (Array, Map oder Iterable). */
function ambiguousGroups(entries) {
  const source = entries instanceof Map ? [...entries.values()] : [...(entries || [])];
  const groups = new Map();
  for (const entry of source) {
    const group = entry?.ambiguous;
    if (!group) continue;
    if (!groups.has(group)) groups.set(group, { group, byKey: new Map() });
    groups.get(group).byKey.set(str(entry.collectionKey), entry);
  }
  return [...groups.values()];
}

/**
 * @param {Iterable<object>|Map<string, object>} ambiguousEntries Eintraege aus readSetCollectionMap (mit `ambiguous`)
 * @param {{ setId?: string, now?: string, cards?: object[] }} [options]
 * @returns {{ setId: string, now: string, silent: any[][], needsDialog: { legacyKey: string, row: object, candidates: object[] }[] }}
 */
export function planAmbiguousMigration(ambiguousEntries, { setId = '', now = new Date().toISOString(), cards = [] } = {}) {
  const cardByKey = new Map();
  (cards || []).forEach((card) => {
    const key = str(card?.collectionKey);
    if (key) cardByKey.set(key, card);
  });
  const silent = [];
  const needsDialog = [];
  for (const { group, byKey } of ambiguousGroups(ambiguousEntries)) {
    const candidates = (group.collectionKeys || []).map((collectionKey) => {
      const own = byKey.get(str(collectionKey));
      return {
        collectionKey,
        card: cardByKey.get(str(collectionKey)) || null,
        hasRow: hasCells(own),
        cells: hasCells(own) ? own.cells : []
      };
    });
    if (!group.g && !group.rh) {
      candidates.forEach((candidate) => {
        if (!candidate.hasRow) silent.push([setId, candidate.collectionKey, false, false, now]);
      });
      continue;
    }
    needsDialog.push({
      legacyKey: group.legacyKey,
      row: { g: Boolean(group.g), rh: Boolean(group.g && group.rh), cells: group.cells || [] },
      candidates
    });
  }
  return { setId, now, silent, needsDialog };
}

/** Auswahl umschalten (rein, fuer den Dialog): choices = Map<legacyKey, Set<collectionKey>>. */
export function toggleChoice(choices, legacyKey, collectionKey, selected) {
  const next = choices instanceof Map ? choices : new Map();
  if (!next.has(legacyKey)) next.set(legacyKey, new Set());
  const set = next.get(legacyKey);
  if (selected) set.add(collectionKey);
  else set.delete(collectionKey);
  return next;
}

function chosenKeys(choices, legacyKey) {
  const raw = choices instanceof Map ? choices.get(legacyKey) : choices?.[legacyKey];
  return new Set(raw ? [...raw].map(str) : []);
}

/**
 * Schreibt die Migration. deps:
 *  - createSnapshot(name, data): Snapshot vor dem ersten Schreiben
 *  - appendRows(rows): neue db_collection-Zeilen (serialisiert)
 *  - updateCells(updates): [{row,col,value}] (updateCellBooleansBatch)
 *  - readMap(): frische Sammlungs-Map (optional, empfohlen; Idempotenz)
 * @returns {{ created: number, updated: number, cleared: number, migrated: string[] }}
 */
export async function applyAmbiguousMigration(plan, choices, deps = {}) {
  const { createSnapshot, appendRows, updateCells, readMap } = deps;
  const setId = plan?.setId || '';
  const now = plan?.now || new Date().toISOString();
  const selected = (plan?.needsDialog || []).filter((item) => chosenKeys(choices, item.legacyKey).size > 0);
  const result = { created: 0, updated: 0, cleared: 0, migrated: [] };
  if (!selected.length && !(plan?.silent || []).length) return result;

  const fresh = typeof readMap === 'function' ? await readMap() : null;
  const freshEntry = (key, fallback) => (fresh instanceof Map ? fresh.get(str(key)) || null : fallback);
  const queued = new Set();
  const toAppend = [];
  const updates = new Map();
  const pushUpdates = (list) => list.forEach((u) => updates.set(`${u.row}:${u.col}`, u));

  for (const row of plan.silent || []) {
    const key = str(row[1]);
    if (queued.has(key) || hasCells(freshEntry(key, null))) continue;
    queued.add(key);
    toAppend.push([row[0], row[1], false, false, now]);
  }

  for (const item of selected) {
    const keys = chosenKeys(choices, item.legacyKey);
    for (const candidate of item.candidates) {
      const key = str(candidate.collectionKey);
      if (!keys.has(key)) continue;
      const own = freshEntry(key, candidate.hasRow ? { cells: candidate.cells, g: false, rh: false } : null);
      if (hasCells(own)) {
        // Eigene Zeile existiert: Altstatus hinzuodern (nie einen vorhandenen Haken zuruecknehmen).
        const g = item.row.g || Boolean(own.g);
        const rh = g && (item.row.rh || Boolean(own.rh));
        pushUpdates(cellsForUpdate(own, 'g', g));
        pushUpdates(cellsForUpdate(own, 'rh', rh));
        result.updated += 1;
      } else {
        const pendingIdx = toAppend.findIndex((r) => str(r[1]) === key);
        if (pendingIdx >= 0) toAppend.splice(pendingIdx, 1); // stille Leerzeile durch die echte ersetzen
        queued.add(key);
        toAppend.push([setId, candidate.collectionKey, item.row.g, item.row.g && item.row.rh, now]);
      }
    }
    // Altzeile(n) auf false, nie loeschen; Zellen aus frischem Stand, falls vorhanden.
    let legacyCells = item.row.cells;
    if (fresh instanceof Map) {
      for (const entry of fresh.values()) {
        const group = entry?.ambiguous;
        if (group && str(group.legacyKey) === str(item.legacyKey) && hasCells(group)) {
          legacyCells = group.cells;
          break;
        }
      }
    }
    pushUpdates(cellsForUpdate({ cells: legacyCells }, 'g', false));
    result.cleared += 1;
    result.migrated.push(item.legacyKey);
  }

  if (!toAppend.length && !updates.size) return result;
  result.created = toAppend.length;

  if (typeof createSnapshot === 'function') {
    const data = {};
    for (const item of plan.needsDialog || []) {
      data[`${setId}/${item.legacyKey}`] = { g: item.row.g, rh: item.row.rh, rows: item.row.cells.map((c) => c.rowNo) };
    }
    await createSnapshot(`Migration mehrdeutiger Altschlüssel (${setId})`, data);
  }
  if (toAppend.length) await appendRows(toAppend);
  if (updates.size) await updateCells([...updates.values()]);
  return result;
}

/**
 * Dialog (DOM). Promise<{ action: 'apply'|'later', choices: Map }>. "Uebernehmen" erst mit Auswahl aktiv;
 * "Spaeter"/Escape aendert nichts.
 */
export function showAmbiguousMigrationDialog(plan, { document: doc = globalThis.document } = {}) {
  return new Promise((resolve) => {
    const choices = new Map();
    const dialog = doc.createElement('dialog');
    dialog.className = 'dialog-card ambiguous-migration-dialog';
    const title = doc.createElement('h3');
    title.textContent = 'Alte Sammlungseinträge zuordnen';
    const intro = doc.createElement('p');
    intro.textContent = 'Diese alten Einträge gelten für mehrere Karten. Wähle die Karten, die du besitzt. '
      + 'Mit „Später“ bleibt alles unverändert.';
    dialog.append(title, intro);

    const applyBtn = doc.createElement('button');
    applyBtn.type = 'button';
    applyBtn.textContent = 'Übernehmen';
    applyBtn.disabled = true;
    const laterBtn = doc.createElement('button');
    laterBtn.type = 'button';
    laterBtn.className = 'btn-secondary';
    laterBtn.textContent = 'Später';
    const refresh = () => {
      applyBtn.disabled = ![...choices.values()].some((set) => set.size > 0);
    };

    for (const item of plan.needsDialog) {
      const group = doc.createElement('fieldset');
      const legend = doc.createElement('legend');
      legend.textContent = `Alter Eintrag „${item.legacyKey}“${item.row.rh ? ' (Normal + Reverse Holo)' : ''}`;
      group.appendChild(legend);
      for (const candidate of item.candidates) {
        const label = doc.createElement('label');
        label.className = 'ambiguous-candidate';
        const input = doc.createElement('input');
        input.type = 'checkbox';
        input.addEventListener('change', () => {
          toggleChoice(choices, item.legacyKey, candidate.collectionKey, input.checked);
          refresh();
        });
        label.appendChild(input);
        const src = candidate.card?.images?.small || candidate.card?.imageSmall || '';
        if (src) {
          const img = doc.createElement('img');
          img.src = src;
          img.alt = candidate.card?.name || candidate.collectionKey;
          img.loading = 'lazy';
          img.width = 72;
          label.appendChild(img);
        }
        const text = doc.createElement('span');
        text.textContent = `${candidate.card?.name || ''} ${candidate.collectionKey}`.trim();
        label.appendChild(text);
        group.appendChild(label);
      }
      dialog.appendChild(group);
    }

    const actions = doc.createElement('div');
    actions.className = 'dialog-actions';
    actions.append(laterBtn, applyBtn);
    dialog.appendChild(actions);

    let done = false;
    const finish = (action) => {
      if (done) return;
      done = true;
      try { dialog.close(); } catch { /* bereits geschlossen */ }
      dialog.remove();
      resolve({ action, choices });
    };
    applyBtn.addEventListener('click', () => finish('apply'));
    laterBtn.addEventListener('click', () => finish('later'));
    dialog.addEventListener('cancel', () => finish('later'));
    doc.body.appendChild(dialog);
    dialog.showModal();
  });
}
