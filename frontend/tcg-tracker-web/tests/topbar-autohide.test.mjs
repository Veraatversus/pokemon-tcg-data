import test from 'node:test';
import assert from 'node:assert/strict';

import { createTopbarAutoHideController } from '../js/features/layout/topbar-autohide.js';

function createClassList() {
  const set = new Set();
  return {
    add: (...names) => names.forEach((name) => set.add(name)),
    remove: (...names) => names.forEach((name) => set.delete(name)),
    contains: (name) => set.has(name),
  };
}

test('topbar autohide collapses while mobile keyboard is open and restores after close', () => {
  const topbar = { offsetHeight: 96 };
  const bodyClassList = createClassList();
  const styleMap = new Map();

  const windowHandlers = new Map();
  const visualViewportHandlers = new Map();
  const documentHandlers = new Map();

  const inputElement = { tagName: 'INPUT', type: 'text', isContentEditable: false };

  const visualViewport = {
    height: 800,
    addEventListener: (name, handler) => visualViewportHandlers.set(name, handler),
  };

  const windowRef = {
    innerHeight: 800,
    scrollY: 0,
    visualViewport,
    requestAnimationFrame: (cb) => cb(),
    addEventListener: (name, handler) => windowHandlers.set(name, handler),
    matchMedia: (query) => ({ matches: query.includes('max-width') }),
  };

  const documentRef = {
    activeElement: null,
    querySelector: (selector) => (selector === '.topbar' ? topbar : null),
    scrollingElement: { scrollTop: 0 },
    documentElement: {
      scrollTop: 0,
      style: {
        setProperty: (key, value) => styleMap.set(key, value),
      },
    },
    body: {
      scrollTop: 0,
      classList: bodyClassList,
    },
    addEventListener: (name, handler) => documentHandlers.set(name, handler),
  };

  const { initAutoHideTopbar } = createTopbarAutoHideController({
    topbar,
    documentRef,
    windowRef,
  });

  initAutoHideTopbar();

  assert.equal(styleMap.get('--topbar-height'), '96px');
  assert.equal(bodyClassList.contains('topbar-collapsed'), false);

  documentRef.activeElement = inputElement;
  visualViewport.height = 520;
  visualViewportHandlers.get('resize')?.();

  assert.equal(bodyClassList.contains('topbar-collapsed'), true);

  documentRef.activeElement = null;
  visualViewport.height = 800;
  documentHandlers.get('focusout')?.();

  assert.equal(bodyClassList.contains('topbar-collapsed'), false);
});
