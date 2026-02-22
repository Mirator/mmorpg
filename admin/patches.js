// @ts-check
// @ts-nocheck

import { ensureAdminAlias, getStoredAdminAlias, renderAdminAlias } from './admin-alias.js';
import { createDesignerApi } from './designer-api.js';

const form = /** @type {HTMLFormElement} */ (document.getElementById('auth-form'));
const passInput = /** @type {HTMLInputElement} */ (document.getElementById('admin-pass'));
const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const aliasLabel = /** @type {HTMLElement} */ (document.getElementById('alias-label'));
const aliasBtn = /** @type {HTMLButtonElement} */ (document.getElementById('alias-btn'));
const lockBtn = /** @type {HTMLButtonElement} */ (document.getElementById('lock-btn'));

const patchListEl = /** @type {HTMLElement} */ (document.getElementById('patch-list'));
const patchCountEl = /** @type {HTMLElement} */ (document.getElementById('patch-count'));
const filterSelect = /** @type {HTMLSelectElement} */ (document.getElementById('patch-filter'));

const createForm = /** @type {HTMLFormElement} */ (document.getElementById('create-patch-form'));
const titleInput = /** @type {HTMLInputElement} */ (document.getElementById('create-title'));
const descriptionInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('create-description'));
const dependenciesInput = /** @type {HTMLInputElement} */ (document.getElementById('create-dependencies'));

const detailEmpty = /** @type {HTMLElement} */ (document.getElementById('detail-empty'));
const detailPanel = /** @type {HTMLElement} */ (document.getElementById('detail-panel'));
const detailTitle = /** @type {HTMLElement} */ (document.getElementById('detail-title'));
const detailStatus = /** @type {HTMLElement} */ (document.getElementById('detail-status'));
const detailMeta = /** @type {HTMLElement} */ (document.getElementById('detail-meta'));
const detailDeps = /** @type {HTMLElement} */ (document.getElementById('detail-dependencies'));
const requestApprovalBtn = /** @type {HTMLButtonElement} */ (document.getElementById('request-approval-btn'));
const approveBtn = /** @type {HTMLButtonElement} */ (document.getElementById('approve-btn'));
const publishBtn = /** @type {HTMLButtonElement} */ (document.getElementById('publish-btn'));
const rollbackBtn = /** @type {HTMLButtonElement} */ (document.getElementById('rollback-btn'));
const restartNote = /** @type {HTMLElement} */ (document.getElementById('restart-note'));

const diffModeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('diff-mode'));
const jsonDiffEl = /** @type {HTMLElement} */ (document.getElementById('json-diff'));
const visualCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('visual-diff-canvas'));
const visualCtx = /** @type {CanvasRenderingContext2D} */ (visualCanvas.getContext('2d'));

const commentListEl = /** @type {HTMLElement} */ (document.getElementById('comment-list'));

const state = {
  alias: '',
  patches: /** @type {any[]} */ ([]),
  comments: /** @type {any[]} */ ([]),
  mapConfig: /** @type {any | null} */ (null),
  designerState: /** @type {any | null} */ (null),
  selectedPatchId: /** @type {string | null} */ (null),
  api: /** @type {ReturnType<typeof createDesignerApi>} */ (createDesignerApi({ getAlias })),
};

function setStatus(message, tone = 'neutral') {
  statusEl.textContent = message;
  statusEl.className = `status ${tone}`;
}

function getAlias() {
  return state.alias;
}

function setLockedState(message = 'Status: locked') {
  state.patches = [];
  state.comments = [];
  state.mapConfig = null;
  state.designerState = null;
  state.selectedPatchId = null;
  restartNote.hidden = true;
  renderPatchList();
  renderDetails();
  renderComments();
  setStatus(message, 'warning');
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function handleUnauthorized(err) {
  const error = /** @type {Error & { status?: number }} */ (err);
  if (error.status !== 401) return false;
  setLockedState('Status: session expired. Unlock again.');
  return true;
}

function statusClass(status) {
  return String(status || '').replaceAll(' ', '-');
}

function selectedPatch() {
  if (!state.selectedPatchId) return null;
  return state.patches.find((entry) => entry.id === state.selectedPatchId) ?? null;
}

function parseDependencyInput(raw) {
  return [...new Set(raw.split(',').map((entry) => entry.trim()).filter(Boolean))];
}

function renderPatchList() {
  patchListEl.textContent = '';
  const filter = filterSelect.value;
  const filtered = filter === 'all'
    ? state.patches
    : state.patches.filter((patch) => patch.status === filter);

  patchCountEl.textContent = `${filtered.length}`;

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'note';
    empty.textContent = 'No patches found for the selected filter.';
    patchListEl.appendChild(empty);
    return;
  }

  for (const patch of filtered) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'list-item';
    if (patch.id === state.selectedPatchId) {
      row.classList.add('active');
    }
    row.innerHTML = [
      `<strong>${patch.title}</strong>`,
      `<div class="meta mono">${patch.id}</div>`,
      `<div class="meta"><span class="pill status-${statusClass(patch.status)}">${patch.status}</span></div>`,
    ].join('');

    row.addEventListener('click', () => {
      state.selectedPatchId = patch.id;
      renderPatchList();
      renderDetails();
    });

    patchListEl.appendChild(row);
  }
}

function renderComments() {
  commentListEl.textContent = '';
  if (!state.comments.length) {
    const empty = document.createElement('div');
    empty.className = 'note';
    empty.textContent = 'No map comments yet.';
    commentListEl.appendChild(empty);
    return;
  }

  for (const comment of state.comments.slice(0, 12)) {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = [
      `<strong>${comment.status === 'resolved' ? 'Resolved' : 'Open'} comment</strong>`,
      `<div class="meta mono">${comment.id}</div>`,
      `<div class="meta">${comment.text}</div>`,
    ].join('');
    commentListEl.appendChild(row);
  }
}

function shortJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * @param {any} beforeValue
 * @param {any} afterValue
 * @param {string} path
 * @param {string[]} lines
 */
function diffValue(beforeValue, afterValue, path, lines) {
  if (lines.length >= 260) return;

  const beforeIsObject = beforeValue && typeof beforeValue === 'object';
  const afterIsObject = afterValue && typeof afterValue === 'object';
  if (!beforeIsObject || !afterIsObject) {
    if (beforeValue !== afterValue) {
      lines.push(`${path}: ${shortJson(beforeValue)} -> ${shortJson(afterValue)}`);
    }
    return;
  }

  if (Array.isArray(beforeValue) || Array.isArray(afterValue)) {
    const beforeArray = Array.isArray(beforeValue) ? beforeValue : [];
    const afterArray = Array.isArray(afterValue) ? afterValue : [];
    if (beforeArray.length !== afterArray.length) {
      lines.push(`${path}.length: ${beforeArray.length} -> ${afterArray.length}`);
    }
    const limit = Math.min(20, Math.max(beforeArray.length, afterArray.length));
    for (let i = 0; i < limit; i += 1) {
      diffValue(beforeArray[i], afterArray[i], `${path}[${i}]`, lines);
      if (lines.length >= 260) return;
    }
    return;
  }

  const keySet = new Set([...Object.keys(beforeValue), ...Object.keys(afterValue)]);
  for (const key of keySet) {
    diffValue(beforeValue[key], afterValue[key], `${path}.${key}`, lines);
    if (lines.length >= 260) return;
  }
}

function renderJsonDiff() {
  const patch = selectedPatch();
  if (!patch || !state.mapConfig) {
    jsonDiffEl.textContent = 'Select a patch to inspect diff data.';
    return;
  }

  const mode = diffModeSelect.value;
  const live = mode === 'designer'
    ? state.designerState
    : state.mapConfig;

  const staged = mode === 'designer'
    ? patch.sourceSnapshot?.zoneState
    : patch.sourceSnapshot?.mapConfig;

  if (!live || !staged) {
    jsonDiffEl.textContent = 'Patch snapshot is missing data.';
    return;
  }

  const lines = [];
  diffValue(live, staged, mode === 'designer' ? 'zoneState' : 'mapConfig', lines);
  jsonDiffEl.textContent = lines.length > 0
    ? lines.join('\n')
    : 'No differences detected.';
}

/**
 * @param {any} mapConfig
 */
function entitiesForDiff(mapConfig) {
  if (!mapConfig) return [];
  /** @type {Array<{ x: number, z: number, kind: string }>} */
  const out = [];

  const pushEntity = (list, kind) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      out.push({
        x: Number(item?.x ?? 0),
        z: Number(item?.z ?? 0),
        kind,
      });
    }
  };

  if (mapConfig.base) {
    out.push({ x: Number(mapConfig.base.x ?? 0), z: Number(mapConfig.base.z ?? 0), kind: 'base' });
  }
  pushEntity(mapConfig.spawnPoints, 'spawn');
  pushEntity(mapConfig.structures, 'structure');
  pushEntity(mapConfig.resourceNodes, 'resource');
  pushEntity(mapConfig.vendors, 'vendor');
  pushEntity(mapConfig.mobSpawns, 'mob');
  return out;
}

function renderVisualDiff() {
  visualCtx.clearRect(0, 0, visualCanvas.width, visualCanvas.height);
  visualCtx.fillStyle = '#120f0b';
  visualCtx.fillRect(0, 0, visualCanvas.width, visualCanvas.height);

  const patch = selectedPatch();
  if (!patch || !state.mapConfig) {
    visualCtx.fillStyle = '#b9aa92';
    visualCtx.font = '12px monospace';
    visualCtx.fillText('Select a patch to view visual diff.', 12, 24);
    return;
  }

  const liveMap = state.mapConfig;
  const stagedMap = patch.sourceSnapshot?.mapConfig;
  if (!stagedMap) {
    visualCtx.fillStyle = '#b9aa92';
    visualCtx.font = '12px monospace';
    visualCtx.fillText('Patch snapshot has no map config.', 12, 24);
    return;
  }

  const mapSize = Math.max(1, Number(liveMap.mapSize ?? stagedMap.mapSize ?? 1));
  const half = mapSize / 2;
  const scale = Math.min(visualCanvas.width, visualCanvas.height) / mapSize;

  const toCanvas = (x, z) => ({
    x: (x + half) * scale,
    y: (z + half) * scale,
  });

  visualCtx.strokeStyle = '#5a472f';
  visualCtx.strokeRect(1, 1, visualCanvas.width - 2, visualCanvas.height - 2);

  const liveEntities = entitiesForDiff(liveMap);
  const stagedEntities = entitiesForDiff(stagedMap);

  for (const entity of liveEntities) {
    const pos = toCanvas(entity.x, entity.z);
    visualCtx.fillStyle = 'rgba(200, 155, 60, 0.7)';
    visualCtx.fillRect(pos.x - 2, pos.y - 2, 4, 4);
  }

  for (const entity of stagedEntities) {
    const pos = toCanvas(entity.x, entity.z);
    visualCtx.fillStyle = 'rgba(111, 159, 98, 0.78)';
    visualCtx.fillRect(pos.x - 2, pos.y - 2, 4, 4);
  }

  visualCtx.fillStyle = '#b9aa92';
  visualCtx.font = '12px monospace';
  visualCtx.fillText('Gold=live, Moss=staged patch snapshot', 12, visualCanvas.height - 12);
}

function renderDetails() {
  const patch = selectedPatch();
  if (!patch) {
    detailEmpty.hidden = false;
    detailPanel.hidden = true;
    renderJsonDiff();
    renderVisualDiff();
    return;
  }

  detailEmpty.hidden = true;
  detailPanel.hidden = false;

  detailTitle.textContent = patch.title;
  detailStatus.className = `pill status-${statusClass(patch.status)}`;
  detailStatus.textContent = patch.status;
  detailMeta.textContent = `Created by ${patch.createdBy || 'admin'} at ${patch.createdAt || '--'}`;

  if (Array.isArray(patch.dependencyIds) && patch.dependencyIds.length > 0) {
    detailDeps.textContent = patch.dependencyIds.join(', ');
  } else {
    detailDeps.textContent = 'None';
  }

  requestApprovalBtn.disabled = patch.status !== 'Draft';
  approveBtn.disabled = patch.status !== 'Review Requested';
  publishBtn.disabled = patch.status !== 'Approved';
  rollbackBtn.disabled = patch.status !== 'Published';

  renderJsonDiff();
  renderVisualDiff();
}

async function reloadData() {
  const [patchesPayload, mapConfig, designerPayload, commentsPayload] = await Promise.all([
    state.api.getPatches(),
    state.api.getMapConfig(),
    state.api.getDesignerState(),
    state.api.getComments(),
  ]);

  state.patches = Array.isArray(patchesPayload.patches) ? patchesPayload.patches : [];
  state.mapConfig = mapConfig;
  state.designerState = designerPayload.zoneState;
  state.comments = Array.isArray(commentsPayload.comments) ? commentsPayload.comments : [];

  if (!selectedPatch()) {
    state.selectedPatchId = state.patches[0]?.id ?? null;
  }

  renderPatchList();
  renderDetails();
  renderComments();
}

async function runPatchAction(action) {
  const patch = selectedPatch();
  if (!patch) return;

  try {
    if (action === 'request') {
      await state.api.requestPatchApproval(patch.id);
      setStatus('Status: approval requested.', 'ok');
    }
    if (action === 'approve') {
      await state.api.approvePatch(patch.id);
      setStatus('Status: patch approved.', 'ok');
    }
    if (action === 'publish') {
      const payload = await state.api.publishPatch(patch.id);
      restartNote.hidden = false;
      restartNote.textContent = payload?.restartRequired
        ? 'Publish complete. Runtime restart is required to apply this patch.'
        : 'Publish complete.';
      setStatus('Status: patch published.', 'ok');
    }
    if (action === 'rollback') {
      const payload = await state.api.rollbackPatch(patch.id);
      restartNote.hidden = false;
      restartNote.textContent = payload?.restartRequired
        ? 'Rollback complete. Runtime restart is required to apply rollback.'
        : 'Rollback complete.';
      setStatus('Status: patch rolled back.', 'ok');
    }

    await reloadData();
  } catch (err) {
    if (handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
}

async function unlock() {
  const password = passInput.value.trim();
  if (!password) return;

  const alias = ensureAdminAlias();
  if (!alias) {
    setStatus('Status: alias required.', 'warning');
    return;
  }

  state.alias = alias;
  renderAdminAlias(aliasLabel, `Alias: ${alias}`);

  setStatus('Status: unlocking...', 'neutral');
  try {
    await state.api.unlockAdminSession(password);
    passInput.value = '';
    await reloadData();
    setStatus('Status: patch manager ready', 'ok');
  } catch (err) {
    const error = /** @type {Error & { status?: number }} */ (err);
    if (error.status === 401) {
      setStatus('Status: invalid password', 'error');
      return;
    }
    setStatus(`Status: ${error.message}`, 'error');
  }
}

async function restoreSession() {
  try {
    await state.api.getAdminSession();
    await reloadData();
    setStatus('Status: patch manager ready', 'ok');
  } catch {
    setLockedState('Status: locked');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await unlock();
});

aliasBtn.addEventListener('click', () => {
  const alias = ensureAdminAlias({ forcePrompt: true });
  if (!alias) return;
  state.alias = alias;
  renderAdminAlias(aliasLabel, `Alias: ${alias}`);
});

filterSelect.addEventListener('change', () => {
  renderPatchList();
  renderDetails();
});

diffModeSelect.addEventListener('change', () => {
  renderJsonDiff();
});

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await state.api.createPatch({
      title: titleInput.value.trim(),
      description: descriptionInput.value.trim(),
      dependencyIds: parseDependencyInput(dependenciesInput.value),
      sourceSnapshot: {
        mapConfig: state.mapConfig,
        zoneState: state.designerState,
      },
    });
    createForm.reset();
    await reloadData();
    setStatus('Status: patch draft created.', 'ok');
  } catch (err) {
    if (handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
});

requestApprovalBtn.addEventListener('click', async () => {
  await runPatchAction('request');
});

approveBtn.addEventListener('click', async () => {
  await runPatchAction('approve');
});

publishBtn.addEventListener('click', async () => {
  await runPatchAction('publish');
});

rollbackBtn.addEventListener('click', async () => {
  await runPatchAction('rollback');
});

lockBtn.addEventListener('click', async () => {
  try {
    await state.api.logoutAdminSession();
  } catch {
    // ignore and force local lock state
  }
  setLockedState('Status: locked');
});

state.alias = getStoredAdminAlias();
renderAdminAlias(aliasLabel, state.alias ? `Alias: ${state.alias}` : 'Alias: --');
setStatus('Status: checking session...', 'neutral');
renderJsonDiff();
renderVisualDiff();
renderComments();
restoreSession().catch(() => {});
