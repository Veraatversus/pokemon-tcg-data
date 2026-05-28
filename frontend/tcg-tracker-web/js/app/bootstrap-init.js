export function setupBootstrapEventBindings({
  dom,
  navigate,
  setRecentSetsDropdownOpen,
  setRefreshMenuOpen,
  positionRecentSetsDropdown,
  handleRouteChange,
  getEngineMetrics
}) {
  // Start Smart Engine metrics update loop
  setInterval(() => {
    try {
      const metrics = getEngineMetrics();
      const metricsEl = document.getElementById('engine-metrics');
      if (metricsEl) {
        metricsEl.classList.remove('hidden');
        const rateEl = document.getElementById('metric-cache-rate');
        const statusEl = document.getElementById('metric-api-status');
        if (rateEl) rateEl.textContent = metrics.cacheHitRate;
        if (statusEl) statusEl.textContent = metrics.status === 'online' ? '🟢 online' : '🔴 offline';
      }
    } catch (err) {
      console.warn('[metrics update]', err);
    }
  }, 5000);

  document.querySelectorAll('.nav-link').forEach((link) => {
    if (link.dataset.navToggle) return;
    link.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(link.dataset.view);
    });
  });

  dom.btnNavSetToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dom.btnNavSetToggle.disabled) return;
    setRecentSetsDropdownOpen(!dom.navSetSplit?.classList.contains('open'));
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Node)) return;
    if (!dom.navSetSplit?.contains(event.target)) {
      setRecentSetsDropdownOpen(false);
    }
    if (!dom.refreshSplit?.contains(event.target)) {
      setRefreshMenuOpen(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setRecentSetsDropdownOpen(false);
      setRefreshMenuOpen(false);
    }
  });

  window.addEventListener('resize', positionRecentSetsDropdown, { passive: true });
  window.addEventListener('scroll', positionRecentSetsDropdown, { passive: true });
  window.addEventListener('hashchange', handleRouteChange);
}

export async function runAuthBootstrapSequence({
  dom,
  state,
  setRefreshMenuOpen,
  setLoading,
  setGlobalStatus,
  initAuth,
  syncAuthButtonLabel,
  signOut,
  resetToLoggedOut,
  showToast,
  signIn,
  onLoginSuccess,
  isSignedIn,
  navigate,
  loadCurrentSet,
  reimportCurrentSetFromApi,
  syncRefreshControls,
  syncSetNavLink,
  setEmptyState,
  exportMissingCards,
  showView
}) {
  setLoading(true, 'Initialisiere…');
  setGlobalStatus('Initialisiere Google API…');

  try {
    const autoLoggedIn = await initAuth();

    syncAuthButtonLabel();
    window.addEventListener('resize', syncAuthButtonLabel, { passive: true });

    dom.auth.addEventListener('click', async () => {
      if (dom.auth.dataset.state === 'out') { signOut(); resetToLoggedOut(); return; }
      dom.auth.disabled = true;
      setGlobalStatus('Bitte Google-Login im Popup abschließen…');
      showToast('Google-Login im Popup geöffnet.', 'info', 2600);
      const ok = await signIn();
      if (!ok) { dom.auth.disabled = false; showToast('Login fehlgeschlagen oder abgebrochen.', 'error'); setGlobalStatus('Login fehlgeschlagen oder abgebrochen.'); return; }
      onLoginSuccess();
    });

    dom.load.addEventListener('click', async () => {
      if (!isSignedIn()) return;
      setRefreshMenuOpen(false);
      const setId = dom.selector.value;
      if (setId) navigate(`set/${setId}`);
      await loadCurrentSet(false);
    });

    dom.refresh.addEventListener('click', async () => {
      if (!isSignedIn() || !state.currentSet) return;
      setRefreshMenuOpen(false);
      await loadCurrentSet(true);
    });

    dom.btnRefreshMenu?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isSignedIn() || dom.btnRefreshMenu.disabled || !state.currentSet) return;
      setRefreshMenuOpen(dom.refreshMenu?.classList.contains('hidden'));
    });

    dom.btnRefreshReimport?.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      setRefreshMenuOpen(false);
      if (!isSignedIn() || !state.currentSet) return;
      await reimportCurrentSetFromApi();
    });

    dom.selector.addEventListener('change', () => {
      setRefreshMenuOpen(false);
      const setId = dom.selector.value;
      if (setId) {
        navigate(`set/${setId}`);
        return;
      }
      state.currentSet = null;
      state.cards = [];
      state.dbMap = new Map();
      syncRefreshControls();
      syncSetNavLink(null);
      dom.cards.innerHTML = '';
      dom.statsSection.classList.add('hidden');
      dom.filterSection.classList.add('hidden');
      dom.sortSection.classList.add('hidden');
      dom.setLogoWrap.classList.add('hidden');
      setEmptyState(true);
    });

    dom.btnMissingExport.addEventListener('click', exportMissingCards);

    if (autoLoggedIn) {
      onLoginSuccess();
    } else {
      setLoading(false);
      setGlobalStatus('Bereit. Bitte anmelden.');
      showView('dashboard');
    }
  } catch (err) {
    setLoading(false);
    showToast(`Init-Fehler: ${err.message}`, 'error');
    setGlobalStatus(`Fehler: ${err.message}`);
  }
}