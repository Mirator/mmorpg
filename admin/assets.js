// @ts-check
// @ts-nocheck

import { ensureAdminAlias, renderAdminAlias } from './admin-alias.js';
import { createDesignerApi } from './designer-api.js';

const form = /** @type {HTMLFormElement} */ (document.getElementById('auth-form'));
const passInput = /** @type {HTMLInputElement} */ (document.getElementById('admin-pass'));
const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const aliasLabel = /** @type {HTMLElement} */ (document.getElementById('alias-label'));
const aliasBtn = /** @type {HTMLButtonElement} */ (document.getElementById('alias-btn'));

const listEl = /** @type {HTMLElement} */ (document.getElementById('prefab-list'));
const countEl = /** @type {HTMLElement} */ (document.getElementById('prefab-count'));

const createForm = /** @type {HTMLFormElement} */ (document.getElementById('create-prefab-form'));
const createName = /** @type {HTMLInputElement} */ (document.getElementById('create-name'));
const createType = /** @type {HTMLInputElement} */ (document.getElementById('create-type'));
const createPath = /** @type {HTMLInputElement} */ (document.getElementById('create-path'));
const createTags = /** @type {HTMLInputElement} */ (document.getElementById('create-tags'));
const createDefaults = /** @type {HTMLTextAreaElement} */ (document.getElementById('create-defaults'));

const detailsEmpty = /** @type {HTMLElement} */ (document.getElementById('details-empty'));
const detailsPanel = /** @type {HTMLElement} */ (document.getElementById('details-panel'));
const detailId = /** @type {HTMLElement} */ (document.getElementById('detail-id'));
const detailVersion = /** @type {HTMLElement} */ (document.getElementById('detail-version'));
const detailCreated = /** @type {HTMLElement} */ (document.getElementById('detail-created'));
const detailUpdated = /** @type {HTMLElement} */ (document.getElementById('detail-updated'));
const editName = /** @type {HTMLInputElement} */ (document.getElementById('edit-name'));
const editType = /** @type {HTMLInputElement} */ (document.getElementById('edit-type'));
const editPath = /** @type {HTMLInputElement} */ (document.getElementById('edit-path'));
const editTags = /** @type {HTMLInputElement} */ (document.getElementById('edit-tags'));
const editDefaults = /** @type {HTMLTextAreaElement} */ (document.getElementById('edit-defaults'));
const saveEditBtn = /** @type {HTMLButtonElement} */ (document.getElementById('save-edit-btn'));
const deleteBtn = /** @type {HTMLButtonElement} */ (document.getElementById('delete-prefab-btn'));

const state = {
  password: '',
  alias: '',
  prefabs: /** @type {any[]} */ ([]),
  selectedId: /** @type {string | null} */ (null),
  api: /** @type {ReturnType<typeof createDesignerApi> | null} */ (null),
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

function parseTagInput(raw) {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseDefaults(text) {
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Defaults must be a JSON object.');
    }
    return parsed;
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Invalid defaults JSON.');
  }
}

function selectedPrefab() {
  if (!state.selectedId) return null;
  return state.prefabs.find((entry) => entry.id === state.selectedId) ?? null;
}

function renderList() {
  listEl.textContent = '';
  countEl.textContent = `${state.prefabs.length}`;

  if (!state.prefabs.length) {
    const empty = document.createElement('div');
    empty.className = 'note';
    empty.textContent = 'No prefabs registered yet.';
    listEl.appendChild(empty);
    return;
  }

  for (const prefab of state.prefabs) {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'list-item';
    if (prefab.id === state.selectedId) {
      item.classList.add('active');
    }

    const tags = Array.isArray(prefab.tags) && prefab.tags.length > 0
      ? prefab.tags.join(', ')
      : 'no tags';

    item.innerHTML = [
      `<strong>${prefab.name}</strong>`,
      `<div class="meta mono">${prefab.id}</div>`,
      `<div class="meta">${prefab.entityType} · ${tags}</div>`,
    ].join('');

    item.addEventListener('click', () => {
      state.selectedId = prefab.id;
      renderList();
      renderDetails();
    });

    listEl.appendChild(item);
  }
}

function renderDetails() {
  const prefab = selectedPrefab();
  if (!prefab) {
    detailsEmpty.hidden = false;
    detailsPanel.hidden = true;
    return;
  }

  detailsEmpty.hidden = true;
  detailsPanel.hidden = false;

  detailId.textContent = prefab.id;
  detailVersion.textContent = String(prefab.version ?? 1);
  detailCreated.textContent = prefab.createdAt || '--';
  detailUpdated.textContent = prefab.updatedAt || '--';

  editName.value = prefab.name ?? '';
  editType.value = prefab.entityType ?? '';
  editPath.value = prefab.assetPath ?? '';
  editTags.value = Array.isArray(prefab.tags) ? prefab.tags.join(', ') : '';
  editDefaults.value = JSON.stringify(prefab.defaults ?? {}, null, 2);
}

async function reloadPrefabs() {
  if (!state.api) return;
  const payload = await state.api.getPrefabs();
  state.prefabs = Array.isArray(payload.prefabs) ? payload.prefabs : [];
  if (!selectedPrefab()) {
    state.selectedId = state.prefabs[0]?.id ?? null;
  }
  renderList();
  renderDetails();
}

async function handleUnlock() {
  const password = passInput.value.trim();
  if (!password) return;

  const alias = ensureAdminAlias();
  if (!alias) {
    setStatus('Status: alias is required to unlock.', 'warning');
    return;
  }

  state.password = password;
  state.alias = alias;
  renderAdminAlias(aliasLabel, `Alias: ${alias}`);
  state.api = createDesignerApi({
    getPassword,
    getAlias,
  });

  setStatus('Status: connecting...', 'neutral');

  try {
    await reloadPrefabs();
    setStatus('Status: prefab registry loaded', 'ok');
  } catch (err) {
    const error = /** @type {Error & { status?: number, details?: string[] }} */ (err);
    if (error.status === 401) {
      setStatus('Status: invalid password', 'error');
      return;
    }
    setStatus(`Status: ${error.message}`, 'error');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await handleUnlock();
});

aliasBtn.addEventListener('click', () => {
  const alias = ensureAdminAlias({ forcePrompt: true });
  if (!alias) return;
  state.alias = alias;
  renderAdminAlias(aliasLabel, `Alias: ${alias}`);
});

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!state.api) return;

  try {
    const payload = {
      name: createName.value.trim(),
      entityType: createType.value.trim(),
      assetPath: createPath.value.trim(),
      tags: parseTagInput(createTags.value),
      defaults: parseDefaults(createDefaults.value),
    };

    await state.api.createPrefab(payload);
    await reloadPrefabs();
    createForm.reset();
    createDefaults.value = '{}';
    setStatus('Status: prefab created', 'ok');
  } catch (err) {
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
});

saveEditBtn.addEventListener('click', async () => {
  if (!state.api) return;
  const prefab = selectedPrefab();
  if (!prefab) return;

  try {
    await state.api.updatePrefab(prefab.id, {
      name: editName.value.trim(),
      entityType: editType.value.trim(),
      assetPath: editPath.value.trim(),
      tags: parseTagInput(editTags.value),
      defaults: parseDefaults(editDefaults.value),
    });
    await reloadPrefabs();
    setStatus('Status: prefab updated', 'ok');
  } catch (err) {
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
});

deleteBtn.addEventListener('click', async () => {
  if (!state.api) return;
  const prefab = selectedPrefab();
  if (!prefab) return;

  const confirmed = window.confirm(`Delete prefab "${prefab.name}"?`);
  if (!confirmed) return;

  try {
    await state.api.deletePrefab(prefab.id);
    state.selectedId = null;
    await reloadPrefabs();
    setStatus('Status: prefab deleted', 'ok');
  } catch (err) {
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
});

renderAdminAlias(aliasLabel, 'Alias: --');
setStatus('Status: locked', 'warning');
