/**
 * Cardmarket UI Module
 * Renders price information and value statistics
 */

class CardmarketUI {
  constructor() {
    this.cardmarket = null;
  }

  /**
   * Inject price display into card element
   */
  injectCardPrice(cardElement, card, price) {
    if (!price || price.error) return;

    // Remove existing price overlay if present
    const existing = cardElement.querySelector('.card-price-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'card-price-overlay';
    overlay.innerHTML = `
      <div class="price-badge">
        <div class="price-value">€${price.price_avg || '—'}</div>
        <div class="price-label">Ø Preis</div>
        ${price.trend ? `<div class="price-trend trend-${price.trend}">↑</div>` : ''}
      </div>
      <div class="availability">
        <span class="available-count">${price.available || 0} verfügbar</span>
      </div>
    `;

    cardElement.appendChild(overlay);
  }

  /**
   * Create collection value panel
   */
  createCollectionValuePanel(collectionValue) {
    const panel = document.createElement('div');
    panel.className = 'collection-value-panel';

    const totalAvg = collectionValue.total_avg || 0;
    const collectedAvg = collectionValue.collected_avg || 0;
    const missingAvg = collectionValue.missing_avg || 0;
    const completionPercent = totalAvg > 0 
      ? parseFloat(((collectedAvg / totalAvg) * 100).toFixed(1)) 
      : 0;

    panel.innerHTML = `
      <div class="value-header">
        <h3>💰 Sammlungswert</h3>
        <button class="refresh-prices-btn" data-action="refresh">🔄 Aktualisieren</button>
      </div>

      <div class="value-grid">
        <div class="value-box">
          <div class="value-label">Gesamt (Ø)</div>
          <div class="value-amount">€${totalAvg.toFixed(2)}</div>
          <div class="value-range">
            € ${(collectionValue.total_low || 0).toFixed(2)} - 
            € ${(collectionValue.total_high || 0).toFixed(2)}
          </div>
        </div>

        <div class="value-box highlight">
          <div class="value-label">Gesammelt</div>
          <div class="value-amount">€${collectedAvg.toFixed(2)}</div>
          <div class="value-range">${completionPercent}% des Wertes</div>
        </div>

        <div class="value-box">
          <div class="value-label">Fehlen</div>
          <div class="value-amount">€${missingAvg.toFixed(2)}</div>
          <div class="value-range">${(100 - completionPercent).toFixed(1)}% verbleibend</div>
        </div>
      </div>

      <div class="rarity-value-breakdown">
        <h4>Nach Seltenheit</h4>
        <div class="rarity-list">
          ${this.createRarityBreakdown(collectionValue.byRarity)}
        </div>
      </div>

      <div class="value-chart">
        <canvas id="value-chart"></canvas>
      </div>
    `;

    return panel;
  }

  /**
   * Create rarity breakdown list
   */
  createRarityBreakdown(byRarity) {
    if (!byRarity || Object.keys(byRarity).length === 0) {
      return '<p class="no-data">Keine Daten verfügbar</p>';
    }

    return Object.entries(byRarity)
      .sort((a, b) => b[1].value - a[1].value)
      .map(([rarity, data]) => `
        <div class="rarity-item">
          <span class="rarity-name">${rarity}</span>
          <span class="rarity-count">${data.count} Karten</span>
          <span class="rarity-value">€${data.value.toFixed(2)}</span>
          <div class="rarity-bar">
            <div class="rarity-bar-fill" style="width: ${Math.min((data.value / 100) * 100, 100)}%"></div>
          </div>
        </div>
      `)
      .join('');
  }

  /**
   * Create price trend info
   */
  createPriceTrendInfo(prices) {
    const panel = document.createElement('div');
    panel.className = 'price-trend-panel';

    const trendCounts = {
      up: prices.filter(p => p && p.trend === 'up').length,
      down: prices.filter(p => p && p.trend === 'down').length,
      stable: prices.filter(p => p && p.trend === 'stable').length
    };

    const total = trendCounts.up + trendCounts.down + trendCounts.stable;
    const upPercent = total > 0 ? ((trendCounts.up / total) * 100).toFixed(1) : 0;
    const downPercent = total > 0 ? ((trendCounts.down / total) * 100).toFixed(1) : 0;

    panel.innerHTML = `
      <h3>📊 Preistrends</h3>
      <div class="trend-stats">
        <div class="trend-item trend-up">
          <span class="trend-emoji">📈</span>
          <span class="trend-count">${trendCounts.up}</span>
          <span class="trend-label">Steigend (${upPercent}%)</span>
        </div>
        <div class="trend-item trend-stable">
          <span class="trend-emoji">➡️</span>
          <span class="trend-count">${trendCounts.stable}</span>
          <span class="trend-label">Stabil</span>
        </div>
        <div class="trend-item trend-down">
          <span class="trend-emoji">📉</span>
          <span class="trend-count">${trendCounts.down}</span>
          <span class="trend-label">Fallend (${downPercent}%)</span>
        </div>
      </div>
    `;

    return panel;
  }

  /**
   * Create wishlist panel (missing cards worth collecting)
   */
  createWishlistPanel(cards, prices, maxItems = 10) {
    const panel = document.createElement('div');
    panel.className = 'wishlist-panel';

    // Get missing cards with prices, sorted by value
    const wishlist = cards
      .filter((card, idx) => {
        const p = prices[idx];
        return (!card.collected && !card.reverseHolo) && p && !p.error;
      })
      .map((card, _, arr) => {
        const idx = arr.indexOf(card);
        return { card, price: prices[cards.indexOf(card)] };
      })
      .sort((a, b) => (b.price?.price_avg || 0) - (a.price?.price_avg || 0))
      .slice(0, maxItems);

    if (wishlist.length === 0) {
      panel.innerHTML = '<p class="no-data">🎉 Alle Karten gesammelt!</p>';
      return panel;
    }

    const totalWishlistValue = wishlist.reduce((sum, item) => sum + (item.price?.price_avg || 0), 0);

    panel.innerHTML = `
      <div class="wishlist-header">
        <h3>⭐ Wunschliste (Top ${maxItems})</h3>
        <span class="wishlist-value">€${totalWishlistValue.toFixed(2)}</span>
      </div>
      <div class="wishlist-items">
        ${wishlist.map((item, idx) => `
          <div class="wishlist-item" data-card-id="${item.card.id}">
            <span class="wishlist-rank">#${idx + 1}</span>
            <span class="wishlist-name">${item.card.name}</span>
            <span class="wishlist-number">#${item.card.number}</span>
            <span class="wishlist-price">€${(item.price?.price_avg || 0).toFixed(2)}</span>
            <button class="wishlist-btn" data-action="add-to-cart">+</button>
          </div>
        `).join('')}
      </div>
    `;

    return panel;
  }

  /**
   * Create price comparison modal
   */
  createPriceComparisonModal(card, price) {
    const modal = document.createElement('div');
    modal.className = 'price-modal';
    modal.innerHTML = `
      <div class="price-modal-content">
        <h3>${card.name} (#${card.number})</h3>
        
        <div class="price-details">
          <div class="price-detail-row">
            <span class="detail-label">Mindestpreis</span>
            <span class="detail-value">€${(price.price_low || 0).toFixed(2)}</span>
          </div>
          <div class="price-detail-row highlight">
            <span class="detail-label">Durchschnitt</span>
            <span class="detail-value">€${(price.price_avg || 0).toFixed(2)}</span>
          </div>
          <div class="price-detail-row">
            <span class="detail-label">Höchstpreis</span>
            <span class="detail-value">€${(price.price_high || 0).toFixed(2)}</span>
          </div>
          <div class="price-detail-row">
            <span class="detail-label">Verfügbar</span>
            <span class="detail-value">${price.available || 0} Angebote</span>
          </div>
          <div class="price-detail-row">
            <span class="detail-label">Trend</span>
            <span class="detail-value trend-${price.trend || 'unknown'}">
              ${this.getTrendEmoji(price.trend)} ${this.getTrendLabel(price.trend)}
            </span>
          </div>
        </div>

        <div class="price-modal-actions">
          <a href="https://www.cardmarket.com/en/Products/Search?searchString=${encodeURIComponent(card.name)}" 
             target="_blank" class="btn-cardmarket">Auf Cardmarket ansehen</a>
          <button class="btn-close">Schließen</button>
        </div>
      </div>
    `;

    return modal;
  }

  /**
   * Get trend emoji
   */
  getTrendEmoji(trend) {
    const emojis = {
      up: '📈',
      down: '📉',
      stable: '➡️',
      unknown: '❓'
    };
    return emojis[trend] || '❓';
  }

  /**
   * Get trend label
   */
  getTrendLabel(trend) {
    const labels = {
      up: 'Steigend',
      down: 'Fallend',
      stable: 'Stabil',
      unknown: 'Unbekannt'
    };
    return labels[trend] || 'Unbekannt';
  }

  /**
   * Inject Cardmarket controls into toolbar
   */
  injectCardmarketControls(toolbarSelector) {
    const toolbar = document.querySelector(toolbarSelector);
    if (!toolbar) return;

    const controls = document.createElement('div');
    controls.className = 'cardmarket-controls';
    controls.innerHTML = `
      <button class="filter-btn" data-cardmarket="prices" title="Preise anzeigen">💰 Preise</button>
      <button class="filter-btn" data-cardmarket="value" title="Sammlungswert">📊 Wert</button>
      <button class="filter-btn" data-cardmarket="wishlist" title="Wunschliste">⭐ Top 10</button>
    `;

    toolbar.appendChild(controls);

    // Bind events
    controls.querySelectorAll('[data-cardmarket]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleCardmarketAction(btn.dataset.cardmarket);
      });
    });
  }

  /**
   * Handle Cardmarket action
   */
  handleCardmarketAction(action) {
    const event = new CustomEvent('cardmarket-action', { 
      detail: { action },
      bubbles: true 
    });
    document.dispatchEvent(event);
  }

  /**
   * Format price with currency
   */
  formatPrice(price) {
    if (price === null || price === undefined) return '—';
    return `€${parseFloat(price).toFixed(2)}`;
  }

  /**
   * Format availability
   */
  formatAvailability(count) {
    if (count === null || count === undefined) return '—';
    if (count === 0) return '❌ Nicht verfügbar';
    if (count < 5) return `⚠️ Nur ${count}`;
    return `✅ ${count}+`;
  }
}

// Global instance
let globalCardmarketUI = null;

/**
 * Initialize global Cardmarket UI
 */
function initializeCardmarketUI() {
  if (!globalCardmarketUI) {
    globalCardmarketUI = new CardmarketUI();
  }
  return globalCardmarketUI;
}

/**
 * Get global Cardmarket UI instance
 */
function getGlobalCardmarketUI() {
  if (!globalCardmarketUI) {
    globalCardmarketUI = new CardmarketUI();
  }
  return globalCardmarketUI;
}

export { CardmarketUI, initializeCardmarketUI, getGlobalCardmarketUI };
