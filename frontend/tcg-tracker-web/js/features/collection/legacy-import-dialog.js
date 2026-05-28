/**
 * Legacy-Import-Dialog – State und Renderer
 *
 * Kapselt den gesamten Dialog-Zustand und das UI-Rendering für
 * den Altbestand-Import (XLSX + Google Sheet).
 * Wird als DI-Controller via createLegacyImportDialogController erstellt.
 */

// ─── Private Hilfsfunktionen ─────────────────────────────────────────────────

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

// ─── Controller-Fabrik ────────────────────────────────────────────────────────

export function createLegacyImportDialogController({
  dom,
  summarizeLegacyImportPlan,
  filterLegacyImportPlanBySelection,
  buildLegacyImportSelectionTree,
  extractLegacySpreadsheetId,
  startLegacyWorkbookImport,
} = {}) {
  let legacyImportSelectionDialogState = null;

  // ─── Preview-Text ─────────────────────────────────────────────────────────

  function buildLegacyImportPreviewText(plan) {
    const summary = summarizeLegacyImportPlan(plan);
    const lines = [
      `Set-Blätter erkannt: ${summary.sheetCount}`,
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
          lines.push(`• ${entry.sheetName}: ${entry.reason}`);
        });
      }

      if (plan.unresolvedCards?.length) {
        lines.push('');
        lines.push('Karten-Probleme:');
        plan.unresolvedCards.slice(0, 8).forEach((entry) => {
          lines.push(`• ${entry.setId} / ${entry.sourceCardId}: ${entry.reason}`);
        });
      }

      lines.push('');
      lines.push('Der Import wurde blockiert, bis alle Konflikte eindeutig gelöst sind.');
      return lines.join('\n');
    }

    lines.push('');
    lines.push('Der Import setzt die betroffenen Sets exakt auf den Altbestand-Stand (G/RH) – inklusive Entfernen nicht markierter Treffer in diesen Sets.');
    return lines.join('\n');
  }

  // ─── Sheet-Dialog ─────────────────────────────────────────────────────────

  function setLegacySheetDialogError(message = '') {
    if (!dom.legacySheetError) return;
    dom.legacySheetError.textContent = message;
    dom.legacySheetError.classList.toggle('hidden', !message);
  }

  function openLegacySheetImportDialog() {
    setLegacySheetDialogError('');
    if (dom.legacySheetInput) {
      dom.legacySheetInput.value = '';
    }
    dom.legacySheetDialog?.showModal();
    dom.legacySheetInput?.focus();
  }

  async function submitLegacySheetImportDialog() {
    const rawInput = String(dom.legacySheetInput?.value || '').trim();
    const spreadsheetId = extractLegacySpreadsheetId(rawInput);
    if (!spreadsheetId) {
      setLegacySheetDialogError('Bitte einen gültigen Google-Sheets-Link oder eine Spreadsheet-ID eingeben.');
      dom.legacySheetInput?.focus();
      return;
    }

    dom.legacySheetDialog?.close();
    await startLegacyWorkbookImport({
      spreadsheetInput: spreadsheetId,
      sourceLabel: 'Google Sheet'
    });
  }

  // ─── Selection-Dialog ─────────────────────────────────────────────────────

  function renderLegacyImportSelectionDialog() {
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
        ? `${stats.selectedCardCount} von ${stats.totalCardCount} Karten aus ${stats.selectedSetCount} von ${stats.totalSetCount} Sets werden übernommen.${stats.autoImportSetCount ? ` ${stats.autoImportSetCount} Sets werden dafür bei Bedarf zuerst importiert.` : ''}`
        : 'Bitte mindestens ein Set oder eine Karte auswählen.';
    }

    if (dom.btnLegacySelectionConfirm) {
      dom.btnLegacySelectionConfirm.disabled = stats.selectedCardCount === 0;
      dom.btnLegacySelectionConfirm.textContent = stats.selectedCardCount > 0
        ? `Ausgewählte importieren (${stats.selectedCardCount})`
        : 'Ausgewählte importieren';
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
            const cardNumber = escapeLegacyImportSelectionHtml(card.sourceCardId || card.cardId || '—');
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
        ? `${setEntry.sheetName} · ${setEntry.setId}`
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
            ${cardsMarkup || '<p class="legacy-selection-empty">Keine Karten für diesen Filter.</p>'}
          </div>
        </details>
      `;
    }).filter(Boolean).join('');

    dom.legacySelectionTree.innerHTML = setMarkup || '<p class="legacy-selection-empty">Keine Sets oder Karten für diesen Filter gefunden.</p>';

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

  function closeLegacyImportSelectionDialog(result = null) {
    const resolver = legacyImportSelectionDialogState?.resolve || null;
    legacyImportSelectionDialogState = null;
    dom.legacySelectionDialog?.close();
    if (dom.legacySelectionSearch) dom.legacySelectionSearch.value = '';
    if (dom.legacySelectionTree) dom.legacySelectionTree.innerHTML = '';
    if (dom.legacySelectionSummary) dom.legacySelectionSummary.innerHTML = '';
    if (dom.legacySelectionInfo) dom.legacySelectionInfo.textContent = '';
    if (typeof resolver === 'function') resolver(result);
  }

  function setAllLegacyImportSelections(selected) {
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

  function confirmLegacyImportSelectionDialog() {
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

  function handleLegacyImportSelectionTreeChange(event) {
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

  function handleLegacyImportSelectionTreeToggle(event) {
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

  // ─── Event-Bindings ───────────────────────────────────────────────────────

  function initLegacyImportDialogBindings() {
    dom.btnImportLegacyXlsx?.addEventListener('click', () => dom.legacyImportFileInput?.click());
    dom.btnImportLegacySheet?.addEventListener('click', openLegacySheetImportDialog);
    dom.btnLegacySheetCancel?.addEventListener('click', () => dom.legacySheetDialog?.close());
    dom.btnLegacySheetImportConfirm?.addEventListener('click', submitLegacySheetImportDialog);
    dom.legacySheetInput?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      submitLegacySheetImportDialog();
    });
    dom.btnLegacySelectionAll?.addEventListener('click', () => setAllLegacyImportSelections(true));
    dom.btnLegacySelectionNone?.addEventListener('click', () => setAllLegacyImportSelections(false));
    dom.btnLegacySelectionCancel?.addEventListener('click', () => closeLegacyImportSelectionDialog(null));
    dom.btnLegacySelectionConfirm?.addEventListener('click', confirmLegacyImportSelectionDialog);
    dom.legacySelectionSearch?.addEventListener('input', renderLegacyImportSelectionDialog);
    dom.legacySelectionTree?.addEventListener('change', handleLegacyImportSelectionTreeChange);
    dom.legacySelectionTree?.addEventListener('click', (event) => {
      if (event.target?.closest?.('.legacy-tree-summary-check')) {
        event.stopPropagation();
      }
    }, true);
    dom.legacySelectionTree?.addEventListener('toggle', handleLegacyImportSelectionTreeToggle, true);
    dom.legacySelectionDialog?.addEventListener('cancel', (event) => {
      event.preventDefault();
      closeLegacyImportSelectionDialog(null);
    });
  }

  return {
    buildLegacyImportPreviewText,
    openLegacyImportSelectionDialog,
    openLegacySheetImportDialog,
    initLegacyImportDialogBindings,
  };
}
