// ══════════════════════════════════════════════════════════════════════════
// SOCIAL UI COMPONENTS
// ══════════════════════════════════════════════════════════════════════════

import {
  loadWishlists,
  createWishlist,
  addToWishlist,
  removeFromWishlist,
  deleteWishlist,
  generateShareableCollectionUrl,
  getTradingLog,
  getTradingStats,
  getUnlockedAchievements,
  ACHIEVEMENTS,
  exportCollectionAsCSV,
  getSetRating,
  rateSet,
  getAllRatings
} from './social-features.js';

// ══════════════════════════════════════════════════════════════════════════
// WISHLIST PANEL UI
// ══════════════════════════════════════════════════════════════════════════

export function createWishlistPanel() {
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';

  const wishlists = loadWishlists();
  const wishlistsArray = Object.values(wishlists);

  dialog.innerHTML = `
    <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
      <div class="modal-header" style="display: flex; justify-content: space-between; align-items: center; padding: 20px; border-bottom: 1px solid var(--border-color);">
        <h3 style="margin: 0;">🎯 Wishlists</h3>
        <button class="wishlist-create-btn" style="background: var(--primary-color); color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">
          + Neue Liste
        </button>
      </div>
      
      <div style="padding: 20px;">
        ${
          wishlistsArray.length === 0
            ? `
          <div style="text-align: center; padding: 40px 0; color: var(--text-muted);">
            <p style="font-size: 24px;">📝</p>
            <p>Keine Wishlists erstellt</p>
          </div>
        `
            : `
          <div class="wishlist-list" style="display: flex; flex-direction: column; gap: 16px;">
            ${wishlistsArray
              .map(
                (list) => `
              <div class="wishlist-item" style="border: 1px solid var(--border-color); border-radius: 8px; padding: 16px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                  <div>
                    <h4 style="margin: 0; font-size: 16px;">${list.name}</h4>
                    <p style="margin: 4px 0 0 0; font-size: 12px; color: var(--text-muted);">
                      ${list.items.length} Einträge
                    </p>
                  </div>
                  <div style="display: flex; gap: 8px;">
                    <button class="wishlist-edit-btn" data-id="${list.id}" style="padding: 6px 12px; background: var(--secondary-color); border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                      Bearbeiten
                    </button>
                    <button class="wishlist-delete-btn" data-id="${list.id}" style="padding: 6px 12px; background: #ff6b6b; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                      Löschen
                    </button>
                  </div>
                </div>
                
                ${
                  list.items.length > 0
                    ? `
                  <div style="background: var(--bg-secondary); padding: 12px; border-radius: 6px; max-height: 200px; overflow-y: auto;">
                    ${list.items
                      .map(
                        (item, idx) => `
                      <div style="padding: 8px 0; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; font-size: 14px;">
                        <span>${item.setId}</span>
                        <span style="font-size: 12px; color: var(--text-muted);">
                          ${
                            item.priority === 'high'
                              ? '🔴'
                              : item.priority === 'medium'
                                ? '🟡'
                                : '🟢'
                          }
                        </span>
                      </div>
                    `
                      )
                      .join('')}
                  </div>
                `
                    : ''
                }
              </div>
            `
              )
              .join('')}
          </div>
        `
        }
      </div>
    </div>
  `;

  // Event listeners
  const createBtn = dialog.querySelector('.wishlist-create-btn');
  if (createBtn) {
    createBtn.addEventListener('click', () => {
      const name = prompt('Wishlist Name:');
      if (name && name.trim()) {
        createWishlist(name.trim());
        location.reload(); // Refresh to show new list
      }
    });
  }

  dialog.querySelectorAll('.wishlist-delete-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = btn.dataset.id;
      if (confirm('Diese Wishlist wirklich löschen?')) {
        deleteWishlist(id);
        btn.closest('.wishlist-item').style.opacity = '0.5';
        setTimeout(() => location.reload(), 300);
      }
    });
  });

  return dialog;
}

// ══════════════════════════════════════════════════════════════════════════
// COLLECTION SHARING DIALOG
// ══════════════════════════════════════════════════════════════════════════

export function createSharingDialog(collectionData, setList) {
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';

  const shareUrl = generateShareableCollectionUrl(collectionData, setList);

  dialog.innerHTML = `
    <div class="modal-content" style="max-width: 600px;">
      <div class="modal-header" style="padding: 20px; border-bottom: 1px solid var(--border-color);">
        <h3 style="margin: 0;">🔗 Collection teilen</h3>
      </div>
      
      <div style="padding: 20px;">
        <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <p style="font-size: 12px; color: var(--text-muted); margin: 0 0 8px 0;">Teilbare URL:</p>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input 
              type="text" 
              value="${shareUrl}" 
              readonly 
              style="flex: 1; padding: 10px; border: 1px solid var(--border-color); border-radius: 4px; font-size: 12px; font-family: monospace;"
            />
            <button class="share-copy-btn" style="padding: 10px 16px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer; white-space: nowrap;">
              📋 Kopieren
            </button>
          </div>
        </div>

        <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <h4 style="margin: 0 0 12px 0; font-size: 14px;">Collection Zusammenfassung:</h4>
          ${
            setList
              .filter((s) => s.imported)
              .slice(0, 5)
              .map(
                (set) => `
              <div style="padding: 8px 0; font-size: 13px; display: flex; justify-content: space-between;">
                <span>${set.setName}</span>
                <span style="color: var(--primary-color); font-weight: bold;">
                  ${
                    collectionData[set.setName]
                      ? Object.values(collectionData[set.setName]).filter((c) => c).length
                      : 0
                  }/${set.totalCards}
                </span>
              </div>
            `
              )
              .join('')
          }
          ${
            setList.filter((s) => s.imported).length > 5
              ? `<div style="padding: 8px 0; font-size: 12px; color: var(--text-muted);">... und ${setList.filter((s) => s.imported).length - 5} weitere Sets</div>`
              : ''
          }
        </div>

        <div style="background: #fff3cd; padding: 12px; border-radius: 6px; border-left: 4px solid #ffc107; font-size: 12px;">
          <p style="margin: 0;"><strong>💡 Tipp:</strong> Diese URL kann mit Freunden geteilt werden, um deine Collection zu zeigen!</p>
        </div>
      </div>
    </div>
  `;

  // Copy button event
  const copyBtn = dialog.querySelector('.share-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const input = dialog.querySelector('input');
      input.select();
      document.execCommand('copy');
      copyBtn.textContent = '✅ Kopiert!';
      setTimeout(() => {
        copyBtn.textContent = '📋 Kopieren';
      }, 2000);
    });
  }

  return dialog;
}

// ══════════════════════════════════════════════════════════════════════════
// TRADING LOG PANEL
// ══════════════════════════════════════════════════════════════════════════

export function createTradingLogPanel() {
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';

  const trades = getTradingLog(100);
  const stats = getTradingStats();

  const typeLabels = {
    add: '➕ Hinzugefügt',
    remove: '➖ Entfernt',
    trade: '🔄 Getauscht',
    upgrade: '⬆️ Upgrade'
  };

  dialog.innerHTML = `
    <div class="modal-content" style="max-width: 700px; max-height: 80vh; overflow-y: auto;">
      <div class="modal-header" style="padding: 20px; border-bottom: 1px solid var(--border-color);">
        <h3 style="margin: 0;">📊 Trading Log</h3>
      </div>
      
      <div style="padding: 20px;">
        ${
          stats
            ? `
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 12px; margin-bottom: 20px;">
            <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; font-weight: bold; color: var(--primary-color);">${stats.total}</div>
              <div style="font-size: 12px; color: var(--text-muted);">Gesamt Transaktionen</div>
            </div>
            <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; font-weight: bold;">➕</div>
              <div style="font-size: 12px; color: var(--text-muted);">${stats.byType.add}</div>
            </div>
            <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; font-weight: bold;">➖</div>
              <div style="font-size: 12px; color: var(--text-muted);">${stats.byType.remove}</div>
            </div>
            <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; text-align: center;">
              <div style="font-size: 20px; font-weight: bold;">🔄</div>
              <div style="font-size: 12px; color: var(--text-muted);">${stats.byType.trade}</div>
            </div>
          </div>
        `
            : ''
        }

        ${
          trades.length === 0
            ? `
          <div style="text-align: center; padding: 40px 0; color: var(--text-muted);">
            <p style="font-size: 24px;">📜</p>
            <p>Keine Transaktionen noch</p>
          </div>
        `
            : `
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${trades
              .map(
                (trade) => `
              <div style="border-left: 4px solid var(--primary-color); padding: 12px; background: var(--bg-secondary); border-radius: 4px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <span style="font-weight: bold; font-size: 14px;">${typeLabels[trade.type] || trade.type}</span>
                  <span style="font-size: 12px; color: var(--text-muted);">
                    ${new Date(trade.timestamp).toLocaleString()}
                  </span>
                </div>
                <div style="font-size: 13px;">
                  <strong>${trade.setId}</strong> - Card #${trade.cardNumber}
                </div>
                ${trade.notes ? `<div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">${trade.notes}</div>` : ''}
              </div>
            `
              )
              .join('')}
          </div>
        `
        }
      </div>
    </div>
  `;

  return dialog;
}

// ══════════════════════════════════════════════════════════════════════════
// ACHIEVEMENTS PANEL
// ══════════════════════════════════════════════════════════════════════════

export function createAchievementsPanel(stats) {
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';

  const unlockedIds = Object.keys(getUnlockedAchievements());

  dialog.innerHTML = `
    <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
      <div class="modal-header" style="padding: 20px; border-bottom: 1px solid var(--border-color);">
        <h3 style="margin: 0;">🏆 Achievements</h3>
      </div>
      
      <div style="padding: 20px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <div style="font-size: 32px; margin-bottom: 8px;">🎉</div>
          <div style="font-size: 24px; font-weight: bold; color: var(--primary-color);">${unlockedIds.length}</div>
          <div style="font-size: 12px; color: var(--text-muted);">von ${Object.keys(ACHIEVEMENTS).length} Achievements</div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
          ${Object.values(ACHIEVEMENTS)
            .map(
              (achievement) => {
                const unlocked = unlockedIds.includes(achievement.id);
                return `
                <div style="
                  border: 2px solid ${unlocked ? 'var(--primary-color)' : 'var(--border-color)'};
                  border-radius: 8px;
                  padding: 16px;
                  text-align: center;
                  background: ${unlocked ? 'var(--bg-secondary)' : 'var(--bg-tertiary)'};
                  opacity: ${unlocked ? '1' : '0.6'};
                ">
                  <div style="font-size: 32px; margin-bottom: 8px;">${achievement.icon}</div>
                  <div style="font-weight: bold; font-size: 12px; margin-bottom: 4px;">${achievement.name}</div>
                  <div style="font-size: 11px; color: var(--text-muted);">${achievement.description}</div>
                </div>
              `;
              }
            )
            .join('')}
        </div>
      </div>
    </div>
  `;

  return dialog;
}

// ══════════════════════════════════════════════════════════════════════════
// CSV EXPORT PANEL
// ══════════════════════════════════════════════════════════════════════════

export function createCSVExportPanel(collectionData, setList) {
  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';

  const csvContent = exportCollectionAsCSV(collectionData, setList);

  dialog.innerHTML = `
    <div class="modal-content" style="max-width: 600px; max-height: 80vh; overflow-y: auto;">
      <div class="modal-header" style="padding: 20px; border-bottom: 1px solid var(--border-color);">
        <h3 style="margin: 0;">📥 CSV Export</h3>
      </div>
      
      <div style="padding: 20px;">
        <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
          <p style="font-size: 12px; color: var(--text-muted); margin: 0 0 12px 0;">Preview (erste 10 Zeilen):</p>
          <textarea 
            readonly 
            style="
              width: 100%; 
              height: 200px; 
              padding: 12px; 
              border: 1px solid var(--border-color); 
              border-radius: 4px; 
              font-family: monospace; 
              font-size: 11px; 
              resize: none;
            "
          >${csvContent.split('\n').slice(0, 11).join('\n')}</textarea>
        </div>

        <div style="display: flex; gap: 12px;">
          <button class="csv-download-btn" style="flex: 1; padding: 12px; background: var(--primary-color); color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
            ⬇️ CSV Herunterladen
          </button>
          <button class="csv-copy-btn" style="flex: 1; padding: 12px; background: var(--secondary-color); border: none; border-radius: 4px; cursor: pointer;">
            📋 In Zwischenablage kopieren
          </button>
        </div>
      </div>
    </div>
  `;

  // Download button
  const downloadBtn = dialog.querySelector('.csv-download-btn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', () => {
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pokemon-collection-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
    });
  }

  // Copy button
  const copyBtn = dialog.querySelector('.csv-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const textarea = dialog.querySelector('textarea');
      textarea.select();
      document.execCommand('copy');
      copyBtn.textContent = '✅ Kopiert!';
      setTimeout(() => {
        copyBtn.textContent = '📋 In Zwischenablage kopieren';
      }, 2000);
    });
  }

  return dialog;
}

// ══════════════════════════════════════════════════════════════════════════
// SET RATING UI
// ══════════════════════════════════════════════════════════════════════════

export function createSetRatingWidget(setId, setName) {
  const container = document.createElement('div');
  const currentRating = getSetRating(setId);
  const rating = currentRating?.rating || 0;
  const review = currentRating?.review || '';

  container.innerHTML = `
    <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; margin: 16px 0;">
      <h4 style="margin: 0 0 12px 0; font-size: 14px;">⭐ Set bewerten</h4>
      
      <div style="display: flex; gap: 8px; margin-bottom: 12px;">
        ${[1, 2, 3, 4, 5]
          .map(
            (star) => `
          <button class="rating-star" data-rating="${star}" style="
            font-size: 24px; 
            background: none; 
            border: none; 
            cursor: pointer; 
            opacity: ${star <= rating ? '1' : '0.3'};
            transition: all 0.2s;
          ">
            ${star <= rating ? '⭐' : '☆'}
          </button>
        `
          )
          .join('')}
      </div>

      <textarea 
        class="rating-review" 
        placeholder="Deine Bewertung (Optional)..." 
        style="
          width: 100%; 
          padding: 10px; 
          border: 1px solid var(--border-color); 
          border-radius: 4px; 
          font-family: inherit;
          font-size: 13px;
          resize: vertical;
          min-height: 80px;
        "
      >${review}</textarea>

      <button class="rating-save-btn" style="
        margin-top: 12px; 
        padding: 10px 16px; 
        background: var(--primary-color); 
        color: white; 
        border: none; 
        border-radius: 4px; 
        cursor: pointer;
        font-weight: bold;
      ">
        💾 Bewertung speichern
      </button>
    </div>
  `;

  // Star rating
  const stars = container.querySelectorAll('.rating-star');
  let tempRating = rating;

  stars.forEach((star) => {
    star.addEventListener('click', () => {
      tempRating = parseInt(star.dataset.rating);
      updateStars(tempRating);
    });

    star.addEventListener('mouseover', () => {
      updateStars(parseInt(star.dataset.rating));
    });
  });

  container.addEventListener('mouseleave', () => {
    updateStars(tempRating);
  });

  function updateStars(r) {
    stars.forEach((star, idx) => {
      if (idx < r) {
        star.textContent = '⭐';
        star.style.opacity = '1';
      } else {
        star.textContent = '☆';
        star.style.opacity = '0.3';
      }
    });
  }

  // Save button
  const saveBtn = container.querySelector('.rating-save-btn');
  const reviewField = container.querySelector('.rating-review');

  saveBtn.addEventListener('click', () => {
    if (tempRating === 0) {
      alert('Bitte mindestens 1 Stern vergeben');
      return;
    }

    rateSet(setId, tempRating, reviewField.value);
    saveBtn.textContent = '✅ Gespeichert!';
    setTimeout(() => {
      saveBtn.textContent = '💾 Bewertung speichern';
    }, 2000);
  });

  return container;
}

// ══════════════════════════════════════════════════════════════════════════
// RATING STATISTICS DISPLAY
// ══════════════════════════════════════════════════════════════════════════

export function createRatingStatsWidget() {
  const container = document.createElement('div');
  const ratings = getAllRatings();

  if (ratings.length === 0) {
    container.innerHTML = `
      <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px; text-align: center; color: var(--text-muted);">
        <p>Noch keine Sets bewertet</p>
      </div>
    `;
    return container;
  }

  const avgRating = (ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length).toFixed(1);
  const ratingDistribution = [0, 0, 0, 0, 0];
  ratings.forEach((r) => {
    ratingDistribution[r.rating - 1]++;
  });

  container.innerHTML = `
    <div style="background: var(--bg-secondary); padding: 16px; border-radius: 8px;">
      <h4 style="margin: 0 0 12px 0;">⭐ Bewertungsstatistik</h4>
      
      <div style="text-align: center; margin-bottom: 16px;">
        <div style="font-size: 28px; font-weight: bold; color: var(--primary-color);">${avgRating}</div>
        <div style="font-size: 12px; color: var(--text-muted);">Durchschnitto aus ${ratings.length} Bewertungen</div>
      </div>

      ${[5, 4, 3, 2, 1]
        .map(
          (star) => `
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px; font-size: 12px;">
          <span style="width: 20px;">${star}⭐</span>
          <div style="flex: 1; height: 20px; background: var(--bg-tertiary); border-radius: 4px; position: relative;">
            <div style="
              height: 100%; 
              width: ${(ratingDistribution[star - 1] / ratings.length) * 100}%; 
              background: var(--primary-color); 
              border-radius: 4px;
            "></div>
          </div>
          <span style="width: 30px; text-align: right;">${ratingDistribution[star - 1]}</span>
        </div>
      `
        )
        .join('')}
    </div>
  `;

  return container;
}
