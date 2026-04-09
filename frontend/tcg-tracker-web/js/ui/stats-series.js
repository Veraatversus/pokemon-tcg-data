import { resolveSeriesGroupInfo } from '../data/schema-contract.js';

export function getStatsSeriesLabel(seriesKey = '', group = {}) {
  const label = String(group?.label || group?.canonicalName || '').trim();
  if (label) return label;
  const fallback = String(seriesKey || '').trim();
  return fallback || 'Andere';
}

export function filterSetsBySeriesKey(sets = [], seriesKey = '') {
  const normalizedKey = String(seriesKey || '').trim().toLowerCase();
  if (!normalizedKey) return [];

  return (sets || []).filter((set) => {
    const info = resolveSeriesGroupInfo(set || {});
    return String(info?.key || '').trim().toLowerCase() === normalizedKey;
  });
}
