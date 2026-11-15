// Zuletzt geoeffnete Sets: Speicherung, Chips im Nav-Dropdown und Set-Link in der Navigation.
import { RECENT_SETS_STORAGE_KEY } from '../core/storage-keys.js';
import { dom } from './dom.js';
import { state } from './state.js';
import { navigate } from './router.js';

export function loadRecentSets() {
  try {
    const raw = localStorage.getItem(RECENT_SETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && item.setId)
      .map((item) => ({
        setId: String(item.setId),
        setName: String(item.setName || item.setId),
        at: Number(item.at) || Date.now()
      }))
      .slice(0, 8);
  } catch (err) {
    console.warn('[loadRecentSets]', err);
    return [];
  }
}

function saveRecentSets() {
  try {
    localStorage.setItem(RECENT_SETS_STORAGE_KEY, JSON.stringify(state.recentSets || []));
  } catch (err) {
    console.warn('[saveRecentSets]', err);
  }
}

export function syncSetNavLink(setMeta = state.currentSet) {
  if (!dom.navSetLink) return;
  const label = String(setMeta?.setName || 'Set-Ansicht');
  dom.navSetLink.textContent = label;
  dom.navSetLink.title = label;
  dom.navSetLink.href = setMeta?.setId ? `#set/${setMeta.setId}` : '#set';
}

export function positionRecentSetsDropdown() {
  if (!dom.navSetSplit || !dom.recentSets || !dom.navSetSplit.classList.contains('open')) return;

  const anchorRect = dom.navSetSplit.getBoundingClientRect();
  const viewportPadding = 12;
  const maxWidth = Math.min(340, window.innerWidth - (viewportPadding * 2));
  const menuWidth = Math.min(dom.recentSets.offsetWidth || maxWidth, maxWidth);
  let left = anchorRect.left;

  if ((left + menuWidth) > (window.innerWidth - viewportPadding)) {
    left = window.innerWidth - viewportPadding - menuWidth;
  }
  if (left < viewportPadding) {
    left = viewportPadding;
  }

  dom.recentSets.style.setProperty('--recent-sets-left', `${Math.round(left)}px`);
  dom.recentSets.style.setProperty('--recent-sets-top', `${Math.round(anchorRect.bottom + 8)}px`);
}

export function setRecentSetsDropdownOpen(isOpen) {
  if (!dom.navSetSplit || !dom.btnNavSetToggle || !dom.recentSets) return;
  const hasItems = !dom.recentSets.classList.contains('hidden') && dom.recentSets.childElementCount > 0;
  const shouldOpen = Boolean(isOpen) && hasItems;
  dom.navSetSplit.classList.toggle('open', shouldOpen);
  dom.btnNavSetToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  if (shouldOpen) {
    window.requestAnimationFrame(positionRecentSetsDropdown);
  }
}

function syncRecentSetsDropdownAvailability(hasItems) {
  if (!dom.btnNavSetToggle) return;
  dom.btnNavSetToggle.disabled = !hasItems;
  dom.btnNavSetToggle.setAttribute('aria-disabled', hasItems ? 'false' : 'true');
  if (!hasItems) {
    setRecentSetsDropdownOpen(false);
  }
}

export function renderRecentSets() {
  if (!dom.recentSets) return;
  const recent = (Array.isArray(state.recentSets) ? state.recentSets : [])
    .filter((entry) => !state.isExcludedSet(entry));
  if (!state.loggedIn || recent.length === 0) {
    dom.recentSets.classList.add('hidden');
    dom.recentSets.innerHTML = '';
    syncRecentSetsDropdownAvailability(false);
    return;
  }

  const labelsById = new Map((state.allSets || []).map((set) => [set.setId, set.setName || set.setId]));
  dom.recentSets.innerHTML = recent
    .map((entry) => {
      const label = labelsById.get(entry.setId) || entry.setName || entry.setId;
      return `<button class="recent-set-chip" type="button" role="menuitem" data-set-id="${entry.setId}" title="${label}">${label}</button>`;
    })
    .join('');
  dom.recentSets.classList.remove('hidden');
  syncRecentSetsDropdownAvailability(true);
  if (dom.navSetSplit?.classList.contains('open')) {
    window.requestAnimationFrame(positionRecentSetsDropdown);
  }

  dom.recentSets.querySelectorAll('.recent-set-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const setId = chip.dataset.setId;
      if (!setId) return;
      dom.selector.value = setId;
      setRecentSetsDropdownOpen(false);
      navigate(`set/${setId}`);
    });
  });
}

export function markSetAsRecent(setMeta) {
  if (!setMeta?.setId) return;
  const normalizedId = String(setMeta.setId);
  const normalizedName = String(setMeta.setName || normalizedId);
  const next = [
    { setId: normalizedId, setName: normalizedName, at: Date.now() },
    ...(state.recentSets || []).filter((entry) => String(entry.setId) !== normalizedId)
  ].slice(0, 8);

  state.recentSets = next;
  saveRecentSets();
  renderRecentSets();
}
