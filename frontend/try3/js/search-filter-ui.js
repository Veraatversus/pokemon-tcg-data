/**
 * Search & Filter UI Module
 * Handle rendering and events for search, filter, and sort controls
 */

import { CardFilter, getGlobalFilter } from './filters.js';
import { getGlobalStats } from './statistics.js';

export class SearchFilterUI {
  constructor() {
    this.filter = getGlobalFilter();
    this.stats = getGlobalStats();
    this.onFilterChange = null;
  }

  /**
   * Create search bar HTML
   */
  createSearchBar() {
    return `
      <div class="search-container" id="search-container">
        <div class="search-bar">
          <input 
            type="text" 
            id="search-input" 
            class="search-input" 
            placeholder="🔍 Nach Name, ID oder Nummer suchen..."
            autocomplete="off"
          >
          <button id="clear-search-btn" class="btn-icon" title="Suche löschen">✕</button>
        </div>
        
        <div class="filter-row">
          <div class="filter-group">
            <label class="filter-label">Status</label>
            <select id="filter-status" class="filter-select">
              <option value="all">Alle anzeigen</option>
              <option value="collected">Gesammelt</option>
              <option value="missing">Fehlend</option>
              <option value="reverseHolo">Reverse Holo</option>
            </select>
          </div>

          <div class="filter-group">
            <label class="filter-label">Sortierung</label>
            <select id="sort-by" class="filter-select">
              <option value="number">Nach Nummer</option>
              <option value="name">Nach Name</option>
              <option value="collected">Nach Status</option>
            </select>
          </div>

          <button id="reset-filters-btn" class="btn-secondary">🔄 Zurücksetzen</button>
        </div>

        <div id="filter-summary" class="filter-summary"></div>
      </div>
    `;
  }

  /**
   * Initialize search and filter event listeners
   */
  initializeEvents() {
    // Search input with debounce
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      let searchTimeout;
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.filter.search(e.target.value);
          this.updateSummary();
          if (this.onFilterChange) {
            this.onFilterChange(this.filter.getFiltered());
          }
        }, 300);
      });
    }

    // Clear search button
    const clearBtn = document.getElementById('clear-search-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        this.filter.search('');
        this.updateSummary();
        if (this.onFilterChange) {
          this.onFilterChange(this.filter.getFiltered());
        }
      });
    }

    // Filter by status
    const statusSelect = document.getElementById('filter-status');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        this.filter.filterByCollectionStatus(e.target.value);
        this.updateSummary();
        if (this.onFilterChange) {
          this.onFilterChange(this.filter.getFiltered());
        }
      });
    }

    // Sort by
    const sortSelect = document.getElementById('sort-by');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.filter.sort(e.target.value, 'asc');
        this.updateSummary();
        if (this.onFilterChange) {
          this.onFilterChange(this.filter.getFiltered());
        }
      });
    }

    // Reset filters
    const resetBtn = document.getElementById('reset-filters-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.resetFilters();
      });
    }
  }

  /**
   * Update filter summary display
   */
  updateSummary() {
    const summaryDiv = document.getElementById('filter-summary');
    if (!summaryDiv) return;

    const stats = this.filter.getStats();
    const summary = `
      <span class="filter-info">
        📊 ${stats.filtered}/${stats.total} Karten
        (<span class="highlight">${stats.completionPercent}%</span> gesammelt)
      </span>
    `;
    summaryDiv.innerHTML = summary;
  }

  /**
   * Reset all filters
   */
  resetFilters() {
    document.getElementById('search-input').value = '';
    document.getElementById('filter-status').value = 'all';
    document.getElementById('sort-by').value = 'number';

    this.filter.clearFilters();
    this.updateSummary();

    if (this.onFilterChange) {
      this.onFilterChange(this.filter.getFiltered());
    }
  }

  /**
   * Get current filter state
   */
  getFilterState() {
    return {
      search: this.filter.searchTerm,
      status: this.filter.filters.collectionStatus,
      sort: this.filter.sortOrder.by
    };
  }

  /**
   * Set filter state (for restoring from localStorage)
   */
  setFilterState(state) {
    if (state.search) {
      document.getElementById('search-input').value = state.search;
      this.filter.search(state.search);
    }
    if (state.status) {
      document.getElementById('filter-status').value = state.status;
      this.filter.filterByCollectionStatus(state.status);
    }
    if (state.sort) {
      document.getElementById('sort-by').value = state.sort;
      this.filter.sort(state.sort);
    }

    this.updateSummary();
  }

  /**
   * Set callback for filter changes
   */
  onFiltersChanged(callback) {
    this.onFilterChange = callback;
  }
}

/**
 * Create and inject search/filter UI into page
 */
export function injectSearchFilterUI(targetSelector = '#main-container') {
  const searchUI = new SearchFilterUI();
  const target = document.querySelector(targetSelector);
  
  if (target) {
    const container = document.createElement('div');
    container.innerHTML = searchUI.createSearchBar();
    target.insertBefore(container.firstElementChild, target.querySelector('#cards-container'));
    searchUI.initializeEvents();
  }

  return searchUI;
}
