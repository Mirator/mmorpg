// @ts-check
import { MOB_TYPES, RESOURCE_TYPE_LIST } from '/shared/entityTypes.js';
import { STRUCTURE_KIND_LIST } from '/shared/mapConfig.js';

export const ZONE_KEY = 'world-map';
export const DRAFT_KEY = 'ra.admin.mapv2.phase2.draft';
export const BRUSH_SPACING = 4;
export const PLAYTEST_POLL_MS = 1000;

export const MAP_ENTITY_MODES = new Set(['Edit', 'Spawn']);
export const MODE_FUNCTIONAL = new Set(['Edit', 'Spawn', 'Nav', 'Trigger', 'Path', 'Lighting', 'Playtest']);

/** @type {Record<string, string>} */
export const OVERLAY_COLLECTION_BY_MODE = {
  Nav: 'navAreas',
  Trigger: 'triggers',
  Lighting: 'lightingRegions',
};

/** @typedef {{ key: string, label: string, type: string, step?: string, options?: Array<string | number | boolean> }} FieldDef */
/** @typedef {{ key: string, label: string, type: string, step?: string }} OverlayFieldDef */

/** @type {Record<string, FieldDef[]>} */
export const FIELD_DEFS = {
  base: [
    { key: 'x', label: 'X', type: 'number', step: '0.1' },
    { key: 'y', label: 'Y', type: 'number', step: '0.1' },
    { key: 'z', label: 'Z', type: 'number', step: '0.1' },
    { key: 'radius', label: 'Radius', type: 'number', step: '0.1' },
  ],
  spawnPoints: [
    { key: 'x', label: 'X', type: 'number', step: '0.1' },
    { key: 'y', label: 'Y', type: 'number', step: '0.1' },
    { key: 'z', label: 'Z', type: 'number', step: '0.1' },
  ],
  obstacles: [
    { key: 'x', label: 'X', type: 'number', step: '0.1' },
    { key: 'y', label: 'Y', type: 'number', step: '0.1' },
    { key: 'z', label: 'Z', type: 'number', step: '0.1' },
    { key: 'radius', label: 'R', type: 'number', step: '0.1' },
  ],
  structures: [
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'kind', label: 'Kind', type: 'select', options: STRUCTURE_KIND_LIST },
    { key: 'x', label: 'X', type: 'number', step: '0.1' },
    { key: 'y', label: 'Y', type: 'number', step: '0.1' },
    { key: 'z', label: 'Z', type: 'number', step: '0.1' },
    { key: 'rotation', label: 'Rotation', type: 'number', step: '0.01' },
    { key: 'colliderRadius', label: 'Collider R', type: 'number', step: '0.1' },
    { key: 'collides', label: 'Collides', type: 'select', options: [true, false] },
  ],
  resourceNodes: [
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'type', label: 'Type', type: 'select', options: RESOURCE_TYPE_LIST },
    { key: 'x', label: 'X', type: 'number', step: '0.1' },
    { key: 'y', label: 'Y', type: 'number', step: '0.1' },
    { key: 'z', label: 'Z', type: 'number', step: '0.1' },
    { key: 'respawnMs', label: 'Respawn (ms)', type: 'number', step: '1000' },
  ],
  vendors: [
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'x', label: 'X', type: 'number', step: '0.1' },
    { key: 'y', label: 'Y', type: 'number', step: '0.1' },
    { key: 'z', label: 'Z', type: 'number', step: '0.1' },
  ],
  mobSpawns: [
    { key: 'id', label: 'ID', type: 'text' },
    { key: 'mobType', label: 'Mob', type: 'select', options: MOB_TYPES },
    { key: 'x', label: 'X', type: 'number', step: '0.1' },
    { key: 'y', label: 'Y', type: 'number', step: '0.1' },
    { key: 'z', label: 'Z', type: 'number', step: '0.1' },
    { key: 'aggressive', label: 'Aggressive', type: 'select', options: [true, false] },
    { key: 'level', label: 'Level', type: 'number', step: '1' },
    { key: 'levelVariance', label: 'Level ±', type: 'number', step: '1' },
  ],
};

/** @type {Record<string, OverlayFieldDef[]>} */
export const OVERLAY_FIELD_DEFS = {
  navAreas: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'x', label: 'X', type: 'number', step: '0.1' },
    { key: 'y', label: 'Y', type: 'number', step: '0.1' },
    { key: 'z', label: 'Z', type: 'number', step: '0.1' },
    { key: 'radius', label: 'Radius', type: 'number', step: '0.1' },
    { key: 'walkCost', label: 'Walk Cost', type: 'number', step: '0.1' },
    { key: 'runCost', label: 'Run Cost', type: 'number', step: '0.1' },
  ],
  triggers: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'x', label: 'X', type: 'number', step: '0.1' },
    { key: 'y', label: 'Y', type: 'number', step: '0.1' },
    { key: 'z', label: 'Z', type: 'number', step: '0.1' },
    { key: 'radius', label: 'Radius', type: 'number', step: '0.1' },
    { key: 'delayMs', label: 'Delay', type: 'number', step: '1' },
  ],
  lightingRegions: [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'x', label: 'X', type: 'number', step: '0.1' },
    { key: 'y', label: 'Y', type: 'number', step: '0.1' },
    { key: 'z', label: 'Z', type: 'number', step: '0.1' },
    { key: 'radius', label: 'Radius', type: 'number', step: '0.1' },
    { key: 'intensity', label: 'Intensity', type: 'number', step: '0.1' },
  ],
};

/** @type {Record<string, string>} */
export const COLORS = {
  terrain: '#5a472f',
  grid: 'rgba(185, 170, 146, 0.2)',
  base: '#c89b3c',
  spawnPoints: '#d8b46b',
  obstacles: '#514535',
  structures: '#8f6b32',
  resourceNodes: '#6f9f62',
  vendors: '#d8b46b',
  mobSpawns: '#c8614f',
  navAreas: '#88bf73',
  triggers: '#d8b46b',
  lightingRegions: '#e7d08f',
  path: '#c89b3c',
  selected: '#f2eadc',
};
