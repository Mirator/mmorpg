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

export function resolveMapConfigPath(env = process.env) {
  const raw = env.MAP_CONFIG_PATH;
  if (typeof raw === 'string' && raw.trim()) {
    return path.resolve(process.cwd(), raw.trim());
  }
  return DEFAULT_MAP_PATH;
}

export function loadMapConfigSync(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid map config JSON: ${err.message}`);
  }
  const normalized = normalizeMapConfig(parsed);
  const errors = validateMapConfig(normalized);
  if (errors.length) {
    throw new Error(`Map config validation failed: ${errors.join(' ')}`);
  }
  return normalized;
}

export async function saveMapConfig(filePath, config) {
  const normalized = normalizeMapConfig(config);
  const errors = validateMapConfig(normalized);
  if (errors.length) {
    const error = new Error('Map config validation failed.');
    error.details = errors;
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

function getAdminPassword(req) {
  if (typeof req.get === 'function') {
    return req.get('x-admin-pass') || '';
  }
  return '';
}

export function createMapConfigHandlers({ password, mapConfigPath }) {
  const mapPath = mapConfigPath;

  const guard = (req, res) => {
    const provided = getAdminPassword(req);
    if (provided !== password) {
      res.status(401).json({ error: 'Unauthorized' });
      return false;
    }
    return true;
  };

  const getHandler = (req, res) => {
    if (!guard(req, res)) return;
    try {
      const config = loadMapConfigSync(mapPath);
      res.json(config);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  };

  const putHandler = async (req, res) => {
    if (!guard(req, res)) return;
    try {
      const saved = await saveMapConfig(mapPath, req.body ?? {});
      res.json({ ok: true, config: saved });
    } catch (err) {
      if (err?.details) {
        res.status(400).json({ error: 'Validation failed', details: err.details });
        return;
      }
      res.status(500).json({ error: err?.message ?? 'Failed to save map config.' });
    }
  };

  return { getHandler, putHandler };
}
