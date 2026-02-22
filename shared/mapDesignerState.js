// @ts-check
// @ts-nocheck

import { normalizeMapConfig, validateMapConfig } from './mapConfig.js';

export const MAP_DESIGNER_STATE_VERSION = 1;
export const DESIGNER_ZONE_KEY_DEFAULT = 'world-map';

export const DESIGNER_LAYER_LIST = [
  'terrain',
  'props',
  'spawns',
  'navmesh',
  'triggers',
  'lighting',
  'debug',
];

const DESIGNER_LAYER_SET = new Set(DESIGNER_LAYER_LIST);

export const PATCH_STATUS = Object.freeze({
  DRAFT: 'Draft',
  REVIEW_REQUESTED: 'Review Requested',
  APPROVED: 'Approved',
  PUBLISHED: 'Published',
  ROLLED_BACK: 'Rolled Back',
});

export const PATCH_STATUS_LIST = [
  PATCH_STATUS.DRAFT,
  PATCH_STATUS.REVIEW_REQUESTED,
  PATCH_STATUS.APPROVED,
  PATCH_STATUS.PUBLISHED,
  PATCH_STATUS.ROLLED_BACK,
];

const PATCH_STATUS_SET = new Set(PATCH_STATUS_LIST);

export const COMMENT_STATUS = Object.freeze({
  OPEN: 'open',
  RESOLVED: 'resolved',
});

const COMMENT_STATUS_SET = new Set([COMMENT_STATUS.OPEN, COMMENT_STATUS.RESOLVED]);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {string} fallback
 */
function asString(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function asFiniteNumber(value, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

/**
 * @param {unknown} value
 * @param {number} fallback
 */
function asInt(value, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  const parsed = Math.floor(Number(value));
  return parsed >= 0 ? parsed : fallback;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

/**
 * @param {unknown} value
 */
function normalizeObject(value) {
  return isObject(value) ? value : {};
}

/**
 * @param {unknown} raw
 */
function normalizeLockRecord(raw) {
  if (!isObject(raw)) return null;
  const alias = asString(raw.alias, '').trim();
  if (!alias) return null;
  return {
    alias,
    reason: asString(raw.reason, '').trim(),
    acquiredAt: asString(raw.acquiredAt, ''),
  };
}

/**
 * @param {unknown} raw
 */
function normalizeLocks(raw) {
  const input = normalizeObject(raw);
  const layersRaw = normalizeObject(input.layers);
  /** @type {Record<string, { alias: string, reason: string, acquiredAt: string } | null>} */
  const layers = {};
  for (const layerId of DESIGNER_LAYER_LIST) {
    layers[layerId] = normalizeLockRecord(layersRaw[layerId]);
  }
  return {
    zone: normalizeLockRecord(input.zone),
    layers,
  };
}

/**
 * @param {unknown} raw
 */
function normalizePrefab(raw) {
  const input = normalizeObject(raw);
  const defaults = normalizeObject(input.defaults);
  return {
    id: asString(input.id, '').trim(),
    name: asString(input.name, '').trim(),
    entityType: asString(input.entityType, '').trim(),
    assetPath: asString(input.assetPath, '').trim(),
    tags: normalizeStringList(input.tags),
    defaults,
    version: Math.max(1, asInt(input.version, 1)),
    createdAt: asString(input.createdAt, ''),
    updatedAt: asString(input.updatedAt, ''),
  };
}

/**
 * @param {unknown} raw
 */
function normalizeNavArea(raw) {
  const input = normalizeObject(raw);
  return {
    id: asString(input.id, '').trim(),
    name: asString(input.name, '').trim(),
    shape: asString(input.shape, 'circle').trim() || 'circle',
    x: asFiniteNumber(input.x, 0),
    y: asFiniteNumber(input.y, 0),
    z: asFiniteNumber(input.z, 0),
    radius: Math.max(0.1, asFiniteNumber(input.radius, 6)),
    width: Math.max(0.1, asFiniteNumber(input.width, 10)),
    height: Math.max(0.1, asFiniteNumber(input.height, 10)),
    walkCost: Math.max(0, asFiniteNumber(input.walkCost, 1)),
    runCost: Math.max(0, asFiniteNumber(input.runCost, 1)),
    tags: normalizeStringList(input.tags),
  };
}

/**
 * @param {unknown} raw
 */
function normalizeTrigger(raw) {
  const input = normalizeObject(raw);
  return {
    id: asString(input.id, '').trim(),
    name: asString(input.name, '').trim(),
    shape: asString(input.shape, 'circle').trim() || 'circle',
    x: asFiniteNumber(input.x, 0),
    y: asFiniteNumber(input.y, 0),
    z: asFiniteNumber(input.z, 0),
    radius: Math.max(0.1, asFiniteNumber(input.radius, 8)),
    width: Math.max(0.1, asFiniteNumber(input.width, 12)),
    height: Math.max(0.1, asFiniteNumber(input.height, 12)),
    conditionRef: asString(input.conditionRef, '').trim(),
    actionRefs: normalizeStringList(input.actionRefs),
    delayMs: Math.max(0, asInt(input.delayMs, 0)),
    enabled: input.enabled !== false,
    tags: normalizeStringList(input.tags),
  };
}

/**
 * @param {unknown} raw
 */
function normalizePathNode(raw) {
  const input = normalizeObject(raw);
  return {
    id: asString(input.id, '').trim(),
    x: asFiniteNumber(input.x, 0),
    y: asFiniteNumber(input.y, 0),
    z: asFiniteNumber(input.z, 0),
    speed: Math.max(0, asFiniteNumber(input.speed, 1)),
    dwellMs: Math.max(0, asInt(input.dwellMs, 0)),
    tags: normalizeStringList(input.tags),
  };
}

/**
 * @param {unknown} raw
 */
function normalizePath(raw) {
  const input = normalizeObject(raw);
  const nodes = Array.isArray(input.nodes) ? input.nodes.map(normalizePathNode) : [];
  return {
    id: asString(input.id, '').trim(),
    name: asString(input.name, '').trim(),
    loop: input.loop !== false,
    behaviorTags: normalizeStringList(input.behaviorTags),
    nodes,
  };
}

/**
 * @param {unknown} raw
 */
function normalizeLightingRegion(raw) {
  const input = normalizeObject(raw);
  return {
    id: asString(input.id, '').trim(),
    name: asString(input.name, '').trim(),
    shape: asString(input.shape, 'circle').trim() || 'circle',
    x: asFiniteNumber(input.x, 0),
    y: asFiniteNumber(input.y, 0),
    z: asFiniteNumber(input.z, 0),
    radius: Math.max(0.1, asFiniteNumber(input.radius, 10)),
    width: Math.max(0.1, asFiniteNumber(input.width, 14)),
    height: Math.max(0.1, asFiniteNumber(input.height, 14)),
    fogPreset: asString(input.fogPreset, '').trim(),
    musicCue: asString(input.musicCue, '').trim(),
    shaderRef: asString(input.shaderRef, '').trim(),
    intensity: Math.max(0, asFiniteNumber(input.intensity, 1)),
    tags: normalizeStringList(input.tags),
  };
}

/**
 * @param {unknown} raw
 */
function normalizeComment(raw) {
  const input = normalizeObject(raw);
  const statusRaw = asString(input.status, COMMENT_STATUS.OPEN).trim().toLowerCase();
  const status = COMMENT_STATUS_SET.has(statusRaw) ? statusRaw : COMMENT_STATUS.OPEN;
  return {
    id: asString(input.id, '').trim(),
    x: asFiniteNumber(input.x, 0),
    y: asFiniteNumber(input.y, 0),
    z: asFiniteNumber(input.z, 0),
    text: asString(input.text, '').trim(),
    layerId: asString(input.layerId, '').trim(),
    entityRef: asString(input.entityRef, '').trim(),
    status,
    createdAt: asString(input.createdAt, ''),
    createdBy: asString(input.createdBy, '').trim(),
    resolvedAt: asString(input.resolvedAt, ''),
    resolvedBy: asString(input.resolvedBy, '').trim(),
  };
}

/**
 * @param {unknown} raw
 */
function normalizePatchSnapshot(raw) {
  const input = normalizeObject(raw);
  const mapConfig = normalizeMapConfig(input.mapConfig);
  const zoneState = normalizeZoneSnapshot(input.zoneState);
  return {
    mapConfig,
    zoneState,
  };
}

/**
 * @param {unknown} raw
 */
function normalizePatch(raw) {
  const input = normalizeObject(raw);
  const status = PATCH_STATUS_SET.has(input.status) ? input.status : PATCH_STATUS.DRAFT;
  const dependencyIds = normalizeStringList(input.dependencyIds);
  const comments = Array.isArray(input.comments)
    ? input.comments.map((entry) => {
      const item = normalizeObject(entry);
      return {
        id: asString(item.id, '').trim(),
        alias: asString(item.alias, '').trim(),
        text: asString(item.text, '').trim(),
        t: asString(item.t, ''),
      };
    })
    : [];
  return {
    id: asString(input.id, '').trim(),
    title: asString(input.title, '').trim(),
    description: asString(input.description, '').trim(),
    dependencyIds,
    status,
    sourceSnapshot: normalizePatchSnapshot(input.sourceSnapshot),
    publishedBaseline: isObject(input.publishedBaseline)
      ? {
          mapConfig: normalizeMapConfig(input.publishedBaseline.mapConfig),
          zoneState: normalizeZoneSnapshot(input.publishedBaseline.zoneState),
          fromPatchId: asString(input.publishedBaseline.fromPatchId, '').trim(),
        }
      : null,
    createdAt: asString(input.createdAt, ''),
    updatedAt: asString(input.updatedAt, ''),
    createdBy: asString(input.createdBy, '').trim(),
    approvedAt: asString(input.approvedAt, ''),
    approvedBy: asString(input.approvedBy, '').trim(),
    publishedAt: asString(input.publishedAt, ''),
    publishedBy: asString(input.publishedBy, '').trim(),
    rolledBackAt: asString(input.rolledBackAt, ''),
    rolledBackBy: asString(input.rolledBackBy, '').trim(),
    comments,
  };
}

/**
 * @param {unknown} raw
 */
function normalizeAuditEntry(raw) {
  const input = normalizeObject(raw);
  return {
    id: asString(input.id, '').trim(),
    t: asString(input.t, ''),
    alias: asString(input.alias, '').trim(),
    type: asString(input.type, '').trim(),
    action: asString(input.action, '').trim(),
    targetId: asString(input.targetId, '').trim(),
    status: input.status === 'error' ? 'error' : 'ok',
    message: asString(input.message, '').trim(),
    details: normalizeObject(input.details),
  };
}

/**
 * @param {unknown} raw
 */
export function normalizeZoneSnapshot(raw) {
  const input = normalizeObject(raw);
  return {
    prefabs: Array.isArray(input.prefabs) ? input.prefabs.map(normalizePrefab) : [],
    navAreas: Array.isArray(input.navAreas) ? input.navAreas.map(normalizeNavArea) : [],
    triggers: Array.isArray(input.triggers) ? input.triggers.map(normalizeTrigger) : [],
    paths: Array.isArray(input.paths) ? input.paths.map(normalizePath) : [],
    lightingRegions: Array.isArray(input.lightingRegions)
      ? input.lightingRegions.map(normalizeLightingRegion)
      : [],
    comments: Array.isArray(input.comments) ? input.comments.map(normalizeComment) : [],
  };
}

export function createDefaultZoneDesignerState() {
  return {
    prefabs: [],
    navAreas: [],
    triggers: [],
    paths: [],
    lightingRegions: [],
    comments: [],
    locks: normalizeLocks(null),
    patches: [],
    audit: [],
    lastPublishedPatchId: '',
  };
}

/**
 * @param {unknown} raw
 */
export function normalizeZoneDesignerState(raw) {
  const input = normalizeObject(raw);
  const snapshot = normalizeZoneSnapshot(input);
  return {
    prefabs: snapshot.prefabs,
    navAreas: snapshot.navAreas,
    triggers: snapshot.triggers,
    paths: snapshot.paths,
    lightingRegions: snapshot.lightingRegions,
    comments: snapshot.comments,
    locks: normalizeLocks(input.locks),
    patches: Array.isArray(input.patches) ? input.patches.map(normalizePatch) : [],
    audit: Array.isArray(input.audit) ? input.audit.map(normalizeAuditEntry) : [],
    lastPublishedPatchId: asString(input.lastPublishedPatchId, '').trim(),
  };
}

export function createDefaultDesignerStateRoot() {
  return {
    version: MAP_DESIGNER_STATE_VERSION,
    revision: 0,
    zones: {
      [DESIGNER_ZONE_KEY_DEFAULT]: createDefaultZoneDesignerState(),
    },
  };
}

/**
 * @param {unknown} raw
 */
export function normalizeDesignerStateRoot(raw) {
  const input = normalizeObject(raw);
  const zonesInput = normalizeObject(input.zones);
  /** @type {Record<string, ReturnType<typeof normalizeZoneDesignerState>>} */
  const zones = {};

  for (const [zoneKey, zoneState] of Object.entries(zonesInput)) {
    const key = zoneKey.trim();
    if (!key) continue;
    zones[key] = normalizeZoneDesignerState(zoneState);
  }

  if (!zones[DESIGNER_ZONE_KEY_DEFAULT]) {
    zones[DESIGNER_ZONE_KEY_DEFAULT] = createDefaultZoneDesignerState();
  }

  return {
    version: MAP_DESIGNER_STATE_VERSION,
    revision: asInt(input.revision, 0),
    zones,
  };
}

/**
 * @param {unknown} value
 */
export function cloneDesignerState(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * @param {string[]} errors
 * @param {string} label
 * @param {Array<{ id: string }>} list
 */
function validateUniqueIds(errors, label, list) {
  const seen = new Set();
  list.forEach((item, index) => {
    const id = (item?.id ?? '').trim();
    if (!id) {
      errors.push(`${label}[${index}] id is required.`);
      return;
    }
    if (seen.has(id)) {
      errors.push(`${label}[${index}] id must be unique.`);
      return;
    }
    seen.add(id);
  });
}

/**
 * @param {string[]} errors
 * @param {string} label
 * @param {Array<{ shape?: string }>} list
 */
function validateShapes(errors, label, list) {
  const valid = new Set(['circle', 'box', 'polygon']);
  list.forEach((item, index) => {
    if (!valid.has(asString(item?.shape, '').trim())) {
      errors.push(`${label}[${index}] shape must be one of: circle, box, polygon.`);
    }
  });
}

/**
 * @param {string[]} errors
 * @param {string} label
 * @param {Array<{ assetPath?: string }>} prefabs
 */
function validateAssetPaths(errors, label, prefabs) {
  prefabs.forEach((prefab, index) => {
    const assetPath = asString(prefab?.assetPath, '').trim();
    if (!assetPath.startsWith('/assets/')) {
      errors.push(`${label}[${index}] assetPath must start with /assets/.`);
    }
  });
}

/**
 * @param {string[]} errors
 * @param {string} label
 * @param {Array<{ status?: string, sourceSnapshot?: { mapConfig?: unknown, zoneState?: unknown }, dependencyIds?: string[] }>} patches
 */
function validatePatches(errors, label, patches) {
  const idSet = new Set(patches.map((patch) => patch.id).filter(Boolean));
  patches.forEach((patch, index) => {
    if (!PATCH_STATUS_SET.has(patch.status)) {
      errors.push(`${label}[${index}] status is invalid.`);
    }

    const mapErrors = validateMapConfig(normalizeMapConfig(patch?.sourceSnapshot?.mapConfig));
    if (mapErrors.length > 0) {
      errors.push(`${label}[${index}] sourceSnapshot.mapConfig is invalid.`);
    }

    const dependencies = Array.isArray(patch.dependencyIds) ? patch.dependencyIds : [];
    dependencies.forEach((depId) => {
      if (!idSet.has(depId)) {
        errors.push(`${label}[${index}] dependency "${depId}" does not exist.`);
      }
    });
  });
}

/**
 * @param {string[]} errors
 * @param {string} label
 * @param {{ zone: { alias?: string } | null, layers: Record<string, { alias?: string } | null> }} locks
 */
function validateLocks(errors, label, locks) {
  if (locks.zone && !asString(locks.zone.alias, '').trim()) {
    errors.push(`${label}.zone alias is required.`);
  }

  for (const [layerId, lock] of Object.entries(locks.layers)) {
    if (!DESIGNER_LAYER_SET.has(layerId)) {
      errors.push(`${label}.layers.${layerId} is not a valid layer id.`);
      continue;
    }
    if (lock && !asString(lock.alias, '').trim()) {
      errors.push(`${label}.layers.${layerId} alias is required.`);
    }
  }
}

/**
 * @param {unknown} root
 * @returns {string[]}
 */
export function validateDesignerStateRoot(root) {
  const normalized = normalizeDesignerStateRoot(root);
  /** @type {string[]} */
  const errors = [];

  if (normalized.version !== MAP_DESIGNER_STATE_VERSION) {
    errors.push(`version must be ${MAP_DESIGNER_STATE_VERSION}.`);
  }

  if (!Number.isInteger(normalized.revision) || normalized.revision < 0) {
    errors.push('revision must be a non-negative integer.');
  }

  for (const [zoneKey, zone] of Object.entries(normalized.zones)) {
    if (!zoneKey.trim()) {
      errors.push('zone key must be non-empty.');
      continue;
    }
    validateUniqueIds(errors, `zones.${zoneKey}.prefabs`, zone.prefabs);
    validateUniqueIds(errors, `zones.${zoneKey}.navAreas`, zone.navAreas);
    validateUniqueIds(errors, `zones.${zoneKey}.triggers`, zone.triggers);
    validateUniqueIds(errors, `zones.${zoneKey}.paths`, zone.paths);
    validateUniqueIds(errors, `zones.${zoneKey}.lightingRegions`, zone.lightingRegions);
    validateUniqueIds(errors, `zones.${zoneKey}.comments`, zone.comments);
    validateUniqueIds(errors, `zones.${zoneKey}.patches`, zone.patches);

    validateShapes(errors, `zones.${zoneKey}.navAreas`, zone.navAreas);
    validateShapes(errors, `zones.${zoneKey}.triggers`, zone.triggers);
    validateShapes(errors, `zones.${zoneKey}.lightingRegions`, zone.lightingRegions);

    validateAssetPaths(errors, `zones.${zoneKey}.prefabs`, zone.prefabs);
    validatePatches(errors, `zones.${zoneKey}.patches`, zone.patches);
    validateLocks(errors, `zones.${zoneKey}.locks`, zone.locks);

    zone.comments.forEach((comment, index) => {
      if (!COMMENT_STATUS_SET.has(comment.status)) {
        errors.push(`zones.${zoneKey}.comments[${index}] status is invalid.`);
      }
      if (comment.layerId && !DESIGNER_LAYER_SET.has(comment.layerId)) {
        errors.push(`zones.${zoneKey}.comments[${index}] layerId is invalid.`);
      }
      if (!comment.text) {
        errors.push(`zones.${zoneKey}.comments[${index}] text is required.`);
      }
    });

    zone.paths.forEach((pathDef, index) => {
      validateUniqueIds(errors, `zones.${zoneKey}.paths[${index}].nodes`, pathDef.nodes);
    });
  }

  return errors;
}

/**
 * @param {string} zoneKey
 */
export function normalizeZoneKey(zoneKey) {
  const normalized = typeof zoneKey === 'string' ? zoneKey.trim() : '';
  return normalized || DESIGNER_ZONE_KEY_DEFAULT;
}

/**
 * @param {string} fromStatus
 * @param {string} toStatus
 */
export function isValidPatchTransition(fromStatus, toStatus) {
  return (
    (fromStatus === PATCH_STATUS.DRAFT && toStatus === PATCH_STATUS.REVIEW_REQUESTED) ||
    (fromStatus === PATCH_STATUS.REVIEW_REQUESTED && toStatus === PATCH_STATUS.APPROVED) ||
    (fromStatus === PATCH_STATUS.APPROVED && toStatus === PATCH_STATUS.PUBLISHED) ||
    (fromStatus === PATCH_STATUS.PUBLISHED && toStatus === PATCH_STATUS.ROLLED_BACK)
  );
}

/**
 * @param {ReturnType<typeof normalizeZoneDesignerState>} zoneState
 */
export function captureZoneSnapshot(zoneState) {
  const snapshot = normalizeZoneSnapshot(zoneState);
  return cloneDesignerState(snapshot);
}

/**
 * @param {ReturnType<typeof normalizeZoneDesignerState>} zoneState
 * @param {unknown} snapshot
 */
export function applyZoneSnapshot(zoneState, snapshot) {
  const normalized = normalizeZoneSnapshot(snapshot);
  zoneState.prefabs = normalized.prefabs;
  zoneState.navAreas = normalized.navAreas;
  zoneState.triggers = normalized.triggers;
  zoneState.paths = normalized.paths;
  zoneState.lightingRegions = normalized.lightingRegions;
  zoneState.comments = normalized.comments;
}

/**
 * @param {unknown} value
 */
export function isDesignerLayerId(value) {
  return typeof value === 'string' && DESIGNER_LAYER_SET.has(value);
}
