// @ts-check
import {
  ASSET_PATHS,
  CONSUMABLE_MODEL_PATHS,
  EQUIPMENT_MODEL_PATHS,
} from './assetPaths.js';
import { getItemCategoryFromKind } from './itemMeta.js';

const RESOURCE_ITEM_MODEL_PATHS = Object.freeze({
  crystal: Array.isArray(ASSET_PATHS.resourceNodeVariants?.crystal)
    ? ASSET_PATHS.resourceNodeVariants.crystal[0]
    : ASSET_PATHS.resourceNodes?.crystal,
  ore: ASSET_PATHS.resourceNodes?.ore,
  herb: ASSET_PATHS.resourceNodes?.herb,
  wood: ASSET_PATHS.resourceNodes?.tree,
  flower: ASSET_PATHS.resourceNodes?.flower,
});

function getModelPathForKind(/** @type {any} */ kind) {
  const normalized = typeof kind === 'string' ? kind.trim() : '';
  if (!normalized) return null;
  if (Object.prototype.hasOwnProperty.call(EQUIPMENT_MODEL_PATHS, normalized)) {
    return EQUIPMENT_MODEL_PATHS[/** @type {keyof typeof EQUIPMENT_MODEL_PATHS} */ (normalized)] ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(CONSUMABLE_MODEL_PATHS, normalized)) {
    return CONSUMABLE_MODEL_PATHS[/** @type {keyof typeof CONSUMABLE_MODEL_PATHS} */ (normalized)] ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(RESOURCE_ITEM_MODEL_PATHS, normalized)) {
    return RESOURCE_ITEM_MODEL_PATHS[/** @type {keyof typeof RESOURCE_ITEM_MODEL_PATHS} */ (normalized)] ?? null;
  }
  return null;
}

export function getItemPreviewSource(/** @type {any} */ kind) {
  const safeKind = typeof kind === 'string' ? kind.trim() : '';
  if (!safeKind) return null;
  return {
    kind: safeKind,
    category: getItemCategoryFromKind(safeKind),
    modelPath: getModelPathForKind(safeKind),
  };
}

async function defaultRenderThumbnail(/** @type {any} */ source) {
  const mod = await import('./item-preview-renderer.js');
  return mod.renderItemThumbnail(source);
}

function normalizeKindEntry(/** @type {any} */ entry) {
  if (typeof entry === 'string') return entry.trim();
  if (entry && typeof entry.kind === 'string') return entry.kind.trim();
  return '';
}

function createLruCache(/** @type {number} */ maxEntries) {
  const store = new Map();
  function get(/** @type {string} */ key) {
    if (!store.has(key)) return undefined;
    const value = store.get(key);
    store.delete(key);
    store.set(key, value);
    return value;
  }
  function set(/** @type {string} */ key, /** @type {any} */ value) {
    if (store.has(key)) store.delete(key);
    store.set(key, value);
    while (store.size > maxEntries) {
      const oldestKey = store.keys().next().value;
      store.delete(oldestKey);
    }
  }
  function clear() {
    store.clear();
  }
  return { get, set, clear };
}

export function createItemPreviewResolver(/** @type {any} */ opts = {}) {
  const maxEntries = Math.max(16, Math.floor(Number(opts.maxEntries) || 160));
  const renderThumbnail = typeof opts.renderThumbnail === 'function'
    ? opts.renderThumbnail
    : defaultRenderThumbnail;
  const cache = createLruCache(maxEntries);
  const inflight = new Map();

  async function resolveItemPreviewKind(/** @type {any} */ kind) {
    const safeKind = typeof kind === 'string' ? kind.trim() : '';
    if (!safeKind) return null;
    const cached = cache.get(safeKind);
    if (cached !== undefined) return cached;
    if (inflight.has(safeKind)) return inflight.get(safeKind);
    const source = getItemPreviewSource(safeKind);
    if (!source) {
      cache.set(safeKind, null);
      return null;
    }
    const promise = Promise.resolve()
      .then(() => renderThumbnail(source))
      .then((/** @type {any} */ value) => {
        const next = typeof value === 'string' && value.length > 0 ? value : null;
        cache.set(safeKind, next);
        inflight.delete(safeKind);
        return next;
      })
      .catch(() => {
        cache.set(safeKind, null);
        inflight.delete(safeKind);
        return null;
      });
    inflight.set(safeKind, promise);
    return promise;
  }

  async function prewarm(/** @type {any[]} */ entries) {
    const kinds = new Set();
    for (const entry of Array.isArray(entries) ? entries : []) {
      const kind = normalizeKindEntry(entry);
      if (kind) kinds.add(kind);
    }
    await Promise.allSettled(Array.from(kinds, (kind) => resolveItemPreviewKind(kind)));
  }

  return {
    resolveItemPreviewKind,
    getCached: (/** @type {any} */ kind) => {
      const safeKind = typeof kind === 'string' ? kind.trim() : '';
      if (!safeKind) return undefined;
      return cache.get(safeKind);
    },
    prewarm,
    clear: () => {
      cache.clear();
      inflight.clear();
    },
  };
}
