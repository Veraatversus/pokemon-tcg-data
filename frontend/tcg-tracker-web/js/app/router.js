const VIEWS = ['dashboard', 'set', 'stats', 'search'];

export function createRouter({
  state,
  dom,
  getSetById,
  ensureSetSelectorOption,
  loadCurrentSet,
  renderStats,
  runSearch,
  renderDashboard,
  setRecentSetsDropdownOpen,
  documentRef = document,
  windowRef = window,
} = {}) {
  function showView(viewId) {
    VIEWS.forEach((view) => {
      const element = documentRef.getElementById(`view-${view}`);
      if (element) element.classList.toggle('hidden', view !== viewId);
    });

    documentRef.querySelectorAll('.nav-link').forEach((link) => {
      link.classList.toggle('active', link.dataset.view === viewId);
    });

    dom.navSetSplit?.classList.toggle('is-active', viewId === 'set');
  }

  function navigate(path) {
    setRecentSetsDropdownOpen?.(false);
    windowRef.location.hash = path;
  }

  function handleRouteChange() {
    if (!state.loggedIn) return;

    const hash = windowRef.location.hash.replace(/^#\/?/, '') || 'dashboard';
    const [view, ...params] = hash.split('/');

    switch (view) {
      case 'set':
        showView('set');
        if (params[0]) {
          const targetSet = getSetById(params[0]);
          if (targetSet) {
            ensureSetSelectorOption(targetSet);
          }
          if (dom.selector.value !== params[0]) {
            dom.selector.value = params[0];
          }
          const shouldReloadSet = !state.currentSet
            || state.currentSet.setId !== params[0]
            || !Array.isArray(state.cards)
            || state.cards.length === 0;
          if (shouldReloadSet) {
            loadCurrentSet(false);
          }
        }
        break;
      case 'stats':
        showView('stats');
        renderStats();
        break;
      case 'search':
        showView('search');
        if (params[0]) {
          dom.searchInput.value = decodeURIComponent(params[0]);
          runSearch();
        } else {
          dom.searchInput.focus();
        }
        break;
      default:
        showView('dashboard');
        renderDashboard();
    }
  }

  return {
    showView,
    navigate,
    handleRouteChange,
  };
}