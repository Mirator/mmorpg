// @ts-check
// @ts-nocheck

import { ensureAdminAlias, getStoredAdminAlias, renderAdminAlias } from './admin-alias.js';
import { createDesignerApi } from './designer-api.js';

const LAYERS = ['terrain', 'props', 'spawns', 'navmesh', 'triggers', 'lighting', 'debug'];

const form = /** @type {HTMLFormElement} */ (document.getElementById('auth-form'));
const passInput = /** @type {HTMLInputElement} */ (document.getElementById('admin-pass'));
const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const aliasLabel = /** @type {HTMLElement} */ (document.getElementById('alias-label'));
const aliasBtn = /** @type {HTMLButtonElement} */ (document.getElementById('alias-btn'));
const lockBtn = /** @type {HTMLButtonElement} */ (document.getElementById('lock-btn'));

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
  alias: '',
  api: /** @type {ReturnType<typeof createDesignerApi>} */ (createDesignerApi({ getAlias })),
  mapConfig: /** @type {any | null} */ (null),
  locks: /** @type {any | null} */ (null),
  comments: /** @type {any[]} */ ([]),
  audit: /** @type {any[]} */ ([]),
};

function setStatus(message, tone = 'neutral') {
  statusEl.textContent = message;
  statusEl.className = `status ${tone}`;
}

function getAlias() {
  return state.alias;
}

function setLockedState(message = 'Status: locked') {
  state.mapConfig = null;
  state.locks = null;
  state.comments = [];
  state.audit = [];
  renderZoneLock();
  renderLayerLocks();
  renderComments();
  renderAudit();
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

function mapSize() {
  return Math.max(1, Number(state.mapConfig?.mapSize ?? 400));
}

function renderCommentCanvas() {
  commentCtx.clearRect(0, 0, commentCanvas.width, commentCanvas.height);
  commentCtx.fillStyle = '#120f0b';
  commentCtx.fillRect(0, 0, commentCanvas.width, commentCanvas.height);

  const size = mapSize();
  const half = size / 2;
  const scale = Math.min(commentCanvas.width, commentCanvas.height) / size;

  const toCanvas = (x, z) => ({
    x: (x + half) * scale,
    y: (z + half) * scale,
  });

  commentCtx.strokeStyle = '#5a472f';
  commentCtx.strokeRect(1, 1, commentCanvas.width - 2, commentCanvas.height - 2);

  for (const comment of state.comments) {
    const point = toCanvas(Number(comment.x ?? 0), Number(comment.z ?? 0));
    commentCtx.fillStyle = comment.status === 'resolved' ? '#9c8b73' : '#d8b46b';
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

    const title = document.createElement('strong');
    title.textContent = layerId;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = lock ? `Locked by ${lock.alias}` : 'Unlocked';

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.layerId = layerId;
    button.dataset.action = action;
    button.textContent = label;

    row.append(title, meta, button);

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

    const headline = document.createElement('strong');
    headline.textContent = `${comment.status === 'resolved' ? 'Resolved' : 'Open'} · ${comment.layerId || 'no-layer'}`;

    const idMeta = document.createElement('div');
    idMeta.className = 'meta mono';
    idMeta.textContent = String(comment.id ?? '');

    const positionMeta = document.createElement('div');
    positionMeta.className = 'meta';
    positionMeta.textContent = `(${Number(comment.x ?? 0).toFixed(1)}, ${Number(comment.z ?? 0).toFixed(1)})`;

    const commentTextEl = document.createElement('div');
    commentTextEl.textContent = String(comment.text ?? '');

    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';

    const resolveBtn = document.createElement('button');
    resolveBtn.type = 'button';
    resolveBtn.dataset.commentId = String(comment.id ?? '');
    resolveBtn.dataset.action = 'resolve';
    resolveBtn.textContent = 'Resolve';

    const reopenBtn = document.createElement('button');
    reopenBtn.type = 'button';
    reopenBtn.dataset.commentId = String(comment.id ?? '');
    reopenBtn.dataset.action = 'reopen';
    reopenBtn.textContent = 'Reopen';

    toolbar.append(resolveBtn, reopenBtn);
    row.append(headline, idMeta, positionMeta, commentTextEl, toolbar);

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

    const actionEl = document.createElement('strong');
    actionEl.textContent = String(entry.action ?? '');

    const actorMeta = document.createElement('div');
    actorMeta.className = 'meta';
    actorMeta.textContent = `${entry.alias} · ${entry.type} · ${entry.status}`;

    const timestampMeta = document.createElement('div');
    timestampMeta.className = 'meta';
    timestampMeta.textContent = String(entry.t ?? '');

    const messageMeta = document.createElement('div');
    messageMeta.className = 'meta';
    messageMeta.textContent = String(entry.message ?? '');

    row.append(actionEl, actorMeta, timestampMeta, messageMeta);
    auditList.appendChild(row);
  }
}

async function reloadAll() {
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

  state.alias = alias;
  renderAdminAlias(aliasLabel, `Alias: ${alias}`);

  try {
    await state.api.unlockAdminSession(password);
    passInput.value = '';
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

async function restoreSession() {
  try {
    await state.api.getAdminSession();
    await reloadAll();
    setStatus('Status: collaboration tools ready.', 'ok');
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

zoneLockBtn.addEventListener('click', async () => {
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
    if (handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
});

layerLocksEl.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('button[data-layer-id]');
  if (!(button instanceof HTMLButtonElement)) return;

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
    if (handleUnauthorized(err)) return;
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
    if (handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
});

commentsEl.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
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
    if (handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
});

for (const input of [auditAliasFilter, auditTypeFilter, auditActionFilter]) {
  input.addEventListener('input', () => {
    renderAudit();
  });
}

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
renderZoneLock();
renderLayerLocks();
renderComments();
renderAudit();
restoreSession().catch(() => {});
