import test from 'node:test';
import assert from 'node:assert/strict';

import { isPointerInsideElement } from '../js/views/set-view-controller.js';

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
