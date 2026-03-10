/**
 * Statistics Dashboard UI Module
 * Render collection statistics and progress information
 */

import { getGlobalStats } from './statistics.js';

export class StatsDashboardUI {
  constructor() {
    this.stats = getGlobalStats();
  }

  /**
   * Create statistics panel HTML
   */
  createStatsPanel(setStats) {
    if (!setStats) {
      return `<div class="stats-panel">Keine Daten verfügbar</div>`;
    }

    const progressPercent = setStats.completionPercent;
    const rhProgressPercent = setStats.rhCompletionPercent;

    return `
      <div class="stats-panel">
        <div class="stats-header">
          <h3>📊 Sammlungsfortschritt</h3>
          <span class="stats-completion-badge">${progressPercent}%</span>
        </div>

        <div class="stats-grid">
          <div class="stat-item">
            <label>Gesammelt</label>
            <div class="stat-value">${setStats.collected}/${setStats.total}</div>
          </div>

          <div class="stat-item">
            <label>Reverse Holo</label>
            <div class="stat-value">${setStats.reverseHolo}</div>
          </div>

          <div class="stat-item">
            <label>Beide</label>
            <div class="stat-value">${setStats.bothCollected}</div>
          </div>

          <div class="stat-item">
            <label>Fehlend</label>
            <div class="stat-value highlight-danger">${setStats.missing}</div>
          </div>
        </div>

        <div class="progress-section">
          <h4>Fortschrittsbalken</h4>
          <div class="progress-bar-container">
            <div class="progress-bar">
              <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="progress-label">${setStats.collected}/${setStats.total} (${progressPercent}%)</span>
          </div>
        </div>

        ${setStats.collected > 0 ? `
          <div class="progress-section">
            <h4>Reverse Holo Fortschritt</h4>
            <div class="progress-bar-container">
              <div class="progress-bar">
                <div class="progress-bar-fill rh" style="width: ${rhProgressPercent}%"></div>
              </div>
              <span class="progress-label">${setStats.bothCollected}/${setStats.collected} (${rhProgressPercent}%)</span>
            </div>
          </div>
        ` : ''}

        <div class="stats-timestamp">
          ⏰ Zuletzt aktualisiert: ${this.formatTimestamp(setStats.lastUpdated)}
        </div>
      </div>
    `;
  }

  /**
   * Create global statistics panel
   */
  createGlobalStatsPanel(globalStats) {
    if (!globalStats || globalStats.totalCards === 0) {
      return `<div class="global-stats-panel">Keine Daten verfügbar</div>`;
    }

    return `
      <div class="global-stats-panel">
        <div class="stats-header">
          <h3>🌍 Gesamtsammlung</h3>
          <span class="stats-completion-badge">${globalStats.globalCompletionPercent}%</span>
        </div>

        <div class="stats-grid-2col">
          <div class="stat-item">
            <label>Gesamt Karten</label>
            <div class="stat-value">${globalStats.totalCards}</div>
          </div>

          <div class="stat-item">
            <label>Gesammelt</label>
            <div class="stat-value highlight-success">${globalStats.totalCollected}</div>
          </div>

          <div class="stat-item">
            <label>RH Karten</label>
            <div class="stat-value">${globalStats.totalReverseHolo}</div>
          </div>

          <div class="stat-item">
            <label>Fehlend</label>
            <div class="stat-value highlight-danger">${globalStats.missing}</div>
          </div>
        </div>

        <div class="set-stats-grid">
          <div class="set-stat-box completed">
            <div class="set-stat-number">${globalStats.completedSets}</div>
            <div class="set-stat-label">✅ Abgeschlossen</div>
          </div>

          <div class="set-stat-box in-progress">
            <div class="set-stat-number">${globalStats.inProgressSets}</div>
            <div class="set-stat-label">🔄 In Arbeit</div>
          </div>

          <div class="set-stat-box not-started">
            <div class="set-stat-number">${globalStats.notStartedSets}</div>
            <div class="set-stat-label">⭕ Nicht begonnen</div>
          </div>
        </div>

        <div class="progress-section">
          <h4>Gesamtfortschritt</h4>
          <div class="progress-bar-container">
            <div class="progress-bar">
              <div class="progress-bar-fill" style="width: ${globalStats.globalCompletionPercent}%"></div>
            </div>
            <span class="progress-label">${globalStats.totalCollected}/${globalStats.totalCards} (${globalStats.globalCompletionPercent}%)</span>
          </div>
        </div>

        <div class="stats-timeline">
          <div class="timeline-item">
            <span>Ø Set-Fortschritt:</span>
            <strong>${globalStats.avgCompletionPercent}%</strong>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Create set completion table
   */
  createSetCompletionTable(setStats) {
    const rows = Object.entries(setStats)
      .sort((a, b) => b[1].completionPercent - a[1].completionPercent)
      .map(([setId, stats]) => `
        <tr class="completion-row ${stats.isComplete ? 'completed' : ''}">
          <td class="set-name">${setId}</td>
          <td class="set-count">${stats.collected}/${stats.total}</td>
          <td class="set-completion">
            <div class="mini-progress-bar">
              <div class="mini-progress-fill" style="width: ${stats.completionPercent}%"></div>
            </div>
          </td>
          <td class="set-percent">${stats.completionPercent}%</td>
        </tr>
      `)
      .join('');

    return `
      <div class="set-completion-table-container">
        <h4>📋 Sets nach Fortschritt</h4>
        <table class="set-completion-table">
          <thead>
            <tr>
              <th>Set</th>
              <th>Gesammelt</th>
              <th>Fortschritt</th>
              <th>%</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  }

  /**
   * Inject statistics into page
   */
  injectStatsPanel(setStats, targetSelector = '#stats-container') {
    const target = document.querySelector(targetSelector);
    if (!target) return;

    target.innerHTML = this.createStatsPanel(setStats);
  }

  /**
   * Inject global stats
   */
  injectGlobalStats(globalStats, targetSelector = '#global-stats-container') {
    const target = document.querySelector(targetSelector);
    if (!target) return;

    target.innerHTML = this.createGlobalStatsPanel(globalStats);
  }

  /**
   * Format timestamp to readable format
   */
  formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Gerade eben';
    if (diff < 3600000) return `vor ${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `vor ${Math.floor(diff / 3600000)}h`;

    return date.toLocaleDateString('de-DE');
  }

  /**
   * Create minimal stats bar (for header)
   */
  createStatsBar(setStats) {
    if (!setStats) return '';

    return `
      <div class="stats-bar">
        <span class="stats-item">
          📦 ${setStats.collected}/${setStats.total}
          <span class="stats-percent">(${setStats.completionPercent}%)</span>
        </span>
        <span class="stats-separator">|</span>
        <span class="stats-item">
          ✨ ${setStats.reverseHolo} RH
        </span>
      </div>
    `;
  }

  /**
   * Update statistics in real-time
   */
  updateStats(setStats) {
    // Update progress bars
    const progressFill = document.querySelector('.progress-bar-fill');
    if (progressFill) {
      progressFill.style.width = setStats.completionPercent + '%';
    }

    // Update stats panel values
    const statsPanel = document.querySelector('.stats-panel');
    if (statsPanel) {
      statsPanel.innerHTML = this.createStatsPanel(setStats);
    }

    // Update header stats if exists
    const statsBar = document.querySelector('.stats-bar');
    if (statsBar) {
      statsBar.innerHTML = this.createStatsBar(setStats);
    }
  }
}

/**
 * Initialize statistics dashboard on page load
 */
export function initializeStatsDashboard() {
  const dashUI = new StatsDashboardUI();
  return dashUI;
}
