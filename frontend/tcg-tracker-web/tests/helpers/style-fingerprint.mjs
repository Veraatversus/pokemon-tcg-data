// Stil-Fingerabdruck: computed styles aller sichtbaren Elemente als stabile, vergleichbare Struktur.
// Single Source of Truth ist STYLE_FINGERPRINT_SNIPPET (auch im angemeldeten Chrome per javascript_tool nutzbar).

export const FINGERPRINT_PROPERTIES = [
  'display', 'position', 'top', 'left', 'width', 'height', 'margin', 'padding',
  'color', 'background-color', 'font-size', 'font-weight', 'line-height',
  'border', 'border-radius', 'gap', 'grid-template-columns', 'flex-direction',
  'opacity', 'visibility', 'z-index', 'transform', 'box-shadow',
];

// Selbstenthaltender Ausdruck: in einer Seite ausgewertet liefert er Array<{ path, styles }>.
// Transitions/Animationen werden nur waehrend der Messung abgeschaltet und danach wieder entfernt.
export const STYLE_FINGERPRINT_SNIPPET = `(() => {
  const props = ${JSON.stringify(FINGERPRINT_PROPERTIES)};
  const skip = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'HEAD', 'NOSCRIPT', 'TEMPLATE', 'BR']);
  const noMotion = document.createElement('style');
  noMotion.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}';
  document.head.appendChild(noMotion);
  try {
    const segment = (el) => {
      let seg = el.tagName.toLowerCase();
      if (el.id) seg += '#' + el.id;
      const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter(Boolean) : [];
      if (cls.length) seg += '.' + cls.join('.');
      const parent = el.parentElement;
      if (parent) {
        const same = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
        if (same.length > 1) seg += ':nth-of-type(' + (same.indexOf(el) + 1) + ')';
      }
      return seg;
    };
    const pathOf = (el) => {
      const parts = [];
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) parts.unshift(segment(n));
      return parts.join(' > ');
    };
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (skip.has(el.tagName)) continue;
      if (el.parentElement && el.parentElement.closest('svg')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.display === 'contents') continue;
      const r = el.getBoundingClientRect();
      if (!(r.width > 0 || r.height > 0)) continue;
      const styles = {};
      for (const p of props) styles[p] = cs.getPropertyValue(p);
      out.push({ path: pathOf(el), styles });
    }
    return out;
  } finally {
    noMotion.remove();
  }
})()`;

export async function collectStyleFingerprint(page) {
  return page.evaluate(STYLE_FINGERPRINT_SNIPPET);
}

// Vergleicht zwei Fingerabdruecke. Doppelte Pfade werden per Vorkommen-Index unterschieden.
export function compareFingerprints(a, b) {
  const index = (list) => {
    const map = new Map();
    const seen = new Map();
    for (const entry of list) {
      const n = (seen.get(entry.path) || 0) + 1;
      seen.set(entry.path, n);
      map.set(n > 1 ? `${entry.path} [#${n}]` : entry.path, entry.styles);
    }
    return map;
  };
  const ma = index(a);
  const mb = index(b);
  const diffs = [];
  for (const [path, sa] of ma) {
    if (!mb.has(path)) { diffs.push({ path, kind: 'nur in A' }); continue; }
    const sb = mb.get(path);
    for (const prop of new Set([...Object.keys(sa), ...Object.keys(sb)])) {
      if (sa[prop] !== sb[prop]) diffs.push({ path, kind: 'property', prop, a: sa[prop], b: sb[prop] });
    }
  }
  for (const path of mb.keys()) if (!ma.has(path)) diffs.push({ path, kind: 'nur in B' });
  return diffs;
}
