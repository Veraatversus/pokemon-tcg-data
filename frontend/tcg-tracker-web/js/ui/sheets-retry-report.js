export function createInitialSheetsRetryMetrics() {
  return {
    totalWrites: 0,
    totalRetries: 0,
    totalFailures: 0,
    maxAttemptSeen: 0,
    events: []
  };
}

export function initSheetsWriteFeedback({ state, renderSheetsRetryReport, setGlobalStatus, updateJob }) {
  if (!state || typeof renderSheetsRetryReport !== 'function') return;

  const pushRetryEvent = (type, details = {}) => {
    const metrics = state.sheetsRetryMetrics;
    const entry = {
      type,
      at: new Date().toISOString(),
      ...details
    };
    metrics.events.unshift(entry);
    if (metrics.events.length > 120) metrics.events.length = 120;
    renderSheetsRetryReport();
  };

  window.addEventListener('sheets-write-retry', (event) => {
    const details = event?.detail || {};
    state.sheetsRetryMetrics.totalRetries += 1;
    state.sheetsRetryMetrics.maxAttemptSeen = Math.max(
      state.sheetsRetryMetrics.maxAttemptSeen,
      Number(details.attempt || 0)
    );
    pushRetryEvent('retry', {
      range: details.range || '',
      attempt: Number(details.attempt || 0),
      maxRetries: Number(details.maxRetries || 0),
      delayMs: Number(details.delayMs || 0),
      status: details.status || null
    });
    const retryLabel = `${details.attempt || '?'} / ${details.maxRetries || '?'}`;
    const waitSeconds = Math.max(1, Math.ceil((Number(details.delayMs) || 0) / 1000));
    const message = `Sheets-Write Retry ${retryLabel} (warte ${waitSeconds}s)`;
    setGlobalStatus(message);
    if (state.activeJob) {
      updateJob(state.activeJob, state.activeJob.current, message);
    }
  });

  window.addEventListener('sheets-write-success', (event) => {
    const details = event?.detail || {};
    state.sheetsRetryMetrics.totalWrites += 1;
    state.sheetsRetryMetrics.maxAttemptSeen = Math.max(
      state.sheetsRetryMetrics.maxAttemptSeen,
      Number(details.attemptsUsed || 1)
    );
    if (Number(details.attemptsUsed || 1) > 1) {
      pushRetryEvent('recovered', {
        range: details.range || '',
        attemptsUsed: Number(details.attemptsUsed || 1)
      });
    }
  });

  window.addEventListener('sheets-write-failed', (event) => {
    const details = event?.detail || {};
    state.sheetsRetryMetrics.totalFailures += 1;
    pushRetryEvent('failed', {
      range: details.range || '',
      status: details.status || null,
      message: details.message || ''
    });
    const message = `Sheets-Write fehlgeschlagen (${details.status || 'unbekannt'}): ${details.range || 'Range unbekannt'}`;
    setGlobalStatus(message);
    if (state.activeJob) {
      updateJob(state.activeJob, state.activeJob.current, message);
    }
  });
}

export function resetSheetsRetryMetrics(state, renderSheetsRetryReport) {
  if (!state || typeof renderSheetsRetryReport !== 'function') return;
  state.sheetsRetryMetrics = createInitialSheetsRetryMetrics();
  renderSheetsRetryReport();
}

export function renderSheetsRetryReport({ dom, state }) {
  if (!dom || !state) return;

  if (dom.sheetsRetryStats) {
    const metrics = state.sheetsRetryMetrics;
    const retryRate = metrics.totalWrites > 0
      ? Math.round((metrics.totalRetries / metrics.totalWrites) * 100)
      : 0;
    dom.sheetsRetryStats.innerHTML = `
      <li><strong>Writes:</strong> ${metrics.totalWrites}</li>
      <li><strong>Retries:</strong> ${metrics.totalRetries}</li>
      <li><strong>Failures:</strong> ${metrics.totalFailures}</li>
      <li><strong>Retry-Rate:</strong> ${retryRate}%</li>
      <li><strong>Max Attempts:</strong> ${metrics.maxAttemptSeen || 1}</li>
    `;
  }

  if (dom.sheetsRetryHistory) {
    const events = state.sheetsRetryMetrics.events || [];
    if (!events.length) {
      dom.sheetsRetryHistory.innerHTML = '<li class="retry-empty">Noch keine Sheets-Retry-Ereignisse.</li>';
      return;
    }
    dom.sheetsRetryHistory.innerHTML = events.map((entry) => {
      const time = new Date(entry.at).toLocaleTimeString('de-DE');
      const kind = entry.type === 'failed' ? 'Fehler' : entry.type === 'recovered' ? 'Erholt' : 'Retry';
      const detail = entry.type === 'retry'
        ? `Versuch ${entry.attempt || '?'} / ${entry.maxRetries || '?'} · ${(Math.ceil((entry.delayMs || 0) / 1000) || 0)}s`
        : entry.type === 'failed'
          ? `${entry.status || 'unbekannt'} · ${entry.message || 'ohne Fehlermeldung'}`
          : `nach ${entry.attemptsUsed || '?'} Versuchen erfolgreich`;
      return `<li class="retry-entry ${entry.type}"><span class="retry-time">${time}</span><span class="retry-kind">${kind}</span><span class="retry-detail">${detail}</span><span class="retry-range">${entry.range || 'Range unbekannt'}</span></li>`;
    }).join('');
  }
}

export function openSheetsRetryReportDialog(dom, renderSheetsRetryReport) {
  if (!dom?.sheetsRetryDialog || typeof renderSheetsRetryReport !== 'function') return;
  renderSheetsRetryReport();
  dom.sheetsRetryDialog.showModal();
}
