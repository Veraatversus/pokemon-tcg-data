/**
 * Modal System
 */

import * as Utils from './utils.js';

/**
 * Create and show modal
 */
export function showModal(title, content, options = {}) {
  const container = document.getElementById('modal-container');
  if (!container) {
    console.error('Modal container not found');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';

  const header = document.createElement('div');
  header.className = 'modal-header';
  header.innerHTML = `
    <h2>${title}</h2>
    <button class="modal-close-btn" title="Schließen">✕</button>
  `;

  const contentDiv = document.createElement('div');
  contentDiv.className = 'modal-content';
  if (typeof content === 'string') {
    contentDiv.innerHTML = content;
  } else {
    contentDiv.appendChild(content);
  }

  modal.appendChild(header);
  modal.appendChild(contentDiv);

  if (options.footer) {
    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    if (typeof options.footer === 'string') {
      footer.innerHTML = options.footer;
    } else {
      footer.appendChild(options.footer);
    }
    modal.appendChild(footer);
  }

  overlay.appendChild(modal);
  container.appendChild(overlay);

  // Close handlers
  const closeBtn = header.querySelector('.modal-close-btn');
  closeBtn.addEventListener('click', () => closeModal(overlay));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay);
  });

  // Keyboard close
  const handleKeydown = (e) => {
    if (e.key === 'Escape') {
      closeModal(overlay);
      document.removeEventListener('keydown', handleKeydown);
    }
  };
  document.addEventListener('keydown', handleKeydown);

  return overlay;
}

/**
 * Close modal
 */
export function closeModal(overlay) {
  overlay.style.opacity = '0';
  overlay.style.transform = 'scale(0.95)';
  setTimeout(() => {
    overlay.remove();
  }, 300);
}

/**
 * Close all modals
 */
export function closeAllModals() {
  const container = document.getElementById('modal-container');
  if (container) {
    container.innerHTML = '';
  }
}

/**
 * Create Set Details Modal
 */
export function showSetDetailsModal(set) {
  const progress = set.getProgress();
  const reverseProgress = set.cards.filter(c => c.reverseHolo).length;

  const content = document.createElement('div');
  content.innerHTML = `
    <div class="set-info">
      <div class="info-row">
        <span class="info-label">Serie:</span>
        <span class="info-value">${set.series || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Veröffentlichung:</span>
        <span class="info-value">${set.releaseDate || '-'}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Insgesamt Karten:</span>
        <span class="info-value">${set.total}</span>
      </div>
    </div>

    <div class="set-stats">
      <div class="stat-card">
        <div class="stat-value">${progress.collected}</div>
        <div class="stat-label">Normal gesammelt</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${reverseProgress}</div>
        <div class="stat-label">Reverse Holo</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${set.total - progress.collected}</div>
        <div class="stat-label">Fehlend</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${progress.percentage}%</div>
        <div class="stat-label">Fortschritt</div>
      </div>
    </div>

    <div class="progress-detailed">
      <div class="progress-label">
        <span>Normal Karten</span>
        <span>${progress.collected} / ${progress.total}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${progress.percentage}%"></div>
      </div>
    </div>

    <div class="progress-detailed">
      <div class="progress-label">
        <span>Reverse Holo</span>
        <span>${reverseProgress} / ${progress.total}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${(reverseProgress / progress.total * 100).toFixed(0)}%"></div>
      </div>
    </div>
  `;

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.gap = '10px';
  footer.innerHTML = `
    <button id="export-set-btn" class="btn-primary" style="margin-right: auto;">📥 Exportieren</button>
    <button id="close-modal-btn" class="btn-secondary">Schließen</button>
  `;

  const modal = showModal(`📊 ${set.name} - Details`, content, { footer });

  footer.querySelector('#export-set-btn').addEventListener('click', () => {
    showExportModal(set);
  });

  footer.querySelector('#close-modal-btn').addEventListener('click', () => {
    closeModal(modal);
  });
}

/**
 * Create Export Modal
 */
export function showExportModal(set) {
  const content = document.createElement('div');
  content.className = 'export-options';
  content.innerHTML = `
    <button class="export-btn" data-export="csv">
      <span class="export-icon">📄</span>
      <span class="export-label">
        <strong>CSV exportieren</strong>
        <small>Komma-getrennte Werte (Excel, Google Sheets)</small>
      </span>
    </button>
    <button class="export-btn" data-export="json">
      <span class="export-icon">{ }</span>
      <span class="export-label">
        <strong>JSON exportieren</strong>
        <small>Strukturiertes Datenformat</small>
      </span>
    </button>
    <button class="export-btn" data-export="print">
      <span class="export-icon">🖨️</span>
      <span class="export-label">
        <strong>Drucken</strong>
        <small>Sammlung ausdrucken</small>
      </span>
    </button>
  `;

  const modal = showModal(`📥 ${set.name} exportieren`, content, {
    footer: '<button id="export-close-btn" class="btn-secondary">Abbrechen</button>'
  });

  content.querySelectorAll('.export-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      handleExport(set, btn.dataset.export);
      closeModal(modal);
    });
  });

  modal.querySelector('#export-close-btn').addEventListener('click', () => {
    closeModal(modal);
  });
}

/**
 * Handle export
 */
function handleExport(set, format) {
  switch (format) {
    case 'csv':
      exportCSV(set);
      break;
    case 'json':
      exportJSON(set);
      break;
    case 'print':
      printCollection(set);
      break;
  }
}

/**
 * Export as CSV
 */
function exportCSV(set) {
  const headers = ['#', 'Name', 'Normal', 'Reverse Holo'];
  const rows = set.cards.map(card => [
    card.number,
    card.name,
    card.collected ? '✓' : '',
    card.reverseHolo ? '✓' : ''
  ]);

  const csv = Utils.generateCSV(rows, headers);
  const filename = `${set.id}_sammlung_${new Date().toISOString().split('T')[0]}.csv`;
  Utils.downloadFile(csv, filename, 'text/csv');
}

/**
 * Export as JSON
 */
function exportJSON(set) {
  const data = {
    set: {
      id: set.id,
      name: set.name,
      series: set.series,
      total: set.total,
      releaseDate: set.releaseDate
    },
    cards: set.cards.map(card => ({
      number: card.number,
      name: card.name,
      collected: card.collected,
      reverseHolo: card.reverseHolo
    })),
    progress: set.getProgress(),
    exportDate: new Date().toISOString()
  };

  const json = JSON.stringify(data, null, 2);
  const filename = `${set.id}_sammlung_${new Date().toISOString().split('T')[0]}.json`;
  Utils.downloadFile(json, filename, 'application/json');
}

/**
 * Print collection
 */
function printCollection(set) {
  const printWindow = window.open('', '', 'width=800,height=600');
  const progress = set.getProgress();

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${set.name} - Sammlung</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        h1 { color: #667eea; }
        .info { background: #f5f5f5; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
        .grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
        .card { border: 1px solid #ddd; padding: 10px; border-radius: 5px; }
        .collected { background: #D9EAD3; }
        .reverse { background: #D0E0F0; }
        .both { background: linear-gradient(135deg, #D9EAD3 0%, #D0E0F0 100%); }
      </style>
    </head>
    <body>
      <h1>🎴 ${set.name}</h1>
      <div class="info">
        <p><strong>Fortschritt:</strong> ${progress.collected}/${progress.total} (${progress.percentage}%)</p>
        <p><strong>Datum:</strong> ${new Date().toLocaleDateString('de-DE')}</p>
      </div>
      <div class="grid">
        ${set.cards.map(card => `
          <div class="card ${card.collected && card.reverseHolo ? 'both' : card.collected ? 'collected' : card.reverseHolo ? 'reverse' : ''}">
            <strong>#${card.number}</strong>
            <div>${card.name}</div>
          </div>
        `).join('')}
      </div>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => printWindow.print(), 250);
}
