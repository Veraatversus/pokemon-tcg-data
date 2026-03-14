import { CONFIG } from '../config/config.js';

/**
 * Show/Hide loading indicator
 */
export function setLoading(show, message = 'Loading...') {
  const loading = document.getElementById('loading');
  if (show) {
    loading.querySelector('p').textContent = message;
    loading.style.display = 'flex';
  } else {
    loading.style.display = 'none';
  }
}

/**
 * Show/Hide empty state
 */
export function setEmptyState(show, message = 'Wähle ein Set aus, um die Karten anzuzeigen') {
  const emptyState = document.getElementById('empty-state');
  const cardsContainer = document.getElementById('cards-container');
  const messageElement = emptyState.querySelector('p');
  
  if (show) {
    if (messageElement) messageElement.textContent = message;
    emptyState.style.display = 'block';
    cardsContainer.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    cardsContainer.style.display = 'block';
  }
}

/**
 * Render Set Selector
 */
export function renderSetSelector(sets) {
  const selector = document.getElementById('set-selector');
  selector.innerHTML = '<option value="">Select Set...</option>';
  
  sets.forEach(set => {
    const option = document.createElement('option');
    option.value = set.id;
    option.textContent = `${set.name} (${set.total} cards)`;
    selector.appendChild(option);
  });
}

/**
 * Render Cards Grid
 */
export function renderCardsGrid(cards, emptyMessage) {
  const container = document.getElementById('cards-container');
  container.innerHTML = '';

  if (cards.length === 0) {
    setEmptyState(true, emptyMessage || 'Keine Karten gefunden');
    return;
  }

  setEmptyState(false);

  // Group cards by rows
  const rows = [];
  for (let i = 0; i < cards.length; i += CONFIG.CARDS_PER_ROW) {
    rows.push(cards.slice(i, i + CONFIG.CARDS_PER_ROW));
  }

  // Render each row
  rows.forEach(row => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'card-row';

    row.forEach(card => {
      const cardDiv = createCardElement(card);
      rowDiv.appendChild(cardDiv);
    });

    container.appendChild(rowDiv);
  });
}

/**
 * Create Card Element
 */
function createCardElement(card) {
  const cardDiv = document.createElement('div');
  cardDiv.className = 'card-block';
  cardDiv.dataset.cardId = card.id;

  if (card.collected) cardDiv.classList.add('collected');
  if (card.reverseHolo) cardDiv.classList.add('reverse-holo-collected');

  cardDiv.innerHTML = `
    <div class="card-header">
      <span class="card-number">#${card.number}</span>
    </div>
    <div class="card-name" title="${card.name}">${card.name}</div>
    <div class="card-image">
      <img src="${card.imageUrl}" 
           alt="${card.name}" 
           loading="lazy" 
           onerror="this.style.display='none'">
      <div class="image-fallback" style="display:none;">📷</div>
    </div>
    <div class="card-checkboxes">
      <label class="checkbox-label">
        <input type="checkbox" 
               class="checkbox-normal" 
               ${card.collected ? 'checked' : ''}>
        <span>Normal</span>
      </label>
      <label class="checkbox-label" ${!card.collected ? 'style="display:none"' : ''}>
        <input type="checkbox" 
               class="checkbox-reverse" 
               ${card.reverseHolo ? 'checked' : ''}>
        <span>Reverse Holo</span>
      </label>
      ${card.cardmarketLink ? `<a href="${card.cardmarketLink}" target="_blank" class="cardmarket-link" title="Cardmarket">🛒</a>` : ''}
    </div>
  `;

  // Add event listeners
  const normalCheckbox = cardDiv.querySelector('.checkbox-normal');
  const reverseCheckbox = cardDiv.querySelector('.checkbox-reverse');
  const reverseLabel = reverseCheckbox.closest('.checkbox-label');

  normalCheckbox.addEventListener('change', (e) => {
    const checked = e.target.checked;
    onCheckboxChange(card, 'normal', checked);
    // Show/hide RH checkbox based on Normal checkbox
    if (reverseLabel) {
      reverseLabel.style.display = checked ? '' : 'none';
      if (!checked && reverseCheckbox.checked) {
        reverseCheckbox.checked = false;
        onCheckboxChange(card, 'reverseHolo', false);
      }
    }
  });

  reverseCheckbox.addEventListener('change', (e) => {
    onCheckboxChange(card, 'reverseHolo', e.target.checked);
  });

  return cardDiv;
}

/**
 * Update card visual state
 */
export function updateCardState(cardId, type, checked) {
  const cardDiv = document.querySelector(`[data-card-id="${cardId}"]`);
  if (!cardDiv) return;

  if (type === 'normal') {
    cardDiv.classList.toggle('collected', checked);
  } else if (type === 'reverseHolo') {
    cardDiv.classList.toggle('reverse-holo-collected', checked);
  }
}

/**
 * Update progress info
 */
export function updateProgressInfo(progress) {
  const progressInfo = document.getElementById('progress-info');
  const percentage = Number.isFinite(progress.percentage) ? progress.percentage : 0;
  progressInfo.innerHTML = `
    <span class="progress-text">
      <strong>${progress.collected} / ${progress.total}</strong> (${percentage}%)
    </span>
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${percentage}%"></div>
    </div>
  `;
}

/**
 * Display user info
 */
export function displayUserInfo(email) {
  const userInfo = document.getElementById('user-info');
  userInfo.textContent = email || 'User';
}

/**
 * Update stats bar
 */
export function updateStatsBar(stats) {
  const statsBar = document.getElementById('stats-bar');
  statsBar.innerHTML = `
    <span><strong>Angezeigt:</strong> ${stats.visible} / ${stats.total}</span>
    <span><strong>Gesammelt:</strong> ${stats.collected}</span>
    <span><strong>Reverse Holo:</strong> ${stats.reverseHolo}</span>
    <span><strong>Fehlend:</strong> ${stats.missing}</span>
  `;
}

/**
 * Show error message
 */
export function showError(message) {
  showToast(message, 'error');
}

/**
 * Show success message
 */
export function showSuccess(message) {
  showToast(message, 'success');
}

/**
 * Toasts
 */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 200);
  }, 2500);
}

// Callback (set by app.js)
let onCheckboxChange = () => {};

export function setCheckboxCallback(callback) {
  onCheckboxChange = callback;
}
