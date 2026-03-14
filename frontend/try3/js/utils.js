/**
 * Utility Functions & Helpers
 */

/**
 * Format number with separator (1000 → 1.000)
 */
export function formatNumber(num, locale = 'de-DE') {
  return num.toLocaleString(locale);
}

/**
 * Format percentage (0.75 → 75%)
 */
export function formatPercentage(value, decimals = 0) {
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(num)) return '0%';
  return `${num.toFixed(decimals)}%`;
}

/**
 * Format date (ISO → 01.02.2026)
 */
export function formatDate(dateString, locale = 'de-DE') {
  if (!dateString) return '-';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(locale);
  } catch {
    return dateString;
  }
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Throttle function
 */
export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * Sort array with natural sort
 */
export function naturalSort(arr, key, order = 'asc') {
  const sorted = [...arr];
  const multiplier = order === 'desc' ? -1 : 1;

  sorted.sort((a, b) => {
    const aValue = key ? a[key] : a;
    const bValue = key ? b[key] : b;

    const aStr = String(aValue).toLowerCase();
    const bStr = String(bValue).toLowerCase();

    return aStr.localeCompare(bStr, 'de', { numeric: true, sensitivity: 'base' }) * multiplier;
  });

  return sorted;
}

/**
 * Calculate completion percentage
 */
export function getCompletionPercentage(collected, total) {
  if (total === 0) return 0;
  return Math.round((collected / total) * 100);
}

/**
 * Generate CSV from data
 */
export function generateCSV(data, headers) {
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => {
      const value = row[h];
      // Escape CSV values
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(','))
  ].join('\n');

  return csv;
}

/**
 * Download file
 */
export function downloadFile(content, filename, mimeType = 'text/plain') {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

/**
 * Copy to clipboard
 */
export async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    }
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Get URL parameters
 */
export function getURLParams() {
  const params = {};
  const searchParams = new URLSearchParams(window.location.search);
  for (const [key, value] of searchParams) {
    params[key] = value;
  }
  return params;
}

/**
 * Update URL parameters
 */
export function updateURLParams(params) {
  const current = new URLSearchParams(window.location.search);
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      current.delete(key);
    } else {
      current.set(key, value);
    }
  });

  const newUrl = window.location.pathname + (current.toString() ? '?' + current.toString() : '');
  window.history.replaceState({}, '', newUrl);
}

/**
 * Validate email
 */
export function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

/**
 * Get browser info
 */
export function getBrowserInfo() {
  const ua = navigator.userAgent;
  const isChrome = /Chrome/.test(ua);
  const isFirefox = /Firefox/.test(ua);
  const isSafari = /Safari/.test(ua) && !isChrome;
  const isEdge = /Edg/.test(ua);

  return {
    isChrome,
    isFirefox,
    isSafari,
    isEdge,
    userAgent: ua
  };
}

/**
 * Check if online
 */
export function isOnline() {
  return navigator.onLine;
}

/**
 * Group array by key
 */
export function groupBy(arr, key) {
  return arr.reduce((result, item) => {
    const group = item[key];
    if (!result[group]) {
      result[group] = [];
    }
    result[group].push(item);
    return result;
  }, {});
}

/**
 * Unique array items
 */
export function unique(arr, key) {
  if (!key) return [...new Set(arr)];
  
  const seen = new Set();
  return arr.filter(item => {
    const value = item[key];
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

/**
 * Deep clone object
 */
export function deepClone(obj) {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (error) {
    console.error('Error cloning object:', error);
    return obj;
  }
}

/**
 * Merge objects deeply
 */
export function deepMerge(target, source) {
  const result = { ...target };

  Object.keys(source).forEach(key => {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  });

  return result;
}

/**
 * Retry async function with exponential backoff
 */
export async function retry(fn, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
}

/**
 * Timeout wrapper
 */
export function withTimeout(promise, ms = 5000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms)
    )
  ]);
}
