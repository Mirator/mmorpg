// @ts-check

import { createDesignerStore } from './designer-store.js';
import { createSessionShell } from './session-shell.js';
import { escapeHtml } from './escapeHtml.js';

const form = /** @type {HTMLFormElement | null} */ (document.getElementById('auth-form'));
const passInput = /** @type {HTMLInputElement | null} */ (document.getElementById('admin-pass'));
const statusEl = /** @type {HTMLElement | null} */ (document.getElementById('status'));
const aliasLabel = /** @type {HTMLElement | null} */ (document.getElementById('alias-label'));
const aliasBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('alias-btn'));
const lockBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('lock-btn'));

const tableBody = /** @type {HTMLElement | null} */ (document.getElementById('nav-table-body'));
const navCountEl = /** @type {HTMLElement | null} */ (document.getElementById('nav-count'));
const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('nav-canvas'));
const ctx = /** @type {CanvasRenderingContext2D | null} */ (canvas?.getContext('2d') ?? null);
const bakeBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('bake-preview-btn'));
const clearBakeBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('clear-bake-btn'));
const removeBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('remove-nav-btn'));
const selectedMeta = /** @type {HTMLElement | null} */ (document.getElementById('selected-nav-meta'));

const state = {
  store: /** @type {ReturnType<typeof createDesignerStore> | null} */ (null),
  selectedId: /** @type {string | null} */ (null),
  showBakePreview: false,
  mapSize: 400,
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
    readyMessage: 'Status: navmesh editor ready.',
    onLocked() {
      state.store = null;
      state.selectedId = null;
      state.showBakePreview = false;
      renderAll();
    },
    async onRestore() {
      const [storeSnapshot, mapConfig] = await Promise.all([
        ensureStore().load(),
        session.api.getMapConfig(),
      ]);
      state.mapSize = Number(mapConfig?.mapSize ?? 400);
      state.selectedId = storeSnapshot.zoneState?.navAreas?.[0]?.id ?? null;
      renderAll();
    },
  }
);

function ensureStore() {
  if (state.store) return state.store;
  state.store = createDesignerStore({
    getDesignerState: () => session.api.getDesignerState(),
    putDesignerState: (expectedRevision, zoneState) => session.api.putDesignerState(expectedRevision, zoneState),
  });
  return state.store;
}

function snapshot() {
  return state.store?.getSnapshot() ?? { zoneState: null };
}

function navAreas() {
  const list = snapshot().zoneState?.navAreas;
  return Array.isArray(list) ? list : [];
}

function selectedArea() {
  if (!state.selectedId) return null;
  return navAreas().find((entry) => entry.id === state.selectedId) ?? null;
}

function createAreaId() {
  return `nav-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function drawCanvas() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#120f0b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const mapSize = Math.max(1, state.mapSize);
  const half = mapSize / 2;
  const scale = Math.min(canvas.width, canvas.height) / mapSize;

  /**
   * @param {number} x
   * @param {number} z
   */
  const toCanvas = (x, z) => ({
    x: (x + half) * scale,
    y: (z + half) * scale,
  });

  ctx.strokeStyle = '#5a472f';
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

  const areas = [...navAreas()];
  for (const area of areas) {
    const center = toCanvas(Number(area.x ?? 0), Number(area.z ?? 0));
    const radius = Math.max(2, Number(area.radius ?? 0) * scale);

    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = area.id === state.selectedId ? 'rgba(200, 155, 60, 0.35)' : 'rgba(111, 159, 98, 0.23)';
    ctx.fill();
    ctx.strokeStyle = area.id === state.selectedId ? '#c89b3c' : '#6f9f62';
    ctx.stroke();

    ctx.fillStyle = '#f2eadc';
    ctx.font = '11px monospace';
    ctx.fillText(area.id, center.x + 4, center.y - 4);
  }

  if (state.showBakePreview && areas.length >= 2) {
    const sorted = [...areas].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    ctx.strokeStyle = '#d8b46b';
    ctx.lineWidth = 1.6;
    ctx.beginPath();

    sorted.forEach((area, index) => {
      const point = toCanvas(Number(area.x ?? 0), Number(area.z ?? 0));
      if (index === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    });
    ctx.stroke();

    ctx.fillStyle = '#d8b46b';
    ctx.fillText('Bake preview path overlay', 10, canvas.height - 12);
  }
}

function renderTable() {
  if (!tableBody || !navCountEl) return;
  tableBody.textContent = '';
  const list = navAreas();
  navCountEl.textContent = String(list.length);

  if (!list.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="8" class="note">No nav areas. Click canvas to add.</td>';
    tableBody.appendChild(row);
    return;
  }

  for (const area of list) {
    const tr = document.createElement('tr');
    if (area.id === state.selectedId) {
      tr.style.background = 'rgba(200, 155, 60, 0.12)';
    }

    const areaIdEsc = escapeHtml(area.id);
    const tagsStr = Array.isArray(area.tags) ? area.tags.join(', ') : '';
    tr.innerHTML = [
      `<td class="mono">${areaIdEsc}</td>`,
      `<td>${Number(area.x ?? 0).toFixed(1)}</td>`,
      `<td>${Number(area.z ?? 0).toFixed(1)}</td>`,
      `<td><input data-nav-id="${areaIdEsc}" data-field="radius" type="number" step="0.5" min="0.1" value="${escapeHtml(String(Number(area.radius ?? 6)))}" /></td>`,
      `<td><input data-nav-id="${areaIdEsc}" data-field="walkCost" type="number" step="0.1" min="0" value="${escapeHtml(String(Number(area.walkCost ?? 1)))}" /></td>`,
      `<td><input data-nav-id="${areaIdEsc}" data-field="runCost" type="number" step="0.1" min="0" value="${escapeHtml(String(Number(area.runCost ?? 1)))}" /></td>`,
      `<td>${escapeHtml(tagsStr)}</td>`,
      `<td><button type="button" data-select-id="${areaIdEsc}">Select</button></td>`,
    ].join('');

    tableBody.appendChild(tr);
  }
}

function renderSelection() {
  if (!selectedMeta || !removeBtn) return;
  const area = selectedArea();
  if (!area) {
    selectedMeta.textContent = 'No nav area selected.';
    removeBtn.disabled = true;
    return;
  }

  selectedMeta.textContent = `${area.id} | walk=${Number(area.walkCost ?? 1)} run=${Number(area.runCost ?? 1)}`;
  removeBtn.disabled = false;
}

function renderAll() {
  renderTable();
  renderSelection();
  drawCanvas();
}

/**
 * @param {(draft: any) => void} mutator
 */
async function persist(mutator) {
  const snap = state.store?.getSnapshot();
  if (!snap?.zoneState || !state.store) return;

  mutator(snap.zoneState);
  const result = await state.store.save(snap.zoneState);
  if (result.conflict) {
    session.setStatus('Status: revision conflict. Reloaded latest nav data.', 'warning');
  }
  renderAll();
}

/**
 * @param {number} x
 * @param {number} y
 */
function locateAreaByCanvas(x, y) {
  if (!canvas) {
    return {
      area: null,
      world: { x: 0, z: 0 },
    };
  }
  const mapSize = Math.max(1, state.mapSize);
  const half = mapSize / 2;
  const scale = Math.min(canvas.width, canvas.height) / mapSize;

  const toWorld = {
    x: x / scale - half,
    z: y / scale - half,
  };

  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const area of navAreas()) {
    const dx = Number(area.x ?? 0) - toWorld.x;
    const dz = Number(area.z ?? 0) - toWorld.z;
    const distance = Math.hypot(dx, dz);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = area;
    }
  }

  if (nearest && nearestDistance <= Number(nearest.radius ?? 6)) {
    return { area: nearest, world: toWorld };
  }

  return { area: null, world: toWorld };
}

canvas?.addEventListener('click', async (event) => {
  if (!state.store) return;
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const point = locateAreaByCanvas(event.clientX - rect.left, event.clientY - rect.top);

  if (point.area) {
    state.selectedId = point.area.id;
    renderAll();
    return;
  }

  const newArea = {
    id: createAreaId(),
    name: 'Nav Area',
    shape: 'circle',
    x: Number(point.world.x.toFixed(1)),
    y: 0,
    z: Number(point.world.z.toFixed(1)),
    radius: 6,
    width: 10,
    height: 10,
    walkCost: 1,
    runCost: 1,
    tags: [],
  };

  try {
    await persist(/** @param {any} draft */ function (draft) {
      if (!Array.isArray(draft.navAreas)) {
        draft.navAreas = [];
      }
      draft.navAreas.push(newArea);
    });
    state.selectedId = newArea.id;
    session.setStatus('Status: nav area added.', 'ok');
  } catch (err) {
    if (session.handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    session.setStatus(`Status: ${error.message}`, 'error');
  }
});

tableBody?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('button[data-select-id]');
  if (!(button instanceof HTMLButtonElement)) return;

  const selectId = button.dataset.selectId;
  if (!selectId) return;
  state.selectedId = selectId;
  renderAll();
});

tableBody?.addEventListener('change', async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  const navId = target.dataset.navId;
  const field = target.dataset.field;
  if (!navId || !field) return;

  const parsed = Number(target.value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    renderAll();
    return;
  }

  try {
    await persist(/** @param {any} draft */ function (draft) {
      if (!Array.isArray(draft.navAreas)) return;
      const area = draft.navAreas.find(/** @param {any} entry */ (entry) => entry.id === navId);
      if (!area) return;
      area[field] = parsed;
    });
    session.setStatus('Status: nav cost updated.', 'ok');
  } catch (err) {
    if (session.handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    session.setStatus(`Status: ${error.message}`, 'error');
  }
});

bakeBtn?.addEventListener('click', () => {
  state.showBakePreview = true;
  drawCanvas();
  session.setStatus('Status: deterministic bake preview generated.', 'ok');
});

clearBakeBtn?.addEventListener('click', () => {
  state.showBakePreview = false;
  drawCanvas();
  session.setStatus('Status: bake preview cleared.', 'neutral');
});

removeBtn?.addEventListener('click', async () => {
  const area = selectedArea();
  if (!area) return;
  const confirmed = window.confirm(`Remove nav area ${area.id}?`);
  if (!confirmed) return;

  try {
    await persist(/** @param {any} draft */ function (draft) {
      draft.navAreas = Array.isArray(draft.navAreas)
        ? draft.navAreas.filter(/** @param {any} entry */ (entry) => entry.id !== area.id)
        : [];
    });
    state.selectedId = null;
    session.setStatus('Status: nav area removed.', 'ok');
  } catch (err) {
    if (session.handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    session.setStatus(`Status: ${error.message}`, 'error');
  }
});
drawCanvas();
session.boot().catch(() => {});
