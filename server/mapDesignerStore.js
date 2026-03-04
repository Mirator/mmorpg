// @ts-check

import fs from 'node:fs';
import path from 'node:path';
import {
  DESIGNER_LAYER_LIST,
  DESIGNER_ZONE_KEY_DEFAULT,
  PATCH_STATUS,
  applyZoneSnapshot,
  captureZoneSnapshot,
  cloneDesignerState,
  createDefaultDesignerStateRoot,
  createDefaultZoneDesignerState,
  isDesignerLayerId,
  isValidPatchTransition,
  normalizeDesignerStateRoot,
  normalizeZoneDesignerState,
  normalizeZoneKey,
  validateDesignerStateRoot,
} from '../shared/mapDesignerState.js';
import { normalizeMapConfig, validateMapConfig } from '../shared/mapConfig.js';
import { loadMapConfigSync, saveMapConfig } from './mapConfig.js';

const DEFAULT_MAP_DESIGNER_STATE_PATH = path.resolve(
  process.cwd(),
  'server',
  'data',
  'world-map.designer.json'
);

const MAX_AUDIT_ENTRIES = 4000;
const ADMIN_ALIAS_MAX_LENGTH = 48;
const COMMENT_TEXT_MAX_LENGTH = 500;
const PATCH_TITLE_MAX_LENGTH = 120;
const PATCH_DESCRIPTION_MAX_LENGTH = 2000;
const PREFAB_NAME_MAX_LENGTH = 120;
const PREFAB_TYPE_MAX_LENGTH = 64;
const ENTITY_REF_MAX_LENGTH = 128;
const LOCK_REASON_MAX_LENGTH = 240;
const ADMIN_ALIAS_PATTERN = /^[A-Za-z0-9 ._@-]+$/;

/** @typedef {Error & { status?: number, details?: string[], revision?: number }} HttpErrorLike */
/** @typedef {import('../shared/mapDesignerState.js').DesignerStateRoot} DesignerStateRoot */
/** @typedef {import('../shared/mapDesignerState.js').ZoneDesignerState} ZoneDesignerState */

/**
 * @param {number} status
 * @param {string} message
 * @param {{ details?: string[], revision?: number }} [meta]
 * @returns {HttpErrorLike}
 */
function createHttpError(status, message, meta = {}) {
  const err = /** @type {HttpErrorLike} */ (new Error(message));
  err.status = status;
  if (Array.isArray(meta.details)) err.details = meta.details;
  if (Number.isFinite(meta.revision)) err.revision = Number(meta.revision);
  return err;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function stringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

/**
 * @param {unknown} value
 * @param {{ field: string, maxLength: number, required?: boolean, multiline?: boolean }} options
 * @returns {string}
 */
function normalizeTextField(value, { field, maxLength, required = false, multiline = false }) {
  if (typeof value !== 'string') {
    if (required) {
      throw createHttpError(400, `${field} is required.`);
    }
    return '';
  }
  let normalized = value.normalize('NFC');
  if (multiline) {
    normalized = normalized
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
      .trim();
  } else {
    normalized = normalized
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (!normalized) {
    if (required) {
      throw createHttpError(400, `${field} is required.`);
    }
    return '';
  }
  if (normalized.length > maxLength) {
    throw createHttpError(400, `${field} must be at most ${maxLength} characters.`);
  }
  return normalized;
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function normalizeAdminAlias(value) {
  const alias = normalizeTextField(value, {
    field: 'admin alias',
    maxLength: ADMIN_ALIAS_MAX_LENGTH,
  });
  if (!alias) return 'admin';
  if (!ADMIN_ALIAS_PATTERN.test(alias)) {
    throw createHttpError(
      400,
      'admin alias must contain only letters, numbers, spaces, ".", "_", "-", or "@".'
    );
  }
  return alias;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function toInt(value, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.floor(Number(value));
}

/**
 * @param {string} prefix
 */
function nextId(prefix) {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function resolveDesignerStatePath(env = process.env) {
  const raw = env.MAP_DESIGNER_STATE_PATH;
  if (typeof raw === 'string' && raw.trim()) {
    return path.resolve(process.cwd(), raw.trim());
  }
  return DEFAULT_MAP_DESIGNER_STATE_PATH;
}

/**
 * @param {string} filePath
 * @param {DesignerStateRoot} root
 * @returns {DesignerStateRoot}
 */
function writeDesignerStateSync(filePath, root) {
  const normalized = normalizeDesignerStateRoot(root);
  const errors = validateDesignerStateRoot(normalized);
  if (errors.length > 0) {
    throw createHttpError(500, 'Designer state validation failed.', { details: errors });
  }

  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
  return normalized;
}

/**
 * @param {string} filePath
 * @returns {DesignerStateRoot}
 */
export function loadDesignerStateSync(filePath) {
  if (!fs.existsSync(filePath)) {
    const seeded = createDefaultDesignerStateRoot();
    writeDesignerStateSync(filePath, seeded);
    return seeded;
  }

  const rawText = fs.readFileSync(filePath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw createHttpError(500, `Invalid designer-state JSON: ${message}`);
  }

  const normalized = normalizeDesignerStateRoot(parsed);
  const errors = validateDesignerStateRoot(normalized);
  if (errors.length > 0) {
    throw createHttpError(500, 'Designer-state validation failed.', { details: errors });
  }
  return normalized;
}

/**
 * @param {any} req
 */
function getProvidedAdminAlias(req) {
  if (typeof req.get !== 'function') return 'admin';
  const raw = req.get('x-admin-alias');
  return normalizeAdminAlias(raw);
}

/**
 * @param {ZoneDesignerState} zone
 * @param {string} alias
 * @param {string | null} layerId
 */
function assertUnlocked(zone, alias, layerId = null) {
  const zoneLock = zone.locks.zone;
  if (zoneLock && zoneLock.alias !== alias) {
    throw createHttpError(423, `Zone lock held by ${zoneLock.alias}.`);
  }
  if (layerId) {
    const layerLock = zone.locks.layers[layerId] ?? null;
    if (layerLock && layerLock.alias !== alias) {
      throw createHttpError(423, `Layer ${layerId} lock held by ${layerLock.alias}.`);
    }
  }
}

/**
 * @param {ZoneDesignerState} zone
 * @param {{
 *   alias: string,
 *   action: string,
 *   type: string,
 *   targetId?: string,
 *   status?: 'ok' | 'error',
 *   message?: string,
 *   details?: Record<string, unknown>
 * }} entry
 */
function appendAudit(zone, entry) {
  const record = {
    id: nextId('audit'),
    t: nowIso(),
    alias: entry.alias,
    type: entry.type,
    action: entry.action,
    targetId: entry.targetId ?? '',
    status: entry.status === 'error' ? 'error' : 'ok',
    message: entry.message ?? '',
    details: isObject(entry.details) ? entry.details : {},
  };
  zone.audit.push(record);
  if (zone.audit.length > MAX_AUDIT_ENTRIES) {
    zone.audit.splice(0, zone.audit.length - MAX_AUDIT_ENTRIES);
  }
}

/**
 * @param {DesignerStateRoot} root
 * @param {string} zoneKey
 */
function getOrCreateZone(root, zoneKey) {
  const key = normalizeZoneKey(zoneKey);
  if (!root.zones[key]) {
    root.zones[key] = createDefaultZoneDesignerState();
  }
  return root.zones[key];
}

/**
 * @param {string} filePath
 * @param {DesignerStateRoot} root
 */
function saveDesignerStateRoot(filePath, root) {
  root.revision = Math.max(0, toInt(root.revision, 0));
  return writeDesignerStateSync(filePath, root);
}

/**
 * @param {unknown} raw
 */
function normalizeLayerId(raw) {
  if (typeof raw !== 'string') return null;
  const layerId = raw.trim();
  if (!isDesignerLayerId(layerId)) return null;
  return layerId;
}

/**
 * @param {unknown} raw
 */
function normalizePrefabPayload(raw) {
  const input = isObject(raw) ? raw : {};
  const name = normalizeTextField(input.name, {
    field: 'name',
    maxLength: PREFAB_NAME_MAX_LENGTH,
    required: true,
  });
  const entityType = normalizeTextField(input.entityType, {
    field: 'entityType',
    maxLength: PREFAB_TYPE_MAX_LENGTH,
    required: true,
  });
  const payload = {
    name,
    entityType,
    assetPath: typeof input.assetPath === 'string' ? input.assetPath.trim() : '',
    tags: stringArray(input.tags),
    defaults: isObject(input.defaults) ? input.defaults : {},
  };
  if (!payload.assetPath || !payload.assetPath.startsWith('/assets/')) {
    throw createHttpError(400, 'assetPath must start with /assets/.');
  }

  return payload;
}

/**
 * @param {unknown} raw
 */
function normalizeCommentPayload(raw) {
  const input = isObject(raw) ? raw : {};
  const text = normalizeTextField(input.text, {
    field: 'text',
    maxLength: COMMENT_TEXT_MAX_LENGTH,
    required: true,
    multiline: true,
  });
  const layerId = input.layerId == null ? '' : String(input.layerId).trim();
  if (layerId && !isDesignerLayerId(layerId)) {
    throw createHttpError(400, 'layerId must be a valid layer id.');
  }

  return {
    x: Number(input.x ?? 0),
    y: Number(input.y ?? 0),
    z: Number(input.z ?? 0),
    text,
    layerId,
    entityRef: normalizeTextField(input.entityRef, {
      field: 'entityRef',
      maxLength: ENTITY_REF_MAX_LENGTH,
    }),
  };
}

/**
 * @param {unknown} raw
 */
function normalizePatchCreatePayload(raw) {
  const input = isObject(raw) ? raw : {};
  const title = normalizeTextField(input.title, {
    field: 'title',
    maxLength: PATCH_TITLE_MAX_LENGTH,
    required: true,
  });
  const description = normalizeTextField(input.description, {
    field: 'description',
    maxLength: PATCH_DESCRIPTION_MAX_LENGTH,
    multiline: true,
  });
  const dependencyIds = [...new Set(stringArray(input.dependencyIds))];
  const sourceSnapshot = isObject(input.sourceSnapshot) ? input.sourceSnapshot : {};

  return {
    title,
    description,
    dependencyIds,
    sourceSnapshot,
  };
}

/**
 * @param {unknown} raw
 */
function normalizeLockActionPayload(raw) {
  const input = isObject(raw) ? raw : {};
  const action = typeof input.action === 'string' ? input.action.trim() : '';
  if (action !== 'acquire' && action !== 'release') {
    throw createHttpError(400, 'action must be acquire or release.');
  }
  const reason = normalizeTextField(input.reason, {
    field: 'reason',
    maxLength: LOCK_REASON_MAX_LENGTH,
    multiline: true,
  });
  return {
    action,
    reason,
  };
}

/**
 * @param {{ mapConfig: unknown, zoneState: unknown }} sourceSnapshot
 * @returns {{ mapConfig: ReturnType<typeof normalizeMapConfig>, zoneState: ReturnType<typeof captureZoneSnapshot> }}
 */
function normalizePatchSnapshotPayload(sourceSnapshot) {
  const mapConfig = normalizeMapConfig(sourceSnapshot.mapConfig);
  const mapErrors = validateMapConfig(mapConfig);
  if (mapErrors.length > 0) {
    throw createHttpError(400, 'Patch sourceSnapshot mapConfig is invalid.', { details: mapErrors });
  }

  const zoneState = captureZoneSnapshot(normalizeZoneDesignerState(sourceSnapshot.zoneState));
  return {
    mapConfig,
    zoneState,
  };
}

/**
 * @param {{ designerStatePath: string, mapConfigPath: string }} params
 */
export function createMapDesignerStateStore({ designerStatePath, mapConfigPath }) {
  const statePath = designerStatePath;

  /**
   * @param {string} zoneKey
   */
  function getState(zoneKey) {
    const root = loadDesignerStateSync(statePath);
    const normalizedZone = normalizeZoneKey(zoneKey);
    const zone = root.zones[normalizedZone] ?? createDefaultZoneDesignerState();
    if (!root.zones[normalizedZone]) {
      root.zones[normalizedZone] = zone;
      saveDesignerStateRoot(statePath, root);
    }
    return {
      zoneKey: normalizedZone,
      revision: root.revision,
      zoneState: cloneDesignerState(zone),
    };
  }

  /**
   * @param {string} zoneKey
   * @param {number} expectedRevision
   * @param {unknown} zoneState
   * @param {string} alias
   */
  function putState(zoneKey, expectedRevision, zoneState, alias) {
    const root = loadDesignerStateSync(statePath);
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
      throw createHttpError(400, 'expectedRevision must be a non-negative integer.');
    }
    if (expectedRevision !== root.revision) {
      throw createHttpError(409, 'Revision conflict', { revision: root.revision });
    }

    const normalizedZoneKey = normalizeZoneKey(zoneKey);
    const currentZone = getOrCreateZone(root, normalizedZoneKey);
    assertUnlocked(currentZone, alias, null);
    for (const [layerId, lock] of Object.entries(currentZone.locks.layers)) {
      if (lock && lock.alias !== alias) {
        throw createHttpError(423, `Layer ${layerId} lock held by ${lock.alias}.`);
      }
    }

    const normalizedInput = normalizeZoneDesignerState(zoneState);
    const nextZone = {
      ...normalizedInput,
      locks: cloneDesignerState(currentZone.locks),
      patches: cloneDesignerState(currentZone.patches),
      audit: cloneDesignerState(currentZone.audit),
      lastPublishedPatchId: currentZone.lastPublishedPatchId,
    };

    root.zones[normalizedZoneKey] = nextZone;
    appendAudit(nextZone, {
      alias,
      action: 'designer-state.put',
      type: 'designer-state',
      message: 'Designer state updated.',
    });
    root.revision += 1;

    const saved = saveDesignerStateRoot(statePath, root);
    return {
      revision: saved.revision,
      zoneState: cloneDesignerState(saved.zones[normalizedZoneKey]),
    };
  }

  /**
   * @param {string} zoneKey
   */
  function getPrefabs(zoneKey) {
    const root = loadDesignerStateSync(statePath);
    const zone = getOrCreateZone(root, zoneKey);
    return cloneDesignerState(zone.prefabs);
  }

  /**
   * @param {string} zoneKey
   * @param {unknown} payload
   * @param {string} alias
   */
  function createPrefab(zoneKey, payload, alias) {
    const root = loadDesignerStateSync(statePath);
    const zone = getOrCreateZone(root, zoneKey);
    assertUnlocked(zone, alias, 'props');

    const data = normalizePrefabPayload(payload);
    const now = nowIso();
    const prefab = {
      id: nextId('prefab'),
      name: data.name,
      entityType: data.entityType,
      assetPath: data.assetPath,
      tags: data.tags,
      defaults: cloneDesignerState(data.defaults),
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    zone.prefabs.push(prefab);
    appendAudit(zone, {
      alias,
      action: 'prefab.create',
      type: 'prefab',
      targetId: prefab.id,
      message: `Created prefab ${prefab.name}.`,
    });

    root.revision += 1;
    saveDesignerStateRoot(statePath, root);
    return cloneDesignerState(prefab);
  }

  /**
   * @param {string} zoneKey
   * @param {string} prefabId
   * @param {unknown} payload
   * @param {string} alias
   */
  function updatePrefab(zoneKey, prefabId, payload, alias) {
    const root = loadDesignerStateSync(statePath);
    const zone = getOrCreateZone(root, zoneKey);
    assertUnlocked(zone, alias, 'props');

    const prefab = zone.prefabs.find((entry) => entry.id === prefabId);
    if (!prefab) {
      throw createHttpError(404, 'Prefab not found.');
    }

    const input = isObject(payload) ? payload : {};
    if ('name' in input) {
      const name = String(input.name ?? '').trim();
      if (!name) throw createHttpError(400, 'name cannot be empty.');
      prefab.name = name;
    }
    if ('entityType' in input) {
      const entityType = String(input.entityType ?? '').trim();
      if (!entityType) throw createHttpError(400, 'entityType cannot be empty.');
      prefab.entityType = entityType;
    }
    if ('assetPath' in input) {
      const assetPath = String(input.assetPath ?? '').trim();
      if (!assetPath.startsWith('/assets/')) {
        throw createHttpError(400, 'assetPath must start with /assets/.');
      }
      prefab.assetPath = assetPath;
    }
    if ('tags' in input) {
      prefab.tags = stringArray(input.tags);
    }
    if ('defaults' in input) {
      if (!isObject(input.defaults)) {
        throw createHttpError(400, 'defaults must be an object.');
      }
      prefab.defaults = cloneDesignerState(input.defaults);
    }

    prefab.version = Math.max(1, toInt(prefab.version, 1) + 1);
    prefab.updatedAt = nowIso();

    appendAudit(zone, {
      alias,
      action: 'prefab.update',
      type: 'prefab',
      targetId: prefab.id,
      message: `Updated prefab ${prefab.name}.`,
    });

    root.revision += 1;
    saveDesignerStateRoot(statePath, root);
    return cloneDesignerState(prefab);
  }

  /**
   * @param {string} zoneKey
   * @param {string} prefabId
   * @param {string} alias
   */
  function deletePrefab(zoneKey, prefabId, alias) {
    const root = loadDesignerStateSync(statePath);
    const zone = getOrCreateZone(root, zoneKey);
    assertUnlocked(zone, alias, 'props');

    const index = zone.prefabs.findIndex((entry) => entry.id === prefabId);
    if (index === -1) {
      throw createHttpError(404, 'Prefab not found.');
    }
    const [removed] = zone.prefabs.splice(index, 1);

    appendAudit(zone, {
      alias,
      action: 'prefab.delete',
      type: 'prefab',
      targetId: prefabId,
      message: `Deleted prefab ${removed?.name ?? prefabId}.`,
    });

    root.revision += 1;
    saveDesignerStateRoot(statePath, root);
    return { ok: true };
  }

  /**
   * @param {string} zoneKey
   */
  function listPatches(zoneKey) {
    const root = loadDesignerStateSync(statePath);
    const zone = getOrCreateZone(root, zoneKey);
    return cloneDesignerState(zone.patches);
  }

  /**
   * @param {string} zoneKey
   * @param {unknown} payload
   * @param {string} alias
   */
  function createPatch(zoneKey, payload, alias) {
    const root = loadDesignerStateSync(statePath);
    const zone = getOrCreateZone(root, zoneKey);
    assertUnlocked(zone, alias, null);

    const data = normalizePatchCreatePayload(payload);
    const dependencySet = new Set(zone.patches.map((patch) => patch.id));
    const missingDependency = data.dependencyIds.find((depId) => !dependencySet.has(depId));
    if (missingDependency) {
      throw createHttpError(400, `Dependency patch "${missingDependency}" does not exist.`);
    }

    const fallbackMapConfig = loadMapConfigSync(mapConfigPath);
    const snapshotPayload = {
      mapConfig: isObject(data.sourceSnapshot.mapConfig)
        ? data.sourceSnapshot.mapConfig
        : fallbackMapConfig,
      zoneState: isObject(data.sourceSnapshot.zoneState)
        ? data.sourceSnapshot.zoneState
        : captureZoneSnapshot(zone),
    };
    const snapshot = normalizePatchSnapshotPayload(snapshotPayload);

    const now = nowIso();
    const patch = {
      id: nextId('patch'),
      title: data.title,
      description: data.description,
      dependencyIds: data.dependencyIds,
      status: PATCH_STATUS.DRAFT,
      sourceSnapshot: snapshot,
      publishedBaseline: null,
      createdAt: now,
      updatedAt: now,
      createdBy: alias,
      approvedAt: '',
      approvedBy: '',
      publishedAt: '',
      publishedBy: '',
      rolledBackAt: '',
      rolledBackBy: '',
      comments: [],
    };

    zone.patches.push(patch);
    appendAudit(zone, {
      alias,
      action: 'patch.create',
      type: 'patch',
      targetId: patch.id,
      message: `Created patch ${patch.title}.`,
    });

    root.revision += 1;
    saveDesignerStateRoot(statePath, root);
    return cloneDesignerState(patch);
  }

  /**
 * @param {ZoneDesignerState} zone
 * @param {string} patchId
 */
function getPatchOrThrow(zone, patchId) {
    const patch = zone.patches.find((entry) => entry.id === patchId);
    if (!patch) throw createHttpError(404, 'Patch not found.');
    return patch;
  }

  /**
   * @param {string} zoneKey
   * @param {string} patchId
   * @param {string} nextStatus
   * @param {string} alias
   * @param {string} action
   */
  function transitionPatch(zoneKey, patchId, nextStatus, alias, action) {
    const root = loadDesignerStateSync(statePath);
    const zone = getOrCreateZone(root, zoneKey);
    assertUnlocked(zone, alias, null);

    const patch = getPatchOrThrow(zone, patchId);
    if (!isValidPatchTransition(patch.status, nextStatus)) {
      throw createHttpError(400, `Invalid patch transition ${patch.status} -> ${nextStatus}.`);
    }

    patch.status = nextStatus;
    patch.updatedAt = nowIso();
    if (nextStatus === PATCH_STATUS.APPROVED) {
      patch.approvedAt = patch.updatedAt;
      patch.approvedBy = alias;
    }

    appendAudit(zone, {
      alias,
      action,
      type: 'patch',
      targetId: patch.id,
      message: `${action} (${patch.status}).`,
    });

    root.revision += 1;
    saveDesignerStateRoot(statePath, root);
    return cloneDesignerState(patch);
  }

  /**
   * @param {string} zoneKey
   * @param {string} patchId
   * @param {string} alias
   */
  async function publishPatch(zoneKey, patchId, alias) {
    const root = loadDesignerStateSync(statePath);
    const zone = getOrCreateZone(root, zoneKey);
    assertUnlocked(zone, alias, null);

    const patch = getPatchOrThrow(zone, patchId);
    if (!isValidPatchTransition(patch.status, PATCH_STATUS.PUBLISHED)) {
      throw createHttpError(400, `Invalid patch transition ${patch.status} -> ${PATCH_STATUS.PUBLISHED}.`);
    }

    for (const dependencyId of patch.dependencyIds) {
      const dependency = zone.patches.find((entry) => entry.id === dependencyId);
      if (!dependency || dependency.status !== PATCH_STATUS.PUBLISHED) {
        throw createHttpError(400, `Dependency ${dependencyId} must be Published before publish.`);
      }
    }

    const nextMapConfig = normalizeMapConfig(patch.sourceSnapshot?.mapConfig);
    const mapErrors = validateMapConfig(nextMapConfig);
    if (mapErrors.length > 0) {
      throw createHttpError(400, 'Patch sourceSnapshot mapConfig is invalid.', { details: mapErrors });
    }

    const baselineMapConfig = loadMapConfigSync(mapConfigPath);
    const baselineZoneSnapshot = captureZoneSnapshot(zone);

    await saveMapConfig(mapConfigPath, nextMapConfig);

    applyZoneSnapshot(zone, patch.sourceSnapshot?.zoneState);
    patch.status = PATCH_STATUS.PUBLISHED;
    patch.updatedAt = nowIso();
    patch.publishedAt = patch.updatedAt;
    patch.publishedBy = alias;
    patch.publishedBaseline = {
      mapConfig: baselineMapConfig,
      zoneState: baselineZoneSnapshot,
      fromPatchId: zone.lastPublishedPatchId || '',
    };
    zone.lastPublishedPatchId = patch.id;

    appendAudit(zone, {
      alias,
      action: 'patch.publish',
      type: 'patch',
      targetId: patch.id,
      message: `Published patch ${patch.title}.`,
      details: { restartRequired: true },
    });

    root.revision += 1;
    saveDesignerStateRoot(statePath, root);

    return {
      ok: true,
      restartRequired: true,
    };
  }

  /**
   * @param {string} zoneKey
   * @param {string} patchId
   * @param {string} alias
   */
  async function rollbackPatch(zoneKey, patchId, alias) {
    const root = loadDesignerStateSync(statePath);
    const zone = getOrCreateZone(root, zoneKey);
    assertUnlocked(zone, alias, null);

    const patch = getPatchOrThrow(zone, patchId);
    if (!isValidPatchTransition(patch.status, PATCH_STATUS.ROLLED_BACK)) {
      throw createHttpError(400, `Invalid patch transition ${patch.status} -> ${PATCH_STATUS.ROLLED_BACK}.`);
    }

    const baseline = patch.publishedBaseline;
    if (!baseline || !isObject(baseline)) {
      throw createHttpError(400, 'Patch does not have a rollback baseline snapshot.');
    }

    const previousMap = normalizeMapConfig(baseline.mapConfig);
    const previousErrors = validateMapConfig(previousMap);
    if (previousErrors.length > 0) {
      throw createHttpError(400, 'Rollback baseline mapConfig is invalid.', { details: previousErrors });
    }

    await saveMapConfig(mapConfigPath, previousMap);

    applyZoneSnapshot(zone, baseline.zoneState);
    patch.status = PATCH_STATUS.ROLLED_BACK;
    patch.updatedAt = nowIso();
    patch.rolledBackAt = patch.updatedAt;
    patch.rolledBackBy = alias;
    zone.lastPublishedPatchId = typeof baseline.fromPatchId === 'string' ? baseline.fromPatchId : '';

    appendAudit(zone, {
      alias,
      action: 'patch.rollback',
      type: 'patch',
      targetId: patch.id,
      message: `Rolled back patch ${patch.title}.`,
      details: { restartRequired: true },
    });

    root.revision += 1;
    saveDesignerStateRoot(statePath, root);

    return {
      ok: true,
      restartRequired: true,
    };
  }

  /**
   * @param {string} zoneKey
   */
  function listComments(zoneKey) {
    const root = loadDesignerStateSync(statePath);
    const zone = getOrCreateZone(root, zoneKey);
    return cloneDesignerState(zone.comments);
  }

  /**
   * @param {string} zoneKey
   * @param {unknown} payload
   * @param {string} alias
   */
  function createComment(zoneKey, payload, alias) {
    const root = loadDesignerStateSync(statePath);
    const zone = getOrCreateZone(root, zoneKey);
    const data = normalizeCommentPayload(payload);

    const lockLayerId = data.layerId || null;
    assertUnlocked(zone, alias, lockLayerId);

    const comment = {
      id: nextId('comment'),
      x: Number.isFinite(data.x) ? data.x : 0,
      y: Number.isFinite(data.y) ? data.y : 0,
      z: Number.isFinite(data.z) ? data.z : 0,
      text: data.text,
      layerId: data.layerId,
      entityRef: data.entityRef,
      status: 'open',
      createdAt: nowIso(),
      createdBy: alias,
      resolvedAt: '',
      resolvedBy: '',
    };

    zone.comments.push(comment);
    appendAudit(zone, {
      alias,
      action: 'comment.create',
      type: 'comment',
      targetId: comment.id,
      message: 'Created map comment.',
    });

    root.revision += 1;
    saveDesignerStateRoot(statePath, root);
    return cloneDesignerState(comment);
  }

  /**
   * @param {string} zoneKey
   * @param {string} commentId
   * @param {unknown} payload
   * @param {string} alias
   */
  function resolveComment(zoneKey, commentId, payload, alias) {
    const root = loadDesignerStateSync(statePath);
    const zone = getOrCreateZone(root, zoneKey);

    const comment = zone.comments.find((entry) => entry.id === commentId);
    if (!comment) {
      throw createHttpError(404, 'Comment not found.');
    }

    const body = isObject(payload) ? payload : {};
    const reopen = body.action === 'reopen' || body.resolved === false;
    const layerId = comment.layerId && isDesignerLayerId(comment.layerId) ? comment.layerId : null;
    assertUnlocked(zone, alias, layerId);

    if (reopen) {
      comment.status = 'open';
      comment.resolvedAt = '';
      comment.resolvedBy = '';
    } else {
      comment.status = 'resolved';
      comment.resolvedAt = nowIso();
      comment.resolvedBy = alias;
    }

    appendAudit(zone, {
      alias,
      action: reopen ? 'comment.reopen' : 'comment.resolve',
      type: 'comment',
      targetId: comment.id,
      message: reopen ? 'Reopened map comment.' : 'Resolved map comment.',
    });

    root.revision += 1;
    saveDesignerStateRoot(statePath, root);
    return cloneDesignerState(comment);
  }

  /**
   * @param {string} zoneKey
   */
  function getLocks(zoneKey) {
    const root = loadDesignerStateSync(statePath);
    const zone = getOrCreateZone(root, zoneKey);
    return cloneDesignerState(zone.locks);
  }

  /**
   * @param {string} zoneKey
   * @param {unknown} payload
   * @param {string} alias
   */
  function setZoneLock(zoneKey, payload, alias) {
    const root = loadDesignerStateSync(statePath);
    const zone = getOrCreateZone(root, zoneKey);

    const { action, reason } = normalizeLockActionPayload(payload);
    const existing = zone.locks.zone;

    if (action === 'acquire') {
      if (existing && existing.alias !== alias) {
        throw createHttpError(423, `Zone lock already held by ${existing.alias}.`);
      }
      zone.locks.zone = {
        alias,
        reason,
        acquiredAt: nowIso(),
      };
    } else {
      if (existing && existing.alias !== alias) {
        throw createHttpError(423, `Zone lock can only be released by ${existing.alias}.`);
      }
      zone.locks.zone = null;
    }

    appendAudit(zone, {
      alias,
      action: action === 'acquire' ? 'lock.zone.acquire' : 'lock.zone.release',
      type: 'lock',
      targetId: 'zone',
      message: action === 'acquire' ? 'Acquired zone lock.' : 'Released zone lock.',
      details: reason ? { reason } : {},
    });

    root.revision += 1;
    saveDesignerStateRoot(statePath, root);
    return cloneDesignerState(zone.locks);
  }

  /**
   * @param {string} zoneKey
   * @param {string} layerId
   * @param {unknown} payload
   * @param {string} alias
   */
  function setLayerLock(zoneKey, layerId, payload, alias) {
    const normalizedLayerId = normalizeLayerId(layerId);
    if (!normalizedLayerId) {
      throw createHttpError(400, `layerId must be one of: ${DESIGNER_LAYER_LIST.join(', ')}`);
    }

    const root = loadDesignerStateSync(statePath);
    const zone = getOrCreateZone(root, zoneKey);
    const zoneLock = zone.locks.zone;
    if (zoneLock && zoneLock.alias !== alias) {
      throw createHttpError(423, `Zone lock held by ${zoneLock.alias}.`);
    }

    const { action, reason } = normalizeLockActionPayload(payload);
    const existing = zone.locks.layers[normalizedLayerId] ?? null;

    if (action === 'acquire') {
      if (existing && existing.alias !== alias) {
        throw createHttpError(423, `Layer ${normalizedLayerId} lock held by ${existing.alias}.`);
      }
      zone.locks.layers[normalizedLayerId] = {
        alias,
        reason,
        acquiredAt: nowIso(),
      };
    } else {
      if (existing && existing.alias !== alias) {
        throw createHttpError(423, `Layer ${normalizedLayerId} lock can only be released by ${existing.alias}.`);
      }
      zone.locks.layers[normalizedLayerId] = null;
    }

    appendAudit(zone, {
      alias,
      action: action === 'acquire' ? 'lock.layer.acquire' : 'lock.layer.release',
      type: 'lock',
      targetId: normalizedLayerId,
      message:
        action === 'acquire'
          ? `Acquired ${normalizedLayerId} layer lock.`
          : `Released ${normalizedLayerId} layer lock.`,
      details: reason ? { reason } : {},
    });

    root.revision += 1;
    saveDesignerStateRoot(statePath, root);
    return cloneDesignerState(zone.locks);
  }

  /**
   * @param {string} zoneKey
   * @param {number} limit
   */
  function getAudit(zoneKey, limit = 200) {
    const root = loadDesignerStateSync(statePath);
    const zone = getOrCreateZone(root, zoneKey);
    const safeLimit = Math.max(1, Math.min(2000, toInt(limit, 200)));
    return cloneDesignerState(zone.audit.slice(-safeLimit).reverse());
  }

  /**
   * @param {string} zoneKey
   */
  function createPlaytestSession(zoneKey) {
    return {
      clientUrl: '/?guest=1',
      note:
        `Preview session for ${normalizeZoneKey(zoneKey)} uses saved map state. ` +
        'Publish and restart are required for runtime patch application.',
    };
  }

  return {
    getState,
    putState,
    getPrefabs,
    createPrefab,
    updatePrefab,
    deletePrefab,
    listPatches,
    createPatch,
    transitionPatch,
    publishPatch,
    rollbackPatch,
    listComments,
    createComment,
    resolveComment,
    getLocks,
    setZoneLock,
    setLayerLock,
    getAudit,
    createPlaytestSession,
  };
}
