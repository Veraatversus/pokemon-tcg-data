import assert from 'node:assert/strict';
import { shouldAutoImportForCollectionToggle } from '../js/core/collection-state.js';

assert.equal(
  shouldAutoImportForCollectionToggle({ checked: true, currentSetImported: false, pendingSearchSetImport: false }),
  true,
  'Ein gesetzter Sammel-Haken auf einem nicht importierten Set muss Auto-Import auslösen.'
);

assert.equal(
  shouldAutoImportForCollectionToggle({ checked: true, currentSetImported: true, pendingSearchSetImport: true }),
  true,
  'Ein Search-Jump auf ein noch nicht importiertes Set muss ebenfalls Auto-Import auslösen.'
);

assert.equal(
  shouldAutoImportForCollectionToggle({ checked: false, currentSetImported: false, pendingSearchSetImport: true }),
  false,
  'Beim Entfernen eines Hakens darf kein Auto-Import stattfinden.'
);

assert.equal(
  shouldAutoImportForCollectionToggle({ checked: true, currentSetImported: true, pendingSearchSetImport: false }),
  false,
  'Bereits importierte Sets brauchen keinen Auto-Import.'
);

console.log('✅ collection-state regression ok');
