// @ts-check
import fs from 'node:fs';
import path from 'node:path';
import {
  MAP_CONFIG_VERSION,
  normalizeMapConfig,
  validateMapConfig,
} from '../shared/mapConfig.js';

const DEFAULT_MAP_PATH = path.resolve(
  process.cwd(),
  'server',
  'data',
  'world-map.json'
);

/** @typedef {Error & { details?: string[] }} MapConfigError */

export function resolveMapConfigPath(/** @type {any} */ env = process.env) {
  const raw = env.MAP_CONFIG_PATH;
  if (typeof raw === 'string' && raw.trim()) {
    return path.resolve(process.cwd(), raw.trim());
  }
  return DEFAULT_MAP_PATH;
}

export function loadMapConfigSync(/** @type {any} */ filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid map config JSON: ${message}`);
  }
  const normalized = normalizeMapConfig(parsed);
  const errors = validateMapConfig(normalized);
  if (errors.length) {
    throw new Error(`Map config validation failed: ${errors.join(' ')}`);
  }
  return normalized;
}

export async function saveMapConfig(/** @type {any} */ filePath, /** @type {any} */ config) {
  const normalized = normalizeMapConfig(config);
  const errors = validateMapConfig(normalized);
  if (errors.length) {
    const error = new Error('Map config validation failed.');
    /** @type {Error & { details?: string[] }} */ (error).details = errors;
    throw error;
  }

  normalized.version = MAP_CONFIG_VERSION;

  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  const json = `${JSON.stringify(normalized, null, 2)}\n`;
  await fs.promises.writeFile(tmpPath, json, 'utf8');
  await fs.promises.rename(tmpPath, filePath);
  return normalized;
}

function getAdminPassword(/** @type {any} */ req) {
  if (typeof req.get === 'function') {
    return req.get('x-admin-pass') || '';
  }
  return '';
}

export function createMapConfigHandlers(/** @type {any} */ { password, mapConfigPath, isAuthorized }) {
  const mapPath = mapConfigPath;

  const guard = (/** @type {any} */ req, /** @type {any} */ res) => {
    const authorized = typeof isAuthorized === 'function'
      ? isAuthorized(req)
      : getAdminPassword(req) === password;
    if (!authorized) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  };

  const getHandler = (/** @type {any} */ req, /** @type {any} */ res) => {
    if (!guard(req, res)) return;
    try {
      const config = loadMapConfigSync(mapPath);
      res.json(config);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load map config.';
      res.status(500).json({ error: message });
    }
  };

  const putHandler = async (/** @type {any} */ req, /** @type {any} */ res) => {
    if (!guard(req, res)) return;
    try {
      const saved = await saveMapConfig(mapPath, req.body ?? {});
      res.json({ ok: true, config: saved });
    } catch (err) {
      const error = /** @type {MapConfigError} */ (
        err instanceof Error ? err : new Error('Failed to save map config.')
      );
      if (error.details) {
        res.status(400).json({ error: 'Validation failed', details: error.details });
        return;
      }
      res.status(500).json({ error: error.message });
    }
  };

  return { getHandler, putHandler };
}
