import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidSetPayload(payload) {
  return isObject(payload) && Array.isArray(payload.cards);
}

function createDefaultScriptsDir() {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.join(currentDir, 'custom-sets');
}

function getLogger(logger) {
  if (logger && typeof logger.info === 'function' && typeof logger.warn === 'function') {
    return logger;
  }

  return {
    info: (...parts) => console.log(...parts),
    warn: (...parts) => console.warn(...parts),
  };
}

export async function applyCustomSetScripts(artifacts, { scriptsDir = createDefaultScriptsDir(), logger } = {}) {
  const safeLogger = getLogger(logger);
  if (!isObject(artifacts) || !isObject(artifacts.sets)) {
    safeLogger.warn('[cardmarket-custom-sets] skipped: artifacts.sets missing');
    return artifacts;
  }

  let files = [];
  try {
    files = await fs.readdir(scriptsDir, { withFileTypes: true });
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      safeLogger.warn('[cardmarket-custom-sets] failed to read scripts dir:', error?.message || error);
    }
    return artifacts;
  }

  const scriptFiles = files
    .filter((entry) => entry.isFile() && /^\d+\.mjs$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((left, right) => Number(left.replace(/\.mjs$/i, '')) - Number(right.replace(/\.mjs$/i, '')));

  if (!scriptFiles.length) {
    safeLogger.info('[cardmarket-custom-sets] no custom set scripts found');
    return artifacts;
  }

  safeLogger.info(`[cardmarket-custom-sets] discovered ${scriptFiles.length} script(s)`);

  for (const fileName of scriptFiles) {
    const setId = fileName.replace(/\.mjs$/i, '');
    const currentPayload = artifacts.sets[setId];

    if (!isValidSetPayload(currentPayload)) {
      continue;
    }

    const scriptPath = path.join(scriptsDir, fileName);

    try {
      const moduleUrl = `${pathToFileURL(scriptPath).href}?ts=${Date.now()}`;
      const customModule = await import(moduleUrl);
      if (typeof customModule.transformSet !== 'function') {
        safeLogger.warn(`[cardmarket-custom-sets] ${fileName} skipped: missing transformSet export`);
        continue;
      }

      const transformedPayload = await customModule.transformSet(currentPayload, {
        setId,
        artifacts,
        logger: safeLogger,
      });

      if (!isValidSetPayload(transformedPayload)) {
        safeLogger.warn(`[cardmarket-custom-sets] ${fileName} skipped: invalid payload result`);
        continue;
      }

      artifacts.sets[setId] = transformedPayload;
      safeLogger.info(`[cardmarket-custom-sets] applied ${fileName}`);
    } catch (error) {
      safeLogger.warn(`[cardmarket-custom-sets] ${fileName} failed:`, error?.message || error);
    }
  }

  return artifacts;
}
