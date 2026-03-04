// @ts-check

import { createSessionShell } from './session-shell.js';

const LAYERS = ['terrain', 'props', 'spawns', 'navmesh', 'triggers', 'lighting', 'debug'];

const form = /** @type {HTMLFormElement | null} */ (document.getElementById('auth-form'));
const passInput = /** @type {HTMLInputElement | null} */ (document.getElementById('admin-pass'));
const statusEl = /** @type {HTMLElement | null} */ (document.getElementById('status'));
const aliasLabel = /** @type {HTMLElement | null} */ (document.getElementById('alias-label'));
const aliasBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('alias-btn'));
const lockBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('lock-btn'));

const zoneLockBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('zone-lock-btn'));
const zoneLockMeta = /** @type {HTMLElement | null} */ (document.getElementById('zone-lock-meta'));
const layerLocksEl = /** @type {HTMLElement | null} */ (document.getElementById('layer-lock-list'));

const commentsEl = /** @type {HTMLElement | null} */ (document.getElementById('comment-list'));
const commentCountEl = /** @type {HTMLElement | null} */ (document.getElementById('comment-count'));
const commentForm = /** @type {HTMLFormElement | null} */ (document.getElementById('comment-form'));
const commentX = /** @type {HTMLInputElement | null} */ (document.getElementById('comment-x'));
const commentY = /** @type {HTMLInputElement | null} */ (document.getElementById('comment-y'));
const commentZ = /** @type {HTMLInputElement | null} */ (document.getElementById('comment-z'));
const commentLayer = /** @type {HTMLSelectElement | null} */ (document.getElementById('comment-layer'));
const commentEntityRef = /** @type {HTMLInputElement | null} */ (document.getElementById('comment-entity-ref'));
const commentText = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('comment-text'));
const commentCanvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('comment-canvas'));
const commentCtx = /** @type {CanvasRenderingContext2D | null} */ (commentCanvas?.getContext('2d') ?? null);

const auditList = /** @type {HTMLElement | null} */ (document.getElementById('audit-list'));
const auditAliasFilter = /** @type {HTMLInputElement | null} */ (document.getElementById('audit-alias-filter'));
const auditTypeFilter = /** @type {HTMLInputElement | null} */ (document.getElementById('audit-type-filter'));
const auditActionFilter = /** @type {HTMLInputElement | null} */ (document.getElementById('audit-action-filter'));

const state = {
  mapConfig: /** @type {any | null} */ (null),
  locks: /** @type {any | null} */ (null),
  comments: /** @type {any[]} */ ([]),
  audit: /** @type {any[]} */ ([]),
};

const session = createSessionShell(
  {
    form,
    passInput,
    statusEl,
    aliasLabel,
    aliasBtn,
    lockBtn,
  },
  {
    checkingMessage: 'Status: checking session...',
    lockedMessage: 'Status: locked',
    invalidPasswordMessage: 'Status: invalid password.',
    aliasRequiredMessage: 'Status: alias required.',
    sessionExpiredMessage: 'Status: session expired. Unlock again.',
    readyMessage: 'Status: collaboration tools ready.',
    onLocked() {
      state.mapConfig = null;
      state.locks = null;
      state.comments = [];
      state.audit = [];
      renderZoneLock();
      renderLayerLocks();
      renderComments();
      renderAudit();
    },
    async onRestore() {
      await reloadAll();
    },
  }
);

function mapSize() {
  return Math.max(1, Number(state.mapConfig?.mapSize ?? 400));
}

function renderCommentCanvas() {
  if (!commentCtx || !commentCanvas) return;
  commentCtx.clearRect(0, 0, commentCanvas.width, commentCanvas.height);
  commentCtx.fillStyle = '#120f0b';
  commentCtx.fillRect(0, 0, commentCanvas.width, commentCanvas.height);

  const size = mapSize();
  const half = size / 2;
  const scale = Math.min(commentCanvas.width, commentCanvas.height) / size;

  /**
   * @param {number} x
   * @param {number} z
   */
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
  if (!zoneLockBtn || !zoneLockMeta) return;
  const zoneLock = state.locks?.zone ?? null;
  if (!zoneLock) {
    zoneLockBtn.textContent = 'Acquire Zone Lock';
    zoneLockBtn.dataset.action = 'acquire';
    zoneLockMeta.textContent = 'No active zone lock.';
    return;
  }

  const owned = zoneLock.alias === session.getAlias();
  zoneLockBtn.textContent = owned ? 'Release Zone Lock' : `Held by ${zoneLock.alias}`;
  zoneLockBtn.dataset.action = owned ? 'release' : 'blocked';
  zoneLockMeta.textContent = zoneLock.reason
    ? `${zoneLock.alias}: ${zoneLock.reason}`
    : `${zoneLock.alias} acquired this lock.`;
}

function renderLayerLocks() {
  if (!layerLocksEl) return;
  layerLocksEl.textContent = '';

  const locks = state.locks?.layers ?? {};
  for (const layerId of LAYERS) {
    const lock = locks[layerId] ?? null;
    const row = document.createElement('div');
    row.className = 'list-item';

    const owned = lock?.alias === session.getAlias();
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
  if (!commentsEl || !commentCountEl) return;
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
  if (!auditList) return;
  auditList.textContent = '';

  const aliasFilter = auditAliasFilter?.value.trim().toLowerCase() ?? '';
  const typeFilter = auditTypeFilter?.value.trim().toLowerCase() ?? '';
  const actionFilter = auditActionFilter?.value.trim().toLowerCase() ?? '';

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
    session.api.getMapConfig(),
    session.api.getLocks(),
    session.api.getComments(),
    session.api.getAudit(400),
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

zoneLockBtn?.addEventListener('click', async () => {
  const action = zoneLockBtn.dataset.action;
  if (action !== 'acquire' && action !== 'release') return;

  try {
    const reason = action === 'acquire'
      ? window.prompt('Reason for zone lock (optional):', '') ?? ''
      : '';
    await session.api.setZoneLock({ action, reason: reason.trim() });
    await reloadAll();
    session.setStatus(`Status: zone lock ${action}d.`, 'ok');
  } catch (err) {
    if (session.handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    session.setStatus(`Status: ${error.message}`, 'error');
  }
});

layerLocksEl?.addEventListener('click', async (event) => {
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
    await session.api.setLayerLock(layerId, { action, reason: reason.trim() });
    await reloadAll();
    session.setStatus(`Status: ${layerId} lock ${action}d.`, 'ok');
  } catch (err) {
    if (session.handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    session.setStatus(`Status: ${error.message}`, 'error');
  }
});

commentCanvas?.addEventListener('click', (event) => {
  if (!commentCanvas || !commentX || !commentZ) return;
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

commentForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await session.api.createComment({
      x: Number(commentX?.value || 0),
      y: Number(commentY?.value || 0),
      z: Number(commentZ?.value || 0),
      text: commentText?.value.trim() ?? '',
      layerId: commentLayer?.value.trim() || undefined,
      entityRef: commentEntityRef?.value.trim() || undefined,
    });
    commentForm.reset();
    if (commentY) commentY.value = '0';
    await reloadAll();
    session.setStatus('Status: comment created.', 'ok');
  } catch (err) {
    if (session.handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    session.setStatus(`Status: ${error.message}`, 'error');
  }
});

commentsEl?.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('button[data-comment-id]');
  if (!(button instanceof HTMLButtonElement)) return;

  const commentId = button.dataset.commentId;
  const action = button.dataset.action;
    if (!commentId || !action) return;

  try {
    if (action === 'resolve') {
      await session.api.resolveComment(commentId, { action: 'resolve' });
    } else if (action === 'reopen') {
      await session.api.resolveComment(commentId, { action: 'reopen' });
    }
    await reloadAll();
    session.setStatus(`Status: comment ${action}d.`, 'ok');
  } catch (err) {
    if (session.handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    session.setStatus(`Status: ${error.message}`, 'error');
  }
});

for (const input of [auditAliasFilter, auditTypeFilter, auditActionFilter]) {
  if (!input) continue;
  input.addEventListener('input', () => {
    renderAudit();
  });
}
renderZoneLock();
renderLayerLocks();
renderComments();
renderAudit();
session.boot().catch(() => {});
