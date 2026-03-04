// @ts-check

import { bindElementRefs } from '/shared/domRefs.js';

/**
 * @param {Document} [root]
 */
export function bindMapEditorDom(root = document) {
  return /** @type {any} */ (
    bindElementRefs(root, {
      form: 'auth-form',
      passInput: 'admin-pass',
      statusEl: 'status',
      aliasLabel: 'alias-label',
      aliasBtn: 'alias-btn',
      lockBtn: 'lock-btn',
      workspacePanel: 'workspace-panel',
      saveStatusEl: 'save-status',
      errorsEl: 'errors',
      modeNoticeEl: 'mode-notice',
      canvas: 'map-canvas',
      miniCanvas: 'mini-map',
      selectionBox: 'selection-box',
      toolGroup: 'tool-group',
      modeGroup: 'mode-group',
      undoBtn: 'undo-btn',
      redoBtn: 'redo-btn',
      saveDraftBtn: 'save-draft-btn',
      reloadBtn: 'reload-btn',
      saveBtn: 'save-btn',
      assetSearch: 'asset-search',
      assetList: 'asset-list',
      zoomReadout: 'zoom-readout',
      coordReadout: 'coord-readout',
      measureReadout: 'measure-readout',
      selectionSummary: 'selection-summary',
      inspectorFields: 'inspector-fields',
      bulkFields: 'bulk-fields',
      layerList: 'layer-list',
      mapSizeInput: 'map-size-input',
      gridSizeInput: 'grid-size-input',
      playtestPanel: 'playtest-panel',
      playtestLaunchBtn: 'playtest-launch-btn',
      playtestRefreshBtn: 'playtest-refresh-btn',
      playtestFrame: 'playtest-frame',
      playtestNote: 'playtest-note',
      playtestPlayers: 'playtest-players',
      playtestSpawns: 'playtest-spawns',
      playtestMobs: 'playtest-mobs',
      playtestResources: 'playtest-resources',
    })
  );
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLCanvasElement} miniCanvas
 */
export function createCanvasContexts(canvas, miniCanvas) {
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  const miniCtx = /** @type {CanvasRenderingContext2D} */ (miniCanvas.getContext('2d'));
  return { ctx, miniCtx };
}
