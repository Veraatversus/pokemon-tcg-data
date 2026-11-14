// Statistik-Ansicht: Sammlungs-Kennzahlen, Serienvergleich, Charts und Serien-Drilldown.
// Der Preis-Tab liegt in ./stats-price.js.
import { filterSetsBySeriesKey, getStatsSeriesLabel } from '../ui/stats-series.js?v=20261114-clean-1';
import { dom } from '../app/dom.js';
import { state } from '../app/state.js';
import { readVisibleSummary, getSetSeriesGroupInfo } from './dashboard.js';
import { renderStatsPriceLoading, renderStatsPriceError, loadStatsPriceAnalyticsLazy } from './stats-price.js';

export async function renderStats() {
  dom.statsContent.innerHTML = '<p class="loading-placeholder">Lade Statistiken\u2026</p>';
  try {
    if (!state.summaryData) {
      state.summaryData = await readVisibleSummary().catch((err) => {
        console.warn('[renderStats] readSummarySheet error:', err.message);
        return [];
      });
    }
    const data = Array.isArray(state.summaryData) ? state.summaryData : [];

    let totalCards = 0, totalCollected = 0, totalRh = 0, completedSets = 0;
    data.forEach((row) => {
      totalCards     += row.total     || 0;
      totalCollected += row.collected || 0;
      totalRh        += row.rh        || 0;
      if ((row.collected || 0) >= (row.total || 1) && row.total > 0) completedSets++;
    });
    const overallPct = totalCards > 0 ? Math.round((totalCollected / totalCards) * 100) : 0;
    const formatNumber = (value) => Number(value || 0).toLocaleString('de-DE');
    const getSetPct = (row) => {
      const total = Number(row?.total || 0);
      const collected = Number(row?.collected || 0);
      return total > 0 ? Math.round((collected / total) * 100) : 0;
    };
    const summaryByName = new Map(data.map((row) => [row.setName, row]));
    const missingCards = Math.max(0, totalCards - totalCollected);
    const averageSetCompletion = data.length
      ? Math.round(data.reduce((sum, row) => sum + getSetPct(row), 0) / data.length)
      : 0;
    const activeSets = data.filter((row) => Number(row?.collected || 0) > 0).length;
    const rhCoverage = totalCards > 0 ? Math.round((totalRh / totalCards) * 100) : 0;
    const nextMilestone = [80, 85, 90, 95, 100].find((value) => value > overallPct) || null;
    const cardsToNextMilestone = nextMilestone
      ? Math.max(0, Math.ceil((nextMilestone / 100) * totalCards) - totalCollected)
      : 0;
    const collectionPhase = overallPct >= 90
      ? '🔥 Endspurt'
      : overallPct >= 75
        ? '🚀 Sehr starker Ausbau'
        : overallPct >= 50
          ? '📈 Spürbarer Fortschritt'
          : '🌱 Aufbauphase';

    // Serien-Breakdown
    const seriesMap = new Map();
    (state.sets || []).forEach((set) => {
      const row = summaryByName.get(set.setName);
      const groupInfo = getSetSeriesGroupInfo(set);
      if (!seriesMap.has(groupInfo.key)) {
        seriesMap.set(groupInfo.key, {
          label: groupInfo.label || 'Andere',
          total: 0,
          collected: 0,
          rh: 0,
          count: 0,
          completed: 0
        });
      }
      const sg = seriesMap.get(groupInfo.key);
      sg.total += row?.total || 0;
      sg.collected += row?.collected || 0;
      sg.rh += row?.rh || 0;
      sg.count++;
      if ((row?.collected || 0) >= (row?.total || 1) && row?.total > 0) sg.completed++;
    });

    const sorted = [...data]
      .filter((row) => Number(row?.total || 0) > 0)
      .sort((a, b) => getSetPct(b) - getSetPct(a));
    const top5Done = sorted.slice(0, 5);
    const top5Missing = [...data]
      .filter((row) => Number(row?.total || 0) > 0 && Number(row?.collected || 0) < Number(row?.total || 0))
      .sort((a, b) => (Number(b.total || 0) - Number(b.collected || 0)) - (Number(a.total || 0) - Number(a.collected || 0)))
      .slice(0, 5);
    const nextSetTargets = [...data]
      .filter((row) => Number(row?.total || 0) > 0 && Number(row?.collected || 0) > 0 && Number(row?.collected || 0) < Number(row?.total || 0))
      .sort((a, b) => {
        const missingDiff = (Number(a.total || 0) - Number(a.collected || 0)) - (Number(b.total || 0) - Number(b.collected || 0));
        if (missingDiff !== 0) return missingDiff;
        return getSetPct(b) - getSetPct(a);
      })
      .slice(0, 3);

    const leadingSet = top5Done[0] || null;
    const topSeriesEntry = [...seriesMap.entries()]
      .filter(([, group]) => Number(group?.total || 0) > 0)
      .sort((a, b) => {
        const pctDiff = (b[1].collected / Math.max(1, b[1].total)) - (a[1].collected / Math.max(1, a[1].total));
        if (pctDiff !== 0) return pctDiff;
        return Number(b[1].collected || 0) - Number(a[1].collected || 0);
      })[0] || null;
    const largestSeriesEntry = [...seriesMap.entries()]
      .filter(([, group]) => Number(group?.total || 0) > 0)
      .sort((a, b) => Number(b[1].collected || 0) - Number(a[1].collected || 0))[0] || null;

    const seriesRows = Array.from(seriesMap.entries())
      .filter(([, group]) => Number(group?.total || 0) > 0)
      .sort((a, b) => {
        const pctDiff = Math.round((b[1].collected / Math.max(1, b[1].total)) * 100) - Math.round((a[1].collected / Math.max(1, a[1].total)) * 100);
        if (pctDiff !== 0) return pctDiff;
        return Number(b[1].collected || 0) - Number(a[1].collected || 0);
      })
      .map(([key, group]) => {
        const pct = group.total > 0 ? Math.round((group.collected / group.total) * 100) : 0;
        const label = getStatsSeriesLabel(key, group);
        const safeKey = String(key).replace(/"/g, '&quot;');
        const safeLabel = String(label).replace(/"/g, '&quot;');
        return `
          <div class="stats-series-row" data-series="${safeKey}" data-series-label="${safeLabel}">
            <div class="stats-series-name-wrap">
              <div class="stats-series-name">${label}</div>
              <div class="stats-series-meta">${group.completed}/${group.count} Sets komplett</div>
            </div>
            <div class="stats-series-bar"><div class="dash-progress-fill" style="width:${pct}%"></div></div>
            <div class="stats-series-numbers"><strong>${pct}%</strong><span>${formatNumber(group.collected)}/${formatNumber(group.total)}</span></div>
          </div>`;
      }).join('');

    dom.statsContent.innerHTML = `
      <section class="stats-hero" style="--stats-progress:${overallPct};">
        <div class="stats-hero-copy">
          <span class="stats-eyebrow">SAMMLUNGSPULS</span>
          <span class="stats-hero-badge">${collectionPhase}</span>
          <h3>Deine Collection wirkt jetzt wie ein echtes Langzeitprojekt - <strong>${formatNumber(totalCollected)}</strong> von <strong>${formatNumber(totalCards)}</strong> Karten sind bereits gesichert.</h3>
          <p>${overallPct}% Gesamtfortschritt, ${completedSets} ${completedSets === 1 ? 'komplettes Set' : 'komplette Sets'}, ${formatNumber(totalRh)} Reverse Holos und ${activeSets} aktive Sets machen aus der Statistik endlich eine richtige Trophäenwand.</p>
          <div class="stats-pill-row">
            <span class="stats-pill primary">${formatNumber(data.length)} importierte Sets</span>
            <span class="stats-pill success">${completedSets} komplett</span>
            <span class="stats-pill">Ø ${averageSetCompletion}% pro Set</span>
            ${nextMilestone ? `<span class="stats-pill warning">Noch ${formatNumber(cardsToNextMilestone)} Karten bis ${nextMilestone}%</span>` : '<span class="stats-pill success">100% erreicht</span>'}
          </div>
        </div>
        <div class="stats-hero-meter">
          <div class="stats-hero-ring">
            <div class="stats-hero-ring-core">
              <strong>${overallPct}%</strong>
              <span>Fortschritt</span>
            </div>
          </div>
          <div class="stats-hero-meter-detail">
            <strong>${formatNumber(missingCards)} Karten fehlen noch</strong>
            <span>${nextMilestone ? `${formatNumber(cardsToNextMilestone)} bis zum nächsten Meilenstein` : 'Die Sammlung ist vollständig.'}</span>
          </div>
        </div>
      </section>

      <div class="stats-overview-cards">
        <article class="stat-card accent">
          <span class="stat-card-value">${formatNumber(totalCards)}</span>
          <span class="stat-card-label">Slots im Tracker</span>
          <span class="stat-card-meta">${seriesMap.size} Serien im Blick</span>
        </article>
        <article class="stat-card collected">
          <span class="stat-card-value">${formatNumber(totalCollected)}</span>
          <span class="stat-card-label">Normals gesammelt</span>
          <span class="stat-card-meta">${overallPct}% der Gesamtmenge</span>
        </article>
        <article class="stat-card reverse">
          <span class="stat-card-value">${formatNumber(totalRh)}</span>
          <span class="stat-card-label">Reverse Holos</span>
          <span class="stat-card-meta">${rhCoverage}% bezogen auf alle Karten</span>
        </article>
        <article class="stat-card success">
          <span class="stat-card-value">${completedSets}</span>
          <span class="stat-card-label">Sets komplett</span>
          <span class="stat-card-meta">${activeSets}/${data.length} Sets mit Fortschritt</span>
        </article>
        <article class="stat-card">
          <span class="stat-card-value">${averageSetCompletion}%</span>
          <span class="stat-card-label">Set-Fortschritt</span>
          <span class="stat-card-meta">${formatNumber(missingCards)} Karten bis 100%</span>
        </article>
        <article class="stat-card">
          <span class="stat-card-value">${activeSets}</span>
          <span class="stat-card-label">Aktive Sets</span>
          <span class="stat-card-meta">${formatNumber(data.length)} importiert</span>
        </article>
      </div>

      <div class="stats-story-grid">
        <section class="stats-spotlight-card">
          <div class="stats-section-kicker">Highlights</div>
          <h3>Was gerade am meisten glänzt</h3>
          <ul class="stats-insight-list">
            <li><span>Bestes Set</span><strong>${leadingSet ? `${leadingSet.setName} - ${getSetPct(leadingSet)}%` : '-'}</strong></li>
            <li><span>Stärkste Serie</span><strong>${topSeriesEntry ? `${getStatsSeriesLabel(topSeriesEntry[0], topSeriesEntry[1])} - ${Math.round((topSeriesEntry[1].collected / Math.max(1, topSeriesEntry[1].total)) * 100)}%` : '-'}</strong></li>
            <li><span>Größter Kartenblock</span><strong>${largestSeriesEntry ? `${getStatsSeriesLabel(largestSeriesEntry[0], largestSeriesEntry[1])} - ${formatNumber(largestSeriesEntry[1].collected)} Karten` : '-'}</strong></li>
          </ul>
        </section>

        <section class="stats-spotlight-card emphasis">
          <div class="stats-section-kicker">Nächste Abschlüsse</div>
          <h3>Diese Sets lohnen sich jetzt besonders</h3>
          <div class="stats-goal-list">
            ${nextSetTargets.length ? nextSetTargets.map((row) => `
              <article class="stats-target-card">
                <div class="stats-target-top">
                  <strong>${row.setName}</strong>
                  <span>${formatNumber((row.total || 0) - (row.collected || 0))} fehlen</span>
                </div>
                <div class="stats-mini-track"><div class="stats-mini-fill" style="width:${getSetPct(row)}%"></div></div>
                <small>${formatNumber(row.collected || 0)}/${formatNumber(row.total || 0)} - ${getSetPct(row)}%</small>
              </article>
            `).join('') : '<p class="stats-empty-note">Sobald ein Set kurz vor dem Abschluss steht, erscheint es hier.</p>'}
          </div>
        </section>

        <section class="stats-spotlight-card">
          <div class="stats-section-kicker">Fokus</div>
          <h3>Was den nächsten Sprung bringt</h3>
          <ul class="stats-insight-list compact">
            <li><span>Bis 100%</span><strong>${formatNumber(missingCards)} Karten</strong></li>
            <li><span>${nextMilestone ? `Bis ${nextMilestone}%` : 'Status'}</span><strong>${nextMilestone ? `${formatNumber(cardsToNextMilestone)} Karten` : 'Meilenstein erreicht'}</strong></li>
            <li><span>Größte Baustelle</span><strong>${top5Missing[0] ? `${top5Missing[0].setName} - ${formatNumber((top5Missing[0].total || 0) - (top5Missing[0].collected || 0))} fehlend` : 'Keine offenen Baustellen'}</strong></li>
          </ul>
        </section>
      </div>

      <section class="stats-series-section">
        <div class="stats-section-head">
          <div>
            <div class="stats-section-kicker">Serienvergleich</div>
            <h3>Wie sich dein Fortschritt verteilt</h3>
          </div>
          <span class="stats-section-note">Klicke eine Reihe für die Set-Details.</span>
        </div>
        <div class="stats-series-table">
          ${seriesRows || '<p class="stats-empty-note">Noch keine Serienstatistiken verfügbar.</p>'}
        </div>
      </section>

      <section id="stats-price-analytics" class="stats-price-panel-shell" data-state="loading" aria-live="polite"></section>

      <div class="stats-charts-row">
        <div class="stats-chart-wrap">
          <div class="stats-section-kicker">Visualisierung</div>
          <h3>Gesamtfortschritt</h3>
          <p>Gesammelt gegen fehlend - als schneller Blick auf den gesamten Binder.</p>
          <canvas id="chart-overall" height="220"></canvas>
        </div>
        <div class="stats-chart-wrap">
          <div class="stats-section-kicker">Visualisierung</div>
          <h3>Top-Serien im Vergleich</h3>
          <p>Die stärksten Reihen nach Abschlussquote auf einen Blick.</p>
          <canvas id="chart-series" height="220"></canvas>
        </div>
      </div>

      <div class="stats-two-col">
        <section class="stats-list-card">
          <div class="stats-section-kicker">Trophy Board</div>
          <h3>Top 5 vollständigste Sets</h3>
          <ol class="stats-top-list">
            ${top5Done.length ? top5Done.map((row) => `
              <li>
                <div class="stats-top-main">
                  <strong>${row.setName}</strong>
                  <span>${getSetPct(row)}%</span>
                </div>
                <small>${formatNumber(row.collected || 0)}/${formatNumber(row.total || 0)} Karten</small>
              </li>
            `).join('') : '<li class="stats-empty-note">Noch keine Sets verfügbar.</li>'}
          </ol>
        </section>
        <section class="stats-list-card">
          <div class="stats-section-kicker">Baustellen</div>
          <h3>Top 5 mit den meisten fehlenden Karten</h3>
          <ol class="stats-top-list">
            ${top5Missing.length ? top5Missing.map((row) => `
              <li>
                <div class="stats-top-main">
                  <strong>${row.setName}</strong>
                  <span>${formatNumber((row.total || 0) - (row.collected || 0))} offen</span>
                </div>
                <small>${formatNumber(row.collected || 0)}/${formatNumber(row.total || 0)} Karten</small>
              </li>
            `).join('') : '<li class="stats-empty-note">Keine offenen Sets mehr.</li>'}
          </ol>
        </section>
      </div>`;

    initStatsCharts(totalCollected, totalCards, seriesMap);
    initStatsDrillDown();
    const statsPriceRequestId = `stats-price-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    renderStatsPriceLoading({ requestId: statsPriceRequestId, loadedCards: 0, totalCards: 0 });
    loadStatsPriceAnalyticsLazy({ requestId: statsPriceRequestId })
      .catch((error) => {
        if (state.statsPrice.requestId !== statsPriceRequestId) return;
        renderStatsPriceError(error?.message || 'Preisanalysen konnten nicht geladen werden.');
      });
  } catch (err) {
    console.error('[renderStats]', err);
    dom.statsContent.innerHTML = `<p class="empty-state">\u2715 Fehler beim Laden der Statistiken</p>`;
  }
}

// --------------------------------------------------------------------------
// FEATURE 2: Charts in Statistiken (Chart.js)
// --------------------------------------------------------------------------
const _statsChartInstances = {};

function initStatsCharts(totalCollected, totalCards, seriesMap) {
  if (!window.Chart) return;

  Object.values(_statsChartInstances).forEach((chartInstance) => {
    try { chartInstance.destroy(); } catch (_) { /* noop */ }
  });

  const textColor = '#94a3b8';
  const gridColor = '#1e293b';

  const ctxOverall = document.getElementById('chart-overall')?.getContext('2d');
  if (ctxOverall) {
    _statsChartInstances.overall = new window.Chart(ctxOverall, {
      type: 'doughnut',
      data: {
        labels: ['Gesammelt', 'Fehlend'],
        datasets: [{
          data: [totalCollected, Math.max(0, totalCards - totalCollected)],
          backgroundColor: ['#22c55e', '#1e293b'],
          borderColor: ['#16a34a', '#334155'],
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        cutout: '68%',
        plugins: {
          legend: { labels: { color: textColor, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.parsed.toLocaleString('de-DE')} Karten`
            }
          }
        }
      }
    });
  }

  const ctxSeries = document.getElementById('chart-series')?.getContext('2d');
  if (ctxSeries) {
    const topSeries = [...seriesMap.entries()]
      .filter(([, group]) => (group.total || 0) > 0)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 8);

    _statsChartInstances.series = new window.Chart(ctxSeries, {
      type: 'bar',
      data: {
        labels: topSeries.map(([key, group]) => {
          const label = getStatsSeriesLabel(key, group);
          return label.length > 16 ? `${label.slice(0, 14)}` : label;
        }),
        datasets: [{
          label: 'Gesammelt %',
          data: topSeries.map(([, group]) => (group.total > 0 ? Math.round((group.collected / group.total) * 100) : 0)),
          backgroundColor: '#0ea5e9',
          borderRadius: 4,
          barThickness: 14
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.parsed.x}%` } }
        },
        scales: {
          x: {
            min: 0,
            max: 100,
            grid: { color: gridColor },
            ticks: { color: textColor, callback: (value) => `${value}%` }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 11 } }
          }
        }
      }
    });
  }
}

// --------------------------------------------------------------------------
// FEATURE 7: Statistiken Drill-Down
// --------------------------------------------------------------------------
// Klick-Handler auf #stats-content nur einmal binden (frueher _featureInitFlags.statsDrilldown in app.js).
let statsDrilldownInitialized = false;

function initStatsDrillDown() {
  const statsContent = document.getElementById('stats-content');
  if (!statsContent || statsDrilldownInitialized) return;
  statsDrilldownInitialized = true;

  statsContent.addEventListener('click', (event) => {
    const row = event.target.closest('.stats-series-row');
    if (!row) return;

    const seriesKey = row.dataset.series || '';
    const seriesLabel = row.dataset.seriesLabel || row.querySelector('.stats-series-name')?.textContent?.trim() || seriesKey;
    if (!seriesKey) return;

    const existing = document.getElementById('stats-drilldown');
    if (existing) {
      const isSameSeries = existing.dataset.series === seriesKey;
      existing.remove();
      document.querySelectorAll('.stats-series-row.expanded').forEach((el) => el.classList.remove('expanded'));
      if (isSameSeries) return;
    }

    const seriesSets = filterSetsBySeriesKey(state.sets || [], seriesKey);
    const summaryRows = state.summaryData || [];

    const panel = document.createElement('div');
    panel.id = 'stats-drilldown';
    panel.className = 'stats-drilldown';
    panel.dataset.series = seriesKey;

    panel.innerHTML = `
      <h4>${seriesLabel} - ${seriesSets.length} Sets</h4>
      <div class="stats-drilldown-grid">
        ${seriesSets.map((set) => {
          const summary = summaryRows.find((entry) => entry.setName === set.setName) || {};
          const total = Number(summary.total || set.totalCards || 0);
          const collected = Number(summary.collected || 0);
          const pct = total > 0 ? Math.round((collected / total) * 100) : 0;
          const missing = total > 0 ? Math.max(0, total - collected) : null;
          const statusClass = pct >= 100 ? 'is-complete' : pct >= 75 ? 'is-close' : '';
          return `
            <div class="stats-drill-set ${statusClass}">
              <div class="stats-drill-set-head">
                <strong>${set.setName}</strong>
                <span class="stats-drill-pct">${pct}%</span>
              </div>
              <div class="mini-bar"><div class="mini-fill" style="width:${pct}%"></div></div>
              <span class="drill-nums">
                <span>${collected}/${total || '?'} Karten</span>
                <span>${missing == null ? 'Gesamt unbekannt' : `${missing} fehlend`}</span>
              </span>
            </div>
          `;
        }).join('')}
      </div>
    `;

    row.classList.add('expanded');
    row.insertAdjacentElement('afterend', panel);
  });
}
