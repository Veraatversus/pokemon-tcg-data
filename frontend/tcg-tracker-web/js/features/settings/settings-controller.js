/**
 * settings-controller.js
 * Encapsulates settings dialog creation and save flow.
 */

export function createSettingsController({
  loadSettings,
  saveSettings,
  createSettingsPanel,
  showToast,
  reloadPage = () => window.location.reload(),
}) {
  function closeOtherOpenDialogs(except = []) {
    const keep = new Set(except.filter(Boolean));
    document.querySelectorAll('dialog[open]').forEach((dialog) => {
      if (keep.has(dialog)) return;
      try {
        dialog.close();
      } catch {
        // ignore dialogs that cannot be closed in current state
      }
    });
  }

  function openSettingsDialog() {
    const currentSettings = loadSettings();
    const settingsPanel = createSettingsPanel(currentSettings, (updated) => {
      saveSettings(updated);
      showToast('Einstellungen gespeichert', 'success', 2000);
      reloadPage();
    });

    const dialog = document.createElement('dialog');
    dialog.id = 'dialog-settings';
    dialog.className = 'ss-dialog';
    dialog.style.cssText = 'width: min(92vw, 760px); max-height: 88vh;';
    dialog.innerHTML = '<h2>Einstellungen</h2>';
    dialog.appendChild(settingsPanel);
    document.body.appendChild(dialog);
    closeOtherOpenDialogs([dialog]);
    dialog.showModal();
    dialog.addEventListener('close', () => dialog.remove());
  }

  return {
    openSettingsDialog,
  };
}
