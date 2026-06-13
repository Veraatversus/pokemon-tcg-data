#!/usr/bin/env node
// scripts/ensure-cardmarket-junction.mjs
//
// Stellt sicher, dass `frontend/tcg-tracker-web/cardmarket` als Junction
// (Verzeichnis-Hardlink) auf `../../cardmarket` existiert. Hintergrund:
// In `getCardmarketBaseUrl` prueft die App, ob `isLocalOrigin()` aktiv
// ist (localhost/127.0.0.1), und faellt dann auf `${origin}/cardmarket`
// zurueck. Ohne diese Junction antwortet der Dev-Server mit 404 fuer
// alle /cardmarket/*.json-Requests, was sich in der Console als
// '[cardmarket] price lookup failed Error: Cardmarket data error 404'
// aeussert und keine Cardmarket-Preise liefert.
//
// Idempotent: wenn die Junction schon korrekt zeigt, wird sie nicht
// neu erstellt. Wenn sie als regulaeres Verzeichnis existiert, wird
// der User mit einem klaren Hinweis gebeten, sie manuell zu loeschen
// (Sicherheitsfeature – wir wollen nie ungefragt ein Verzeichnis mit
// potentiellen User-Daten ueberschreiben).

import { existsSync, statSync, lstatSync, readlinkSync, symlinkSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, '..');
const JUNCTION_PATH = join(APP_DIR, 'cardmarket');
const REPO_ROOT = resolve(APP_DIR, '..', '..');
const CARDMARKET_TARGET = join(REPO_ROOT, 'cardmarket');

if (!existsSync(CARDMARKET_TARGET)) {
  console.error(`[ensure-cardmarket-junction] Ziel nicht gefunden: ${CARDMARKET_TARGET}`);
  console.error('  Hast du das Repo-Root richtig geclont? Der cardmarket/-Ordner fehlt.');
  process.exit(0); // nicht fatal – Production nutzt veraatversus.github.io direkt
}

if (existsSync(JUNCTION_PATH)) {
  try {
    const lstat = lstatSync(JUNCTION_PATH);
    if (lstat.isSymbolicLink() || lstat.isDirectory()) {
      // Auf Windows ist eine Junction ein Directory mit speziellem Status
      const target = readlinkSync(JUNCTION_PATH);
      if (target && target.includes('cardmarket')) {
        console.log(`[ensure-cardmarket-junction] Junction existiert bereits: ${JUNCTION_PATH} -> ${target}`);
        process.exit(0);
      }
    }
    // Es ist ein regulaeres Verzeichnis (kein Symlink/Junction) – potenziell
    // kritisch, weil wir nicht wissen, was drin ist.
    const stat = statSync(JUNCTION_PATH);
    if (stat.isDirectory()) {
      // Junction auf Windows ist technisch ein Directory – das ist OK,
      // wenn readlinkSync den richtigen Target zurueckgibt.
      try {
        const target = readlinkSync(JUNCTION_PATH);
        if (target) {
          console.log(`[ensure-cardmarket-junction] Junction existiert: ${JUNCTION_PATH} -> ${target}`);
          process.exit(0);
        }
      } catch { /* kein Symlink, normales Verzeichnis */ }
      console.error(`[ensure-cardmarket-junction] FEHLER: ${JUNCTION_PATH} ist ein regulaeres Verzeichnis.`);
      console.error('  Bitte manuell loeschen (es enthaelt evtl. User-Daten):');
      console.error(`    Remove-Item -Recurse -Force "${JUNCTION_PATH}"`);
      console.error('  Dann das Skript erneut laufen.');
      process.exit(1);
    }
  } catch (err) {
    // lstat kann fehlschlagen, dann versuchen wir es mit der direkten Anlage
  }
}

try {
  // type: 'junction' ist Windows-spezifisch (Verzeichnis-Hardlink ohne
  // Admin-Rechte). Auf POSIX wird automatisch ein Symlink erstellt.
  symlinkSync(CARDMARKET_TARGET, JUNCTION_PATH, 'junction');
  console.log(`[ensure-cardmarket-junction] erstellt: ${JUNCTION_PATH} -> ${CARDMARKET_TARGET}`);
} catch (err) {
  console.error(`[ensure-cardmarket-junction] FEHLER: ${err.message}`);
  console.error('  Auf Windows eventuell Adminrechte noetig (Junction sollte aber ohne funktionieren).');
  process.exit(1);
}
