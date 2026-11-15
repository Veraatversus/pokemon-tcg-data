// Sheets-Schreib-Feedback, Retry-Report und Audit-/Speicherstatus-Oberflaeche.
import {
  initSheetsWriteFeedback as initSheetsWriteFeedbackUi,
  resetSheetsRetryMetrics as resetSheetsRetryMetricsUi,
  renderSheetsRetryReport as renderSheetsRetryReportUi,
  openSheetsRetryReportDialog as openSheetsRetryReportDialogUi
} from './sheets-retry-report.js';
import { dom } from '../app/dom.js';
import { state } from '../app/state.js';
import { updateJob } from '../features/collection/import-jobs.js';
import { setGlobalStatus, renderAuditPanel, updateSaveStatePill, updateUndoUi, undoLastChange } from './helpers.js';

export function initSheetsWriteFeedback() {
  initSheetsWriteFeedbackUi({
    state,
    renderSheetsRetryReport,
    setGlobalStatus,
    updateJob,
  });
}

export function resetSheetsRetryMetrics() {
  resetSheetsRetryMetricsUi(state, renderSheetsRetryReport);
}

function renderSheetsRetryReport() {
  renderSheetsRetryReportUi({ dom, state });
}

export function openSheetsRetryReportDialog() {
  openSheetsRetryReportDialogUi(dom, renderSheetsRetryReport);
}

export function initAuditAndSaveUi() {
  updateSaveStatePill();
  renderAuditPanel();
  updateUndoUi();

  dom.btnAuditPanel?.addEventListener('click', () => {
    if (!dom.auditPanel) return;
    dom.auditPanel.classList.toggle('hidden');
    const expanded = !dom.auditPanel.classList.contains('hidden');
    dom.btnAuditPanel.setAttribute('aria-expanded', String(expanded));
  });

  dom.btnAuditClear?.addEventListener('click', () => {
    state.auditEntries = [];
    renderAuditPanel();
  });

  dom.btnUndoLast?.addEventListener('click', () => undoLastChange());

  window.addEventListener('keydown', (event) => {
    const isUndo = (event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 'z';
    if (!isUndo) return;
    if (event.target?.matches?.('input, textarea, [contenteditable="true"]')) return;
    event.preventDefault();
    undoLastChange();
  });
}
