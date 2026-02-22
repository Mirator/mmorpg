// @ts-check
// @ts-nocheck

import {
  DEFAULT_LAYER_STATE,
  applyToSelection,
  canBulkEditField,
  deepClone,
  getEntityByRef,
  layerForType,
  normalizeSelection,
  selectionKey,
} from './map-v2/state.js';
import { canRedo, canUndo, createHistory, pushHistory, redo, undo } from './map-v2/history.js';
import { TEMPLATE_DEFINITIONS, filterTemplates, instantiateTemplate } from './map-v2/templates.js';
import {
  canvasToWorld,
  clampWorldPosition,
  createViewMetrics,
  distance2d,
  pointInRect,
  snapWorldPosition,
  worldToCanvas,
} from './map-v2/canvas.js';
import { MOB_TYPES, RESOURCE_TYPE_LIST } from '/shared/entityTypes.js';
import { STRUCTURE_KIND_LIST } from '/shared/mapConfig.js';
import { createDefaultZoneDesignerState } from '/shared/mapDesignerState.js';
import { createDesignerApi } from './designer-api.js';
import { createDesignerStore } from './designer-store.js';
import { ensureAdminAlias, renderAdminAlias } from './admin-alias.js';

const ZONE_KEY = 'world-map';
const DRAFT_KEY = 'ra.admin.mapv2.phase2.draft';
const BRUSH_SPACING = 4;
const PLAYTEST_POLL_MS = 1000;

const MAP_ENTITY_MODES = new Set(['Edit', 'Spawn']);
const MODE_FUNCTIONAL = new Set(['Edit', 'Spawn', 'Nav', 'Trigger', 'Path', 'Lighting', 'Playtest']);
const OVERLAY_COLLECTION_BY_MODE = {
  Nav: 'navAreas',
  Trigger: 'triggers',
  Lighting: 'lightingRegions',
};

const form = /** @type {HTMLFormElement} */ (document.getElementById('auth-form'));
const passInput = /** @type {HTMLInputElement} */ (document.getElementById('admin-pass'));
const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const aliasLabel = /** @type {HTMLElement} */ (document.getElementById('alias-label'));
const aliasBtn = /** @type {HTMLButtonElement} */ (document.getElementById('alias-btn'));
const workspacePanel = /** @type {HTMLElement} */ (document.getElementById('workspace-panel'));
const saveStatusEl = /** @type {HTMLElement} */ (document.getElementById('save-status'));
const errorsEl = /** @type {HTMLElement} */ (document.getElementById('errors'));
const modeNoticeEl = /** @type {HTMLElement} */ (document.getElementById('mode-notice'));

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('map-canvas'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
const miniCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('mini-map'));
const miniCtx = /** @type {CanvasRenderingContext2D} */ (miniCanvas.getContext('2d'));
const selectionBox = /** @type {HTMLElement} */ (document.getElementById('selection-box'));

const toolGroup = /** @type {HTMLElement} */ (document.getElementById('tool-group'));
const modeGroup = /** @type {HTMLElement} */ (document.getElementById('mode-group'));
const undoBtn = /** @type {HTMLButtonElement} */ (document.getElementById('undo-btn'));
const redoBtn = /** @type {HTMLButtonElement} */ (document.getElementById('redo-btn'));
const saveDraftBtn = /** @type {HTMLButtonElement} */ (document.getElementById('save-draft-btn'));
const reloadBtn = /** @type {HTMLButtonElement} */ (document.getElementById('reload-btn'));
const saveBtn = /** @type {HTMLButtonElement} */ (document.getElementById('save-btn'));

const assetSearch = /** @type {HTMLInputElement} */ (document.getElementById('asset-search'));
const assetList = /** @type {HTMLElement} */ (document.getElementById('asset-list'));

const zoomReadout = /** @type {HTMLElement} */ (document.getElementById('zoom-readout'));
const coordReadout = /** @type {HTMLElement} */ (document.getElementById('coord-readout'));
const measureReadout = /** @type {HTMLElement} */ (document.getElementById('measure-readout'));

const selectionSummary = /** @type {HTMLElement} */ (document.getElementById('selection-summary'));
const inspectorFields = /** @type {HTMLElement} */ (document.getElementById('inspector-fields'));
const bulkFields = /** @type {HTMLElement} */ (document.getElementById('bulk-fields'));
const layerList = /** @type {HTMLElement} */ (document.getElementById('layer-list'));

const mapSizeInput = /** @type {HTMLInputElement} */ (document.getElementById('map-size-input'));
const gridSizeInput = /** @type {HTMLInputElement} */ (document.getElementById('grid-size-input'));

const playtestPanel = /** @type {HTMLElement} */ (document.getElementById('playtest-panel'));
const playtestLaunchBtn = /** @type {HTMLButtonElement} */ (document.getElementById('playtest-launch-btn'));
const playtestRefreshBtn = /** @type {HTMLButtonElement} */ (document.getElementById('playtest-refresh-btn'));
const playtestFrame = /** @type {HTMLIFrameElement} */ (document.getElementById('playtest-frame'));
const playtestNote = /** @type {HTMLElement} */ (document.getElementById('playtest-note'));
const playtestPlayers = /** @type {HTMLElement} */ (document.getElementById('playtest-players'));
const playtestSpawns = /** @type {HTMLElement} */ (document.getElementById('playtest-spawns'));
const playtestMobs = /** @type {HTMLElement} */ (document.getElementById('playtest-mobs'));
const playtestResources = /** @type {HTMLElement} */ (document.getElementById('playtest-resources'));

/** @type {Record<string, Array<{ key: string, label: string, type: string, step?: string, options?: Array<string | number | boolean> }>>} */
const FIELD_DEFS = {
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

/** @type {Record<string, Array<{ key: string, label: string, type: string, step?: string }>>} */
const OVERLAY_FIELD_DEFS = {
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

const COLORS = {
  terrain: '#2a3944',
  grid: 'rgba(148, 165, 183, 0.18)',
  base: '#5fb8ff',
  spawnPoints: '#d8b880',
  obstacles: '#3a3f44',
  structures: '#9b7b53',
  resourceNodes: '#5ef2c2',
  vendors: '#ffd54f',
  mobSpawns: '#ff6b6b',
  navAreas: '#5ef2c2',
  triggers: '#ffb44d',
  lightingRegions: '#f9f871',
  path: '#5fb8ff',
  selected: '#ffffff',
};

const state = {
  adminPassword: '',
  adminAlias: '',
  api: /** @type {ReturnType<typeof createDesignerApi> | null} */ (null),
  designerStore: /** @type {ReturnType<typeof createDesignerStore> | null} */ (null),

  mapConfig: null,
  zoneState: createDefaultZoneDesignerState(),

  selected: /** @type {Array<{ type: string, index: number }>} */ ([]),
  selectedOverlay: /** @type {{ kind: 'overlay', collection: string, id: string } | { kind: 'path-node', pathId: string, nodeId: string } | null} */ (null),

  history: createHistory(100),
  unsaved: false,
  activeTool: 'select',
  activeMode: 'Edit',
  activeTemplateId: null,
  layers: deepClone(DEFAULT_LAYER_STATE),

  showGrid: true,
  snapToGrid: true,
  gridSize: 1,

  view: {
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  },

  measure: {
    start: null,
    end: null,
  },

  pointer: null,
  spaceDown: false,

  playtest: {
    pollTimer: /** @type {ReturnType<typeof setInterval> | null} */ (null),
    clientUrl: '',
  },
};

function setStatus(message, tone = 'neutral') {
  statusEl.textContent = message;
  statusEl.className = `status ${tone}`;
}

function setSaveStatus(message, tone = 'neutral') {
  saveStatusEl.textContent = message;
  saveStatusEl.className = `status compact ${tone}`;
}

function setErrors(errors) {
  errorsEl.textContent = '';
  if (!errors || errors.length === 0) return;
  const list = document.createElement('ul');
  for (const error of errors) {
    const li = document.createElement('li');
    li.textContent = error;
    list.appendChild(li);
  }
  errorsEl.appendChild(list);
}

function setControlsEnabled(enabled) {
  reloadBtn.disabled = !enabled;
  saveBtn.disabled = !enabled;
  saveDraftBtn.disabled = !enabled;
  mapSizeInput.disabled = !enabled;
}

function readPassword() {
  return state.adminPassword;
}

function readAlias() {
  return state.adminAlias;
}

function stopPlaytestPolling() {
  if (!state.playtest.pollTimer) return;
  clearInterval(state.playtest.pollTimer);
  state.playtest.pollTimer = null;
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '--';
}

function normalizeZoneState(input) {
  const zone = deepClone(input ?? createDefaultZoneDesignerState());

  if (!Array.isArray(zone.prefabs)) zone.prefabs = [];
  if (!Array.isArray(zone.navAreas)) zone.navAreas = [];
  if (!Array.isArray(zone.triggers)) zone.triggers = [];
  if (!Array.isArray(zone.paths)) zone.paths = [];
  if (!Array.isArray(zone.lightingRegions)) zone.lightingRegions = [];
  if (!Array.isArray(zone.comments)) zone.comments = [];
  if (!Array.isArray(zone.patches)) zone.patches = [];
  if (!Array.isArray(zone.audit)) zone.audit = [];

  zone.locks = zone.locks ?? { zone: null, layers: {} };
  zone.locks.zone = zone.locks.zone ?? null;
  zone.locks.layers = zone.locks.layers ?? {};
  for (const layerId of Object.keys(state.layers)) {
    zone.locks.layers[layerId] = zone.locks.layers[layerId] ?? null;
  }

  return zone;
}

function getMapSize() {
  return Number(state.mapConfig?.mapSize ?? 1);
}

function getMetrics() {
  const width = Math.max(1, canvas.width);
  const height = Math.max(1, canvas.height);
  return createViewMetrics({
    width,
    height,
    mapSize: getMapSize(),
    zoom: state.view.zoom,
    offsetX: state.view.offsetX,
    offsetY: state.view.offsetY,
    padding: 24,
  });
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(320, Math.floor(rect.width));
  canvas.height = Math.max(320, Math.floor(rect.height));
  renderCanvas();
}

function snapshotEditor() {
  return {
    mapConfig: deepClone(state.mapConfig),
    zoneState: deepClone(state.zoneState),
  };
}

function applyEditorSnapshot(snapshot) {
  state.mapConfig = deepClone(snapshot?.mapConfig ?? null);
  state.zoneState = normalizeZoneState(snapshot?.zoneState ?? createDefaultZoneDesignerState());
  syncLayerLocksFromZone();
  normalizeSelectionState();
}

function pushSnapshot() {
  if (!state.mapConfig) return;
  pushHistory(state.history, snapshotEditor());
  updateHistoryButtons();
}

function updateHistoryButtons() {
  undoBtn.disabled = !canUndo(state.history) || !state.mapConfig;
  redoBtn.disabled = !canRedo(state.history) || !state.mapConfig;
}

function markUnsaved() {
  state.unsaved = true;
  setSaveStatus('Unsaved changes', 'warning');
}

function normalizeSelectionState() {
  state.selected = normalizeSelection(state.mapConfig, state.selected);

  if (state.selectedOverlay?.kind === 'overlay') {
    const list = state.zoneState[state.selectedOverlay.collection];
    if (!Array.isArray(list) || !list.some((entry) => entry.id === state.selectedOverlay.id)) {
      state.selectedOverlay = null;
    }
  }

  if (state.selectedOverlay?.kind === 'path-node') {
    const pathDef = state.zoneState.paths.find((entry) => entry.id === state.selectedOverlay.pathId);
    const valid = pathDef?.nodes?.some((node) => node.id === state.selectedOverlay.nodeId);
    if (!valid) {
      state.selectedOverlay = null;
    }
  }
}

function getMapLayerId(type) {
  return layerForType(type);
}

function canMutateLayer(layerId) {
  const zoneLock = state.zoneState?.locks?.zone;
  if (zoneLock && zoneLock.alias !== readAlias()) {
    return { ok: false, message: `Zone is locked by ${zoneLock.alias}.` };
  }

  const layerLock = state.zoneState?.locks?.layers?.[layerId] ?? null;
  if (layerLock && layerLock.alias !== readAlias()) {
    return { ok: false, message: `${layerId} layer is locked by ${layerLock.alias}.` };
  }

  return { ok: true, message: '' };
}

function assertLayerUnlocked(layerId) {
  const gate = canMutateLayer(layerId);
  if (!gate.ok) {
    setSaveStatus(gate.message, 'warning');
    return false;
  }
  return true;
}

function isEditableRef(ref) {
  const layerId = getMapLayerId(ref.type);
  const layer = state.layers[layerId];
  if (!layer || layer.functional === false) return false;
  return assertLayerUnlocked(layerId);
}

function getEntityRadius(type, item) {
  if (type === 'base') return Math.max(0, Number(item?.radius ?? 0));
  if (type === 'obstacles') return Math.max(0, Number(item?.radius ?? 0));
  if (type === 'structures' && item?.collides !== false) {
    return Math.max(0, Number(item?.colliderRadius ?? 0));
  }
  return 0;
}

function getAllMapRefs() {
  if (!state.mapConfig) return [];
  const refs = [{ type: 'base', index: 0 }];
  for (const type of ['spawnPoints', 'obstacles', 'structures', 'resourceNodes', 'vendors', 'mobSpawns']) {
    const list = state.mapConfig[type];
    if (!Array.isArray(list)) continue;
    for (let i = 0; i < list.length; i += 1) {
      refs.push({ type, index: i });
    }
  }
  return refs;
}

function mapPositionOf(ref) {
  const entity = getEntityByRef(state.mapConfig, ref);
  if (!entity) return null;
  return {
    x: Number(entity.x ?? 0),
    y: Number(entity.y ?? 0),
    z: Number(entity.z ?? 0),
  };
}

function writePosition(ref, pos) {
  const entity = getEntityByRef(state.mapConfig, ref);
  if (!entity) return;

  const radius = getEntityRadius(ref.type, entity);
  const snapped = snapWorldPosition(pos, state.snapToGrid, state.gridSize);
  const clamped = clampWorldPosition(state.mapConfig, snapped, radius);
  entity.x = clamped.x;
  entity.y = clamped.y ?? 0;
  entity.z = clamped.z;
}

function parseControlValue(input) {
  if (input instanceof HTMLSelectElement) {
    if (input.dataset.valueType === 'boolean') return input.value === 'true';
    return input.value;
  }

  if (input.type === 'number') {
    const parsed = Number.parseFloat(input.value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return input.value;
}

function buildField({ label, value, type, step, options, dataset, disabled = false }) {
  const wrapper = document.createElement('label');
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.appendChild(text);

  let control;
  if (type === 'select') {
    control = document.createElement('select');
    for (const optionValue of options ?? []) {
      const option = document.createElement('option');
      option.value = String(optionValue);
      option.textContent = String(optionValue);
      if (String(optionValue) === String(value ?? '')) {
        option.selected = true;
      }
      control.appendChild(option);
    }
    if (options?.[0] === true || options?.[0] === false) {
      control.dataset.valueType = 'boolean';
    }
  } else {
    control = document.createElement('input');
    control.type = type;
    if (type === 'number') {
      control.step = step ?? '0.1';
    }
    control.value = value === undefined || value === null ? '' : String(value);
  }

  if (disabled) {
    control.disabled = true;
  }

  for (const [key, val] of Object.entries(dataset ?? {})) {
    control.dataset[key] = val;
  }

  wrapper.appendChild(control);
  return wrapper;
}

function setModeNotice(message) {
  if (!message) {
    modeNoticeEl.classList.add('hidden');
    modeNoticeEl.textContent = '';
    return;
  }
  modeNoticeEl.classList.remove('hidden');
  modeNoticeEl.textContent = message;
}

function syncLayerLocksFromZone() {
  const zoneLayers = state.zoneState?.locks?.layers ?? {};
  for (const layerId of Object.keys(state.layers)) {
    state.layers[layerId].locked = Boolean(zoneLayers[layerId]);
  }
}

function renderToolButtons() {
  const buttons = toolGroup.querySelectorAll('button[data-tool]');
  buttons.forEach((button) => {
    const tool = button.getAttribute('data-tool');
    const isToggle = tool === 'grid' || tool === 'snap';
    button.classList.remove('active', 'toggle-on');

    if (tool === state.activeTool && !isToggle) {
      button.classList.add('active');
    }
    if (tool === 'grid' && state.showGrid) {
      button.classList.add('toggle-on');
    }
    if (tool === 'snap' && state.snapToGrid) {
      button.classList.add('toggle-on');
    }
  });
}

function renderModeButtons() {
  const buttons = modeGroup.querySelectorAll('button[data-mode]');
  buttons.forEach((button) => {
    const mode = button.getAttribute('data-mode');
    button.classList.toggle('active', mode === state.activeMode);
  });

  if (MODE_FUNCTIONAL.has(state.activeMode)) {
    const modeHints = {
      Edit: 'Edit and spawn map entities with select/move/paint/erase tools.',
      Spawn: 'Spawn mode focuses on spawn points and mob/vendor placements.',
      Nav: 'Nav mode paints nav areas and edits movement costs.',
      Trigger: 'Trigger mode creates region triggers and action references.',
      Path: 'Path mode places patrol nodes and path graphs.',
      Lighting: 'Lighting mode paints ambient override regions.',
      Playtest: 'Playtest mode launches client preview with telemetry.',
    };
    setModeNotice(modeHints[state.activeMode] ?? '');
  }

  const showPlaytest = state.activeMode === 'Playtest';
  playtestPanel.classList.toggle('hidden', !showPlaytest);
  if (showPlaytest) {
    startPlaytestPolling();
  } else {
    stopPlaytestPolling();
  }
}

function mapEntityTypeFromPrefab(prefab) {
  const type = String(prefab?.entityType ?? '').trim();
  if (['spawnPoints', 'obstacles', 'structures', 'resourceNodes', 'vendors', 'mobSpawns'].includes(type)) {
    return type;
  }
  return 'structures';
}

function nextId(list, prefix) {
  const used = new Set((Array.isArray(list) ? list : []).map((item) => String(item?.id ?? '')));
  let i = 1;
  while (used.has(`${prefix}${i}`)) i += 1;
  return `${prefix}${i}`;
}

function instantiatePrefabTemplate(prefab, worldPos) {
  const type = mapEntityTypeFromPrefab(prefab);
  const defaults = deepClone(prefab?.defaults ?? {});
  const baseY = Number.isFinite(state.mapConfig?.base?.y) ? state.mapConfig.base.y : 0;
  const y = Number.isFinite(worldPos.y) ? worldPos.y : baseY;

  if (type === 'spawnPoints') {
    return { type, item: { x: worldPos.x, y, z: worldPos.z, ...defaults } };
  }

  if (type === 'obstacles') {
    return {
      type,
      item: {
        x: worldPos.x,
        y,
        z: worldPos.z,
        radius: Number(defaults.radius ?? 6),
        ...defaults,
      },
    };
  }

  if (type === 'structures') {
    return {
      type,
      item: {
        id: String(defaults.id ?? nextId(state.mapConfig?.structures, 'structure-')),
        kind: String(defaults.kind ?? 'market'),
        x: worldPos.x,
        y,
        z: worldPos.z,
        rotation: Number(defaults.rotation ?? 0),
        colliderRadius: Number(defaults.colliderRadius ?? 3),
        collides: defaults.collides !== false,
        ...defaults,
      },
    };
  }

  if (type === 'resourceNodes') {
    return {
      type,
      item: {
        id: String(defaults.id ?? nextId(state.mapConfig?.resourceNodes, 'r')),
        type: String(defaults.type ?? 'crystal'),
        x: worldPos.x,
        y,
        z: worldPos.z,
        ...defaults,
      },
    };
  }

  if (type === 'vendors') {
    return {
      type,
      item: {
        id: String(defaults.id ?? nextId(state.mapConfig?.vendors, 'vendor-')),
        name: String(defaults.name ?? prefab.name ?? 'Vendor'),
        x: worldPos.x,
        y,
        z: worldPos.z,
        ...defaults,
      },
    };
  }

  return {
    type: 'mobSpawns',
    item: {
      id: String(defaults.id ?? nextId(state.mapConfig?.mobSpawns, 'm')),
      mobType: String(defaults.mobType ?? 'orc'),
      x: worldPos.x,
      y,
      z: worldPos.z,
      aggressive: defaults.aggressive !== false,
      ...defaults,
    },
  };
}

function templateCatalog() {
  const prefabs = Array.isArray(state.zoneState?.prefabs)
    ? state.zoneState.prefabs.map((prefab) => ({
      id: `prefab:${prefab.id}`,
      label: `Prefab: ${prefab.name}`,
      type: mapEntityTypeFromPrefab(prefab),
      tags: ['prefab', ...(Array.isArray(prefab.tags) ? prefab.tags : [])],
    }))
    : [];

  return [...prefabs, ...TEMPLATE_DEFINITIONS];
}

function renderTemplates() {
  const catalog = templateCatalog();
  const filtered = filterTemplates(catalog, assetSearch.value ?? '');
  assetList.textContent = '';

  for (const template of filtered) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'asset-card';
    if (state.activeTemplateId === template.id) {
      card.classList.add('active');
    }
    card.draggable = true;
    card.dataset.templateId = template.id;
    card.innerHTML = [
      `<span class="asset-title">${template.label}</span>`,
      `<span class="asset-tags">${template.tags.join(' · ')}</span>`,
    ].join('');

    card.addEventListener('click', () => {
      state.activeTemplateId = template.id;
      if (state.activeTool !== 'paint') {
        state.activeTool = 'select';
      }
      renderToolButtons();
      renderTemplates();
    });

    card.addEventListener('dragstart', (event) => {
      event.dataTransfer?.setData('text/plain', template.id);
      state.activeTemplateId = template.id;
      renderTemplates();
    });

    assetList.appendChild(card);
  }

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No templates match this query.';
    assetList.appendChild(empty);
  }
}

function renderLayerList() {
  layerList.textContent = '';

  for (const layerId of Object.keys(state.layers)) {
    const layer = state.layers[layerId];
    const lockRecord = state.zoneState?.locks?.layers?.[layerId] ?? null;
    const lockOwned = lockRecord && lockRecord.alias === readAlias();

    const row = document.createElement('div');
    row.className = 'layer-row';

    const head = document.createElement('div');
    head.className = 'layer-head';

    const label = document.createElement('label');
    label.className = 'layer-controls';

    const visibleInput = document.createElement('input');
    visibleInput.type = 'checkbox';
    visibleInput.checked = layer.visible;
    visibleInput.dataset.layerId = layer.id;
    visibleInput.dataset.layerAction = 'visible';

    const text = document.createElement('span');
    text.textContent = layer.label;

    label.append(visibleInput, text);

    const lockBtn = document.createElement('button');
    lockBtn.type = 'button';
    lockBtn.className = 'layer-lock';
    lockBtn.dataset.layerId = layer.id;
    lockBtn.dataset.layerAction = lockRecord ? (lockOwned ? 'release-lock' : 'locked-by-other') : 'acquire-lock';
    lockBtn.textContent = lockRecord
      ? (lockOwned ? 'Release' : `Locked by ${lockRecord.alias}`)
      : 'Acquire';
    if (lockRecord) {
      lockBtn.classList.add('locked');
    }

    head.append(label, lockBtn);

    const opacityWrap = document.createElement('label');
    opacityWrap.className = 'layer-controls';
    const opacityText = document.createElement('span');
    opacityText.textContent = `Opacity ${layer.opacity}%`;

    const opacity = document.createElement('input');
    opacity.type = 'range';
    opacity.min = '0';
    opacity.max = '100';
    opacity.step = '10';
    opacity.value = String(layer.opacity);
    opacity.dataset.layerId = layer.id;
    opacity.dataset.layerAction = 'opacity';

    opacityWrap.append(opacityText, opacity);

    row.append(head, opacityWrap);
    layerList.appendChild(row);
  }
}

function activeOverlayCollection() {
  return OVERLAY_COLLECTION_BY_MODE[state.activeMode] ?? null;
}

function selectedOverlayEntity() {
  if (!state.selectedOverlay) return null;
  if (state.selectedOverlay.kind === 'overlay') {
    const list = state.zoneState[state.selectedOverlay.collection];
    return Array.isArray(list)
      ? list.find((entry) => entry.id === state.selectedOverlay.id) ?? null
      : null;
  }

  if (state.selectedOverlay.kind === 'path-node') {
    const pathDef = state.zoneState.paths.find((entry) => entry.id === state.selectedOverlay.pathId);
    return pathDef?.nodes?.find((entry) => entry.id === state.selectedOverlay.nodeId) ?? null;
  }

  return null;
}

function renderOverlayInspector() {
  inspectorFields.textContent = '';
  bulkFields.textContent = '';

  const selection = state.selectedOverlay;
  if (!selection) {
    selectionSummary.textContent = `${state.activeMode} mode: no overlay selection.`;
    return;
  }

  if (selection.kind === 'path-node') {
    const node = selectedOverlayEntity();
    selectionSummary.textContent = `Path node ${selection.nodeId}`;
    const defs = [
      { key: 'x', label: 'X', type: 'number', step: '0.1' },
      { key: 'y', label: 'Y', type: 'number', step: '0.1' },
      { key: 'z', label: 'Z', type: 'number', step: '0.1' },
      { key: 'speed', label: 'Speed', type: 'number', step: '0.1' },
      { key: 'dwellMs', label: 'Dwell', type: 'number', step: '1' },
    ];

    for (const def of defs) {
      const fieldNode = buildField({
        label: def.label,
        value: node?.[def.key],
        type: def.type,
        step: def.step,
        dataset: {
          overlayKind: 'path-node',
          pathId: selection.pathId,
          nodeId: selection.nodeId,
          field: def.key,
        },
      });
      inspectorFields.appendChild(fieldNode);
    }

    return;
  }

  const item = selectedOverlayEntity();
  const defs = OVERLAY_FIELD_DEFS[selection.collection] ?? [];
  selectionSummary.textContent = `${selection.collection} ${selection.id}`;

  for (const def of defs) {
    const fieldNode = buildField({
      label: def.label,
      value: item?.[def.key],
      type: def.type,
      step: def.step,
      dataset: {
        overlayKind: 'overlay',
        overlayCollection: selection.collection,
        overlayId: selection.id,
        field: def.key,
      },
    });
    inspectorFields.appendChild(fieldNode);
  }
}

function renderMapInspector() {
  inspectorFields.textContent = '';
  bulkFields.textContent = '';

  normalizeSelectionState();

  if (!state.selected.length) {
    selectionSummary.textContent = 'No selection.';
    return;
  }

  if (state.selected.length === 1) {
    const ref = state.selected[0];
    const entity = getEntityByRef(state.mapConfig, ref);
    selectionSummary.textContent = `${ref.type} #${ref.index + 1}`;
    const defs = FIELD_DEFS[ref.type] ?? [];

    for (const def of defs) {
      const value = entity?.[def.key];
      const fieldNode = buildField({
        label: def.label,
        value,
        type: def.type,
        step: def.step,
        options: def.options,
        dataset: {
          refType: ref.type,
          refIndex: String(ref.index),
          field: def.key,
        },
      });
      inspectorFields.appendChild(fieldNode);
    }

    if (ref.type !== 'base') {
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.textContent = 'Remove Selected';
      removeButton.dataset.action = 'remove-selection';
      inspectorFields.appendChild(removeButton);
    }
    return;
  }

  selectionSummary.textContent = `${state.selected.length} objects selected`;

  const firstType = state.selected[0].type;
  const sameType = state.selected.every((ref) => ref.type === firstType);
  if (!sameType || firstType === 'base') {
    const hint = document.createElement('div');
    hint.className = 'muted';
    hint.textContent = 'Bulk edit requires multi-select on the same entity type.';
    bulkFields.appendChild(hint);
    return;
  }

  const defs = (FIELD_DEFS[firstType] ?? []).filter((field) => field.key !== 'id');
  const usableDefs = defs.filter((field) => canBulkEditField(state.mapConfig, state.selected, field.key));

  for (const def of usableDefs) {
    const fieldNode = buildField({
      label: `${def.label} (all)`,
      value: '',
      type: def.type,
      step: def.step,
      options: def.options,
      dataset: {
        bulkField: def.key,
      },
    });

    const control = fieldNode.querySelector('input,select');
    if (control) {
      control.setAttribute('placeholder', 'Apply to selection');
    }
    bulkFields.appendChild(fieldNode);
  }

  if (!usableDefs.length) {
    const hint = document.createElement('div');
    hint.className = 'muted';
    hint.textContent = 'No shared editable fields for this selection.';
    bulkFields.appendChild(hint);
  }
}

function renderInspector() {
  if (state.activeMode === 'Nav' || state.activeMode === 'Trigger' || state.activeMode === 'Lighting' || state.activeMode === 'Path') {
    renderOverlayInspector();
    return;
  }
  renderMapInspector();
}

function renderMapSettings() {
  mapSizeInput.value = state.mapConfig ? String(state.mapConfig.mapSize ?? '') : '';
  gridSizeInput.value = String(state.gridSize);
}

function drawGrid(metrics) {
  if (!state.showGrid || !state.mapConfig) return;

  const half = getMapSize() / 2;
  const step = Math.max(0.5, state.gridSize);
  ctx.save();
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;

  for (let x = -half; x <= half; x += step) {
    const start = worldToCanvas({ x, z: -half }, metrics);
    const end = worldToCanvas({ x, z: half }, metrics);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  for (let z = -half; z <= half; z += step) {
    const start = worldToCanvas({ x: -half, z }, metrics);
    const end = worldToCanvas({ x: half, z }, metrics);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawMapEntity(ref, item, metrics, selectedSet) {
  const layerId = getMapLayerId(ref.type);
  const layer = state.layers[layerId];
  if (!layer?.visible) return;

  const c = worldToCanvas({ x: item.x, z: item.z }, metrics);
  const selected = selectedSet.has(selectionKey(ref));

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100));

  if (ref.type === 'base') {
    const radiusPx = Math.max(3, Number(item.radius ?? 0) * metrics.scale);
    ctx.fillStyle = COLORS.base;
    ctx.strokeStyle = COLORS.base;
    ctx.globalAlpha *= 0.25;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100));
    ctx.lineWidth = selected ? 3 : 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radiusPx, 0, Math.PI * 2);
    ctx.stroke();
  } else if (ref.type === 'obstacles') {
    const radiusPx = Math.max(3, Number(item.radius ?? 0) * metrics.scale);
    ctx.fillStyle = COLORS.obstacles;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radiusPx, 0, Math.PI * 2);
    ctx.fill();
  } else if (ref.type === 'structures') {
    const radiusPx = Math.max(4, Number(item.colliderRadius ?? 0) * metrics.scale);
    ctx.strokeStyle = COLORS.structures;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, radiusPx, 0, Math.PI * 2);
    ctx.stroke();
  } else if (ref.type === 'spawnPoints') {
    ctx.strokeStyle = COLORS.spawnPoints;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 6, 0, Math.PI * 2);
    ctx.stroke();
  } else if (ref.type === 'resourceNodes') {
    ctx.fillStyle = COLORS.resourceNodes;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (ref.type === 'vendors') {
    ctx.fillStyle = COLORS.vendors;
    ctx.fillRect(c.x - 5, c.y - 5, 10, 10);
  } else if (ref.type === 'mobSpawns') {
    ctx.strokeStyle = COLORS.mobSpawns;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x - 6, c.y - 6);
    ctx.lineTo(c.x + 6, c.y + 6);
    ctx.moveTo(c.x + 6, c.y - 6);
    ctx.lineTo(c.x - 6, c.y + 6);
    ctx.stroke();
  }

  if (selected) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.selected;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 10, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawOverlayCircle(collection, item, metrics, selected) {
  const layerId = collection === 'navAreas' ? 'navmesh' : collection === 'triggers' ? 'triggers' : 'lighting';
  const layer = state.layers[layerId];
  if (!layer?.visible) return;

  const center = worldToCanvas({ x: Number(item.x ?? 0), z: Number(item.z ?? 0) }, metrics);
  const radius = Math.max(4, Number(item.radius ?? 1) * metrics.scale);
  const color = COLORS[collection] ?? '#ffffff';

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100));
  ctx.strokeStyle = color;
  ctx.lineWidth = selected ? 3 : 2;
  if (collection === 'triggers') {
    ctx.setLineDash([6, 4]);
  }
  ctx.beginPath();
  ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
  ctx.stroke();

  if (selected) {
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    ctx.strokeStyle = COLORS.selected;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPaths(metrics) {
  const layer = state.layers.debug;
  if (!layer?.visible) return;

  for (const pathDef of state.zoneState.paths) {
    if (!Array.isArray(pathDef.nodes) || pathDef.nodes.length === 0) continue;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity / 100));
    ctx.strokeStyle = COLORS.path;
    ctx.lineWidth = 2;
    ctx.beginPath();

    pathDef.nodes.forEach((node, index) => {
      const p = worldToCanvas({ x: Number(node.x ?? 0), z: Number(node.z ?? 0) }, metrics);
      if (index === 0) {
        ctx.moveTo(p.x, p.y);
      } else {
        ctx.lineTo(p.x, p.y);
      }
    });
    ctx.stroke();

    for (const node of pathDef.nodes) {
      const p = worldToCanvas({ x: Number(node.x ?? 0), z: Number(node.z ?? 0) }, metrics);
      const selected = state.selectedOverlay?.kind === 'path-node'
        && state.selectedOverlay.pathId === pathDef.id
        && state.selectedOverlay.nodeId === node.id;

      ctx.fillStyle = selected ? '#ffffff' : COLORS.path;
      ctx.beginPath();
      ctx.arc(p.x, p.y, selected ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

function renderCanvas() {
  if (!state.mapConfig) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    miniCtx.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
    return;
  }

  const metrics = getMetrics();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawGrid(metrics);

  const half = getMapSize() / 2;
  const topLeft = worldToCanvas({ x: -half, z: -half }, metrics);
  const bottomRight = worldToCanvas({ x: half, z: half }, metrics);

  ctx.strokeStyle = COLORS.terrain;
  ctx.lineWidth = 2;
  ctx.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);

  const selectedSet = new Set(state.selected.map((ref) => selectionKey(ref)));
  for (const ref of getAllMapRefs()) {
    const entity = getEntityByRef(state.mapConfig, ref);
    if (!entity) continue;
    drawMapEntity(ref, entity, metrics, selectedSet);
  }

  for (const collection of ['navAreas', 'triggers', 'lightingRegions']) {
    const list = state.zoneState[collection];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const selected = state.selectedOverlay?.kind === 'overlay'
        && state.selectedOverlay.collection === collection
        && state.selectedOverlay.id === item.id;
      drawOverlayCircle(collection, item, metrics, selected);
    }
  }

  drawPaths(metrics);

  if (state.pointer?.kind === 'box' && state.pointer.rect) {
    const rect = state.pointer.rect;
    selectionBox.classList.remove('hidden');
    selectionBox.style.left = `${Math.min(rect.x1, rect.x2)}px`;
    selectionBox.style.top = `${Math.min(rect.y1, rect.y2)}px`;
    selectionBox.style.width = `${Math.abs(rect.x2 - rect.x1)}px`;
    selectionBox.style.height = `${Math.abs(rect.y2 - rect.y1)}px`;
  } else {
    selectionBox.classList.add('hidden');
  }

  renderMiniMap(metrics);
  zoomReadout.textContent = `Zoom ${Math.round(state.view.zoom * 100)}%`;
}

function renderMiniMap(metrics) {
  miniCtx.clearRect(0, 0, miniCanvas.width, miniCanvas.height);
  miniCtx.fillStyle = '#0f1820';
  miniCtx.fillRect(0, 0, miniCanvas.width, miniCanvas.height);

  if (!state.mapConfig) return;

  const mapSize = getMapSize();
  const half = mapSize / 2;

  const toMini = (pos) => ({
    x: ((pos.x + half) / mapSize) * miniCanvas.width,
    y: ((pos.z + half) / mapSize) * miniCanvas.height,
  });

  miniCtx.strokeStyle = '#355065';
  miniCtx.lineWidth = 1;
  miniCtx.strokeRect(1, 1, miniCanvas.width - 2, miniCanvas.height - 2);

  for (const ref of getAllMapRefs()) {
    const entity = getEntityByRef(state.mapConfig, ref);
    if (!entity) continue;
    const layer = state.layers[getMapLayerId(ref.type)];
    if (!layer?.visible) continue;

    const p = toMini({ x: entity.x, z: entity.z });
    miniCtx.fillStyle = COLORS[ref.type] ?? '#ffffff';
    miniCtx.fillRect(p.x - 1, p.y - 1, 3, 3);
  }

  for (const item of state.zoneState.navAreas) {
    const p = toMini({ x: item.x, z: item.z });
    miniCtx.fillStyle = COLORS.navAreas;
    miniCtx.fillRect(p.x - 1, p.y - 1, 3, 3);
  }

  const worldA = canvasToWorld({ x: 0, y: 0 }, metrics);
  const worldB = canvasToWorld({ x: canvas.width, y: canvas.height }, metrics);

  const miniA = toMini({ x: worldA.x, z: worldA.z });
  const miniB = toMini({ x: worldB.x, z: worldB.z });

  miniCtx.strokeStyle = '#5fb8ff';
  miniCtx.lineWidth = 1.5;
  miniCtx.strokeRect(
    Math.min(miniA.x, miniB.x),
    Math.min(miniA.y, miniB.y),
    Math.abs(miniB.x - miniA.x),
    Math.abs(miniB.y - miniA.y)
  );
}

function renderAll() {
  renderToolButtons();
  renderModeButtons();
  renderTemplates();
  renderLayerList();
  renderInspector();
  renderMapSettings();
  updateWorkspaceLock();
  updateHistoryButtons();
  renderCanvas();
}

function updateWorkspaceLock() {
  workspacePanel.classList.toggle('locked', !state.mapConfig);
}

function canvasPointFromMouse(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function updateCoordinateReadout(point) {
  if (!state.mapConfig) return;
  const world = canvasToWorld(point, getMetrics());
  coordReadout.textContent = `X: ${formatNumber(world.x, 2)} Z: ${formatNumber(world.z, 2)}`;
}

function setMeasure(start, end) {
  state.measure.start = start;
  state.measure.end = end;
  if (!start || !end) {
    measureReadout.textContent = 'Measure: --';
    return;
  }
  const dist = Math.hypot(end.x - start.x, end.z - start.z);
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  measureReadout.textContent = `Measure: d=${formatNumber(dist, 2)} (dx=${formatNumber(dx, 2)}, dz=${formatNumber(dz, 2)})`;
}

function findMapHit(canvasPos) {
  if (!state.mapConfig) return null;
  const metrics = getMetrics();

  /** @type {Array<{ ref: { type: string, index: number }, dist: number }>} */
  const hits = [];

  for (const ref of getAllMapRefs()) {
    const entity = getEntityByRef(state.mapConfig, ref);
    if (!entity) continue;

    const layer = state.layers[getMapLayerId(ref.type)];
    if (!layer?.visible) continue;

    const c = worldToCanvas({ x: entity.x, z: entity.z }, metrics);
    let radiusPx = 10;
    if (ref.type === 'base') radiusPx = Math.max(8, Number(entity.radius ?? 0) * metrics.scale + 6);
    if (ref.type === 'obstacles') radiusPx = Math.max(8, Number(entity.radius ?? 0) * metrics.scale + 6);
    if (ref.type === 'structures') radiusPx = Math.max(8, Number(entity.colliderRadius ?? 1) * metrics.scale + 6);

    const dist = distance2d(canvasPos, c);
    if (dist <= radiusPx) {
      hits.push({ ref, dist });
    }
  }

  hits.sort((a, b) => a.dist - b.dist);
  return hits[0]?.ref ?? null;
}

function findOverlayHit(canvasPos) {
  const metrics = getMetrics();
  const modeCollection = activeOverlayCollection();

  if (modeCollection) {
    const list = state.zoneState[modeCollection];
    if (Array.isArray(list)) {
      let best = null;
      for (const item of list) {
        const c = worldToCanvas({ x: Number(item.x ?? 0), z: Number(item.z ?? 0) }, metrics);
        const radiusPx = Math.max(8, Number(item.radius ?? 2) * metrics.scale + 6);
        const dist = distance2d(canvasPos, c);
        if (dist > radiusPx) continue;
        if (!best || dist < best.dist) {
          best = {
            kind: 'overlay',
            collection: modeCollection,
            id: item.id,
            dist,
          };
        }
      }
      if (best) return best;
    }
  }

  if (state.activeMode === 'Path') {
    let bestNode = null;
    for (const pathDef of state.zoneState.paths) {
      for (const node of pathDef.nodes ?? []) {
        const c = worldToCanvas({ x: Number(node.x ?? 0), z: Number(node.z ?? 0) }, metrics);
        const dist = distance2d(canvasPos, c);
        if (dist > 10) continue;
        if (!bestNode || dist < bestNode.dist) {
          bestNode = {
            kind: 'path-node',
            pathId: pathDef.id,
            nodeId: node.id,
            dist,
          };
        }
      }
    }
    return bestNode;
  }

  return null;
}

function refsInSelectionRect(rect) {
  if (!state.mapConfig) return [];
  const metrics = getMetrics();
  const normalizedRect = {
    x: Math.min(rect.x1, rect.x2),
    y: Math.min(rect.y1, rect.y2),
    w: Math.abs(rect.x2 - rect.x1),
    h: Math.abs(rect.y2 - rect.y1),
  };

  const refs = [];
  for (const ref of getAllMapRefs()) {
    const entity = getEntityByRef(state.mapConfig, ref);
    if (!entity) continue;
    const layer = state.layers[getMapLayerId(ref.type)];
    if (!layer?.visible) continue;

    const c = worldToCanvas({ x: entity.x, z: entity.z }, metrics);
    if (pointInRect(c, normalizedRect)) {
      refs.push(ref);
    }
  }

  return refs;
}

function removeMapRefs(refs) {
  if (!state.mapConfig || !refs.length) return;

  const removable = refs.filter((ref) => ref.type !== 'base');
  if (!removable.length) return;

  for (const ref of removable) {
    if (!assertLayerUnlocked(getMapLayerId(ref.type))) return;
  }

  pushSnapshot();

  /** @type {Record<string, number[]>} */
  const byType = {};
  for (const ref of removable) {
    byType[ref.type] ??= [];
    byType[ref.type].push(ref.index);
  }

  for (const [type, indices] of Object.entries(byType)) {
    const list = state.mapConfig[type];
    if (!Array.isArray(list)) continue;
    indices.sort((a, b) => b - a).forEach((index) => list.splice(index, 1));
  }

  state.selected = [];
  markUnsaved();
  renderAll();
}

function instantiateAnyTemplate(templateId, worldPos) {
  if (templateId.startsWith('prefab:')) {
    const prefabId = templateId.slice('prefab:'.length);
    const prefab = state.zoneState.prefabs.find((entry) => entry.id === prefabId);
    if (!prefab) return null;
    return instantiatePrefabTemplate(prefab, worldPos);
  }

  return instantiateTemplate(templateId, state.mapConfig, worldPos);
}

function placeTemplateAt(templateId, worldPos) {
  if (!state.mapConfig) return;
  if (!MAP_ENTITY_MODES.has(state.activeMode)) {
    setSaveStatus('Template placement is available in Edit/Spawn modes.', 'warning');
    return;
  }

  const result = instantiateAnyTemplate(templateId, worldPos);
  if (!result) return;

  const layerId = getMapLayerId(result.type);
  if (!assertLayerUnlocked(layerId)) return;

  const list = state.mapConfig[result.type];
  if (!Array.isArray(list)) return;

  const radius = getEntityRadius(result.type, result.item);
  const snapped = snapWorldPosition(result.item, state.snapToGrid, state.gridSize);
  const clamped = clampWorldPosition(state.mapConfig, snapped, radius);
  result.item.x = clamped.x;
  result.item.y = clamped.y ?? 0;
  result.item.z = clamped.z;

  pushSnapshot();
  list.push(result.item);
  state.selectedOverlay = null;
  state.selected = [{ type: result.type, index: list.length - 1 }];
  markUnsaved();
  renderAll();
}

function overlayId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function addOverlayAt(worldPos) {
  const mode = state.activeMode;

  if (mode === 'Nav') {
    if (!assertLayerUnlocked('navmesh')) return;
    const area = {
      id: overlayId('nav'),
      name: 'Nav Area',
      shape: 'circle',
      x: worldPos.x,
      y: worldPos.y ?? 0,
      z: worldPos.z,
      radius: 6,
      width: 10,
      height: 10,
      walkCost: 1,
      runCost: 1,
      tags: [],
    };
    pushSnapshot();
    state.zoneState.navAreas.push(area);
    state.selectedOverlay = { kind: 'overlay', collection: 'navAreas', id: area.id };
    markUnsaved();
    renderAll();
    return;
  }

  if (mode === 'Trigger') {
    if (!assertLayerUnlocked('triggers')) return;
    const trigger = {
      id: overlayId('trigger'),
      name: 'Trigger',
      shape: 'circle',
      x: worldPos.x,
      y: worldPos.y ?? 0,
      z: worldPos.z,
      radius: 8,
      width: 12,
      height: 12,
      conditionRef: 'enter_region',
      actionRefs: ['spawn_wave'],
      delayMs: 0,
      enabled: true,
      tags: [],
    };
    pushSnapshot();
    state.zoneState.triggers.push(trigger);
    state.selectedOverlay = { kind: 'overlay', collection: 'triggers', id: trigger.id };
    markUnsaved();
    renderAll();
    return;
  }

  if (mode === 'Lighting') {
    if (!assertLayerUnlocked('lighting')) return;
    const region = {
      id: overlayId('light'),
      name: 'Lighting Region',
      shape: 'circle',
      x: worldPos.x,
      y: worldPos.y ?? 0,
      z: worldPos.z,
      radius: 10,
      width: 14,
      height: 14,
      fogPreset: '',
      musicCue: '',
      shaderRef: '',
      intensity: 1,
      tags: [],
    };
    pushSnapshot();
    state.zoneState.lightingRegions.push(region);
    state.selectedOverlay = { kind: 'overlay', collection: 'lightingRegions', id: region.id };
    markUnsaved();
    renderAll();
    return;
  }

  if (mode === 'Path') {
    if (!assertLayerUnlocked('debug')) return;

    pushSnapshot();

    let pathDef = null;
    if (state.selectedOverlay?.kind === 'path-node') {
      pathDef = state.zoneState.paths.find((entry) => entry.id === state.selectedOverlay.pathId) ?? null;
    }
    if (!pathDef) {
      pathDef = {
        id: overlayId('path'),
        name: 'Path',
        loop: false,
        behaviorTags: [],
        nodes: [],
      };
      state.zoneState.paths.push(pathDef);
    }

    const node = {
      id: overlayId('node'),
      x: worldPos.x,
      y: worldPos.y ?? 0,
      z: worldPos.z,
      speed: 1,
      dwellMs: 0,
      tags: [],
    };

    pathDef.nodes.push(node);
    state.selectedOverlay = { kind: 'path-node', pathId: pathDef.id, nodeId: node.id };
    markUnsaved();
    renderAll();
  }
}

function eraseOverlayAt(canvasPos) {
  const hit = findOverlayHit(canvasPos);
  if (!hit) return;

  if (hit.kind === 'overlay') {
    const layerId = hit.collection === 'navAreas'
      ? 'navmesh'
      : hit.collection === 'triggers'
        ? 'triggers'
        : 'lighting';
    if (!assertLayerUnlocked(layerId)) return;

    const list = state.zoneState[hit.collection];
    if (!Array.isArray(list)) return;
    const index = list.findIndex((entry) => entry.id === hit.id);
    if (index < 0) return;

    pushSnapshot();
    list.splice(index, 1);
    state.selectedOverlay = null;
    markUnsaved();
    renderAll();
    return;
  }

  if (hit.kind === 'path-node') {
    if (!assertLayerUnlocked('debug')) return;
    const pathDef = state.zoneState.paths.find((entry) => entry.id === hit.pathId);
    if (!pathDef) return;

    const nodeIndex = pathDef.nodes.findIndex((entry) => entry.id === hit.nodeId);
    if (nodeIndex < 0) return;

    pushSnapshot();
    pathDef.nodes.splice(nodeIndex, 1);
    if (pathDef.nodes.length === 0) {
      state.zoneState.paths = state.zoneState.paths.filter((entry) => entry.id !== hit.pathId);
      state.selectedOverlay = null;
    }
    markUnsaved();
    renderAll();
  }
}

function startMapDrag(worldStart) {
  const initial = new Map();
  for (const ref of state.selected) {
    const pos = mapPositionOf(ref);
    if (!pos) continue;
    initial.set(selectionKey(ref), pos);
  }
  state.pointer = {
    kind: 'map-drag',
    worldStart,
    initial,
    pushed: false,
  };
}

function applyMapDrag(currentWorld) {
  if (!state.pointer || state.pointer.kind !== 'map-drag') return;

  const dx = currentWorld.x - state.pointer.worldStart.x;
  const dz = currentWorld.z - state.pointer.worldStart.z;

  if (!state.pointer.pushed) {
    pushSnapshot();
    state.pointer.pushed = true;
  }

  for (const ref of state.selected) {
    const layerId = getMapLayerId(ref.type);
    if (!assertLayerUnlocked(layerId)) continue;
    const start = state.pointer.initial.get(selectionKey(ref));
    if (!start) continue;
    writePosition(ref, {
      x: start.x + dx,
      y: start.y,
      z: start.z + dz,
    });
  }

  markUnsaved();
  renderCanvas();
  renderInspector();
}

function startOverlayDrag(worldStart) {
  if (!state.selectedOverlay) return;
  const target = selectedOverlayEntity();
  if (!target) return;

  state.pointer = {
    kind: 'overlay-drag',
    worldStart,
    overlayStart: {
      x: Number(target.x ?? 0),
      y: Number(target.y ?? 0),
      z: Number(target.z ?? 0),
    },
    pushed: false,
  };
}

function applyOverlayDrag(worldPos) {
  if (!state.pointer || state.pointer.kind !== 'overlay-drag') return;
  const selection = state.selectedOverlay;
  if (!selection) return;

  if (selection.kind === 'overlay') {
    const layerId = selection.collection === 'navAreas'
      ? 'navmesh'
      : selection.collection === 'triggers'
        ? 'triggers'
        : 'lighting';
    if (!assertLayerUnlocked(layerId)) return;

    const list = state.zoneState[selection.collection];
    const item = Array.isArray(list) ? list.find((entry) => entry.id === selection.id) : null;
    if (!item) return;

    if (!state.pointer.pushed) {
      pushSnapshot();
      state.pointer.pushed = true;
    }

    const dx = worldPos.x - state.pointer.worldStart.x;
    const dz = worldPos.z - state.pointer.worldStart.z;
    const radius = Number(item.radius ?? 0);

    const next = clampWorldPosition(
      state.mapConfig,
      snapWorldPosition(
        {
          x: state.pointer.overlayStart.x + dx,
          y: state.pointer.overlayStart.y,
          z: state.pointer.overlayStart.z + dz,
        },
        state.snapToGrid,
        state.gridSize
      ),
      Math.max(0, radius)
    );

    item.x = next.x;
    item.y = next.y ?? 0;
    item.z = next.z;

    markUnsaved();
    renderCanvas();
    renderInspector();
  }

  if (selection.kind === 'path-node') {
    if (!assertLayerUnlocked('debug')) return;
    const pathDef = state.zoneState.paths.find((entry) => entry.id === selection.pathId);
    const node = pathDef?.nodes?.find((entry) => entry.id === selection.nodeId);
    if (!node) return;

    if (!state.pointer.pushed) {
      pushSnapshot();
      state.pointer.pushed = true;
    }

    const dx = worldPos.x - state.pointer.worldStart.x;
    const dz = worldPos.z - state.pointer.worldStart.z;
    const next = clampWorldPosition(
      state.mapConfig,
      snapWorldPosition(
        {
          x: state.pointer.overlayStart.x + dx,
          y: state.pointer.overlayStart.y,
          z: state.pointer.overlayStart.z + dz,
        },
        state.snapToGrid,
        state.gridSize
      ),
      0
    );

    node.x = next.x;
    node.y = next.y ?? 0;
    node.z = next.z;

    markUnsaved();
    renderCanvas();
    renderInspector();
  }
}

function beginPan(mousePos) {
  state.pointer = {
    kind: 'pan',
    start: mousePos,
    offsetX: state.view.offsetX,
    offsetY: state.view.offsetY,
  };
}

function beginBoxSelect(mousePos, additive) {
  state.pointer = {
    kind: 'box',
    rect: {
      x1: mousePos.x,
      y1: mousePos.y,
      x2: mousePos.x,
      y2: mousePos.y,
    },
    additive,
  };
}

function beginPaint(worldPos) {
  if (MAP_ENTITY_MODES.has(state.activeMode)) {
    if (!state.activeTemplateId) {
      setSaveStatus('Select a template in Asset Browser before painting.', 'warning');
      return;
    }

    state.pointer = {
      kind: 'paint-map',
      lastWorld: worldPos,
    };

    placeTemplateAt(state.activeTemplateId, worldPos);
    return;
  }

  state.pointer = {
    kind: 'paint-overlay',
    lastWorld: worldPos,
  };

  addOverlayAt(worldPos);
}

function commitOverlayField(target) {
  const overlayKind = target.dataset.overlayKind;
  const field = target.dataset.field;
  if (!overlayKind || !field) return false;

  const value = parseControlValue(target);
  pushSnapshot();

  if (overlayKind === 'overlay') {
    const collection = target.dataset.overlayCollection;
    const id = target.dataset.overlayId;
    if (!collection || !id) return false;

    const list = state.zoneState[collection];
    const item = Array.isArray(list) ? list.find((entry) => entry.id === id) : null;
    if (!item) return false;

    item[field] = value;
    if (field === 'x' || field === 'y' || field === 'z' || field === 'radius') {
      const clamped = clampWorldPosition(
        state.mapConfig,
        {
          x: Number(item.x ?? 0),
          y: Number(item.y ?? 0),
          z: Number(item.z ?? 0),
        },
        Math.max(0, Number(item.radius ?? 0))
      );
      item.x = clamped.x;
      item.y = clamped.y ?? 0;
      item.z = clamped.z;
    }
  }

  if (overlayKind === 'path-node') {
    const pathId = target.dataset.pathId;
    const nodeId = target.dataset.nodeId;
    const pathDef = state.zoneState.paths.find((entry) => entry.id === pathId);
    const node = pathDef?.nodes?.find((entry) => entry.id === nodeId);
    if (!node) return false;

    node[field] = value;
    if (field === 'x' || field === 'y' || field === 'z') {
      const clamped = clampWorldPosition(
        state.mapConfig,
        {
          x: Number(node.x ?? 0),
          y: Number(node.y ?? 0),
          z: Number(node.z ?? 0),
        },
        0
      );
      node.x = clamped.x;
      node.y = clamped.y ?? 0;
      node.z = clamped.z;
    }
  }

  markUnsaved();
  renderAll();
  return true;
}

function commitMapInspectorField(target) {
  const bulkField = target.dataset.bulkField;
  if (bulkField) {
    pushSnapshot();
    const value = parseControlValue(target);
    applyToSelection(state.mapConfig, state.selected, (entity, ref) => {
      if (!assertLayerUnlocked(getMapLayerId(ref.type))) return;
      entity[bulkField] = value;
    });
    markUnsaved();
    renderAll();
    return;
  }

  const type = target.dataset.refType;
  const field = target.dataset.field;
  if (!type || !field) return;

  const index = Number.parseInt(target.dataset.refIndex ?? '0', 10);
  const ref = { type, index };

  if (!assertLayerUnlocked(getMapLayerId(ref.type))) return;

  const entity = getEntityByRef(state.mapConfig, ref);
  if (!entity) return;

  const value = parseControlValue(target);
  pushSnapshot();
  entity[field] = value;

  if (field === 'x' || field === 'y' || field === 'z' || field === 'radius' || field === 'colliderRadius') {
    writePosition(ref, { x: entity.x ?? 0, y: entity.y ?? 0, z: entity.z ?? 0 });
  }

  markUnsaved();
  renderAll();
}

function commitInspectorField(target) {
  if (commitOverlayField(target)) return;
  commitMapInspectorField(target);
}

function handleMapMouseDown(event, mousePos, worldPos) {
  if (state.activeTool === 'paint') {
    beginPaint(worldPos);
    return;
  }

  const hit = findMapHit(mousePos);

  if (state.activeTool === 'erase') {
    if (hit) removeMapRefs([hit]);
    return;
  }

  if (hit) {
    const isAlreadySelected = state.selected.some((ref) => selectionKey(ref) === selectionKey(hit));
    if (event.shiftKey) {
      if (!isAlreadySelected) {
        state.selected = normalizeSelection(state.mapConfig, [...state.selected, hit]);
      }
    } else {
      state.selected = [hit];
    }
    state.selectedOverlay = null;

    if (state.selected.length > 0) {
      startMapDrag(worldPos);
    }

    renderInspector();
    renderCanvas();
    return;
  }

  if (!event.shiftKey) {
    state.selected = [];
    state.selectedOverlay = null;
    renderInspector();
    renderCanvas();
  }

  beginBoxSelect(mousePos, event.shiftKey);
}

function handleOverlayMouseDown(mousePos, worldPos) {
  const hit = findOverlayHit(mousePos);

  if (state.activeTool === 'paint') {
    beginPaint(worldPos);
    return;
  }

  if (state.activeTool === 'erase') {
    eraseOverlayAt(mousePos);
    return;
  }

  if (hit) {
    if (hit.kind === 'overlay') {
      state.selectedOverlay = { kind: 'overlay', collection: hit.collection, id: hit.id };
    } else if (hit.kind === 'path-node') {
      state.selectedOverlay = { kind: 'path-node', pathId: hit.pathId, nodeId: hit.nodeId };
    }
    state.selected = [];

    if (state.activeTool === 'select' || state.activeTool === 'move') {
      startOverlayDrag(worldPos);
    }

    renderInspector();
    renderCanvas();
    return;
  }

  state.selectedOverlay = null;
  renderInspector();
  renderCanvas();
}

async function refreshPlaytestTelemetry() {
  if (!state.api || !state.mapConfig) return;
  const adminState = await state.api.getAdminState();

  const players = adminState?.players ? Object.keys(adminState.players).length : 0;
  const spawns =
    (Array.isArray(state.mapConfig.spawnPoints) ? state.mapConfig.spawnPoints.length : 0) +
    (Array.isArray(state.mapConfig.mobSpawns) ? state.mapConfig.mobSpawns.length : 0);
  const mobs = Array.isArray(adminState?.mobs) ? adminState.mobs.length : 0;
  const resources = Array.isArray(adminState?.resources) ? adminState.resources.length : 0;

  playtestPlayers.textContent = String(players);
  playtestSpawns.textContent = String(spawns);
  playtestMobs.textContent = String(mobs);
  playtestResources.textContent = String(resources);
}

async function launchPlaytest() {
  if (!state.api) return;
  const payload = await state.api.createPlaytestSession();
  const clientUrl = String(payload?.clientUrl ?? '/?guest=1');
  state.playtest.clientUrl = clientUrl;
  playtestFrame.src = clientUrl;
  playtestNote.textContent = String(
    payload?.note ??
      'Preview reflects currently saved map state. Publish and restart are required for runtime patch application.'
  );
}

function startPlaytestPolling() {
  if (state.playtest.pollTimer || !state.api) return;
  refreshPlaytestTelemetry().catch(() => {});
  state.playtest.pollTimer = setInterval(() => {
    refreshPlaytestTelemetry().catch(() => {});
  }, PLAYTEST_POLL_MS);
}

function updateLayerVisibilityAndOpacity(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  const layerId = target.dataset.layerId;
  const action = target.dataset.layerAction;
  if (!layerId || !action || !state.layers[layerId]) return;

  if (action === 'visible') {
    state.layers[layerId].visible = target.checked;
    renderLayerList();
    renderCanvas();
    return;
  }

  if (action === 'opacity') {
    const value = Number.parseFloat(target.value);
    if (Number.isFinite(value)) {
      state.layers[layerId].opacity = Math.max(0, Math.min(100, value));
      renderLayerList();
      renderCanvas();
    }
  }
}

async function handleLayerLockClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !state.api) return;
  const button = target.closest('button[data-layer-action]');
  if (!(button instanceof HTMLButtonElement)) return;

  const layerId = button.dataset.layerId;
  const action = button.dataset.layerAction;
  if (!layerId || !action || !state.layers[layerId]) return;

  if (action === 'locked-by-other') {
    const lock = state.zoneState?.locks?.layers?.[layerId];
    setSaveStatus(`${layerId} is locked by ${lock?.alias ?? 'another user'}.`, 'warning');
    return;
  }

  if (action !== 'acquire-lock' && action !== 'release-lock') return;

  try {
    const requestAction = action === 'acquire-lock' ? 'acquire' : 'release';
    await state.api.setLayerLock(layerId, { action: requestAction });

    if (state.designerStore) {
      const latest = await state.designerStore.load();
      state.zoneState = normalizeZoneState(latest.zoneState);
      syncLayerLocksFromZone();
    }

    setSaveStatus(`${layerId} lock ${requestAction}d.`, 'ok');
    renderAll();
  } catch (err) {
    const error = /** @type {Error} */ (err);
    setSaveStatus(error.message, 'error');
  }
}

async function unlockAndLoad(password) {
  state.adminPassword = password;
  setStatus('Status: connecting...', 'neutral');

  const alias = ensureAdminAlias();
  if (!alias) {
    setStatus('Status: alias required', 'warning');
    return;
  }

  state.adminAlias = alias;
  renderAdminAlias(aliasLabel, `Alias: ${alias}`);

  state.api = createDesignerApi({
    getPassword: readPassword,
    getAlias: readAlias,
    getZoneKey: () => ZONE_KEY,
  });

  state.designerStore = createDesignerStore({
    getDesignerState: () => state.api.getDesignerState(),
    putDesignerState: (expectedRevision, zoneState) => state.api.putDesignerState(expectedRevision, zoneState),
  });

  try {
    const [mapConfig, designerSnapshot] = await Promise.all([
      state.api.getMapConfig(),
      state.designerStore.load(),
    ]);

    let loadedMap = mapConfig;
    let loadedZone = normalizeZoneState(designerSnapshot.zoneState);

    const rawDraft = localStorage.getItem(DRAFT_KEY);
    if (rawDraft) {
      try {
        const draft = JSON.parse(rawDraft);
        if (draft?.mapConfig && draft?.zoneState) {
          const differs =
            JSON.stringify(draft.mapConfig) !== JSON.stringify(mapConfig)
            || JSON.stringify(draft.zoneState) !== JSON.stringify(loadedZone);
          if (differs) {
            const restore = window.confirm('Local draft found. Restore draft into editor?');
            if (restore) {
              loadedMap = draft.mapConfig;
              loadedZone = normalizeZoneState(draft.zoneState);
              setSaveStatus('Loaded local draft. Save to publish.', 'warning');
            }
          }
        }
      } catch {
        // ignore corrupt draft
      }
    }

    state.mapConfig = loadedMap;
    state.zoneState = loadedZone;
    state.selected = [];
    state.selectedOverlay = null;
    state.history = createHistory(100);
    state.unsaved = false;

    syncLayerLocksFromZone();
    setControlsEnabled(true);
    setErrors([]);
    setStatus('Status: connected', 'ok');
    if (!saveStatusEl.textContent || saveStatusEl.textContent === 'No map loaded.') {
      setSaveStatus('Loaded map and designer state.', 'ok');
    }

    renderAll();
  } catch (err) {
    const error = /** @type {Error & { status?: number }} */ (err);
    if (error.status === 401) {
      setStatus('Status: invalid password', 'error');
      setControlsEnabled(false);
      return;
    }

    setStatus('Status: offline', 'error');
    setControlsEnabled(false);
    setSaveStatus(error.message, 'error');
  }
}

canvas.addEventListener('wheel', (event) => {
  if (!state.mapConfig) return;
  event.preventDefault();

  const dir = event.deltaY < 0 ? 1 : -1;
  const factor = dir > 0 ? 1.08 : 1 / 1.08;
  state.view.zoom = Math.max(0.25, Math.min(6, state.view.zoom * factor));
  renderCanvas();
}, { passive: false });

canvas.addEventListener('mousedown', (event) => {
  if (!state.mapConfig) return;

  const mousePos = canvasPointFromMouse(event);
  const worldPos = canvasToWorld(mousePos, getMetrics());
  updateCoordinateReadout(mousePos);

  if (event.button === 1 || state.spaceDown) {
    beginPan(mousePos);
    return;
  }

  if (event.button !== 0) return;

  if (state.activeTool === 'measure') {
    if (!state.measure.start || state.measure.end) {
      setMeasure(worldPos, null);
    } else {
      setMeasure(state.measure.start, worldPos);
    }
    renderCanvas();
    return;
  }

  if (state.activeMode === 'Playtest') {
    return;
  }

  if (MAP_ENTITY_MODES.has(state.activeMode)) {
    handleMapMouseDown(event, mousePos, worldPos);
    return;
  }

  handleOverlayMouseDown(mousePos, worldPos);
});

window.addEventListener('mousemove', (event) => {
  if (!state.mapConfig) return;

  const rect = canvas.getBoundingClientRect();
  const mousePos = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };

  updateCoordinateReadout(mousePos);

  if (!state.pointer) return;

  if (state.pointer.kind === 'pan') {
    state.view.offsetX = state.pointer.offsetX + (mousePos.x - state.pointer.start.x);
    state.view.offsetY = state.pointer.offsetY + (mousePos.y - state.pointer.start.y);
    renderCanvas();
    return;
  }

  if (state.pointer.kind === 'map-drag') {
    const worldPos = canvasToWorld(mousePos, getMetrics());
    applyMapDrag(worldPos);
    return;
  }

  if (state.pointer.kind === 'overlay-drag') {
    const worldPos = canvasToWorld(mousePos, getMetrics());
    applyOverlayDrag(worldPos);
    return;
  }

  if (state.pointer.kind === 'box') {
    state.pointer.rect.x2 = mousePos.x;
    state.pointer.rect.y2 = mousePos.y;
    renderCanvas();
    return;
  }

  if (state.pointer.kind === 'paint-map' && state.activeTemplateId) {
    const worldPos = canvasToWorld(mousePos, getMetrics());
    const dist = Math.hypot(worldPos.x - state.pointer.lastWorld.x, worldPos.z - state.pointer.lastWorld.z);
    if (dist >= BRUSH_SPACING) {
      state.pointer.lastWorld = worldPos;
      placeTemplateAt(state.activeTemplateId, worldPos);
    }
    return;
  }

  if (state.pointer.kind === 'paint-overlay') {
    const worldPos = canvasToWorld(mousePos, getMetrics());
    const dist = Math.hypot(worldPos.x - state.pointer.lastWorld.x, worldPos.z - state.pointer.lastWorld.z);
    if (dist >= BRUSH_SPACING) {
      state.pointer.lastWorld = worldPos;
      addOverlayAt(worldPos);
    }
  }
});

window.addEventListener('mouseup', () => {
  if (!state.pointer) return;

  if (state.pointer.kind === 'box') {
    state.selected = refsInSelectionRect(state.pointer.rect);
    renderInspector();
  }

  state.pointer = null;
  renderCanvas();
});

canvas.addEventListener('dragover', (event) => {
  event.preventDefault();
});

canvas.addEventListener('drop', (event) => {
  event.preventDefault();
  if (!state.mapConfig) return;

  const templateId = event.dataTransfer?.getData('text/plain') || state.activeTemplateId;
  if (!templateId) return;

  const mousePos = canvasPointFromMouse(event);
  const worldPos = canvasToWorld(mousePos, getMetrics());
  placeTemplateAt(templateId, worldPos);
});

assetSearch.addEventListener('input', () => {
  renderTemplates();
});

layerList.addEventListener('input', updateLayerVisibilityAndOpacity);
layerList.addEventListener('click', (event) => {
  handleLayerLockClick(event).catch(() => {});
});

inspectorFields.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  commitInspectorField(target);
});

bulkFields.addEventListener('change', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
  commitInspectorField(target);
});

inspectorFields.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  if (target.dataset.action === 'remove-selection') {
    removeMapRefs(state.selected);
  }
});

mapSizeInput.addEventListener('change', () => {
  if (!state.mapConfig) return;
  if (!assertLayerUnlocked('terrain')) {
    renderMapSettings();
    return;
  }

  const parsed = Number.parseFloat(mapSizeInput.value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    renderMapSettings();
    return;
  }

  pushSnapshot();
  state.mapConfig.mapSize = parsed;
  markUnsaved();
  renderAll();
});

gridSizeInput.addEventListener('change', () => {
  const parsed = Number.parseFloat(gridSizeInput.value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    gridSizeInput.value = String(state.gridSize);
    return;
  }
  state.gridSize = parsed;
  renderCanvas();
});

modeGroup.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('button[data-mode]');
  if (!(button instanceof HTMLButtonElement)) return;
  const mode = button.dataset.mode;
  if (!mode) return;

  state.activeMode = mode;
  state.selected = [];
  state.selectedOverlay = null;

  if (mode === 'Path' && Array.isArray(state.zoneState.paths) && state.zoneState.paths.length === 0) {
    if (assertLayerUnlocked('debug')) {
      pushSnapshot();
      const seedPath = {
        id: overlayId('path'),
        name: 'Path',
        loop: false,
        behaviorTags: [],
        nodes: [
          {
            id: overlayId('node'),
            x: 0,
            y: Number(state.mapConfig?.base?.y ?? 0),
            z: 0,
            speed: 1,
            dwellMs: 0,
            tags: [],
          },
        ],
      };
      state.zoneState.paths.push(seedPath);
      state.selectedOverlay = { kind: 'path-node', pathId: seedPath.id, nodeId: seedPath.nodes[0].id };
      markUnsaved();
    }
  }

  renderAll();
});

toolGroup.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('button[data-tool]');
  if (!(button instanceof HTMLButtonElement)) return;
  const tool = button.dataset.tool;
  if (!tool) return;

  if (tool === 'grid') {
    state.showGrid = !state.showGrid;
    renderToolButtons();
    renderCanvas();
    return;
  }

  if (tool === 'snap') {
    state.snapToGrid = !state.snapToGrid;
    renderToolButtons();
    return;
  }

  state.activeTool = tool;
  renderToolButtons();
});

undoBtn.addEventListener('click', () => {
  const previous = undo(state.history, snapshotEditor());
  if (!previous) return;
  applyEditorSnapshot(previous);
  markUnsaved();
  renderAll();
});

redoBtn.addEventListener('click', () => {
  const next = redo(state.history, snapshotEditor());
  if (!next) return;
  applyEditorSnapshot(next);
  markUnsaved();
  renderAll();
});

saveDraftBtn.addEventListener('click', () => {
  if (!state.mapConfig) return;
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      savedAt: Date.now(),
      mapConfig: state.mapConfig,
      zoneState: state.zoneState,
    })
  );
  setSaveStatus('Draft saved locally.', 'ok');
});

reloadBtn.addEventListener('click', async () => {
  if (!state.api || !state.designerStore) return;

  try {
    const [mapConfig, designerSnapshot] = await Promise.all([
      state.api.getMapConfig(),
      state.designerStore.load(),
    ]);

    state.mapConfig = mapConfig;
    state.zoneState = normalizeZoneState(designerSnapshot.zoneState);
    state.selected = [];
    state.selectedOverlay = null;
    state.history = createHistory(100);
    state.unsaved = false;

    syncLayerLocksFromZone();
    setErrors([]);
    setSaveStatus('Reloaded map and designer state.', 'ok');
    renderAll();
  } catch (err) {
    const error = /** @type {Error & { details?: string[] }} */ (err);
    setSaveStatus('Reload failed.', 'error');
    setErrors(error.details ?? [error.message]);
  }
});

saveBtn.addEventListener('click', async () => {
  if (!state.api || !state.designerStore || !state.mapConfig) return;

  const zoneGate = canMutateLayer('terrain');
  if (!zoneGate.ok) {
    setSaveStatus(zoneGate.message, 'warning');
    return;
  }

  try {
    const mapSave = await state.api.putMapConfig(state.mapConfig);
    state.mapConfig = mapSave?.config ?? state.mapConfig;

    const storeResult = await state.designerStore.save(state.zoneState);
    state.zoneState = normalizeZoneState(storeResult.zoneState);
    syncLayerLocksFromZone();

    if (storeResult.conflict) {
      setSaveStatus('Save reached a revision conflict. Latest designer state was reloaded.', 'warning');
      state.unsaved = false;
    } else {
      state.unsaved = false;
      setSaveStatus('Saved successfully. Publish patch + restart to apply runtime changes.', 'ok');
    }

    setErrors([]);
    renderAll();
  } catch (err) {
    const error = /** @type {Error & { status?: number, details?: string[] }} */ (err);
    if (error.status === 401) {
      setStatus('Status: invalid password', 'error');
      setControlsEnabled(false);
      return;
    }

    if (error.status === 423) {
      setSaveStatus(`Save blocked by lock: ${error.message}`, 'error');
    } else {
      setSaveStatus('Save failed.', 'error');
    }

    setErrors(error.details ?? [error.message]);
  }
});

playtestLaunchBtn.addEventListener('click', async () => {
  try {
    await launchPlaytest();
    await refreshPlaytestTelemetry();
    setSaveStatus('Playtest preview launched.', 'ok');
  } catch (err) {
    const error = /** @type {Error} */ (err);
    setSaveStatus(error.message, 'error');
  }
});

playtestRefreshBtn.addEventListener('click', async () => {
  try {
    await refreshPlaytestTelemetry();
    setSaveStatus('Playtest telemetry refreshed.', 'ok');
  } catch (err) {
    const error = /** @type {Error} */ (err);
    setSaveStatus(error.message, 'error');
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const password = passInput.value.trim();
  if (!password) return;
  await unlockAndLoad(password);
});

aliasBtn.addEventListener('click', () => {
  const alias = ensureAdminAlias({ forcePrompt: true });
  if (!alias) return;
  state.adminAlias = alias;
  renderAdminAlias(aliasLabel, `Alias: ${alias}`);
  renderLayerList();
});

window.addEventListener('resize', resizeCanvas);

window.addEventListener('keydown', (event) => {
  const activeTag = document.activeElement?.tagName?.toLowerCase();
  if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
    return;
  }

  const cmd = event.metaKey || event.ctrlKey;

  if (event.code === 'Space') {
    state.spaceDown = true;
  }

  if (cmd && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) {
      redoBtn.click();
    } else {
      undoBtn.click();
    }
    return;
  }

  if (cmd && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redoBtn.click();
    return;
  }

  if (cmd && event.key.toLowerCase() === 's') {
    event.preventDefault();
    saveBtn.click();
    return;
  }

  if ((event.key === 'Delete' || event.key === 'Backspace') && state.selected.length) {
    event.preventDefault();
    removeMapRefs(state.selected);
    return;
  }

  if (event.key.toLowerCase() === 'q') state.activeTool = 'select';
  if (event.key.toLowerCase() === 'w') state.activeTool = 'move';
  if (event.key.toLowerCase() === 'e') state.activeTool = 'rotate';
  if (event.key.toLowerCase() === 'r') state.activeTool = 'scale';
  if (event.key.toLowerCase() === 'b') state.activeTool = 'paint';
  if (event.key.toLowerCase() === 'x') state.activeTool = 'erase';
  if (event.key.toLowerCase() === 'm') state.activeTool = 'measure';
  if (event.key.toLowerCase() === 'g' && event.shiftKey) {
    state.snapToGrid = !state.snapToGrid;
  } else if (event.key.toLowerCase() === 'g') {
    state.showGrid = !state.showGrid;
  }

  renderToolButtons();
  renderCanvas();
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'Space') {
    state.spaceDown = false;
  }
});

window.addEventListener('beforeunload', () => {
  stopPlaytestPolling();
});

window.__MAP_EDITOR_V2__ = {
  getState: () => ({
    mapConfig: deepClone(state.mapConfig),
    zoneState: deepClone(state.zoneState),
    selected: deepClone(state.selected),
    selectedOverlay: deepClone(state.selectedOverlay),
    layers: deepClone(state.layers),
    view: deepClone(state.view),
    activeTool: state.activeTool,
    activeMode: state.activeMode,
    snapToGrid: state.snapToGrid,
    showGrid: state.showGrid,
    gridSize: state.gridSize,
  }),
};

renderAdminAlias(aliasLabel, 'Alias: --');
setControlsEnabled(false);
setStatus('Status: locked', 'warning');
setModeNotice('Unlock with admin password to start editing.');
renderAll();
resizeCanvas();
