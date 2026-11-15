// Hash-Router und View-Verwaltung.
import { dom } from './dom.js';
import { state } from './state.js';
import { actions } from './actions.js';

const VIEWS = ['dashboard', 'set', 'stats', 'search'];

export function showView(viewId) {
  VIEWS.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== viewId);
  });
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.view === viewId);
  });
  dom.navSetSplit?.classList.toggle('is-active', viewId === 'set');
}

export function navigate(path) {
  actions.setRecentSetsDropdownOpen(false);
  window.location.hash = path;
}

export function handleRouteChange() {
  if (!state.loggedIn) return;
  const hash = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
  const [view, ...params] = hash.split('/');
  switch (view) {
    case 'set':
      showView('set');
      if (params[0]) {
        const targetSet = actions.getSetById(params[0]);
        if (targetSet) {
          actions.ensureSetSelectorOption(targetSet);
        }
        if (dom.selector.value !== params[0]) {
          dom.selector.value = params[0];
        }
        const shouldReloadSet = !state.currentSet
          || state.currentSet.setId !== params[0]
          || !Array.isArray(state.cards)
          || state.cards.length === 0;
        if (shouldReloadSet) {
          actions.loadCurrentSet(false);
        }
      }
      break;
    case 'stats':
      showView('stats');
      actions.renderStats();
      break;
    case 'search':
      showView('search');
      if (params[0]) {
        dom.searchInput.value = decodeURIComponent(params[0]);
        actions.runSearch();
      } else {
        dom.searchInput.focus();
      }
      break;
    default:
      showView('dashboard');
      actions.renderDashboard();
  }
}
