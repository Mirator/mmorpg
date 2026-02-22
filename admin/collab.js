// @ts-check
// @ts-nocheck

import { ensureAdminAlias, renderAdminAlias } from './admin-alias.js';
import { createDesignerApi } from './designer-api.js';

const LAYERS = ['terrain', 'props', 'spawns', 'navmesh', 'triggers', 'lighting', 'debug'];

const form = /** @type {HTMLFormElement} */ (document.getElementById('auth-form'));
const passInput = /** @type {HTMLInputElement} */ (document.getElementById('admin-pass'));
const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const aliasLabel = /** @type {HTMLElement} */ (document.getElementById('alias-label'));
const aliasBtn = /** @type {HTMLButtonElement} */ (document.getElementById('alias-btn'));

const zoneLockBtn = /** @type {HTMLButtonElement} */ (document.getElementById('zone-lock-btn'));
const zoneLockMeta = /** @type {HTMLElement} */ (document.getElementById('zone-lock-meta'));
const layerLocksEl = /** @type {HTMLElement} */ (document.getElementById('layer-lock-list'));

const commentsEl = /** @type {HTMLElement} */ (document.getElementById('comment-list'));
const commentCountEl = /** @type {HTMLElement} */ (document.getElementById('comment-count'));
const commentForm = /** @type {HTMLFormElement} */ (document.getElementById('comment-form'));
const commentX = /** @type {HTMLInputElement} */ (document.getElementById('comment-x'));
const commentY = /** @type {HTMLInputElement} */ (document.getElementById('comment-y'));
const commentZ = /** @type {HTMLInputElement} */ (document.getElementById('comment-z'));
const commentLayer = /** @type {HTMLSelectElement} */ (document.getElementById('comment-layer'));
const commentEntityRef = /** @type {HTMLInputElement} */ (document.getElementById('comment-entity-ref'));
const commentText = /** @type {HTMLTextAreaElement} */ (document.getElementById('comment-text'));
const commentCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('comment-canvas'));
const commentCtx = /** @type {CanvasRenderingContext2D} */ (commentCanvas.getContext('2d'));

const auditList = /** @type {HTMLElement} */ (document.getElementById('audit-list'));
const auditAliasFilter = /** @type {HTMLInputElement} */ (document.getElementById('audit-alias-filter'));
const auditTypeFilter = /** @type {HTMLInputElement} */ (document.getElementById('audit-type-filter'));
const auditActionFilter = /** @type {HTMLInputElement} */ (document.getElementById('audit-action-filter'));

const state = {
  password: '',
  alias: '',
  api: /** @type {ReturnType<typeof createDesignerApi> | null} */ (null),
  mapConfig: /** @type {any | null} */ (null),
  locks: /** @type {any | null} */ (null),
  comments: /** @type {any[]} */ ([]),
  audit: /** @type {any[]} */ ([]),
};

function setStatus(message, tone = 'neutral') {
  statusEl.textContent = message;
  statusEl.className = `status ${tone}`;
}

function getPassword() {
  return state.password;
}

function getAlias() {
  return state.alias;
}

function mapSize() {
  return Math.max(1, Number(state.mapConfig?.mapSize ?? 400));
}

function renderCommentCanvas() {
  commentCtx.clearRect(0, 0, commentCanvas.width, commentCanvas.height);
  commentCtx.fillStyle = '#0f1820';
  commentCtx.fillRect(0, 0, commentCanvas.width, commentCanvas.height);

  const size = mapSize();
  const half = size / 2;
  const scale = Math.min(commentCanvas.width, commentCanvas.height) / size;

  const toCanvas = (x, z) => ({
    x: (x + half) * scale,
    y: (z + half) * scale,
  });

  commentCtx.strokeStyle = '#355065';
  commentCtx.strokeRect(1, 1, commentCanvas.width - 2, commentCanvas.height - 2);

  for (const comment of state.comments) {
    const point = toCanvas(Number(comment.x ?? 0), Number(comment.z ?? 0));
    commentCtx.fillStyle = comment.status === 'resolved' ? '#8a99a5' : '#ffb44d';
    commentCtx.beginPath();
    commentCtx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    commentCtx.fill();
  }
}

function renderZoneLock() {
  const zoneLock = state.locks?.zone ?? null;
  if (!zoneLock) {
    zoneLockBtn.textContent = 'Acquire Zone Lock';
    zoneLockBtn.dataset.action = 'acquire';
    zoneLockMeta.textContent = 'No active zone lock.';
    return;
  }

  const owned = zoneLock.alias === state.alias;
  zoneLockBtn.textContent = owned ? 'Release Zone Lock' : `Held by ${zoneLock.alias}`;
  zoneLockBtn.dataset.action = owned ? 'release' : 'blocked';
  zoneLockMeta.textContent = zoneLock.reason
    ? `${zoneLock.alias}: ${zoneLock.reason}`
    : `${zoneLock.alias} acquired this lock.`;
}

function renderLayerLocks() {
  layerLocksEl.textContent = '';

  const locks = state.locks?.layers ?? {};
  for (const layerId of LAYERS) {
    const lock = locks[layerId] ?? null;
    const row = document.createElement('div');
    row.className = 'list-item';

    const owned = lock?.alias === state.alias;
    const action = lock ? (owned ? 'release' : 'blocked') : 'acquire';
    const label = lock ? (owned ? 'Release' : `Held by ${lock.alias}`) : 'Acquire';

    row.innerHTML = [
      `<strong>${layerId}</strong>`,
      `<div class="meta">${lock ? `Locked by ${lock.alias}` : 'Unlocked'}</div>`,
      `<button type="button" data-layer-id="${layerId}" data-action="${action}">${label}</button>`,
    ].join('');

    layerLocksEl.appendChild(row);
  }
}

function renderComments() {
  commentsEl.textContent = '';
  commentCountEl.textContent = String(state.comments.length);

  if (!state.comments.length) {
    const empty = document.createElement('div');
    empty.className = 'note';
    empty.textContent = 'No comments pinned to the map.';
    commentsEl.appendChild(empty);
    renderCommentCanvas();
    return;
  }

  for (const comment of state.comments) {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = [
      `<strong>${comment.status === 'resolved' ? 'Resolved' : 'Open'} · ${comment.layerId || 'no-layer'}</strong>`,
      `<div class="meta mono">${comment.id}</div>`,
      `<div class="meta">(${Number(comment.x ?? 0).toFixed(1)}, ${Number(comment.z ?? 0).toFixed(1)})</div>`,
      `<div>${comment.text}</div>`,
      `<div class="toolbar">`,
      `<button type="button" data-comment-id="${comment.id}" data-action="resolve">Resolve</button>`,
      `<button type="button" data-comment-id="${comment.id}" data-action="reopen">Reopen</button>`,
      `</div>`,
    ].join('');

    commentsEl.appendChild(row);
  }

  renderCommentCanvas();
}

function renderAudit() {
  auditList.textContent = '';

  const aliasFilter = auditAliasFilter.value.trim().toLowerCase();
  const typeFilter = auditTypeFilter.value.trim().toLowerCase();
  const actionFilter = auditActionFilter.value.trim().toLowerCase();

  const filtered = state.audit.filter((entry) => {
    const aliasPass = !aliasFilter || String(entry.alias || '').toLowerCase().includes(aliasFilter);
    const typePass = !typeFilter || String(entry.type || '').toLowerCase().includes(typeFilter);
    const actionPass = !actionFilter || String(entry.action || '').toLowerCase().includes(actionFilter);
    return aliasPass && typePass && actionPass;
  });

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'note';
    empty.textContent = 'No audit entries match current filters.';
    auditList.appendChild(empty);
    return;
  }

  for (const entry of filtered) {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = [
      `<strong>${entry.action}</strong>`,
      `<div class="meta">${entry.alias} · ${entry.type} · ${entry.status}</div>`,
      `<div class="meta">${entry.t}</div>`,
      `<div class="meta">${entry.message || ''}</div>`,
    ].join('');
    auditList.appendChild(row);
  }
}

async function reloadAll() {
  if (!state.api) return;

  const [mapConfig, locksPayload, commentsPayload, auditPayload] = await Promise.all([
    state.api.getMapConfig(),
    state.api.getLocks(),
    state.api.getComments(),
    state.api.getAudit(400),
  ]);

  state.mapConfig = mapConfig;
  state.locks = locksPayload?.locks ?? { zone: null, layers: {} };
  state.comments = Array.isArray(commentsPayload?.comments) ? commentsPayload.comments : [];
  state.audit = Array.isArray(auditPayload?.audit) ? auditPayload.audit : [];

  renderZoneLock();
  renderLayerLocks();
  renderComments();
  renderAudit();
}

async function unlock() {
  const password = passInput.value.trim();
  if (!password) return;

  const alias = ensureAdminAlias();
  if (!alias) {
    setStatus('Status: alias required.', 'warning');
    return;
  }

  state.password = password;
  state.alias = alias;
  renderAdminAlias(aliasLabel, `Alias: ${alias}`);

  state.api = createDesignerApi({ getPassword, getAlias });

  try {
    await reloadAll();
    setStatus('Status: collaboration tools ready.', 'ok');
  } catch (err) {
    const error = /** @type {Error & { status?: number }} */ (err);
    if (error.status === 401) {
      setStatus('Status: invalid password.', 'error');
      return;
    }
    setStatus(`Status: ${error.message}`, 'error');
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

zoneLockBtn.addEventListener('click', async () => {
  if (!state.api) return;
  const action = zoneLockBtn.dataset.action;
  if (action !== 'acquire' && action !== 'release') return;

  try {
    const reason = action === 'acquire'
      ? window.prompt('Reason for zone lock (optional):', '') ?? ''
      : '';
    await state.api.setZoneLock({ action, reason: reason.trim() });
    await reloadAll();
    setStatus(`Status: zone lock ${action}d.`, 'ok');
  } catch (err) {
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
});

layerLocksEl.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('button[data-layer-id]');
  if (!(button instanceof HTMLButtonElement) || !state.api) return;

  const layerId = button.dataset.layerId;
  const action = button.dataset.action;
  if (!layerId || (action !== 'acquire' && action !== 'release')) return;

  try {
    const reason = action === 'acquire'
      ? window.prompt(`Reason for ${layerId} lock (optional):`, '') ?? ''
      : '';
    await state.api.setLayerLock(layerId, { action, reason: reason.trim() });
    await reloadAll();
    setStatus(`Status: ${layerId} lock ${action}d.`, 'ok');
  } catch (err) {
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
});

commentCanvas.addEventListener('click', (event) => {
  const rect = commentCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const size = mapSize();
  const half = size / 2;
  const scale = Math.min(commentCanvas.width, commentCanvas.height) / size;

  const worldX = x / scale - half;
  const worldZ = y / scale - half;

  commentX.value = worldX.toFixed(1);
  commentZ.value = worldZ.toFixed(1);
});

commentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.api) return;

  try {
    await state.api.createComment({
      x: Number(commentX.value || 0),
      y: Number(commentY.value || 0),
      z: Number(commentZ.value || 0),
      text: commentText.value.trim(),
      layerId: commentLayer.value.trim() || undefined,
      entityRef: commentEntityRef.value.trim() || undefined,
    });
    commentForm.reset();
    commentY.value = '0';
    await reloadAll();
    setStatus('Status: comment created.', 'ok');
  } catch (err) {
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
});

commentsEl.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement) || !state.api) return;
  const button = target.closest('button[data-comment-id]');
  if (!(button instanceof HTMLButtonElement)) return;

  const commentId = button.dataset.commentId;
  const action = button.dataset.action;
  if (!commentId || !action) return;

  try {
    if (action === 'resolve') {
      await state.api.resolveComment(commentId, { action: 'resolve' });
    } else if (action === 'reopen') {
      await state.api.resolveComment(commentId, { action: 'reopen' });
    }
    await reloadAll();
    setStatus(`Status: comment ${action}d.`, 'ok');
  } catch (err) {
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
});

for (const input of [auditAliasFilter, auditTypeFilter, auditActionFilter]) {
  input.addEventListener('input', () => {
    renderAudit();
  });
}

renderAdminAlias(aliasLabel, 'Alias: --');
setStatus('Status: locked', 'warning');
renderZoneLock();
renderLayerLocks();
renderComments();
renderAudit();
