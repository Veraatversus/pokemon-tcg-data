import test from 'node:test';
import assert from 'node:assert/strict';
import { actions, registerActions } from '../js/app/actions.js';

test('registrierte Aktion wird aufgerufen und gibt den Rueckgabewert zurueck', () => {
  registerActions({ addiere: (a, b) => a + b });
  assert.equal(actions.addiere(2, 3), 5);
});

test('nicht registrierte Aktion wirft mit Namen in der Meldung', () => {
  assert.throws(() => actions.gibtEsNicht(), /Aktion "gibtEsNicht" ist nicht registriert/);
});

test('doppelte Registrierung eines Namens wirft', () => {
  registerActions({ einmalig: () => 1 });
  assert.throws(() => registerActions({ einmalig: () => 2 }), /einmalig/);
});
