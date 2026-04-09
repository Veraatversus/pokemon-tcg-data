// ══════════════════════════════════════════════════════════════════════════
// VOICE COMMANDS & GESTURE RECOGNITION
// ══════════════════════════════════════════════════════════════════════════

import { scopedStoragePrefix } from './config.js';

export class VoiceCommandRecognizer {
  constructor(onCommand) {
    this.onCommand = onCommand;
    this.recognition = null;
    this.isListening = false;
    this.commands = {
      'set suchen': 'search-set',
      'set laden': 'load-set',
      'sammlung zeigen': 'show-collection',
      'statistiken': 'show-stats',
      'einstellungen': 'settings',
      'hilfe': 'help',
      'sicherung': 'backup',
      'karten hinzufügen': 'add-card',
      'karten entfernen': 'remove-card',
      'alle gekauft': 'mark-all-collected',
      'zurück': 'back',
      'weiter': 'next',
      'favoriten': 'favorites',
      'wunschliste': 'wishlists'
    };

    this.initRecognition();
  }

  initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Speech Recognition not supported in this browser');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'de-DE';
    this.recognition.continuous = false;
    this.recognition.interimResults = true;

    this.recognition.onstart = () => {
      this.isListening = true;
      console.log('🎤 Listening...');
    };

    this.recognition.onresult = (event) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        }
      }

      if (finalTranscript) {
        this.processVoiceCommand(finalTranscript.trim().toLowerCase());
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech Recognition error:', event.error);
      this.isListening = false;
    };

    this.recognition.onend = () => {
      this.isListening = false;
    };
  }

  processVoiceCommand(transcript) {
    console.log('🎤 Detected:', transcript);

    for (const [phrase, command] of Object.entries(this.commands)) {
      if (transcript.includes(phrase)) {
        console.log('✅ Command:', command);
        this.onCommand(command);
        return;
      }
    }

    console.log('⚠️ Unknown command');
  }

  start() {
    if (this.recognition && !this.isListening) {
      this.recognition.start();
    }
  }

  stop() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
    }
  }

  isSupported() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    return Boolean(SpeechRecognition);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// TOUCH GESTURE DETECTION
// ══════════════════════════════════════════════════════════════════════════

export class GestureRecognizer {
  constructor(element, onGesture) {
    this.element = element;
    this.onGesture = onGesture;
    this.startX = 0;
    this.startY = 0;
    this.startTime = 0;
    this.longPressTimer = null;

    this.init();
  }

  init() {
    this.element.addEventListener('touchstart', (e) => this.handleTouchStart(e));
    this.element.addEventListener('touchmove', (e) => this.handleTouchMove(e));
    this.element.addEventListener('touchend', (e) => this.handleTouchEnd(e));
  }

  handleTouchStart(e) {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.startX = touch.clientX;
      this.startY = touch.clientY;
      this.startTime = Date.now();

      // Long press detection
      this.longPressTimer = setTimeout(() => {
        this.onGesture('longpress', { x: touch.clientX, y: touch.clientY });
      }, 500);
    }
  }

  handleTouchMove(e) {
    // Could add continuous swipe feedback here
  }

  handleTouchEnd(e) {
    clearTimeout(this.longPressTimer);

    if (e.changedTouches.length === 1) {
      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - this.startX;
      const deltaY = touch.clientY - this.startY;
      const deltaTime = Date.now() - this.startTime;

      const threshold = 50;
      const timeThreshold = 300;

      // Quick swipe
      if (deltaTime < timeThreshold) {
        if (Math.abs(deltaX) > threshold && Math.abs(deltaX) > Math.abs(deltaY)) {
          if (deltaX > 0) {
            this.onGesture('swipe-right', { deltaX, deltaY });
          } else {
            this.onGesture('swipe-left', { deltaX, deltaY });
          }
        } else if (Math.abs(deltaY) > threshold && Math.abs(deltaY) > Math.abs(deltaX)) {
          if (deltaY > 0) {
            this.onGesture('swipe-down', { deltaX, deltaY });
          } else {
            this.onGesture('swipe-up', { deltaX, deltaY });
          }
        }
      }
    }

    // Pinch zoom detection (2 fingers)
    if (e.touches.length === 0 && this.previousDistance) {
      this.previousDistance = null;
    }
  }

  handlePinch(e) {
    if (e.touches.length === 2) {
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );

      if (this.previousDistance) {
        const scale = distance / this.previousDistance;
        this.onGesture('pinch', { scale, distance });
      }

      this.previousDistance = distance;
    }
  }
}

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

export function downloadCsv(filename, data) {
  try {
    let csv = '';

    if (Array.isArray(data) && data.length > 0) {
      // Extract headers
      const headers = Object.keys(data[0]);
      csv = headers.join(',') + '\n';

      // Add rows
      data.forEach((row) => {
        const values = headers.map((header) => {
          const value = row[header];
          return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
        });
        csv += values.join(',') + '\n';
      });
    } else if (typeof data === 'string') {
      csv = data;
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
    return true;
  } catch (err) {
    console.error('CSV download failed:', err);
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

export function restoreLocalBackup(key) {
  try {
    const backup = localStorage.getItem(key);
    if (!backup) return null;
    return JSON.parse(backup).data;
  } catch (err) {
    console.warn('Backup restore failed:', err);
    return null;
  }
}

export function deleteLocalBackup(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (err) {
    console.warn('Backup deletion failed:', err);
    return false;
  }
}

export function getLocalBackupSize() {
  try {
    let totalSize = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(BACKUP_PREFIX)) {
        totalSize += localStorage.getItem(key).length;
      }
    }
    return totalSize;
  } catch (err) {
    console.warn('Size calculation failed:', err);
    return 0;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// DUPLICATE DETECTION & MERGE
// ══════════════════════════════════════════════════════════════════════════

export function detectDuplicateCards(collection, setName) {
  const duplicates = [];
  const cardMap = collection[setName] || {};

  Object.entries(cardMap).forEach(([cardNum, data]) => {
    // Check if card marked multiple times with different conditions
    if (typeof data === 'object' && data.g && data.rh) {
      // Already has both conditions
      duplicates.push({
        cardNum,
        issue: 'Karte als G und RH markiert',
        suggestion: 'Entscheiden: nur G oder RH'
      });
    }
  });

  return duplicates;
}

export function mergeImportedCollections(collectionA, collectionB) {
  try {
    const merged = JSON.parse(JSON.stringify(collectionA)); // Deep clone

    Object.entries(collectionB).forEach(([setName, cards]) => {
      if (!merged[setName]) {
        merged[setName] = {};
      }

      Object.entries(cards).forEach(([cardNum, data]) => {
        if (!merged[setName][cardNum]) {
          // Card doesn't exist in A, add from B
          merged[setName][cardNum] = data;
        } else if (typeof data === 'object' && typeof merged[setName][cardNum] === 'object') {
          // Merge conditions (prefer RH > G)
          merged[setName][cardNum].g = merged[setName][cardNum].g || data.g;
          merged[setName][cardNum].rh = merged[setName][cardNum].rh || data.rh;
        }
      });
    });

    return merged;
  } catch (err) {
    console.error('Merge failed:', err);
    return collectionA;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// COLLECTION STATISTICS & INSIGHTS
// ══════════════════════════════════════════════════════════════════════════

export function generateAdvancedStatistics(collection, sets) {
  try {
    const stats = {
      totalCards: 0,
      totalHolographics: 0,
      rareCards: 0,
      completedSets: 0,
      almostComplete: [], // 90-99%
      neverStarted: [],   // 0 cards
      mostHolographic: null,
      leastHolographic: null,
      averagePercentage: 0
    };

    let totalPercentage = 0;
    let holoMinMax = { min: Infinity, max: 0, minSet: null, maxSet: null };

    sets.forEach((set) => {
      const cards = collection[set.setName] || {};
      const collected = Object.values(cards).filter((c) => c).length;
      const total = set.totalCards || 0;
      const percentage = total > 0 ? (collected / total) * 100 : 0;

      totalPercentage += percentage;
      stats.totalCards += collected;

      if (percentage === 100) {
        stats.completedSets++;
      } else if (percentage >= 90) {
        stats.almostComplete.push({
          setId: set.setId,
          setName: set.setName,
          percentage: percentage.toFixed(1),
          missing: total - collected
        });
      } else if (percentage === 0) {
        stats.neverStarted.push({
          setId: set.setId,
          setName: set.setName
        });
      }

      // Count holographics
      Object.values(cards).forEach((card) => {
        if (typeof card === 'object' && card.rh) {
          stats.totalHolographics++;
        }
      });

      // Track holo extremes
      if (percentage < holoMinMax.min) {
        holoMinMax.min = percentage;
        holoMinMax.minSet = set.setName;
      }
      if (percentage > holoMinMax.max) {
        holoMinMax.max = percentage;
        holoMinMax.maxSet = set.setName;
      }
    });

    stats.averagePercentage = sets.length > 0 ? (totalPercentage / sets.length).toFixed(1) : 0;
    stats.mostHolographic = holoMinMax.maxSet;
    stats.leastHolographic = holoMinMax.minSet;

    return stats;
  } catch (err) {
    console.error('Statistics generation failed:', err);
    return null;
  }
}

export function generateCollectionInsights(collection, sets) {
  const stats = generateAdvancedStatistics(collection, sets);
  if (!stats) return [];

  const insights = [];

  // Insight 1: Almost complete sets
  if (stats.almostComplete.length > 0) {
    insights.push({
      type: 'almost-complete',
      title: '🎯 Fast fertig',
      sets: stats.almostComplete.slice(0, 3),
      action: 'Konzentriere dich auf diese Sets'
    });
  }

  // Insight 2: Never started
  if (stats.neverStarted.length > 0) {
    insights.push({
      type: 'never-started',
      title: '📦 Neue Sets verfügbar',
      count: stats.neverStarted.length,
      action: 'Beginne mit' + (stats.neverStarted.length > 0 ? ' einem neuen Set' : '')
    });
  }

  // Insight 3: Holographic collection
  if (stats.totalHolographics > 10) {
    insights.push({
      type: 'holographic-collector',
      title: '✨ Holografisches Sammler',
      count: stats.totalHolographics,
      action: 'Du hast ' + stats.totalHolographics + ' holografische Karten'
    });
  }

  return insights;
}
