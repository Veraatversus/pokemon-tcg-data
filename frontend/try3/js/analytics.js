/**
 * Analytics & Statistics Module
 */

/**
 * Calculate collection statistics
 */
export function calculateStats(sets) {
  if (!sets || sets.length === 0) {
    return getEmptyStats();
  }

  let totalCards = 0;
  let totalCollected = 0;
  let totalReverseHolo = 0;
  let seriesStats = {};

  sets.forEach(set => {
    const progress = set.getProgress();
    const reverseHolo = set.cards.filter(c => c.reverseHolo).length;

    totalCards += progress.total;
    totalCollected += progress.collected;
    totalReverseHolo += reverseHolo;

    // Group by series
    if (!seriesStats[set.series]) {
      seriesStats[set.series] = {
        series: set.series,
        sets: 0,
        total: 0,
        collected: 0,
        percentage: 0
      };
    }
    seriesStats[set.series].sets += 1;
    seriesStats[set.series].total += progress.total;
    seriesStats[set.series].collected += progress.collected;
  });

  // Calculate percentages
  Object.values(seriesStats).forEach(stat => {
    if (stat.total > 0) {
      stat.percentage = Math.round((stat.collected / stat.total) * 100);
    }
  });

  return {
    totalCards,
    totalCollected,
    totalReverseHolo,
    totalPercentage: totalCards > 0 ? Math.round((totalCollected / totalCards) * 100) : 0,
    reverseHoloPercentage: totalCards > 0 ? Math.round((totalReverseHolo / totalCards) * 100) : 0,
    missing: totalCards - totalCollected,
    seriesCount: Object.keys(seriesStats).length,
    seriesStats: Object.values(seriesStats)
  };
}

/**
 * Empty stats object
 */
function getEmptyStats() {
  return {
    totalCards: 0,
    totalCollected: 0,
    totalReverseHolo: 0,
    totalPercentage: 0,
    reverseHoloPercentage: 0,
    missing: 0,
    seriesCount: 0,
    seriesStats: []
  };
}

/**
 * Calculate set progress for comparison
 */
export function getSetCompletion(sets) {
  return sets.map(set => {
    const progress = set.getProgress();
    return {
      id: set.id,
      name: set.name,
      series: set.series,
      percentage: progress.percentage,
      collected: progress.collected,
      total: progress.total
    };
  }).sort((a, b) => b.percentage - a.percentage);
}

/**
 * Create analytics HTML modal
 */
export function createAnalyticsModal(sets) {
  const stats = calculateStats(sets);
  const completion = getSetCompletion(sets);

  const modal = document.createElement('div');
  modal.innerHTML = `
    <div class="analytics-container">
      <!-- Overview Stats -->
      <div class="analytics-section">
        <h3>📊 Gesamt-Übersicht</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${stats.totalCollected}</div>
            <div class="stat-label">Karten gesammelt</div>
            <div class="stat-sub">${stats.totalCards} insgesamt</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.totalPercentage}%</div>
            <div class="stat-label">Gesamtfortschritt</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.totalReverseHolo}</div>
            <div class="stat-label">Reverse Holos</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.missing}</div>
            <div class="stat-label">Fehlende Karten</div>
          </div>
        </div>
      </div>

      <!-- Series Stats -->
      <div class="analytics-section">
        <h3>📚 Nach Serie</h3>
        <div class="series-list">
          ${stats.seriesStats.map(series => `
            <div class="series-item">
              <div class="series-header">
                <span class="series-name">${series.series}</span>
                <span class="series-badge">${series.sets} Set${series.sets !== 1 ? 's' : ''}</span>
              </div>
              <div class="series-progress">
                <span>${series.collected} / ${series.total}</span>
                <div class="progress-bar-mini">
                  <div class="progress-fill-mini" style="width: ${series.percentage}%"></div>
                </div>
                <span>${series.percentage}%</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Set Ranking -->
      <div class="analytics-section">
        <h3>🏆 Set-Fortschritt (Top 10)</h3>
        <div class="ranking-list">
          ${completion.slice(0, 10).map((set, idx) => `
            <div class="ranking-item">
              <span class="rank">#${idx + 1}</span>
              <span class="set-name">${set.name}</span>
              <span class="rank-badge ${set.percentage === 100 ? 'complete' : ''}">${set.percentage}%</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Charts -->
      <div class="analytics-section">
        <h3>📈 Visualisierung</h3>
        <div class="chart-container">
          <canvas id="completion-chart"></canvas>
        </div>
      </div>
    </div>
  `;

  return modal;
}

/**
 * Format stats for export
 */
export function exportStats(sets) {
  const stats = calculateStats(sets);
  
  return {
    summary: {
      totalCards: stats.totalCards,
      totalCollected: stats.totalCollected,
      percentage: stats.totalPercentage + '%',
      sets: sets.length,
      series: stats.seriesCount,
      exportDate: new Date().toISOString()
    },
    bySeries: stats.seriesStats,
    bySet: sets.map(set => {
      const progress = set.getProgress();
      return {
        id: set.id,
        name: set.name,
        series: set.series,
        total: progress.total,
        collected: progress.collected,
        percentage: progress.percentage + '%'
      };
    })
  };
}

/**
 * Get completion metrics
 */
export function getMetrics(sets) {
  const stats = calculateStats(sets);
  const completion = getSetCompletion(sets);

  const fullySets = completion.filter(s => s.percentage === 100).length;
  const partialSets = completion.filter(s => s.percentage > 0 && s.percentage < 100).length;
  const emptySets = completion.filter(s => s.percentage === 0).length;

  return {
    stats,
    completion,
    fullySets,
    partialSets,
    emptySets,
    averagePercentage: Math.round(completion.reduce((sum, s) => sum + s.percentage, 0) / completion.length) || 0
  };
}
