/**
 * Analytics UI Module
 * Renders analytics dashboards and charts
 */

class AnalyticsUI {
  constructor(analytics) {
    this.analytics = analytics;
  }

  /**
   * Create analytics dashboard
   */
  createDashboard(currentStats, sets) {
    const dashboard = document.createElement('div');
    dashboard.className = 'analytics-dashboard';

    const progressData = this.analytics.getProgressOverTime(30);
    const velocity = this.analytics.getVelocity(4);
    const mostImproved = this.analytics.getMostImprovedSets(30);
    const milestones = this.analytics.getMilestones();
    const prediction = this.analytics.predictCompletionDate(currentStats, 30);

    dashboard.innerHTML = `
      <div class="dashboard-header">
        <h2>📊 Analytics Dashboard</h2>
        <button class="close-btn">✕</button>
      </div>

      <div class="dashboard-content">
        <!-- Key Metrics -->
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-icon">📈</div>
            <div class="metric-label">Wachstum (7 Tage)</div>
            <div class="metric-value">${this.analytics.getGrowthRate(7)} Karten</div>
          </div>

          <div class="metric-card">
            <div class="metric-icon">⚡</div>
            <div class="metric-label">Ø pro Tag</div>
            <div class="metric-value">${this.analytics.getAveragePerDay(30)}</div>
          </div>

          <div class="metric-card">
            <div class="metric-icon">🔥</div>
            <div class="metric-label">Streak</div>
            <div class="metric-value">${this.analytics.getCurrentStreak()} Tage</div>
          </div>

          ${prediction ? `
          <div class="metric-card">
            <div class="metric-icon">🎯</div>
            <div class="metric-label">Fertig in</div>
            <div class="metric-value">${prediction.daysRemaining} Tagen</div>
            <div class="metric-subtext">${prediction.date.toLocaleDateString('de-DE')}</div>
          </div>
          ` : ''}
        </div>

        <!-- Progress Chart -->
        <div class="chart-container">
          <h3>Sammlungsfortschritt (30 Tage)</h3>
          <canvas id="progress-chart" width="600" height="300"></canvas>
        </div>

        <!-- Velocity Chart -->
        <div class="chart-container">
          <h3>Sammlungsgeschwindigkeit (4 Wochen)</h3>
          <canvas id="velocity-chart" width="600" height="200"></canvas>
        </div>

        <!-- Most Improved Sets -->
        ${mostImproved.length > 0 ? `
        <div class="improved-sets">
          <h3>🏆 Am meisten verbesserte Sets (30 Tage)</h3>
          <div class="improved-list">
            ${mostImproved.slice(0, 5).map((set, idx) => `
              <div class="improved-item">
                <span class="rank">#${idx + 1}</span>
                <span class="set-name">${set.name}</span>
                <span class="improvement">+${set.improvement} Karten</span>
                <span class="percent">(+${set.improvementPercent}%)</span>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        <!-- Milestones -->
        ${milestones.length > 0 ? `
        <div class="milestones">
          <h3>🎉 Meilensteine</h3>
          <div class="milestone-list">
            ${milestones.slice(0, 10).map(milestone => `
              <div class="milestone-item">
                <span class="milestone-icon">${milestone.type === 'set_complete' ? '✅' : '🎯'}</span>
                <span class="milestone-desc">${milestone.description}</span>
                <span class="milestone-date">${milestone.date.toLocaleDateString('de-DE')}</span>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </div>

      <div class="dashboard-footer">
        <button class="btn-export-analytics">📥 Daten exportieren</button>
        <button class="btn-clear-history">🗑️ Verlauf löschen</button>
      </div>
    `;

    return dashboard;
  }

  /**
   * Draw progress chart (simple canvas implementation)
   */
  drawProgressChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    if (data.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Keine Daten verfügbar', width / 2, height / 2);
      return;
    }

    // Find min/max values
    const values = data.map(d => d.collectedCards);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const range = maxValue - minValue || 1;

    // Draw axes
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Draw data line
    ctx.strokeStyle = '#4caf50';
    ctx.lineWidth = 2;
    ctx.beginPath();

    data.forEach((point, idx) => {
      const x = padding + ((width - 2 * padding) * idx) / (data.length - 1);
      const y = height - padding - ((point.collectedCards - minValue) / range) * (height - 2 * padding);

      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw points
    ctx.fillStyle = '#4caf50';
    data.forEach((point, idx) => {
      const x = padding + ((width - 2 * padding) * idx) / (data.length - 1);
      const y = height - padding - ((point.collectedCards - minValue) / range) * (height - 2 * padding);
      
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
    });

    // Labels
    ctx.fillStyle = '#333';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    
    // Y-axis label
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Gesammelte Karten', 0, 0);
    ctx.restore();

    // X-axis label
    ctx.fillText('Zeit', width / 2, height - 10);

    // Min/Max values
    ctx.textAlign = 'right';
    ctx.fillText(maxValue.toString(), padding - 5, padding + 5);
    ctx.fillText(minValue.toString(), padding - 5, height - padding + 5);
  }

  /**
   * Draw velocity chart (bar chart)
   */
  drawVelocityChart(canvasId, velocityData) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const padding = 40;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    if (velocityData.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Keine Daten verfügbar', width / 2, height / 2);
      return;
    }

    const maxCards = Math.max(...velocityData.map(v => v.cards), 1);
    const barWidth = (width - 2 * padding) / velocityData.length - 10;

    // Draw bars
    velocityData.forEach((week, idx) => {
      const x = padding + (idx * (barWidth + 10));
      const barHeight = ((week.cards / maxCards) * (height - 2 * padding));
      const y = height - padding - barHeight;

      // Bar
      ctx.fillStyle = '#ff9800';
      ctx.fillRect(x, y, barWidth, barHeight);

      // Value label
      ctx.fillStyle = '#333';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(week.cards.toString(), x + barWidth / 2, y - 5);

      // Week label
      ctx.fillText(`W${week.week}`, x + barWidth / 2, height - padding + 15);
    });

    // Y-axis
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#333';
    ctx.font = '12px sans-serif';
    
    // Y-axis label
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Karten pro Woche', 0, 0);
    ctx.restore();
  }

  /**
   * Inject analytics button into toolbar
   */
  injectAnalyticsButton(toolbarSelector) {
    const toolbar = document.querySelector(toolbarSelector);
    if (!toolbar) return;

    const btn = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.action = 'analytics';
    btn.title = 'Analytics Dashboard';
    btn.innerHTML = '📊 Analytics';
    
    toolbar.appendChild(btn);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const event = new CustomEvent('analytics-action', {
        detail: { action: 'open' },
        bubbles: true
      });
      document.dispatchEvent(event);
    });
  }
}

// Global instance
let globalAnalyticsUI = null;

/**
 * Initialize global Analytics UI
 */
function initializeAnalyticsUI(analytics) {
  if (!globalAnalyticsUI) {
    globalAnalyticsUI = new AnalyticsUI(analytics);
  }
  return globalAnalyticsUI;
}

/**
 * Get global Analytics UI instance
 */
function getGlobalAnalyticsUI() {
  return globalAnalyticsUI;
}

export { AnalyticsUI, initializeAnalyticsUI, getGlobalAnalyticsUI };
