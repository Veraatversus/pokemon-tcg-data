export function createDataQualityController(deps = {}) {
  const {
    state,
    showToast,
    setLoading,
    setGlobalStatus,
    startJob,
    assertJobNotCancelled,
    updateJob,
    finishJob,
    fetchMergedCards,
    readSetCollectionMap,
    downloadJson,
    createAutoSnapshot,
    importSetsSequential,
    runPokecodeParityCheck,
    confirm = (message) => window.confirm(message),
    prompt = (message, initialValue) => window.prompt(message, initialValue),
    logger = console,
  } = deps;

  async function runDataHealthCheck({ autoFix = false } = {}) {
    if (!state.sets.length) {
      showToast('Keine importierten Sets fuer Datencheck.', 'info');
      return;
    }

    setLoading(true, 'Datencheck laeuft...');
    const report = {
      createdAt: new Date().toISOString(),
      checkedSets: state.sets.length,
      mismatches: [],
      errors: [],
    };
    const mismatchSets = [];
    const job = startJob(autoFix ? 'Datencheck + Auto-Fix' : 'Datencheck', state.sets.length);

    try {
      for (let index = 0; index < state.sets.length; index++) {
        assertJobNotCancelled(job);
        const set = state.sets[index];
        setGlobalStatus(`Datencheck ${index + 1}/${state.sets.length}: ${set.setName}`);
        updateJob(job, index, `Datencheck ${index + 1}/${state.sets.length}: ${set.setName}`);
        try {
          const [apiCards, sheetMap] = await Promise.all([
            fetchMergedCards(set.setId),
            readSetCollectionMap(set.setName),
          ]);

          const apiCount = Array.isArray(apiCards) ? apiCards.length : 0;
          const sheetCount = sheetMap instanceof Map ? sheetMap.size : 0;
          if (apiCount !== sheetCount) {
            mismatchSets.push(set);
            report.mismatches.push({
              setId: set.setId,
              setName: set.setName,
              apiCount,
              sheetCount,
              delta: sheetCount - apiCount,
            });
          }
        } catch (err) {
          report.errors.push({ setId: set.setId, setName: set.setName, error: err.message });
        }
      }
      updateJob(job, state.sets.length, `Datencheck beendet: ${report.mismatches.length} Abweichungen`);
    } catch (err) {
      finishJob(job, err.message || 'Datencheck abgebrochen', true);
      throw err;
    } finally {
      setLoading(false);
    }

    if (!report.mismatches.length && !report.errors.length) {
      finishJob(job, 'Keine Abweichungen gefunden', false);
      showToast(`Datencheck ok: ${report.checkedSets} Sets geprueft, keine Abweichungen.`, 'success', 4500);
      return;
    }

    logger.group('[DataHealthCheck] Bericht');
    if (report.mismatches.length) logger.table(report.mismatches);
    if (report.errors.length) logger.table(report.errors);
    logger.groupEnd();

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadJson(`poke_data_health_${stamp}.json`, report);
    showToast(`Datencheck fertig: ${report.mismatches.length} Abweichungen, ${report.errors.length} Fehler. Report exportiert.`, 'error', 6500);

    if (!autoFix || !mismatchSets.length) {
      finishJob(job, `Datencheck abgeschlossen (${report.mismatches.length} Abweichungen)`, true);
      return;
    }

    const confirmText = `${mismatchSets.length} Set${mismatchSets.length === 1 ? '' : 's'} mit Abweichungen automatisch reimportieren?`;
    const ok = confirm(confirmText);
    if (!ok) {
      finishJob(job, 'Auto-Fix abgebrochen', true);
      return;
    }

    try {
      const currentCollection = state.collection || {};
      const action = `Auto-Fix: ${mismatchSets.length} Set(s) mit Abweichungen`;
      await createAutoSnapshot(action, currentCollection);
    } catch (err) {
      logger.warn('[runDataHealthCheck] auto snapshot failed', err);
    }

    const uniqueSets = Array.from(new Map(mismatchSets.map((set) => [set.setId, set])).values());
    await importSetsSequential(uniqueSets, { successMessage: '{count} Mismatch-Set(s) automatisch repariert.' });
    finishJob(job, `Auto-Fix ausgefuehrt (${uniqueSets.length} Sets)`, false);
  }

  async function runPokecodeParityTest({ skipPrompt = false, maxSets: presetMaxSets = null } = {}) {
    let maxSets = 10;
    if (Number.isFinite(presetMaxSets) && presetMaxSets > 0) {
      maxSets = Math.min(Number(presetMaxSets), 50);
    } else if (!skipPrompt) {
      const input = prompt('Wie viele Sets sollen geprueft werden? (Standard: 10)', '10');
      const parsed = Number.parseInt(String(input || '10'), 10);
      maxSets = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 50) : 10;
    }

    setLoading(true, 'Pokecode-Parity-Test laeuft...');
    setGlobalStatus(`Parity-Test laeuft (max. ${maxSets} Sets)...`);
    const job = startJob('Pokecode-Parity-Test', maxSets);

    try {
      const report = await runPokecodeParityCheck({ maxSets });
      updateJob(job, report.checkedSetCount || 0, `Parity-Test beendet: ${report.ok ? 'OK' : 'Abweichungen gefunden'}`);
      finishJob(job, report.ok ? 'Parity-Test erfolgreich' : 'Parity-Test mit Abweichungen', !report.ok);

      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      downloadJson(`poke_parity_report_${stamp}.json`, report);

      if (report.ok) {
        showToast(`Parity-Test OK (${report.checkedSetCount} Sets, keine Abweichungen). Report exportiert.`, 'success', 5000);
      } else {
        showToast(`Parity-Test fertig: ${report.overviewMismatches.length} Overview- und ${report.cardMismatches.length} Karten-Abweichungen. Report exportiert.`, 'error', 7000);
        logger.group('[ParityTest] Abweichungen');
        if (report.overviewMismatches.length) logger.table(report.overviewMismatches);
        if (report.cardMismatches.length) logger.table(report.cardMismatches);
        logger.groupEnd();
      }
    } catch (err) {
      finishJob(job, err?.message || 'Parity-Test fehlgeschlagen', true);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  return {
    runDataHealthCheck,
    runPokecodeParityTest,
  };
}
