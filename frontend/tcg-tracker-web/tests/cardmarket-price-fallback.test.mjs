import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyCardmarketPriceSummary,
  buildCardmarketLinkPresentation,
  CARDMARKET_BASE_PRICE_DEFAULT,
  getCardmarketPriceDetails,
  getCardmarketPrimaryCandidates,
  hasReliableHoloPrices,
  normalizeCardmarketBasePriceType,
  renderLightboxCardmarketPrices,
} from '../js/ui/cardmarket-price.js';

// Minimal-DOM-Polyfill fuer Tests, die `document.createElement` brauchen.
// Der echte Lightbox-Renderer erzeugt section/h4/div/span/strong-Elemente;
// fuer die Assertion reicht es, Klassen + textContent + Hierarchie
// abzubilden.
if (typeof globalThis.document === 'undefined') {
  const makeNode = (tag) => {
    const node = {
      tagName: tag.toUpperCase(),
      className: '',
      _textContent: '',
      children: [],
      appendChild(child) { this.children.push(child); return child; },
      append(...kids) { kids.forEach((k) => this.appendChild(k)); },
      querySelector(selector) {
        const tag = String(selector).toLowerCase();
        const stack = [...this.children];
        while (stack.length) {
          const cur = stack.shift();
          if (cur.tagName === tag.toUpperCase()) return cur;
          stack.push(...cur.children);
        }
        return null;
      },
    };
    Object.defineProperty(node, 'textContent', {
      get() {
        const own = this._textContent || '';
        return own + this.children.map((c) => c.textContent || '').join('');
      },
      set(v) { this._textContent = v; }
    });
    return node;
  };
  globalThis.document = {
    createElement(tag) { return makeNode(tag); }
  };
}

const makeEntry = (prices) => ({
  entry: {
    productId: 123,
    name: 'Test Card',
    expansionId: 999,
    prices,
    url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Test/Test-Card',
  },
  url: 'https://www.cardmarket.com/en/Pokemon/Products/Singles/Test/Test-Card',
});

const createDom = () => {
  const grid = {
    children: [],
    innerHTML: '',
    appendChild(node) { this.children.push(node); },
  };
  return {
    priceMode: { textContent: '' },
    priceGrid: grid,
    _grid: grid,
  };
};

test('hasReliableHoloPrices returns true when avgHolo is a finite positive number', () => {
  assert.equal(hasReliableHoloPrices({ avgHolo: 1.5 }), true);
  assert.equal(hasReliableHoloPrices({ avgHolo: 0.5, averageHolo: null }), true);
});

test('hasReliableHoloPrices returns true when only the averageHolo alias is set', () => {
  assert.equal(hasReliableHoloPrices({ averageHolo: 2.0 }), true);
});

test('hasReliableHoloPrices returns false when avgHolo and averageHolo are both null/0', () => {
  assert.equal(hasReliableHoloPrices({ avgHolo: null, averageHolo: null }), false);
  assert.equal(hasReliableHoloPrices({}), false);
  assert.equal(hasReliableHoloPrices({ avgHolo: 0 }), false);
  assert.equal(hasReliableHoloPrices({ avgHolo: null, trendHolo: 5.0, avg1Holo: 0.2 }), false);
});

test('getCardmarketPriceDetails returns an empty list for reverseHolo when no reliable holo data exists', () => {
  // Karten ohne eigene Holo-Variante (avgHolo == null) sollen im
  // Tooltip/Title keine "Reverse Holo: ..."-Zeile mit Werten einer
  // anderen Variante anzeigen.
  const prices = {
    trend: 2.1,
    average: 2.2,
    avgHolo: null,
    trendHolo: 7.5,
    avg1Holo: 0.2,
    lowHolo: 0.24,
  };
  assert.deepEqual(getCardmarketPriceDetails(prices, { reverseHolo: true }), []);
  // Die normalen Preise muessen weiterhin verfuegbar sein.
  const normal = getCardmarketPriceDetails(prices, { reverseHolo: false });
  assert.ok(normal.length > 0);
  assert.ok(normal.some((line) => line.startsWith('Trend:')));
});

test('getCardmarketPriceDetails still shows holo rows when avgHolo is set', () => {
  const prices = {
    trend: 2.1,
    average: 2.2,
    avgHolo: 6.2,
    trendHolo: 7.5,
  };
  const reverse = getCardmarketPriceDetails(prices, { reverseHolo: true });
  assert.ok(reverse.length > 0, 'expected at least one reverse-holo detail line');
  assert.ok(reverse.some((line) => line.includes('6,20') || line.includes('6.20')));
});

test('buildCardmarketLinkPresentation falls back to normal prices when avgHolo is null', () => {
  const prices = {
    trend: 2.1,
    average: 2.2,
    avgHolo: null,
    trendHolo: 7.5,
    avg1Holo: 0.2,
    lowHolo: 0.24,
  };
  const summary = makeEntry(prices);

  // Trotz preferReverseHolo: true muss der Label-Preis aus den normalen
  // Feldern stammen (2,10 €), nicht aus dem (unzuverlaessigen) Holo-Feld.
  const presentation = buildCardmarketLinkPresentation(summary, { preferReverseHolo: true });
  assert.ok(presentation, 'expected a presentation');
  assert.match(presentation.label, /2,10/);
  assert.ok(!presentation.label.includes('7,50'));

  // Der Title darf keinen "Reverse Holo:"-Block enthalten, der Werte
  // einer anderen Variante zitiert.
  assert.ok(
    !presentation.title.includes('Reverse Holo:'),
    `title still contained "Reverse Holo:" block: ${presentation.title}`
  );
  // Der activeMode muss auf "Normal" stehen, weil wir auf die normale
  // Variante zurueckgefallen sind.
  assert.match(presentation.title, /Cardmarket \(Normal\)/);
});

test('buildCardmarketLinkPresentation keeps reverse-holo prices when avgHolo is set', () => {
  const prices = {
    trend: 2.1,
    averageHolo: 7.3,
  };
  const summary = makeEntry(prices);

  const presentation = buildCardmarketLinkPresentation(summary, { preferReverseHolo: true });
  assert.ok(presentation);
  assert.match(presentation.label, /7,30/);
  assert.match(presentation.title, /Cardmarket \(Reverse Holo\)/);
  assert.ok(presentation.title.includes('Reverse Holo:'));
});

test('buildCardmarketLinkPresentation respects basePriceType to pick the primary key first', () => {
  // Mit `basePriceType: 'average7'` wird `average7Holo` zuerst probiert;
  // nur wenn der nichts liefert, faellt der Picker auf den Rest der Liste
  // zurueck (trendHolo, avgHolo, ...).
  const prices = {
    trend: 2.1,
    average7: 3.7,
    avgHolo: 7.0,
    trendHolo: 7.5,
    average7Holo: 8.4,
  };
  const summary = makeEntry(prices);

  const avg7Holo = buildCardmarketLinkPresentation(summary, {
    preferReverseHolo: true,
    basePriceType: 'average7'
  });
  assert.match(avg7Holo.label, /8,40/);

  // Mit basePriceType 'trend' (Default) wird trendHolo zuerst genommen.
  const trendHolo = buildCardmarketLinkPresentation(summary, {
    preferReverseHolo: true,
    basePriceType: 'trend'
  });
  assert.match(trendHolo.label, /7,50/);
});

test('normalizeCardmarketBasePriceType returns default for unknown values', () => {
  assert.equal(normalizeCardmarketBasePriceType('average7'), 'average7');
  assert.equal(normalizeCardmarketBasePriceType('  TREND  '), 'trend');
  assert.equal(normalizeCardmarketBasePriceType('not-a-thing'), CARDMARKET_BASE_PRICE_DEFAULT);
  assert.equal(normalizeCardmarketBasePriceType(null), CARDMARKET_BASE_PRICE_DEFAULT);
  assert.equal(normalizeCardmarketBasePriceType(undefined), CARDMARKET_BASE_PRICE_DEFAULT);
});

test('getCardmarketPrimaryCandidates deduplicates and orders by basePriceType', () => {
  const trend = getCardmarketPrimaryCandidates({ reverseHolo: false, basePriceType: 'trend' });
  assert.deepEqual(trend[0], [['trend'], 'Trend']);

  // Bei `basePriceType: 'average'` wird der Primary-Schluessel
  // ['average', 'avg'] zuerst gelistet - der Trend-Fallback kommt danach.
  const average = getCardmarketPrimaryCandidates({ reverseHolo: false, basePriceType: 'average' });
  assert.deepEqual(average[0], [['average', 'avg'], 'Ø']);
  assert.ok(average.length > 1);
  // Kein Duplikat: ['average', 'avg'] darf nicht zweimal vorkommen.
  const signatures = average.map(([keys]) => keys.join('|'));
  assert.equal(new Set(signatures).size, signatures.length);

  const reverse = getCardmarketPrimaryCandidates({ reverseHolo: true, basePriceType: 'low' });
  assert.deepEqual(reverse[0], [['lowHolo'], 'RH Low']);
});

test('renderLightboxCardmarketPrices is a no-op when targets are missing', () => {
  // Fehlende DOM-Targets fuehren zu einem stillen Abbruch, damit der Caller
  // keine Null-Checks machen muss.
  renderLightboxCardmarketPrices(null, { entry: { prices: {} } });
  renderLightboxCardmarketPrices({ priceMode: null, priceGrid: null }, { entry: { prices: {} } });
});

test('renderLightboxCardmarketPrices shows loading state when summary is null', () => {
  const dom = createDom();
  renderLightboxCardmarketPrices(dom, null, { preferReverseHolo: false });
  assert.equal(dom.priceMode.textContent, 'Normal aktiv');
  assert.equal(dom._grid.children.length, 1);
  assert.equal(dom._grid.children[0].className, 'lightbox-price-loading');
  assert.match(dom._grid.children[0].textContent, /Preise werden geladen/);
});

test('renderLightboxCardmarketPrices shows empty state when prices are missing', () => {
  const dom = createDom();
  renderLightboxCardmarketPrices(dom, { entry: { prices: null } }, { preferReverseHolo: true });
  assert.equal(dom.priceMode.textContent, 'Reverse Holo aktiv');
  assert.equal(dom._grid.children.length, 1);
  assert.equal(dom._grid.children[0].className, 'lightbox-price-empty');
});

test('renderLightboxCardmarketPrices fills the RH column with normal prices when avgHolo is null', () => {
  // Die "Reverse Holo"-Spalte muss bei Karten ohne eigene Holo-Variante
  // die normalen Kartenpreise zeigen - inkl. der gewoehnlichen Labels.
  const dom = createDom();
  const prices = {
    trend: 0.16,
    average: 0.16,
    avg1: 0.12,
    avg7: 0.15,
    avg30: 0.14,
    low: 0.02,
    avgHolo: null,
    trendHolo: 0.59,
    avg1Holo: 0.1,
    lowHolo: 0.14
  };
  renderLightboxCardmarketPrices(dom, { entry: { prices } }, { preferReverseHolo: true });

  assert.equal(dom.priceMode.textContent, 'Reverse Holo aktiv');
  const groups = dom._grid.children;
  assert.equal(groups.length, 2, 'expected exactly two price groups');

  const rhGroup = groups.find((g) => g.querySelector('h4')?.textContent === 'Reverse Holo');
  assert.ok(rhGroup, 'expected a Reverse Holo group');
  // Die RH-Spalte darf NICHT die trendHolo/averageHolo-Werte einer anderen
  // Variante zitieren - sie muss die normalen Kartenpreise zeigen.
  const rhText = rhGroup.textContent;
  assert.match(rhText, /0,16/, 'expected normal trend value in RH column');
  assert.ok(!rhText.includes('0,59'), 'RH column should not contain holo value 0,59');
  assert.ok(!rhText.includes('avg1Holo') && !rhText.includes('trendHolo'));
});

test('renderLightboxCardmarketPrices fills the RH column with holo prices when avgHolo is set', () => {
  const dom = createDom();
  const prices = {
    trend: 2.1,
    average: 2.2,
    avgHolo: 6.2,
    trendHolo: 7.5
  };
  renderLightboxCardmarketPrices(dom, { entry: { prices } }, { preferReverseHolo: true });

  const rhGroup = dom._grid.children.find((g) => g.querySelector('h4')?.textContent === 'Reverse Holo');
  assert.ok(rhGroup);
  assert.match(rhGroup.textContent, /7,50/);
});

test('applyCardmarketPriceSummary updates linkEl with presentation data', () => {
  const linkEl = {
    href: '',
    title: '',
    textContent: '',
    classList: { _classes: new Set(), toggle(c, on) { on ? this._classes.add(c) : this._classes.delete(c); } },
    dataset: {}
  };
  const summary = makeEntry({
    trend: 2.1,
    averageHolo: 7.3,
  });

  applyCardmarketPriceSummary(linkEl, summary, { preferReverseHolo: true });

  assert.match(linkEl.title, /Cardmarket \(Reverse Holo\)/);
  assert.match(linkEl.textContent, /7,30/);
  assert.match(linkEl.textContent, /^Cardmarket - /);
  assert.ok(linkEl.href.includes('isReverseHolo=Y'));
});

test('applyCardmarketPriceSummary honors labelPrefix and labelSeparator for set-view style', () => {
  const linkEl = {
    href: '',
    title: '',
    textContent: '',
    classList: { _classes: new Set(), toggle(c, on) { on ? this._classes.add(c) : this._classes.delete(c); } },
    dataset: {}
  };
  const summary = makeEntry({ trend: 2.1, averageHolo: 7.3 });

  applyCardmarketPriceSummary(linkEl, summary, {
    preferReverseHolo: true,
    labelPrefix: '🛒 ',
    labelSeparator: ' · '
  });

  // Mit basePriceType: 'trend' (default) startet die RH-Candidate-Liste
  // mit `trendHolo`. Da `trendHolo` im Fixture fehlt, faellt der Picker
  // auf den naechsten Eintrag (averageHolo, gelabelt "RH Ø") zurueck.
  assert.equal(linkEl.textContent, '🛒 Cardmarket · RH Ø 7,30 €',
    `unexpected label: ${linkEl.textContent}`);
});

test('applyCardmarketPriceSummary emits no label when presentation is null', () => {
  const linkEl = {
    href: 'stale',
    title: 'stale',
    textContent: 'stale',
    classList: { _classes: new Set(), toggle() {} },
    dataset: {}
  };
  applyCardmarketPriceSummary(linkEl, null, { preferReverseHolo: true });
  assert.equal(linkEl.textContent, 'stale');
  assert.equal(linkEl.href, 'stale');
});

