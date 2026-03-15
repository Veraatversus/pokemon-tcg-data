/**
 * ╔══════════════════════════════════════════════════════════════════════════
 * ║ COMMAND PALETTE – CMD+K / CTRL+K für intuitive Navigation
 * ║ Plus Keyboard Shortcuts für Power-User
 * ╚══════════════════════════════════════════════════════════════════════════
 */

const COMMANDS = [
  { id: 'sync', label: '🔄 Sync Overview', desc: 'Aktualisiert Set-Übersicht', category: 'API', hotkey: null },
  { id: 'import-batch', label: '📦 Batch-Import', desc: 'Mehrere Sets importieren', category: 'Import', hotkey: null },
  { id: 'health-check', label: '🩺 Datencheck', desc: 'Sucht nach Inkonsistenzen', category: 'Maintenance', hotkey: null },
  { id: 'backup-download', label: '💾 Backup exportieren', desc: 'Sichert Daten lokal', category: 'Backup', hotkey: 'Shift+B' },
  { id: 'parity-test', label: '🧪 Parity-Test', desc: 'Vergleicht Adapter/Compat', category: 'Testing', hotkey: null },
  { id: 'search', label: '🔍 Suche', desc: 'Fuzzy-Suche für Karten/Sets', category: 'Navigation', hotkey: '/' },
  { id: 'settings', label: '⚙️ Einstellungen', desc: 'App-Einstellungen', category: 'System', hotkey: null },
  { id: 'snapshots', label: '📸 Snapshots', desc: 'Collection-Versionen', category: 'Versioning', hotkey: null },
  { id: 'marketplace', label: '💱 Trading Marketplace', desc: 'Handelsangebote & Matches', category: 'Trading', hotkey: null },
  { id: 'wanted', label: '🎯 Gesuchte Karten', desc: 'Wanted-Liste verwalten', category: 'Trading', hotkey: null },
  { id: 'collection-value', label: '💰 Kollektionswert', desc: 'Wertschätzung deiner Sammlung', category: 'Analytics', hotkey: null },
  { id: 'ml-recommendations', label: '🧠 ML-Empfehlungen', desc: 'KI-basierte Set-Priorisierung', category: 'AI', hotkey: null },
  { id: 'live-dashboard', label: '📊 Live Dashboard', desc: 'Realtime KPIs & Health', category: 'Analytics', hotkey: null },
  { id: 'help', label: '❓ Keyboard Help', desc: 'Shortcuts anzeigen', category: 'Help', hotkey: '?' }
];

let paletteOpen = false;
let selectedCommandIndex = 0;

/** Initialisiert Command Palette */
export function initCommandPalette(commandHandlers = {}) {
  // Erstelle Palette HTML
  const palette = createPaletteElement();
  document.body.appendChild(palette);

  // Global keyboard listeners
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      toggleCommandPalette();
      return;
    }

    if (e.key === '/' && !paletteOpen) {
      e.preventDefault();
      openCommandPalette();
      simulateSearch('/');
      return;
    }

    if (e.key === '?') {
      e.preventDefault();
      showKeyboardShortcuts();
      return;
    }

    if (paletteOpen) {
      handlePaletteKeyboard(e);
    }

    // Custom hotkeys
    if (e.shiftKey && e.key === 'B') {
      e.preventDefault();
      commandHandlers['backup-download']?.();
    }
  });

  // Command execution
  const commandElements = document.querySelectorAll('[data-command]');
  commandElements.forEach((el) => {
    el.addEventListener('click', () => {
      const cmdId = el.dataset.command;
      executeCommand(cmdId, commandHandlers);
      closePalette();
    });
  });
}

function createPaletteElement() {
  const container = document.createElement('div');
  container.id = 'command-palette';
  container.className = 'command-palette-hidden';
  container.innerHTML = `
    <div class="command-palette-backdrop"></div>
    <div class="command-palette-box">
      <div class="command-palette-input-wrapper">
        <span class="command-palette-icon">🔍</span>
        <input 
          type="search" 
          id="command-palette-input" 
          class="command-palette-input" 
          placeholder="Commands, Sets, Karten… (Tippe / oder ?)" 
          autocomplete="off"
        />
        <span class="command-palette-hint">ESC to close</span>
      </div>
      <div id="command-palette-results" class="command-palette-results">
        ${COMMANDS.map(
          (cmd, i) => `
        <div 
          class="command-palette-item ${i === 0 ? 'selected' : ''}" 
          data-command="${cmd.id}"
          data-index="${i}"
        >
          <div class="command-item-main">
            <span class="command-label">${cmd.label}</span>
            <span class="command-category">${cmd.category}</span>
          </div>
          <span class="command-desc">${cmd.desc}</span>
          ${cmd.hotkey ? `<span class="command-hotkey">${cmd.hotkey}</span>` : ''}
        </div>
      `
        ).join('')}
      </div>
      <div class="command-palette-footer">
        <span class="footer-hint">↑↓ to navigate • ENTER to select • ESC to close</span>
      </div>
    </div>
  `;

  container.addEventListener('click', (e) => {
    if (e.target === container || e.target.classList.contains('command-palette-backdrop')) {
      closePalette();
    }
  });

  return container;
}

function toggleCommandPalette() {
  paletteOpen ? closePalette() : openCommandPalette();
}

function openCommandPalette() {
  paletteOpen = true;
  const palette = document.getElementById('command-palette');
  if (palette) {
    palette.classList.remove('command-palette-hidden');
    document.getElementById('command-palette-input')?.focus();
    selectedCommandIndex = 0;
    updateSelection();
  }
}

function closePalette() {
  paletteOpen = false;
  const palette = document.getElementById('command-palette');
  if (palette) {
    palette.classList.add('command-palette-hidden');
  }
}

function simulateSearch(query) {
  const input = document.getElementById('command-palette-input');
  if (input) {
    input.value = query;
    filterCommands(query);
  }
}

function filterCommands(query) {
  const normalized = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  const items = document.querySelectorAll('.command-palette-item');
  let visibleCount = 0;

  items.forEach((item, idx) => {
    const label = item.querySelector('.command-label')?.textContent || '';
    const desc = item.querySelector('.command-desc')?.textContent || '';
    const searchable = (label + desc).toLowerCase().replace(/[^a-z0-9]/g, '');
    const match = searchable.includes(normalized);

    item.classList.toggle('hidden', !match);
    if (match) visibleCount++;
  });

  selectedCommandIndex = 0;
  updateSelection();
}

function handlePaletteKeyboard(e) {
  const items = Array.from(document.querySelectorAll('.command-palette-item:not(.hidden)'));
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedCommandIndex = (selectedCommandIndex + 1) % items.length;
    updateSelection();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedCommandIndex = (selectedCommandIndex - 1 + items.length) % items.length;
    updateSelection();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const selected = items[selectedCommandIndex];
    if (selected) {
      selected.click();
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closePalette();
  }
}

function updateSelection() {
  const items = Array.from(document.querySelectorAll('.command-palette-item:not(.hidden)'));
  items.forEach((item, idx) => {
    item.classList.toggle('selected', idx === selectedCommandIndex);
  });

  // Scroll into view
  items[selectedCommandIndex]?.scrollIntoView({ block: 'nearest' });
}

function executeCommand(cmdId, handlers) {
  const handler = handlers[cmdId];
  if (handler) {
    handler();
  } else {
    console.warn(`[CommandPalette] No handler for ${cmdId}`);
  }
}

function showKeyboardShortcuts() {
  const shortcuts = [
    ['CMD + K / CTRL + K', 'Command Palette öffnen'],
    ['/', 'Suche öffnen'],
    ['?', 'Shortcuts anzeigen'],
    ['SHIFT + B', 'Backup exportieren'],
    ['↑ ↓', 'Navigieren in Palette'],
    ['ENTER', 'Command ausführen'],
    ['ESC', 'Palette schließen']
  ];

  const message = shortcuts.map(([key, desc]) => `${key.padEnd(20)} → ${desc}`).join('\n');
  alert(`⌨️ Keyboard Shortcuts:\n\n${message}`);
}

// Search input integration
export function integrateCommandPaletteSearch() {
  const input = document.getElementById('command-palette-input');
  if (input) {
    input.addEventListener('input', (e) => filterCommands(e.target.value));
  }
}

export { openCommandPalette, closePalette };
