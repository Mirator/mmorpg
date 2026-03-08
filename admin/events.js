// @ts-check

import { ensureAdminAlias, getStoredAdminAlias, renderAdminAlias } from './admin-alias.js';
import { createDesignerApi } from './designer-api.js';
import { createDesignerStore } from './designer-store.js';
import { escapeHtml } from './escapeHtml.js';

const form = /** @type {HTMLFormElement} */ (document.getElementById('auth-form'));
const passInput = /** @type {HTMLInputElement} */ (document.getElementById('admin-pass'));
const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const aliasLabel = /** @type {HTMLElement} */ (document.getElementById('alias-label'));
const aliasBtn = /** @type {HTMLButtonElement} */ (document.getElementById('alias-btn'));
const lockBtn = /** @type {HTMLButtonElement} */ (document.getElementById('lock-btn'));

const triggerListEl = /** @type {HTMLElement} */ (document.getElementById('trigger-list'));
const triggerCountEl = /** @type {HTMLElement} */ (document.getElementById('trigger-count'));
const modeSelect = /** @type {HTMLSelectElement} */ (document.getElementById('view-mode'));
const graphCanvas = /** @type {HTMLCanvasElement} */ (document.getElementById('trigger-graph-canvas'));
const graphCtx = /** @type {CanvasRenderingContext2D} */ (graphCanvas.getContext('2d'));

const createForm = /** @type {HTMLFormElement} */ (document.getElementById('trigger-form'));
const nameInput = /** @type {HTMLInputElement} */ (document.getElementById('trigger-name'));
const shapeInput = /** @type {HTMLSelectElement} */ (document.getElementById('trigger-shape'));
const xInput = /** @type {HTMLInputElement} */ (document.getElementById('trigger-x'));
const yInput = /** @type {HTMLInputElement} */ (document.getElementById('trigger-y'));
const zInput = /** @type {HTMLInputElement} */ (document.getElementById('trigger-z'));
const radiusInput = /** @type {HTMLInputElement} */ (document.getElementById('trigger-radius'));
const widthInput = /** @type {HTMLInputElement} */ (document.getElementById('trigger-width'));
const heightInput = /** @type {HTMLInputElement} */ (document.getElementById('trigger-height'));
const conditionInput = /** @type {HTMLInputElement} */ (document.getElementById('trigger-condition'));
const actionsInput = /** @type {HTMLInputElement} */ (document.getElementById('trigger-actions'));
const tagsInput = /** @type {HTMLInputElement} */ (document.getElementById('trigger-tags'));
const delayInput = /** @type {HTMLInputElement} */ (document.getElementById('trigger-delay'));
const enabledInput = /** @type {HTMLInputElement} */ (document.getElementById('trigger-enabled'));

const validationList = /** @type {HTMLElement} */ (document.getElementById('validation-list'));
const selectedMeta = /** @type {HTMLElement} */ (document.getElementById('selected-trigger-meta'));
const deleteBtn = /** @type {HTMLButtonElement} */ (document.getElementById('delete-trigger-btn'));

const state = {
  alias: '',
  api: /** @type {ReturnType<typeof createDesignerApi>} */ (createDesignerApi({ getAlias })),
  store: /** @type {ReturnType<typeof createDesignerStore> | null} */ (null),
  selectedTriggerId: /** @type {string | null} */ (null),
};

/**
 * @param {string} message
 * @param {string} [tone]
 */
function setStatus(message, tone = 'neutral') {
  statusEl.textContent = message;
  statusEl.className = `status ${tone}`;
}

function getAlias() {
  return state.alias;
}

function ensureStore() {
  if (state.store) return state.store;
  state.store = createDesignerStore({
    getDesignerState: () => state.api.getDesignerState(),
    putDesignerState: (expectedRevision, zoneState) => state.api.putDesignerState(expectedRevision, zoneState),
  });
  return state.store;
}

function setLockedState(message = 'Status: locked') {
  state.store = null;
  state.selectedTriggerId = null;
  renderAll();
  setStatus(message, 'warning');
}

/**
 * @param {string} value
 * @returns {string[]}
 */
function parseCsv(value) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function snapshot() {
  return state.store?.getSnapshot() ?? { zoneState: null, revision: -1 };
}

function triggerList() {
  const list = snapshot().zoneState?.triggers;
  return Array.isArray(list) ? list : [];
}

function selectedTrigger() {
  if (!state.selectedTriggerId) return null;
  return triggerList().find((entry) => entry.id === state.selectedTriggerId) ?? null;
}

function ensureSelected() {
  if (selectedTrigger()) return;
  const first = triggerList()[0] ?? null;
  state.selectedTriggerId = first?.id ?? null;
}

function triggerId() {
  return `trigger-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * @param {any[]} triggers
 */
function validateTriggers(triggers) {
  /** @type {string[]} */
  const errors = [];
  const seen = new Set();

  triggers.forEach((trigger, index) => {
    const label = `Trigger ${index + 1}`;
    if (!trigger.id) {
      errors.push(`${label}: missing id.`);
      return;
    }
    if (seen.has(trigger.id)) {
      errors.push(`${label}: duplicate id (${trigger.id}).`);
    }
    seen.add(trigger.id);

    if (!trigger.name) {
      errors.push(`${label}: name is required.`);
    }
    if (!trigger.conditionRef) {
      errors.push(`${label}: conditionRef is missing.`);
    }
    if (!Array.isArray(trigger.actionRefs) || trigger.actionRefs.length === 0) {
      errors.push(`${label}: at least one actionRef is required.`);
    }
    if (Number(trigger.radius) <= 0) {
      errors.push(`${label}: radius must be > 0.`);
    }
    if (Number(trigger.width) <= 0 || Number(trigger.height) <= 0) {
      errors.push(`${label}: width/height must be > 0.`);
    }
    if (!['circle', 'box', 'polygon'].includes(trigger.shape)) {
      errors.push(`${label}: shape must be circle/box/polygon.`);
    }
  });

  return errors;
}

function renderValidation() {
  validationList.textContent = '';
  const errors = validateTriggers(triggerList());
  if (!errors.length) {
    const ok = document.createElement('div');
    ok.className = 'note';
    ok.textContent = 'No validation errors.';
    validationList.appendChild(ok);
    return;
  }

  const ul = document.createElement('ul');
  for (const error of errors) {
    const li = document.createElement('li');
    li.textContent = error;
    ul.appendChild(li);
  }
  validationList.appendChild(ul);
}

function renderList() {
  triggerListEl.textContent = '';
  const list = triggerList();
  triggerCountEl.textContent = String(list.length);

  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'note';
    empty.textContent = 'No triggers yet.';
    triggerListEl.appendChild(empty);
    return;
  }

  for (const trigger of list) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'list-item';
    if (trigger.id === state.selectedTriggerId) {
      item.classList.add('active');
    }

    item.innerHTML = [
      `<strong>${escapeHtml(trigger.name || trigger.id)}</strong>`,
      `<div class="meta mono">${escapeHtml(trigger.id)}</div>`,
      `<div class="meta">${escapeHtml(trigger.shape)} · ${trigger.enabled === false ? 'disabled' : 'enabled'}</div>`,
    ].join('');

    item.addEventListener('click', () => {
      state.selectedTriggerId = trigger.id;
      renderAll();
    });

    triggerListEl.appendChild(item);
  }
}

/**
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} toX
 * @param {number} toY
 */
function drawArrow(fromX, fromY, toX, toY) {
  graphCtx.beginPath();
  graphCtx.moveTo(fromX, fromY);
  graphCtx.lineTo(toX, toY);
  graphCtx.stroke();

  const angle = Math.atan2(toY - fromY, toX - fromX);
  const head = 6;
  graphCtx.beginPath();
  graphCtx.moveTo(toX, toY);
  graphCtx.lineTo(toX - head * Math.cos(angle - 0.35), toY - head * Math.sin(angle - 0.35));
  graphCtx.lineTo(toX - head * Math.cos(angle + 0.35), toY - head * Math.sin(angle + 0.35));
  graphCtx.closePath();
  graphCtx.fill();
}

function renderGraph() {
  graphCtx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);
  graphCtx.fillStyle = '#120f0b';
  graphCtx.fillRect(0, 0, graphCanvas.width, graphCanvas.height);

  const list = triggerList();
  if (!list.length) {
    graphCtx.fillStyle = '#b9aa92';
    graphCtx.font = '12px monospace';
    graphCtx.fillText('No triggers to render.', 12, 22);
    return;
  }

  const gapY = Math.max(44, Math.floor(graphCanvas.height / (list.length + 1)));
  const triggerX = 110;
  const actionX = graphCanvas.width - 120;

  graphCtx.font = '11px monospace';
  graphCtx.lineWidth = 1.2;

  list.forEach((trigger, index) => {
    const y = (index + 1) * gapY;
    const isSelected = trigger.id === state.selectedTriggerId;

    graphCtx.fillStyle = isSelected ? '#c89b3c' : '#2d2419';
    graphCtx.fillRect(triggerX - 70, y - 16, 140, 32);
    graphCtx.fillStyle = '#f2eadc';
    graphCtx.fillText(trigger.name || trigger.id, triggerX - 62, y - 2);

    const actionRefs = Array.isArray(trigger.actionRefs) ? trigger.actionRefs : [];
    actionRefs.slice(0, 2).forEach((/** @type {string} */ actionRef, /** @type {number} */ actionIndex) => {
      const actionY = y + actionIndex * 18 - 9;
      graphCtx.fillStyle = '#31472a';
      graphCtx.fillRect(actionX - 70, actionY - 8, 140, 16);
      graphCtx.fillStyle = '#f2eadc';
      graphCtx.fillText(actionRef, actionX - 62, actionY + 2);

      graphCtx.strokeStyle = '#a8cc8f';
      graphCtx.fillStyle = '#a8cc8f';
      drawArrow(triggerX + 70, y, actionX - 70, actionY);
    });
  });
}

/**
 * @param {any} trigger
 */
function fillForm(trigger) {
  if (!trigger) {
    selectedMeta.textContent = 'No trigger selected. Creating a new trigger will append to the list.';
    deleteBtn.disabled = true;
    return;
  }

  selectedMeta.textContent = `Editing trigger ${trigger.id}`;
  deleteBtn.disabled = false;

  nameInput.value = trigger.name ?? '';
  shapeInput.value = trigger.shape ?? 'circle';
  xInput.value = String(trigger.x ?? 0);
  yInput.value = String(trigger.y ?? 0);
  zInput.value = String(trigger.z ?? 0);
  radiusInput.value = String(trigger.radius ?? 8);
  widthInput.value = String(trigger.width ?? 12);
  heightInput.value = String(trigger.height ?? 12);
  conditionInput.value = trigger.conditionRef ?? '';
  actionsInput.value = Array.isArray(trigger.actionRefs) ? trigger.actionRefs.join(', ') : '';
  tagsInput.value = Array.isArray(trigger.tags) ? trigger.tags.join(', ') : '';
  delayInput.value = String(trigger.delayMs ?? 0);
  enabledInput.checked = trigger.enabled !== false;
}

function updateFormForMode() {
  const mode = modeSelect.value;
  graphCanvas.hidden = mode !== 'graph';
}

function renderAll() {
  ensureSelected();
  renderList();
  renderValidation();
  fillForm(selectedTrigger());
  updateFormForMode();
  renderGraph();
}

/**
 * @param {(draft: any) => void} mutator
 */
async function persist(mutator) {
  if (!state.store) return;
  const draft = state.store.getSnapshot().zoneState;
  if (!draft) return;

  mutator(draft);
  const result = await state.store.save(draft);
  if (result.conflict) {
    setStatus('Status: revision conflict. Reloaded newest designer state.', 'warning');
  }
  renderAll();
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
    await ensureStore().load();
    renderAll();
    setStatus('Status: trigger editor ready.', 'ok');
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
    await ensureStore().load();
    renderAll();
    setStatus('Status: trigger editor ready.', 'ok');
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

modeSelect.addEventListener('change', () => {
  updateFormForMode();
});

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.store) return;

  const targetId = selectedTrigger()?.id ?? triggerId();

  const nextTrigger = {
    id: targetId,
    name: nameInput.value.trim(),
    shape: shapeInput.value,
    x: Number(xInput.value || 0),
    y: Number(yInput.value || 0),
    z: Number(zInput.value || 0),
    radius: Number(radiusInput.value || 0),
    width: Number(widthInput.value || 0),
    height: Number(heightInput.value || 0),
    conditionRef: conditionInput.value.trim(),
    actionRefs: parseCsv(actionsInput.value),
    delayMs: Math.max(0, Number(delayInput.value || 0)),
    enabled: enabledInput.checked,
    tags: parseCsv(tagsInput.value),
  };

  try {
    await persist(/** @param {any} draft */ function (draft) {
      if (!Array.isArray(draft.triggers)) {
        draft.triggers = [];
      }
      const index = draft.triggers.findIndex(/** @param {any} entry */ (entry) => entry.id === targetId);
      if (index >= 0) {
        draft.triggers[index] = nextTrigger;
      } else {
        draft.triggers.push(nextTrigger);
      }
    });

    state.selectedTriggerId = targetId;
    setStatus('Status: trigger saved.', 'ok');
  } catch (err) {
    const error = /** @type {Error & { status?: number }} */ (err);
    if (error.status === 401) {
      setLockedState('Status: session expired. Unlock again.');
      return;
    }
    setStatus(`Status: ${error.message}`, 'error');
  }
});

deleteBtn.addEventListener('click', async () => {
  const trigger = selectedTrigger();
  if (!trigger) return;
  const confirmed = window.confirm(`Delete trigger ${trigger.name || trigger.id}?`);
  if (!confirmed) return;

  try {
    await persist(/** @param {any} draft */ function (draft) {
      draft.triggers = Array.isArray(draft.triggers)
        ? draft.triggers.filter(/** @param {any} entry */ (entry) => entry.id !== trigger.id)
        : [];
    });
    state.selectedTriggerId = null;
    setStatus('Status: trigger deleted.', 'ok');
  } catch (err) {
    const error = /** @type {Error & { status?: number }} */ (err);
    if (error.status === 401) {
      setLockedState('Status: session expired. Unlock again.');
      return;
    }
    setStatus(`Status: ${error.message}`, 'error');
  }
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
renderValidation();
renderGraph();
restoreSession().catch(() => {});
