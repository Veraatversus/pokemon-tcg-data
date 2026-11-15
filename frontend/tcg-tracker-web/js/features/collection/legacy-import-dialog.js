// Altbestand-Import (XLSX oder Google-Sheets-Link): Analyse, Auswahl-Dialog und Anwenden des Plans.
// Die reine Parse-/Planungslogik liegt in ./legacy-import.js; hier nur Oberflaeche und Schreiben.
import { signIn } from '../../core/auth.js';
import { readSetCollectionMap, ensureCollectionEntry, updateCellBooleansBatch } from '../../data/sheets-db.js?v=20261115-empty-sets';
import {
  emptyCollectionEntry,
  hasEntryCells,
  stateCellUpdates,
  applyEntryState,
  adoptEnsuredEntry,
  pendingAmbiguityError,
  isAmbiguousLegacyKeyError
} from '../../data/collection-writes.js';
import { fetchMergedCards } from '../../data/pokemon-api.js?v=20261115-empty-sets';
import { createAutoSnapshot } from './index.js';
import {
  loadLegacyWorkbookFromFile,
  loadLegacyWorkbookFromSpreadsheetInput,
  parseLegacyWorkbook,
  buildLegacyImportPlan,
  buildLegacyImportSelectionTree,
  filterLegacyImportPlanBySelection,
  summarizeLegacyImportPlan,
  extractLegacySpreadsheetId
} from './legacy-import.js?v=20261115-empty-sets';
import { ensureResolverForSet } from '../../data/collection-aliases.js';
import { pickSourceSetKey, resolveSourceCardKey } from './legacy-key-resolution.js';
import { importSetsSequential } from './import-jobs.js';
import { downloadJson } from '../../advanced-features.js';
import { dom } from '../../app/dom.js';
import { state } from '../../app/state.js';
import { setGlobalStatus, setLoading, showToast, getErrorMessage } from '../../ui/helpers.js';
import { loadSets, getSetById } from '../../views/dashboard.js';
import { onAmbiguousLegacyKey } from '../../views/set-cards.js';
import { loadCurrentSet } from '../../views/set-view.js';

function buildLegacyImportPreviewText(plan) {
  const summary = summarizeLegacyImportPlan(plan);
  const lines = [
    `Set-Blaetter erkannt: ${summary.sheetCount}`,
    `Markierte Karten (G/RH): ${summary.checkedCardCount}`,
    `Eindeutig zuordenbar: ${summary.matchedCardCount}`,
    `Fehlende Sets zum Vorimport: ${summary.missingSetCount}`
  ];

  if (!summary.ok) {
    lines.push('');
    lines.push(`Offene Set-Konflikte: ${summary.unresolvedSheetCount}`);
    lines.push(`Offene Karten-Konflikte: ${summary.unresolvedCardCount}`);

    if (plan.unresolvedSheets?.length) {
      lines.push('');
      lines.push('Set-Probleme:');
      plan.unresolvedSheets.slice(0, 5).forEach((entry) => {
        lines.push(` ${entry.sheetName}: ${entry.reason}`);
      });
    }

    if (plan.unresolvedCards?.length) {
      lines.push('');
      lines.push('Karten-Probleme:');
      plan.unresolvedCards.slice(0, 8).forEach((entry) => {
        lines.push(` ${entry.setId} / ${entry.sourceCardId}: ${entry.reason}`);
      });
    }

    lines.push('');
    lines.push('Der Import wurde blockiert, bis alle Konflikte eindeutig geloest sind.');
    return lines.join('\n');
  }

  lines.push('');
  lines.push('Der Import setzt die betroffenen Sets exakt auf den Altbestand-Stand (G/RH) - inklusive Entfernen nicht markierter Treffer in diesen Sets.');
  return lines.join('\n');
}

async function prepareLegacyWorkbookImport(workbook, sourceLabel = 'Altbestand') {
  if (!workbook) throw new Error('Keine Altbestand-Quelle ausgewaehlt.');
  if (!state.allSets?.length) {
    await loadSets();
  }
  if (!state.allSets?.length) {
    throw new Error('Sets konnten vor der Analyse nicht geladen werden.');
  }

  const parsedWorkbook = parseLegacyWorkbook(workbook);
  if (!parsedWorkbook.sheets.length) {
    throw new Error(`In ${sourceLabel} wurden keine markierten Karten gefunden.`);
  }

  const preflight = buildLegacyImportPlan({
    parsedWorkbook,
    allSets: state.allSets,
    cardsBySetId: {}
  });

  if (preflight.unresolvedSheets.length) {
    return { parsedWorkbook, cardsBySetId: {}, plan: preflight };
  }

  const cardsBySetId = {};
  const uniqueSetIds = Array.from(new Set(preflight.matchedSets.map((entry) => entry.setId)));

  for (let index = 0; index < uniqueSetIds.length; index++) {
    const setId = uniqueSetIds[index];
    const setMeta = getSetById(setId);
    setGlobalStatus(`Analysiere ${sourceLabel} ${index + 1}/${uniqueSetIds.length}: ${setMeta?.setName || setId}`);
    const cards = await fetchMergedCards(setId);
    if (!Array.isArray(cards) || !cards.length) {
      throw new Error(`Kartenkatalog fuer ${setMeta?.setName || setId} konnte nicht geladen werden.`);
    }
    cardsBySetId[setId] = cards;
  }

  const plan = buildLegacyImportPlan({
    parsedWorkbook,
    allSets: state.allSets,
    cardsBySetId
  });

  return { parsedWorkbook, cardsBySetId, plan };
}

let legacyImportSelectionDialogState = null;

async function applyLegacyImportPlan(plan, cardsBySetId) {
  if (!plan?.ok) {
    throw new Error('Der Dry-Run enthaelt noch Konflikte.');
  }

  const missingSets = plan.missingSetIds
    .map((setId) => getSetById(setId))
    .filter((set) => set?.setId);

  if (missingSets.length) {
    await importSetsSequential(missingSets, {
      successMessage: '{count} fehlende Sets fuer den Altbestand-Import importiert.'
    });
    await loadSets();
  }

  try {
    await createAutoSnapshot(`Legacy Altbestand Import (${plan.matchedSets.length} Sets)`, state.collection || {});
  } catch (err) {
    console.warn('[applyLegacyImportPlan] snapshot failed', err);
  }

  let updatedCells = 0;
  let legacyAmbiguous = 0;
  let legacyUnresolved = 0;
  const ambiguousSkipped = [];
  setLoading(true, 'Synchronisiere Altbestand...');
  try {
    for (let setIndex = 0; setIndex < plan.matchedSets.length; setIndex++) {
      const matchedSet = plan.matchedSets[setIndex];
      const liveSet = getSetById(matchedSet.setId);
      if (!liveSet?.setName) {
        throw new Error(`Ziel-Set ${matchedSet.setId} ist nach dem Vorimport nicht verfuegbar.`);
      }

      setGlobalStatus(`Altbestand-Import ${setIndex + 1}/${plan.matchedSets.length}: ${liveSet.setName}`);
      const liveMap = await readSetCollectionMap(liveSet.setName, { setId: liveSet.setId }).catch(() => new Map());
      // Quellnummern gelten im Namensraum des QUELL-Sets (Blatt-Set-ID, z. B. TCGDEX-30th-c mit localIds;
      // ohne Set-ID: das Live-Set). Nur eindeutig aufgeloeste collectionKeys werden geschrieben, nie rohe Nummern.
      const resolver = await ensureResolverForSet(liveSet.setId);
      const sourceSetKey = pickSourceSetKey(resolver, { sourceSetId: matchedSet.sourceSetIdRaw, liveSetId: liveSet.setId });
      const pendingCellUpdates = [];

      for (const target of (matchedSet.cards || [])) {
        const rawCardId = String(target?.sourceCardId || target?.cardId || '').trim();
        if (!rawCardId) continue;
        const resolved = resolveSourceCardKey(resolver, sourceSetKey, rawCardId);
        if (resolved.skip === 'ambiguous') {
          legacyAmbiguous++;
          continue;
        }
        if (resolved.skip) {
          legacyUnresolved++;
          continue;
        }
        const key = resolved.collectionKey;

        let entry = liveMap.get(key) || null;
        if (!hasEntryCells(entry)) {
          try {
            const pending = pendingAmbiguityError(entry, { setId: liveSet.setId });
            if (pending) throw pending;
            entry = adoptEnsuredEntry(entry || emptyCollectionEntry({ collectionKey: key, number: key }, key),
              await ensureCollectionEntry(liveSet.setName, key, { setId: liveSet.setId }));
            liveMap.set(entry.collectionKey || key, entry);
          } catch (err) {
            if (!isAmbiguousLegacyKeyError(err)) throw err;
            ambiguousSkipped.push(err);
            continue;
          }
        }

        const targetG = Boolean(target.g);
        const targetRh = Boolean(target.g && target.rh);
        if (Boolean(entry.g) === targetG && Boolean(entry.rh) === targetRh) continue;
        const updates = stateCellUpdates(entry, { g: targetG, rh: targetRh });
        pendingCellUpdates.push(...updates);
        applyEntryState(entry, { g: targetG, rh: targetRh });
        updatedCells += updates.length;
      }

      if (pendingCellUpdates.length) {
        await updateCellBooleansBatch(liveSet.setName, pendingCellUpdates, { chunkSize: 200 });
      }
    }
  } finally {
    setLoading(false);
  }

  state.summaryData = null;
  await loadSets();
  if (state.currentSet?.setId) {
    await loadCurrentSet(true).catch(() => {});
  }

  if (ambiguousSkipped.length) onAmbiguousLegacyKey(ambiguousSkipped[0]);
  setGlobalStatus(`Altbestand importiert: ${plan.matchedSets.length} Sets, ${updatedCells} aenderungen.`);
  const legacySkipped = legacyAmbiguous + legacyUnresolved + ambiguousSkipped.length;
  const legacySkippedText = legacySkipped
    ? ` Nicht zuordenbar und nicht geschrieben: ${legacySkipped} Karte(n) (${legacyAmbiguous + ambiguousSkipped.length} mehrdeutig, ${legacyUnresolved} unbekannt).`
    : '';
  showToast(`Altbestand importiert: ${plan.matchedSets.length} Sets synchronisiert, ${updatedCells} aenderungen geschrieben.${legacySkippedText}`,
    legacySkipped ? 'info' : 'success', legacySkipped ? 8000 : 5000);
}

function setLegacySheetDialogError(message = '') {
  if (!dom.legacySheetError) return;
  dom.legacySheetError.textContent = message;
  dom.legacySheetError.classList.toggle('hidden', !message);
}

function escapeLegacyImportSelectionHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function syncLegacyImportSelectionSetState(setEntry) {
  if (!setEntry || !Array.isArray(setEntry.cards)) return 0;
  const selectedCards = setEntry.cards.filter((card) => card?.selected !== false).length;
  setEntry.selected = selectedCards > 0;
  return selectedCards;
}

function getLegacyImportSelectionStats(tree) {
  const sets = Array.isArray(tree?.sets) ? tree.sets : [];
  const totalSetCount = sets.length;
  const totalCardCount = sets.reduce((sum, set) => sum + (Array.isArray(set?.cards) ? set.cards.length : 0), 0);
  const selectedSetCount = sets.filter((set) => Array.isArray(set?.cards) && set.cards.some((card) => card?.selected !== false)).length;
  const selectedCardCount = sets.reduce((sum, set) => sum + (Array.isArray(set?.cards) ? set.cards.filter((card) => card?.selected !== false).length : 0), 0);
  const autoImportSetCount = sets.filter((set) => !set?.imported && Array.isArray(set?.cards) && set.cards.some((card) => card?.selected !== false)).length;
  return { totalSetCount, totalCardCount, selectedSetCount, selectedCardCount, autoImportSetCount };
}

export function renderLegacyImportSelectionDialog() {
  const session = legacyImportSelectionDialogState;
  if (!session || !dom.legacySelectionTree) return;

  const query = String(dom.legacySelectionSearch?.value || '').trim().toLowerCase();
  const stats = getLegacyImportSelectionStats(session.tree);

  if (dom.legacySelectionSummary) {
    dom.legacySelectionSummary.innerHTML = `
      <div class="legacy-selection-stat"><strong>${stats.selectedSetCount}</strong><span>Sets</span></div>
      <div class="legacy-selection-stat"><strong>${stats.selectedCardCount}</strong><span>Karten</span></div>
      <div class="legacy-selection-stat"><strong>${stats.autoImportSetCount}</strong><span>Vorimporte</span></div>
    `;
  }

  if (dom.legacySelectionInfo) {
    dom.legacySelectionInfo.textContent = stats.selectedCardCount > 0
      ? `${stats.selectedCardCount} von ${stats.totalCardCount} Karten aus ${stats.selectedSetCount} von ${stats.totalSetCount} Sets werden uebernommen.${stats.autoImportSetCount ? ` ${stats.autoImportSetCount} Sets werden dafuer bei Bedarf zuerst importiert.` : ''}`
      : 'Bitte mindestens ein Set oder eine Karte auswaehlen.';
  }

  if (dom.btnLegacySelectionConfirm) {
    dom.btnLegacySelectionConfirm.disabled = stats.selectedCardCount === 0;
    dom.btnLegacySelectionConfirm.textContent = stats.selectedCardCount > 0
      ? `Ausgewaehlte importieren (${stats.selectedCardCount})`
      : 'Ausgewaehlte importieren';
  }

  const setMarkup = (session.tree.sets || []).map((setEntry, setIndex) => {
    const selectedCount = syncLegacyImportSelectionSetState(setEntry);
    const setSearchText = [setEntry.setName, setEntry.sheetName, setEntry.setId].join(' ').toLowerCase();
    const setMatches = !query || setSearchText.includes(query);
    const visibleCards = (setEntry.cards || [])
      .map((card, cardIndex) => ({ card, cardIndex }))
      .filter(({ card }) => !query || setMatches || [card.name, card.cardId, card.sourceCardId].join(' ').toLowerCase().includes(query));

    if (query && !setMatches && !visibleCards.length) return '';

    const shouldOpen = query ? true : Boolean(setEntry.expanded);
    const cardsMarkup = shouldOpen
      ? visibleCards.map(({ card, cardIndex }) => {
          const badgeHtml = [
            card.g ? '<span class="legacy-tree-badge is-collected">G</span>' : '',
            card.rh ? '<span class="legacy-tree-badge is-reverse">RH</span>' : ''
          ].join('');
          const cardNumber = escapeLegacyImportSelectionHtml(card.sourceCardId || card.cardId || '');
          const cardName = escapeLegacyImportSelectionHtml(card.name || card.cardId || 'Unbenannte Karte');
          return `
            <label class="legacy-tree-card">
              <input type="checkbox" data-selection-type="card" data-set-index="${setIndex}" data-card-index="${cardIndex}" ${card.selected !== false ? 'checked' : ''} />
              <span class="legacy-tree-card-id">#${cardNumber}</span>
              <span class="legacy-tree-card-name">${cardName}</span>
              <span class="legacy-tree-card-flags">${badgeHtml}</span>
            </label>
          `;
        }).join('')
      : '';

    const summaryLabel = escapeLegacyImportSelectionHtml(setEntry.setName || setEntry.sheetName || setEntry.setId || 'Unbekanntes Set');
    const summaryMeta = escapeLegacyImportSelectionHtml(setEntry.sheetName && setEntry.sheetName !== setEntry.setName
      ? `${setEntry.sheetName} - ${setEntry.setId}`
      : `Set-ID: ${setEntry.setId}`);

    return `
      <details class="legacy-tree-set" data-set-index="${setIndex}" ${shouldOpen ? 'open' : ''}>
        <summary class="legacy-tree-set-summary">
          <label class="legacy-tree-summary-check">
            <input class="legacy-tree-set-toggle" type="checkbox" data-selection-type="set" data-set-index="${setIndex}" ${selectedCount > 0 ? 'checked' : ''} />
          </label>
          <div class="legacy-tree-set-copy">
            <strong>${summaryLabel}</strong>
            <small>${summaryMeta}</small>
          </div>
          <div class="legacy-tree-set-meta">
            <span class="legacy-tree-pill ${setEntry.imported ? '' : 'is-accent'}">${setEntry.imported ? 'bereits importiert' : 'wird vorimportiert'}</span>
            <span class="legacy-tree-count">${selectedCount}/${setEntry.cards.length}</span>
          </div>
        </summary>
        <div class="legacy-tree-card-list" role="group">
          ${cardsMarkup || '<p class="legacy-selection-empty">Keine Karten fuer diesen Filter.</p>'}
        </div>
      </details>
    `;
  }).filter(Boolean).join('');

  dom.legacySelectionTree.innerHTML = setMarkup || '<p class="legacy-selection-empty">Keine Sets oder Karten fuer diesen Filter gefunden.</p>';

  dom.legacySelectionTree.querySelectorAll('.legacy-tree-set-toggle').forEach((checkbox) => {
    const setIndex = Number(checkbox.dataset.setIndex || '-1');
    const setEntry = session.tree.sets[setIndex];
    if (!setEntry) return;
    const total = Array.isArray(setEntry.cards) ? setEntry.cards.length : 0;
    const selected = Array.isArray(setEntry.cards) ? setEntry.cards.filter((card) => card?.selected !== false).length : 0;
    checkbox.checked = selected > 0;
    checkbox.indeterminate = selected > 0 && selected < total;
  });
}

export function closeLegacyImportSelectionDialog(result = null) {
  const resolver = legacyImportSelectionDialogState?.resolve || null;
  legacyImportSelectionDialogState = null;
  dom.legacySelectionDialog?.close();
  if (dom.legacySelectionSearch) dom.legacySelectionSearch.value = '';
  if (dom.legacySelectionTree) dom.legacySelectionTree.innerHTML = '';
  if (dom.legacySelectionSummary) dom.legacySelectionSummary.innerHTML = '';
  if (dom.legacySelectionInfo) dom.legacySelectionInfo.textContent = '';
  if (typeof resolver === 'function') resolver(result);
}

export function setAllLegacyImportSelections(selected) {
  const session = legacyImportSelectionDialogState;
  if (!session) return;
  session.tree.sets.forEach((setEntry) => {
    setEntry.selected = Boolean(selected);
    (setEntry.cards || []).forEach((card) => {
      card.selected = Boolean(selected);
    });
  });
  renderLegacyImportSelectionDialog();
}

export function confirmLegacyImportSelectionDialog() {
  const session = legacyImportSelectionDialogState;
  if (!session) return;
  const filteredPlan = filterLegacyImportPlanBySelection(session.plan, session.tree);
  const summary = summarizeLegacyImportPlan(filteredPlan);
  if (!summary.checkedCardCount) {
    renderLegacyImportSelectionDialog();
    return;
  }
  closeLegacyImportSelectionDialog(filteredPlan);
}

export function handleLegacyImportSelectionTreeChange(event) {
  const target = event.target;
  const session = legacyImportSelectionDialogState;
  if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox' || !session) return;

  const setIndex = Number(target.dataset.setIndex || '-1');
  const setEntry = session.tree.sets[setIndex];
  if (!setEntry) return;

  if (target.dataset.selectionType === 'set') {
    setEntry.selected = target.checked;
    (setEntry.cards || []).forEach((card) => {
      card.selected = target.checked;
    });
  } else if (target.dataset.selectionType === 'card') {
    const cardIndex = Number(target.dataset.cardIndex || '-1');
    const cardEntry = setEntry.cards?.[cardIndex];
    if (!cardEntry) return;
    cardEntry.selected = target.checked;
    syncLegacyImportSelectionSetState(setEntry);
  }

  renderLegacyImportSelectionDialog();
}

export function handleLegacyImportSelectionTreeToggle(event) {
  const session = legacyImportSelectionDialogState;
  const details = event.target;
  if (!(details instanceof HTMLDetailsElement) || !session) return;
  const setIndex = Number(details.dataset.setIndex || '-1');
  const setEntry = session.tree.sets?.[setIndex];
  if (!setEntry) return;
  setEntry.expanded = Boolean(details.open);
  renderLegacyImportSelectionDialog();
}

function openLegacyImportSelectionDialog(plan, cardsBySetId) {
  if (!dom.legacySelectionDialog || !dom.legacySelectionTree) {
    const ok = window.confirm(`${buildLegacyImportPreviewText(plan)}\n\nImport jetzt anwenden?`);
    return Promise.resolve(ok ? plan : null);
  }

  const tree = buildLegacyImportSelectionTree(plan, cardsBySetId);
  tree.sets.forEach(syncLegacyImportSelectionSetState);
  legacyImportSelectionDialogState = {
    plan,
    tree,
    resolve: null
  };

  if (dom.legacySelectionSearch) {
    dom.legacySelectionSearch.value = '';
  }

  renderLegacyImportSelectionDialog();
  dom.legacySelectionDialog.showModal();
  dom.legacySelectionSearch?.focus();

  return new Promise((resolve) => {
    legacyImportSelectionDialogState.resolve = resolve;
  });
}

export function openLegacySheetImportDialog() {
  setLegacySheetDialogError('');
  if (dom.legacySheetInput) {
    dom.legacySheetInput.value = '';
  }
  dom.legacySheetDialog?.showModal();
  dom.legacySheetInput?.focus();
}

export async function submitLegacySheetImportDialog() {
  const rawInput = String(dom.legacySheetInput?.value || '').trim();
  const spreadsheetId = extractLegacySpreadsheetId(rawInput);
  if (!spreadsheetId) {
    setLegacySheetDialogError('Bitte einen gueltigen Google-Sheets-Link oder eine Spreadsheet-ID eingeben.');
    dom.legacySheetInput?.focus();
    return;
  }

  dom.legacySheetDialog?.close();
  await startLegacyWorkbookImport({
    spreadsheetInput: spreadsheetId,
    sourceLabel: 'Google Sheet'
  });
}

export async function startLegacyWorkbookImport(source = {}) {
  const sourceFile = source instanceof Blob ? source : source?.file || null;
  const spreadsheetInput = typeof source === 'string' ? source : source?.spreadsheetInput || '';
  const sourceLabel = String(source?.sourceLabel || (sourceFile ? 'XLSX' : 'Google Sheet')).trim();
  if (!sourceFile && !spreadsheetInput) return;

  setLoading(true, 'Analysiere Altbestand...');
  try {
    let workbook;
    if (sourceFile) {
      workbook = await loadLegacyWorkbookFromFile(sourceFile);
    } else {
      try {
        workbook = await loadLegacyWorkbookFromSpreadsheetInput(spreadsheetInput);
      } catch (err) {
        if (err?.code !== 'legacy-drive-export-scope-required') throw err;

        setGlobalStatus('Altbestand-Import benoetigt eine einmalige Google-Freigabe');
        const allowUpgrade = window.confirm('Damit der Sheets-Link exakt wie der XLSX-Import ausgewertet wird, braucht der Tracker einmalig zusaetzliche Google-Drive-Leseberechtigung. Jetzt Google-Freigabe aktualisieren?');
        if (!allowUpgrade) {
          throw new Error('Google-Berechtigung fuer den direkten Sheets-Link-Import wurde nicht erteilt.');
        }

        const reauthOk = await signIn({ forceConsent: true });
        if (!reauthOk) {
          throw new Error('Google-Anmeldung wurde nicht abgeschlossen. Bitte Popup erlauben und erneut versuchen.');
        }

        workbook = await loadLegacyWorkbookFromSpreadsheetInput(spreadsheetInput);
      }
    }

    const { plan, cardsBySetId } = await prepareLegacyWorkbookImport(workbook, sourceLabel);
    const summary = summarizeLegacyImportPlan(plan);

    if (!summary.ok) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadJson(`legacy_import_report_${stamp}.json`, {
        createdAt: new Date().toISOString(),
        summary,
        plan
      });
      setGlobalStatus(`Altbestand blockiert: ${summary.unresolvedSheetCount} Set-, ${summary.unresolvedCardCount} Kartenkonflikte.`);
      window.alert(buildLegacyImportPreviewText(plan));
      showToast(`Import blockiert: ${summary.unresolvedSheetCount} Set- und ${summary.unresolvedCardCount} Kartenkonflikte. Pruefbericht exportiert.`, 'error', 7000);
      return;
    }

    setLoading(false);
    setGlobalStatus(`Altbestand analysiert: ${summary.sheetCount} Sets, ${summary.checkedCardCount} markierte Karten. Bitte Auswahl pruefen.`);
    const selectedPlan = await openLegacyImportSelectionDialog(plan, cardsBySetId);
    if (!selectedPlan) {
      setGlobalStatus('Altbestand-Analyse abgeschlossen - Import nicht angewendet.');
      showToast('Altbestand analysiert. Es wurden noch keine aenderungen geschrieben.', 'info', 4500);
      return;
    }

    await applyLegacyImportPlan(selectedPlan, cardsBySetId);
  } catch (err) {
    const message = getErrorMessage(err, 'Unbekannter Fehler');
    console.error('[startLegacyWorkbookImport]', err);
    setGlobalStatus(`Altbestand-Import fehlgeschlagen: ${message}`);
    showToast(`Altbestand-Import fehlgeschlagen: ${message}`, 'error', 7000);
  } finally {
    setLoading(false);
  }
}
