// ══════════════════════════════════════════════════════════════════════════
// TRADING MARKETPLACE USER INTERFACE
// ══════════════════════════════════════════════════════════════════════════

import {
  getTradeOffers,
  getUserTradeStats,
  addWantedCard,
  removeWantedCard,
  getWantedCards,
  isCardWanted,
  createTradeOffer,
  findMatchingTrades,
  generateTradeSuggestions,
  TRADE_STATUS
} from './trading-system.js';

// ══════════════════════════════════════════════════════════════════════════
// WANTED CARDS PANEL
// ══════════════════════════════════════════════════════════════════════════

export function createWantedCardsPanel() {
  const panel = document.createElement('div');
  panel.className = 'wanted-cards-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <h3>🎯 Gesuchte Karten</h3>
      <button class="add-wanted-btn" title="Karte hinzufügen">
        <span class="icon">+</span>
      </button>
    </div>
    <div class="wanted-list"></div>
    <div class="wanted-stats">
      <small>Insgesamt: <span class="count">0</span> Karten</small>
    </div>
  `;

  const addBtn = panel.querySelector('.add-wanted-btn');
  const list = panel.querySelector('.wanted-list');

  addBtn.addEventListener('click', () => {
    showWantedCardDialog((setId, cardNumber, priority) => {
      addWantedCard(setId, cardNumber, priority);
      renderWantedCards();
    });
  });

  function renderWantedCards() {
    const wanted = getWantedCards();
    list.innerHTML = '';

    if (Object.keys(wanted).length === 0) {
      list.innerHTML = '<p class="empty-state">Keine gesuchten Karten</p>';
      panel.querySelector('.count').textContent = '0';
      return;
    }

    Object.values(wanted).forEach((card) => {
      const item = document.createElement('div');
      item.className = 'wanted-card-item';

      const priorityEmoji = { urgent: '🔴', high: '🟠', medium: '🟡', low: '⚪' };
      const priorityLabel = { urgent: 'Dringend', high: 'Hoch', medium: 'Mittel', low: 'Niedrig' };

      item.innerHTML = `
        <div class="wanted-card-info">
          <div class="wanted-card-id">${card.setId} #${card.cardNumber}</div>
          <div class="wanted-card-priority">
            ${priorityEmoji[card.priority]} ${priorityLabel[card.priority]}
          </div>
        </div>
        <button class="wanted-remove-btn" title="Entfernen">✕</button>
      `;

      item.querySelector('.wanted-remove-btn').addEventListener('click', () => {
        removeWantedCard(card.setId, card.cardNumber);
        renderWantedCards();
      });

      list.appendChild(item);
    });

    panel.querySelector('.count').textContent = Object.keys(wanted).length;
  }

  renderWantedCards();
  return panel;
}

// ══════════════════════════════════════════════════════════════════════════
// TRADE OFFERS MARKETPLACE
// ══════════════════════════════════════════════════════════════════════════

export function createTradeMarketplacePanel() {
  const panel = document.createElement('div');
  panel.className = 'trade-marketplace-panel';
  panel.innerHTML = `
    <div class="panel-header">
      <h3>💱 Handelsmarktplatz</h3>
      <button class="create-offer-btn">+ Angebot erstellen</button>
    </div>
    <div class="marketplace-filters">
      <input type="text" class="search-filter" placeholder="Suche Angebote..." />
      <select class="status-filter">
        <option value="">Alle Status</option>
        <option value="open">Offene Angebote</option>
        <option value="pending">Ausstehend</option>
        <option value="completed">Abgeschlossen</option>
      </select>
    </div>
    <div class="offers-grid"></div>
  `;

  const createBtn = panel.querySelector('.create-offer-btn');
  const grid = panel.querySelector('.offers-grid');
  const searchInput = panel.querySelector('.search-filter');
  const statusFilter = panel.querySelector('.status-filter');

  createBtn.addEventListener('click', () => {
    showCreateTradeOfferDialog();
  });

  function renderOffers() {
    const offers = getTradeOffers();
    grid.innerHTML = '';

    if (offers.length === 0) {
      grid.innerHTML = '<p class="empty-state">Keine Handelsangebote verfügbar</p>';
      return;
    }

    const filteredOffers = offers.filter((offer) => {
      const matchesSearch =
        searchInput.value === '' ||
        offer.description.toLowerCase().includes(searchInput.value.toLowerCase()) ||
        offer.offerId.includes(searchInput.value);

      const matchesStatus =
        statusFilter.value === '' || offer.status === statusFilter.value;

      return matchesSearch && matchesStatus;
    });

    filteredOffers.forEach((offer) => {
      const card = createTradeOfferCard(offer);
      grid.appendChild(card);
    });
  }

  searchInput.addEventListener('input', renderOffers);
  statusFilter.addEventListener('change', renderOffers);

  renderOffers();
  return panel;
}

function createTradeOfferCard(offer) {
  const card = document.createElement('div');
  card.className = 'trade-offer-card';

  const statusEmoji = {
    open: '📤',
    pending: '⏳',
    completed: '✅',
    cancelled: '❌'
  };

  const offeredSummary = offer.offeredCards.slice(0, 2)
    .map((c) => `${c.setId} #${c.cardNumber}`)
    .join(', ');
  const wantedSummary = offer.wantedCards.slice(0, 2)
    .map((c) => `${c.setId} #${c.cardNumber}`)
    .join(', ');

  card.innerHTML = `
    <div class="trade-card-header">
      <span class="trade-status">${statusEmoji[offer.status]}</span>
      <span class="trade-views">👁️ ${offer.views}</span>
    </div>
    <div class="trade-card-body">
      <div class="trade-offered">
        <strong>Ich biete:</strong>
        <small>${offeredSummary}${offer.offeredCards.length > 2 ? ' +' + (offer.offeredCards.length - 2) : ''}</small>
      </div>
      <div class="trade-wants">
        <strong>Ich suche:</strong>
        <small>${wantedSummary}${offer.wantedCards.length > 2 ? ' +' + (offer.wantedCards.length - 2) : ''}</small>
      </div>
    </div>
    <div class="trade-card-footer">
      <small>${new Date(offer.createdAt).toLocaleDateString('de-DE')}</small>
      <button class="trade-details-btn">Details</button>
    </div>
  `;

  card.querySelector('.trade-details-btn').addEventListener('click', () => {
    showTradeOfferDetails(offer);
  });

  return card;
}

// ══════════════════════════════════════════════════════════════════════════
// TRADE STATS CARD
// ══════════════════════════════════════════════════════════════════════════

export function createTradeStatsCard(userId) {
  const card = document.createElement('div');
  card.className = 'trade-stats-card';

  const stats = getUserTradeStats(userId);

  card.innerHTML = `
    <div class="stats-header">🤝 Handelsstatistik</div>
    <div class="stats-grid">
      <div class="stat-item">
        <div class="stat-value">${stats.completedTrades || 0}</div>
        <div class="stat-label">Abgeschlossene Trades</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.activeOffers || 0}</div>
        <div class="stat-label">Aktive Angebote</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.averageRating || '-'}</div>
        <div class="stat-label">Bewertung ⭐</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${stats.tradePartners || 0}</div>
        <div class="stat-label">Handelspartner</div>
      </div>
    </div>
  `;

  return card;
}

// ══════════════════════════════════════════════════════════════════════════
// TRADE SUGGESTIONS
// ══════════════════════════════════════════════════════════════════════════

export function createTradeSuggestionsPanel(userId, userCards) {
  const panel = document.createElement('div');
  panel.className = 'trade-suggestions-panel';

  const wanted = getWantedCards();
  const suggestions = generateTradeSuggestions(userId, userCards, Object.values(wanted));

  panel.innerHTML = `
    <div class="panel-header">
      <h3>✨ Handelsvorschläge</h3>
      <small>${suggestions.length} Angebot(e) gefunden</small>
    </div>
    <div class="suggestions-list"></div>
  `;

  const list = panel.querySelector('.suggestions-list');

  if (suggestions.length === 0) {
    list.innerHTML = '<p class="empty-state">Keine Handelsvorschläge vorhanden</p>';
    return panel;
  }

  suggestions.slice(0, 5).forEach((suggestion) => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';

    item.innerHTML = `
      <div class="suggestion-match">
        <div class="match-score">${Math.round(suggestion.score * 100)}% Match</div>
        <div class="match-details">
          <small>Sie haben: ${suggestion.theyWant.length} Karten, die ich will</small>
          <small>Ich habe: ${suggestion.theyHave.length} Karten, die sie wollen</small>
        </div>
      </div>
      <button class="view-suggestion-btn">Angebot ansehen</button>
    `;

    item.querySelector('.view-suggestion-btn').addEventListener('click', () => {
      showTradeOfferDetails(suggestion.offer);
    });

    list.appendChild(item);
  });

  return panel;
}

// ══════════════════════════════════════════════════════════════════════════
// DIALOGS
// ══════════════════════════════════════════════════════════════════════════

function showWantedCardDialog(callback) {
  const dialog = document.createElement('div');
  dialog.className = 'modal-overlay';

  dialog.innerHTML = `
    <div class="modal-content small">
      <h3>Gesuchte Karte hinzufügen</h3>
      <form>
        <div class="form-group">
          <label>Set ID</label>
          <input type="text" class="set-input" placeholder="z.B. base1" required />
        </div>
        <div class="form-group">
          <label>Kartennummer</label>
          <input type="number" class="card-input" placeholder="z.B. 1" required />
        </div>
        <div class="form-group">
          <label>Priorität</label>
          <select class="priority-input">
            <option value="low">Niedrig</option>
            <option value="medium" selected>Mittel</option>
            <option value="high">Hoch</option>
            <option value="urgent">Dringend</option>
          </select>
        </div>
        <div class="modal-buttons">
          <button type="button" class="btn-cancel">Abbrechen</button>
          <button type="submit" class="btn-primary">Hinzufügen</button>
        </div>
      </form>
    </div>
  `;

  const form = dialog.querySelector('form');
  const setInput = dialog.querySelector('.set-input');
  const cardInput = dialog.querySelector('.card-input');
  const priorityInput = dialog.querySelector('.priority-input');
  const cancelBtn = dialog.querySelector('.btn-cancel');

  cancelBtn.addEventListener('click', () => dialog.remove());

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    callback(setInput.value, cardInput.value, priorityInput.value);
    dialog.remove();
  });

  document.body.appendChild(dialog);
}

function showCreateTradeOfferDialog() {
  const dialog = document.createElement('div');
  dialog.className = 'modal-overlay';

  dialog.innerHTML = `
    <div class="modal-content">
      <h3>Handelsangebot erstellen</h3>
      <form>
        <div class="form-group">
          <label>Beschreibung</label>
          <textarea class="description-input" placeholder="Beschreiben Sie Ihr Angebot..." maxlength="500"></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Angebotene Karten</label>
            <input type="text" class="offered-input" placeholder="Set1 #1, Set2 #5..." />
          </div>
          <div class="form-group">
            <label>Gesuchte Karten</label>
            <input type="text" class="wanted-input" placeholder="Base1 #10, Base2 #25..." />
          </div>
        </div>
        <div class="modal-buttons">
          <button type="button" class="btn-cancel">Abbrechen</button>
          <button type="submit" class="btn-primary">Erstellen</button>
        </div>
      </form>
    </div>
  `;

  const form = dialog.querySelector('form');
  const descInput = dialog.querySelector('.description-input');
  const offeredInput = dialog.querySelector('.offered-input');
  const wantedInput = dialog.querySelector('.wanted-input');
  const cancelBtn = dialog.querySelector('.btn-cancel');

  cancelBtn.addEventListener('click', () => dialog.remove());

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const parseCards = (str) =>
      str
        .split(',')
        .map((s) => {
          const parts = s.trim().split('#');
          return { setId: parts[0].trim(), cardNumber: parts[1]?.trim() };
        })
        .filter((c) => c.setId && c.cardNumber);

    const offer = createTradeOffer(parseCards(offeredInput.value), parseCards(wantedInput.value), 'current-user', descInput.value);

    if (offer) {
      alert('✅ Handelsangebot erstellt!');
      dialog.remove();
    }
  });

  document.body.appendChild(dialog);
}

function showTradeOfferDetails(offer) {
  const dialog = document.createElement('div');
  dialog.className = 'modal-overlay';

  const offeredCards = offer.offeredCards
    .map((c) => `<li>${c.setId} #${c.cardNumber}</li>`)
    .join('');
  const wantedCards = offer.wantedCards
    .map((c) => `<li>${c.setId} #${c.cardNumber}</li>`)
    .join('');

  dialog.innerHTML = `
    <div class="modal-content">
      <h3>Handelsangebot Details</h3>
      <div class="trade-details">
        <div class="detail-section">
          <strong>Ich biete:</strong>
          <ul>${offeredCards}</ul>
        </div>
        <div class="detail-section">
          <strong>Ich suche:</strong>
          <ul>${wantedCards}</ul>
        </div>
        ${offer.description ? `<div class="detail-section"><strong>Beschreibung:</strong><p>${offer.description}</p></div>` : ''}
        <div class="detail-section">
          <small>Erstellt: ${new Date(offer.createdAt).toLocaleString('de-DE')}</small>
          <small>Ablauf: ${new Date(offer.expiresAt).toLocaleString('de-DE')}</small>
        </div>
      </div>
      <div class="modal-buttons">
        <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Schließen</button>
        <button class="btn-primary accept-btn">Angebot akzeptieren</button>
      </div>
    </div>
  `;

  const acceptBtn = dialog.querySelector('.accept-btn');
  acceptBtn.addEventListener('click', () => {
    alert('🎉 Handelsangebot akzeptiert! Der Trading Partner wird benachrichtigt.');
    dialog.remove();
  });

  document.body.appendChild(dialog);
}

// ══════════════════════════════════════════════════════════════════════════
// TRADE HISTORY PANEL
// ══════════════════════════════════════════════════════════════════════════

export function createTradeHistoryPanel(userId) {
  const panel = document.createElement('div');
  panel.className = 'trade-history-panel';

  panel.innerHTML = `
    <div class="panel-header">
      <h3>📋 Handelsverlauf</h3>
    </div>
    <div class="history-list"></div>
  `;

  const list = panel.querySelector('.history-list');

  // Note: Would need getTradeHistory function from trading-system.js
  // For now, showing placeholder

  list.innerHTML = `
    <p class="empty-state">Kein Handelsverlauf vorhanden</p>
  `;

  return panel;
}
