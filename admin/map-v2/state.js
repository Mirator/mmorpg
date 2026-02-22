// @ts-check

/**
 * @typedef {'spawnPoints' | 'obstacles' | 'structures' | 'resourceNodes' | 'vendors' | 'mobSpawns' | 'base'} EntityType
 */

/**
 * @typedef {'terrain' | 'props' | 'spawns' | 'navmesh' | 'triggers' | 'lighting' | 'debug'} LayerId
 */

/**
 * @typedef {'select' | 'move' | 'rotate' | 'scale' | 'paint' | 'erase' | 'measure' | 'grid' | 'snap'} Tool
 */

/**
 * @typedef {'Edit' | 'Spawn' | 'Nav' | 'Trigger' | 'Path' | 'Lighting' | 'Playtest'} Mode
 */

/**
 * @typedef {{
 *   type: EntityType,
 *   index: number
 * }} SelectionRef
 */

/**
 * @typedef {{
 *   id: LayerId,
 *   label: string,
 *   visible: boolean,
 *   locked: boolean,
 *   opacity: number,
 *   functional: boolean
 * }} LayerState
 */

/**
 * @typedef {{
 *   mapConfig: any,
 *   selected: SelectionRef[],
 *   activeTool: Tool,
 *   activeMode: Mode,
 *   layers: Record<LayerId, LayerState>,
 *   unsaved: boolean,
 *   snapToGrid: boolean,
 *   showGrid: boolean,
 *   gridSize: number
 * }} EditorState
 */

/** @type {Record<LayerId, LayerState>} */
export const DEFAULT_LAYER_STATE = {
  terrain: {
    id: 'terrain',
    label: 'Terrain',
    visible: true,
    locked: false,
    opacity: 100,
    functional: true,
  },
  props: {
    id: 'props',
    label: 'Props',
    visible: true,
    locked: false,
    opacity: 100,
    functional: true,
  },
  spawns: {
    id: 'spawns',
    label: 'Spawns',
    visible: true,
    locked: false,
    opacity: 100,
    functional: true,
  },
  navmesh: {
    id: 'navmesh',
    label: 'Navmesh',
    visible: true,
    locked: false,
    opacity: 70,
    functional: true,
  },
  triggers: {
    id: 'triggers',
    label: 'Triggers',
    visible: true,
    locked: false,
    opacity: 70,
    functional: true,
  },
  lighting: {
    id: 'lighting',
    label: 'Lighting',
    visible: true,
    locked: false,
    opacity: 70,
    functional: true,
  },
  debug: {
    id: 'debug',
    label: 'Debug',
    visible: true,
    locked: false,
    opacity: 100,
    functional: true,
  },
};

/**
 * @param {unknown} value
 * @returns {any}
 */
export function deepClone(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * @param {EntityType} type
 * @returns {LayerId}
 */
export function layerForType(type) {
  if (type === 'base') return 'terrain';
  if (type === 'spawnPoints' || type === 'mobSpawns') return 'spawns';
  return 'props';
}

/**
 * @param {any} mapConfig
 * @param {SelectionRef} ref
 * @returns {any | null}
 */
export function getEntityByRef(mapConfig, ref) {
  if (!mapConfig || !ref) return null;
  if (ref.type === 'base') return mapConfig.base ?? null;
  const list = mapConfig[ref.type];
  if (!Array.isArray(list)) return null;
  return list[ref.index] ?? null;
}

/**
 * @param {any} mapConfig
 * @param {SelectionRef} ref
 * @returns {boolean}
 */
export function isRefValid(mapConfig, ref) {
  return !!getEntityByRef(mapConfig, ref);
}

/**
 * @param {any} mapConfig
 * @param {SelectionRef[]} selected
 * @returns {SelectionRef[]}
 */
export function normalizeSelection(mapConfig, selected) {
  if (!Array.isArray(selected)) return [];
  return selected.filter((ref) => isRefValid(mapConfig, ref));
}

/**
 * @param {SelectionRef} ref
 * @returns {string}
 */
export function selectionKey(ref) {
  return `${ref.type}:${ref.index}`;
}

/**
 * @param {any} mapConfig
 * @param {SelectionRef[]} selection
 * @param {string} field
 * @returns {boolean}
 */
export function canBulkEditField(mapConfig, selection, field) {
  if (!Array.isArray(selection) || selection.length < 2) return false;
  const first = selection[0];
  if (first.type === 'base') return false;
  const firstEntity = getEntityByRef(mapConfig, first);
  if (!firstEntity || !(field in firstEntity)) return false;
  return selection.every((ref) => {
    if (ref.type !== first.type) return false;
    const entity = getEntityByRef(mapConfig, ref);
    return !!entity && field in entity;
  });
}

/**
 * @param {any} mapConfig
 * @param {SelectionRef[]} selection
 * @param {(entity: any, ref: SelectionRef) => void} fn
 */
export function applyToSelection(mapConfig, selection, fn) {
  for (const ref of selection) {
    const entity = getEntityByRef(mapConfig, ref);
    if (!entity) continue;
    fn(entity, ref);
  }
}
