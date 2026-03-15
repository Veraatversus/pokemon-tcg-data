/**
 * ╔══════════════════════════════════════════════════════════════════════════
 * ║ COLLECTION VERSIONING – Point-in-Time Snapshots mit Auto-Rollback
 * ╚══════════════════════════════════════════════════════════════════════════
 */

import { scopedStorageKey } from './config.js';

const SNAPSHOTS_STORAGE_KEY = scopedStorageKey('collection-snapshots');
const MAX_SNAPSHOTS = 20;

export class CollectionSnapshot {
  constructor(name, collectionData, metadata = {}) {
    this.id = `snap_${Date.now()}`;
    this.name = name || `Snapshot ${new Date().toLocaleString('de-DE')}`;
    this.timestamp = new Date().toISOString();
    this.collectionData = collectionData;
    this.size = JSON.stringify(collectionData).length;
    this.metadata = {
      totalCards: Object.keys(collectionData || {}).length,
      ...metadata
    };
  }
}

/** Speichert einen Snapshot der Collection */
export function createSnapshot(name, collectionData, metadata = {}) {
  const snapshot = new CollectionSnapshot(name, collectionData, metadata);
  const snapshots = loadSnapshots();
  snapshots.unshift(snapshot);

  // Behalte nur die letzten MAX_SNAPSHOTS
  if (snapshots.length > MAX_SNAPSHOTS) {
    snapshots.pop();
  }

  persistSnapshots(snapshots);
  return snapshot;
}

/** Lädt alle Snapshots */
export function loadSnapshots() {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('[loadSnapshots]', err);
    return [];
  }
}

/** Speichert Snapshots persistent */
function persistSnapshots(snapshots) {
  try {
    localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots));
  } catch (err) {
    console.warn('[persistSnapshots]', err);
  }
}

/** Restauriert eine Collection von einem Snapshot */
export function restoreFromSnapshot(snapshotId) {
  const snapshots = loadSnapshots();
  const snapshot = snapshots.find((s) => s.id === snapshotId);
  if (!snapshot) throw new Error('Snapshot nicht gefunden');
  return snapshot.collectionData;
}

/** Löscht einen Snapshot */
export function deleteSnapshot(snapshotId) {
  let snapshots = loadSnapshots();
  snapshots = snapshots.filter((s) => s.id !== snapshotId);
  persistSnapshots(snapshots);
}

/** Gibt Größe aller Snapshots in MB zurück */
export function getSnapshotsSize() {
  const snapshots = loadSnapshots();
  const bytes = snapshots.reduce((sum, s) => sum + (s.size || 0), 0);
  return (bytes / 1024 / 1024).toFixed(2);
}

/** Auto-Snapshot: Erstellt vor jedem ImportAktion einen Snapshot */
export function createAutoSnapshot(actionName, collectionData) {
  return createSnapshot(`Auto: ${actionName} (${new Date().toLocaleTimeString('de-DE')})`, collectionData, {
    isAutomatic: true,
    action: actionName
  });
}

/** Gibt eine lesbare Summary der Snapshots */
export function getSnapshotsSummary() {
  const snapshots = loadSnapshots();
  const totalSize = getSnapshotsSize();
  return {
    count: snapshots.length,
    oldest: snapshots[snapshots.length - 1]?.timestamp || null,
    newest: snapshots[0]?.timestamp || null,
    totalSizeMB: totalSize,
    snapshots: snapshots.map((s) => ({
      id: s.id,
      name: s.name,
      timestamp: s.timestamp,
      cards: s.metadata.totalCards,
      size: (s.size / 1024).toFixed(2) + ' KB'
    }))
  };
}
