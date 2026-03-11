// ══════════════════════════════════════════════════════════════════════════
// ML-INSPIRED RECOMMENDATION ENGINE (leichtgewichtig, lokal, offline-fähig)
// ══════════════════════════════════════════════════════════════════════════

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function normalize(value, max) {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return clamp(value / max, 0, 1);
}

function detectSeriesTrend(summaryRows = [], allSets = []) {
  const seriesStats = new Map();

  for (const row of summaryRows) {
    const set = allSets.find((s) => s.setName === row.setName || s.setId === row.setId);
    const series = set?.series || 'Andere';
    const bucket = seriesStats.get(series) || { total: 0, collected: 0, count: 0 };
    bucket.total += Number(row.total || 0);
    bucket.collected += Number(row.collected || 0);
    bucket.count += 1;
    seriesStats.set(series, bucket);
  }

  const output = new Map();
  for (const [series, stat] of seriesStats.entries()) {
    const ratio = stat.total > 0 ? stat.collected / stat.total : 0;
    output.set(series, ratio);
  }
  return output;
}

export function trainSetRecommendationModel(summaryRows = [], allSets = []) {
  const seriesTrend = detectSeriesTrend(summaryRows, allSets);
  const maxTotalCards = Math.max(1, ...allSets.map((s) => Number(s.totalCards || 0)));

  const completionRatios = summaryRows
    .map((row) => {
      const total = Number(row.total || 0);
      const collected = Number(row.collected || 0);
      return total > 0 ? collected / total : 0;
    })
    .filter((v) => Number.isFinite(v));

  const avgCompletion = completionRatios.length
    ? completionRatios.reduce((sum, value) => sum + value, 0) / completionRatios.length
    : 0;

  return {
    version: 1,
    trainedAt: new Date().toISOString(),
    avgCompletion,
    seriesTrend,
    maxTotalCards,
    weights: {
      finishability: avgCompletion < 0.5 ? 0.38 : 0.30,
      seriesAffinity: 0.24,
      holoPotential: 0.18,
      sizePenalty: 0.12,
      freshness: 0.08
    }
  };
}

export function generateMLSetRecommendations(summaryRows = [], allSets = [], topN = 6) {
  if (!Array.isArray(allSets) || allSets.length === 0) return [];

  const model = trainSetRecommendationModel(summaryRows, allSets);
  const summaryMap = new Map();

  for (const row of summaryRows || []) {
    summaryMap.set(row.setName, row);
    if (row.setId) summaryMap.set(row.setId, row);
  }

  const currentYear = new Date().getFullYear();

  const scored = allSets
    .filter((set) => set?.imported)
    .map((set) => {
      const row = summaryMap.get(set.setName) || summaryMap.get(set.setId) || {};
      const total = Number(row.total || set.totalCards || 0);
      const collected = Number(row.collected || 0);
      const rh = Number(row.rh || 0);
      const completion = total > 0 ? clamp(collected / total) : 0;

      const remaining = Math.max(0, total - collected);
      const finishability = total > 0 ? clamp(1 - (remaining / Math.max(total, 1))) : 0;
      const seriesAffinity = model.seriesTrend.get(set.series || 'Andere') || 0;
      const holoPotential = total > 0 ? clamp(rh / total) : 0;
      const sizePenalty = normalize(Number(set.totalCards || total || 0), model.maxTotalCards);

      const releaseYear = Number(String(set.releaseDate || '').slice(0, 4));
      const ageYears = Number.isFinite(releaseYear) && releaseYear > 0 ? Math.max(0, currentYear - releaseYear) : 10;
      const freshness = clamp(1 - normalize(ageYears, 25));

      const w = model.weights;
      const score =
        (finishability * w.finishability) +
        (seriesAffinity * w.seriesAffinity) +
        (holoPotential * w.holoPotential) +
        (freshness * w.freshness) -
        (sizePenalty * w.sizePenalty);

      const reasons = [];
      if (remaining <= 12 && total > 0) reasons.push(`Nur ${remaining} Karten bis Vollsatz`);
      if (seriesAffinity >= 0.5) reasons.push(`Starke Performance in Serie „${set.series || 'Andere'}“`);
      if (holoPotential >= 0.18) reasons.push('Überdurchschnittlicher Holo-Anteil');
      if (freshness >= 0.7) reasons.push('Relativ modernes Set');
      if (reasons.length === 0) reasons.push('Ausgeglichene Empfehlung auf Basis deiner Sammlung');

      return {
        setId: set.setId,
        setName: set.setName,
        series: set.series || 'Andere',
        total,
        collected,
        completion: Math.round(completion * 100),
        score: Number(score.toFixed(4)),
        confidence: Math.round(clamp(score) * 100),
        reasons: reasons.slice(0, 2)
      };
    })
    .filter((item) => item.total > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return scored;
}

export function summarizeMLRecommendations(recommendations = []) {
  if (!recommendations.length) {
    return {
      headline: 'Keine ML-Empfehlungen verfügbar',
      topConfidence: 0,
      averageCompletion: 0
    };
  }

  const topConfidence = Math.max(...recommendations.map((item) => item.confidence || 0));
  const averageCompletion = Math.round(
    recommendations.reduce((sum, item) => sum + (item.completion || 0), 0) / recommendations.length
  );

  return {
    headline: `Top ${recommendations.length} Set-Empfehlungen`,
    topConfidence,
    averageCompletion
  };
}
