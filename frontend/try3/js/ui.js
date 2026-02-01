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
export function setEmptyState(show) {
  const emptyState = document.getElementById('empty-state');
  const cardsContainer = document.getElementById('cards-container');
  
  if (show) {
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
export function renderCardsGrid(cards) {
  const container = document.getElementById('cards-container');
  container.innerHTML = '';

  if (cards.length === 0) {
    setEmptyState(true);
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
           onerror="this.src='assets/images/card-placeholder.png'">
    </div>
    <div class="card-checkboxes">
      <label class="checkbox-label">
        <input type="checkbox" 
               class="checkbox-normal" 
               ${card.collected ? 'checked' : ''}>
        <span>Normal</span>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" 
               class="checkbox-reverse" 
               ${card.reverseHolo ? 'checked' : ''}>
        <span>Reverse Holo</span>
      </label>
    </div>
  `;

  // Add event listeners
  const normalCheckbox = cardDiv.querySelector('.checkbox-normal');
  const reverseCheckbox = cardDiv.querySelector('.checkbox-reverse');

  normalCheckbox.addEventListener('change', (e) => {
    onCheckboxChange(card, 'normal', e.target.checked);
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
  progressInfo.innerHTML = `
    <span class="progress-text">
      <strong>${progress.collected} / ${progress.total}</strong> (${progress.percentage}%)
    </span>
    <div class="progress-bar">
      <div class="progress-fill" style="width: ${progress.percentage}%"></div>
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
 * Show error message
 */
export function showError(message) {
  alert('❌ ' + message);
}

/**
 * Show success message
 */
export function showSuccess(message) {
  console.log('✅ ' + message);
  // Could be enhanced with a toast notification
}

// Callback (set by app.js)
let onCheckboxChange = () => {};

export function setCheckboxCallback(callback) {
  onCheckboxChange = callback;
}
