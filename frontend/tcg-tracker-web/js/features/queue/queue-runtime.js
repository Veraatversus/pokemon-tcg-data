export function createQueueRuntime({ state, dom, showToast } = {}) {
  function startJob(title, totalSteps = 0) {
    const job = {
      id: Date.now(),
      title,
      totalSteps: Math.max(0, Number(totalSteps) || 0),
      current: 0,
      cancelled: false,
      startedAt: Date.now()
    };
    state.activeJob = job;
    dom.jobPanel?.classList.remove('hidden');
    if (dom.jobTitle) dom.jobTitle.textContent = title;
    if (dom.jobStatusText) dom.jobStatusText.textContent = 'Gestartet…';
    if (dom.jobProgressFill) dom.jobProgressFill.style.width = '0%';
    if (dom.btnJobCancel) dom.btnJobCancel.disabled = false;
    return job;
  }

  function pushJobHistory(text) {
    if (!dom.jobHistory) return;
    const item = document.createElement('li');
    item.textContent = text;
    dom.jobHistory.prepend(item);
    while (dom.jobHistory.children.length > 30) {
      dom.jobHistory.removeChild(dom.jobHistory.lastChild);
    }
  }

  function updateJob(job, current, text) {
    if (!job || state.activeJob?.id !== job.id) return;
    job.current = Math.max(0, Number(current) || 0);
    const pct = job.totalSteps > 0 ? Math.min(100, Math.round((job.current / job.totalSteps) * 100)) : 0;
    if (dom.jobProgressFill) dom.jobProgressFill.style.width = `${pct}%`;
    if (dom.jobStatusText) dom.jobStatusText.textContent = text || `${job.current}/${job.totalSteps}`;
  }

  function finishJob(job, summary, isError = false) {
    if (!job || state.activeJob?.id !== job.id) return;
    if (dom.jobStatusText) dom.jobStatusText.textContent = summary;
    if (dom.btnJobCancel) dom.btnJobCancel.disabled = true;
    if (dom.jobProgressFill && job.totalSteps > 0) {
      dom.jobProgressFill.style.width = isError ? dom.jobProgressFill.style.width : '100%';
    }
    pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} • ${job.title}: ${summary}`);
    state.activeJob = null;
  }

  function assertJobNotCancelled(job) {
    if (job?.cancelled) {
      throw new Error('Vorgang abgebrochen.');
    }
  }

  function updateQueueUiState() {
    const queued = state.queuedActions.length;
    if (dom.btnQueueRun) dom.btnQueueRun.disabled = state.queueRunning || queued === 0;
    if (dom.btnQueueClear) dom.btnQueueClear.disabled = state.queueRunning || queued === 0;
  }

  function enqueueAction(label, action) {
    state.queuedActions.push({ id: Date.now() + Math.random(), label, action });
    pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} • Queue hinzugefügt: ${label}`);
    updateQueueUiState();
  }

  function clearQueuedActions() {
    const count = state.queuedActions.length;
    state.queuedActions = [];
    updateQueueUiState();
    if (count > 0) showToast(`Queue geleert (${count} entfernt).`, 'info');
  }

  async function runQueuedActions() {
    if (state.queueRunning || state.queuedActions.length === 0) return;
    state.queueRunning = true;
    state.queueCancelRequested = false;
    updateQueueUiState();
    dom.jobPanel?.classList.remove('hidden');
    if (dom.jobTitle) dom.jobTitle.textContent = 'Job Queue';

    try {
      while (state.queuedActions.length > 0) {
        if (state.queueCancelRequested) {
          pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} • Queue abgebrochen`);
          break;
        }
        const next = state.queuedActions.shift();
        updateQueueUiState();
        if (dom.jobStatusText) dom.jobStatusText.textContent = `Queue: ${next.label}`;
        pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} • Queue startet: ${next.label}`);
        try {
          await next.action();
        } catch (err) {
          pushJobHistory(`${new Date().toLocaleTimeString('de-DE')} • Queue-Fehler: ${next.label} (${err.message})`);
          showToast(`Queue gestoppt: ${next.label} – ${err.message}`, 'error', 6000);
          break;
        }
      }
    } finally {
      const remaining = state.queuedActions.length;
      state.queueRunning = false;
      state.queueCancelRequested = false;
      updateQueueUiState();
      if (remaining === 0) {
        if (dom.jobStatusText) dom.jobStatusText.textContent = 'Queue beendet';
        showToast('Queue abgearbeitet.', 'success', 3000);
      } else {
        if (dom.jobStatusText) dom.jobStatusText.textContent = `Queue gestoppt (${remaining} offen)`;
      }
    }
  }

  return {
    startJob,
    pushJobHistory,
    updateJob,
    finishJob,
    assertJobNotCancelled,
    updateQueueUiState,
    enqueueAction,
    clearQueuedActions,
    runQueuedActions,
  };
}