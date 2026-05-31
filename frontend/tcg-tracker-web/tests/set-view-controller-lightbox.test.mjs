import test from 'node:test';
import assert from 'node:assert/strict';

import { isPointerInsideElement, renderLightbox } from '../js/views/set-view-controller.js';

test('isPointerInsideElement erkennt Pointer innerhalb der Box', () => {
  const element = {
    getBoundingClientRect() {
      return { left: 10, top: 20, right: 50, bottom: 60 };
    }
  };

  const result = isPointerInsideElement({ clientX: 30, clientY: 40 }, element);
  assert.equal(result, true);
});

test('isPointerInsideElement liefert false bei ungueltigen Koordinaten', () => {
  const element = {
    getBoundingClientRect() {
      return { left: 10, top: 20, right: 50, bottom: 60 };
    }
  };

  assert.equal(isPointerInsideElement({}, element), false);
  assert.equal(isPointerInsideElement({ clientX: NaN, clientY: 30 }, element), false);
});

test('renderLightbox zeigt den Set-Namen und die Set-ID', () => {
  const dom = {
    lightboxImg: createImageNode(),
    lightboxTitle: createTextNode(),
    lightboxSubtitle: createTextNode(),
    lightboxCounter: createTextNode(),
    lightboxRarity: createFactNode(),
    lightboxHp: createFactNode(),
    lightboxTypes: createFactNode(),
    lightboxSupertype: createFactNode(),
    lightboxSubtypes: createFactNode(),
    lightboxEvolvesFrom: createFactNode(),
    lightboxArtist: createFactNode(),
    lightboxRegulationMark: createFactNode(),
    lightboxRules: createFactNode(),
    lightboxFlavorText: createFactNode(),
    lightboxSet: createFactNode(),
    lightboxCmLink: createLinkNode(),
    lightboxPriceMode: createTextNode(),
    lightboxPricePanel: createPanelNode(),
    lightboxPriceGrid: createPanelNode(),
    btnLightboxPrev: createButtonNode(),
    btnLightboxNext: createButtonNode(),
    lightboxGCheck: createCheckboxNode(),
    lightboxRhCheck: createCheckboxNode(),
    lightboxDialog: createDialogNode(),
    lightboxImageDialog: null,
    cards: createCardsNode()
  };

  const state = {
    cards: [{ number: '001', name: 'Bulbasaur', setId: 'sv1', setName: 'Scarlet & Violet' }],
    dbMap: new Map(),
    currentSet: { setId: 'sv1', setName: 'Scarlet & Violet' },
    lightboxIndex: 0
  };

  const originalDocument = globalThis.document;
  globalThis.document = createDocument();

  try {
    renderLightbox({
      dom,
      state,
      normalizeCardNumber: (value) => String(value || '').trim(),
      attachImageFallback: () => {},
      hydrateCardmarketLink: () => {},
      getCollectionUiState: () => ({ gChecked: false, gDisabled: true, rhChecked: false, rhDisabled: true })
    }, 0);
  } finally {
    globalThis.document = originalDocument;
  }

  assert.equal(dom.lightboxSet.textContent, 'Scarlet & Violet (sv1)');
});

function createTextNode() {
  return {
    textContent: '—',
    classList: createClassList()
  };
}

function createFactNode() {
  return {
    textContent: '—',
    classList: createClassList()
  };
}

function createCheckboxNode() {
  return {
    checked: false,
    disabled: false
  };
}

function createImageNode() {
  return {
    src: '',
    alt: '',
    removeAttribute(name) {
      if (name === 'src') this.src = '';
    }
  };
}

function createLinkNode() {
  return {
    href: '',
    textContent: '',
    title: '',
    classList: createClassList(),
    dataset: {}
  };
}

function createButtonNode() {
  return {
    disabled: false,
    focus() {}
  };
}

function createPanelNode() {
  return {
    hidden: false,
    innerHTML: '',
    classList: createClassList(),
    appendChild(child) {
      return child;
    },
    querySelector() {
      return null;
    }
  };
}

function createDocument() {
  return {
    createElement(tagName) {
      return createElementNode(tagName);
    }
  };
}

function createElementNode(tagName) {
  return {
    tagName: String(tagName || '').toUpperCase(),
    className: '',
    textContent: '',
    appendChild(child) {
      return child;
    },
    append(...children) {
      return children.at(-1) || null;
    }
  };
}

function createDialogNode() {
  return {
    open: false,
    scrollTop: 0,
    querySelector() {
      return null;
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    }
  };
}

function createCardsNode() {
  return {
    querySelector() {
      return null;
    }
  };
}

function createClassList() {
  const classes = new Set();
  return {
    add(...values) {
      values.forEach((value) => classes.add(value));
    },
    remove(...values) {
      values.forEach((value) => classes.delete(value));
    },
    toggle(value, force) {
      if (force === undefined) {
        if (classes.has(value)) {
          classes.delete(value);
          return false;
        }
        classes.add(value);
        return true;
      }
      if (force) classes.add(value);
      else classes.delete(value);
      return Boolean(force);
    },
    contains(value) {
      return classes.has(value);
    }
  };
}
