// ══════════════════════════════════════════════════════════════════════════
// BACKUP / EXPORT
// ══════════════════════════════════════════════════════════════════════════

import { scopedStoragePrefix } from './core/config.js';
// ══════════════════════════════════════════════════════════════════════════
// DATA EXPORT UTILITIES
// ══════════════════════════════════════════════════════════════════════════

export function downloadJson(filename, data) {
  try {
    const json = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('Download failed:', err);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// LOCAL BACKUP/RESTORE
// ══════════════════════════════════════════════════════════════════════════

const BACKUP_PREFIX = scopedStoragePrefix('backup-');

export function createLocalBackup(data, name) {
  try {
    const timestamp = new Date().toISOString();
    const backup = {
      name: name || `Backup ${timestamp.split('T')[0]}`,
      timestamp,
      data,
      version: 1
    };

    const key = BACKUP_PREFIX + Date.now();
    localStorage.setItem(key, JSON.stringify(backup));
    return key;
  } catch (err) {
    console.warn('Backup creation failed:', err);
    return null;
  }
}

export function getLocalBackups() {
  try {
    const backups = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(BACKUP_PREFIX)) {
        const backup = JSON.parse(localStorage.getItem(key));
        backups.push({ key, ...backup });
      }
    }
    return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    console.warn('Failed to get backups:', err);
    return [];
  }
}
