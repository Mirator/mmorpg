// @ts-check
// @ts-nocheck

import { ensureAdminAlias, renderAdminAlias } from './admin-alias.js';
import { createDesignerApi } from './designer-api.js';
import { createDesignerStore } from './designer-store.js';

const form = /** @type {HTMLFormElement} */ (document.getElementById('auth-form'));
const passInput = /** @type {HTMLInputElement} */ (document.getElementById('admin-pass'));
const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const aliasLabel = /** @type {HTMLElement} */ (document.getElementById('alias-label'));
const aliasBtn = /** @type {HTMLButtonElement} */ (document.getElementById('alias-btn'));

const tableBody = /** @type {HTMLElement} */ (document.getElementById('nav-table-body'));
const navCountEl = /** @type {HTMLElement} */ (document.getElementById('nav-count'));
const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('nav-canvas'));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
const bakeBtn = /** @type {HTMLButtonElement} */ (document.getElementById('bake-preview-btn'));
const clearBakeBtn = /** @type {HTMLButtonElement} */ (document.getElementById('clear-bake-btn'));
const removeBtn = /** @type {HTMLButtonElement} */ (document.getElementById('remove-nav-btn'));
const selectedMeta = /** @type {HTMLElement} */ (document.getElementById('selected-nav-meta'));

const state = {
  password: '',
  alias: '',
  api: /** @type {ReturnType<typeof createDesignerApi> | null} */ (null),
  store: /** @type {ReturnType<typeof createDesignerStore> | null} */ (null),
  selectedId: /** @type {string | null} */ (null),
  showBakePreview: false,
  mapSize: 400,
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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0f1820';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const mapSize = Math.max(1, state.mapSize);
  const half = mapSize / 2;
  const scale = Math.min(canvas.width, canvas.height) / mapSize;

  const toCanvas = (x, z) => ({
    x: (x + half) * scale,
    y: (z + half) * scale,
  });

  ctx.strokeStyle = '#355065';
  ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);

  const areas = [...navAreas()];
  for (const area of areas) {
    const center = toCanvas(Number(area.x ?? 0), Number(area.z ?? 0));
    const radius = Math.max(2, Number(area.radius ?? 0) * scale);

    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = area.id === state.selectedId ? 'rgba(95, 184, 255, 0.35)' : 'rgba(94, 242, 194, 0.23)';
    ctx.fill();
    ctx.strokeStyle = area.id === state.selectedId ? '#5fb8ff' : '#5ef2c2';
    ctx.stroke();

    ctx.fillStyle = '#e6edf3';
    ctx.font = '11px monospace';
    ctx.fillText(area.id, center.x + 4, center.y - 4);
  }

  if (state.showBakePreview && areas.length >= 2) {
    const sorted = [...areas].sort((a, b) => String(a.id).localeCompare(String(b.id)));
    ctx.strokeStyle = '#ffb44d';
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

    ctx.fillStyle = '#ffb44d';
    ctx.fillText('Bake preview path overlay', 10, canvas.height - 12);
  }
}

function renderTable() {
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
      tr.style.background = 'rgba(95, 184, 255, 0.1)';
    }

    tr.innerHTML = [
      `<td class="mono">${area.id}</td>`,
      `<td>${Number(area.x ?? 0).toFixed(1)}</td>`,
      `<td>${Number(area.z ?? 0).toFixed(1)}</td>`,
      `<td><input data-nav-id="${area.id}" data-field="radius" type="number" step="0.5" min="0.1" value="${Number(area.radius ?? 6)}" /></td>`,
      `<td><input data-nav-id="${area.id}" data-field="walkCost" type="number" step="0.1" min="0" value="${Number(area.walkCost ?? 1)}" /></td>`,
      `<td><input data-nav-id="${area.id}" data-field="runCost" type="number" step="0.1" min="0" value="${Number(area.runCost ?? 1)}" /></td>`,
      `<td>${Array.isArray(area.tags) ? area.tags.join(', ') : ''}</td>`,
      `<td><button type="button" data-select-id="${area.id}">Select</button></td>`,
    ].join('');

    tableBody.appendChild(tr);
  }
}

function renderSelection() {
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

async function persist(mutator) {
  const snap = state.store?.getSnapshot();
  if (!snap?.zoneState || !state.store) return;

  mutator(snap.zoneState);
  const result = await state.store.save(snap.zoneState);
  if (result.conflict) {
    setStatus('Status: revision conflict. Reloaded latest nav data.', 'warning');
  }
  renderAll();
}

function locateAreaByCanvas(x, y) {
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
  state.store = createDesignerStore({
    getDesignerState: () => state.api.getDesignerState(),
    putDesignerState: (expectedRevision, zoneState) => state.api.putDesignerState(expectedRevision, zoneState),
  });

  try {
    const [storeSnapshot, mapConfig] = await Promise.all([
      state.store.load(),
      state.api.getMapConfig(),
    ]);
    state.mapSize = Number(mapConfig?.mapSize ?? 400);
    state.selectedId = storeSnapshot.zoneState?.navAreas?.[0]?.id ?? null;
    renderAll();
    setStatus('Status: navmesh editor ready.', 'ok');
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

canvas.addEventListener('click', async (event) => {
  if (!state.store) return;
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
    await persist((draft) => {
      if (!Array.isArray(draft.navAreas)) {
        draft.navAreas = [];
      }
      draft.navAreas.push(newArea);
    });
    state.selectedId = newArea.id;
    setStatus('Status: nav area added.', 'ok');
  } catch (err) {
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
});

tableBody.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const button = target.closest('button[data-select-id]');
  if (!(button instanceof HTMLButtonElement)) return;

  const selectId = button.dataset.selectId;
  if (!selectId) return;
  state.selectedId = selectId;
  renderAll();
});

tableBody.addEventListener('change', async (event) => {
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
    await persist((draft) => {
      if (!Array.isArray(draft.navAreas)) return;
      const area = draft.navAreas.find((entry) => entry.id === navId);
      if (!area) return;
      area[field] = parsed;
    });
    setStatus('Status: nav cost updated.', 'ok');
  } catch (err) {
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
});

bakeBtn.addEventListener('click', () => {
  state.showBakePreview = true;
  drawCanvas();
  setStatus('Status: deterministic bake preview generated.', 'ok');
});

clearBakeBtn.addEventListener('click', () => {
  state.showBakePreview = false;
  drawCanvas();
  setStatus('Status: bake preview cleared.', 'neutral');
});

removeBtn.addEventListener('click', async () => {
  const area = selectedArea();
  if (!area) return;
  const confirmed = window.confirm(`Remove nav area ${area.id}?`);
  if (!confirmed) return;

  try {
    await persist((draft) => {
      draft.navAreas = Array.isArray(draft.navAreas)
        ? draft.navAreas.filter((entry) => entry.id !== area.id)
        : [];
    });
    state.selectedId = null;
    setStatus('Status: nav area removed.', 'ok');
  } catch (err) {
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
});

renderAdminAlias(aliasLabel, 'Alias: --');
setStatus('Status: locked', 'warning');
drawCanvas();
