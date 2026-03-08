// @ts-check

import { createSessionShell } from './session-shell.js';
import { escapeHtml } from './escapeHtml.js';

/** @typedef {{ id: string, name: string, entityType: string, assetPath: string, tags: string[], defaults: Record<string, unknown>, version: number, createdAt: string, updatedAt: string }} PrefabRecord */

const form = /** @type {HTMLFormElement | null} */ (document.getElementById('auth-form'));
const passInput = /** @type {HTMLInputElement | null} */ (document.getElementById('admin-pass'));
const statusEl = /** @type {HTMLElement | null} */ (document.getElementById('status'));
const aliasLabel = /** @type {HTMLElement | null} */ (document.getElementById('alias-label'));
const aliasBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('alias-btn'));
const lockBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('lock-btn'));

const listEl = /** @type {HTMLElement | null} */ (document.getElementById('prefab-list'));
const countEl = /** @type {HTMLElement | null} */ (document.getElementById('prefab-count'));

const createForm = /** @type {HTMLFormElement | null} */ (document.getElementById('create-prefab-form'));
const createName = /** @type {HTMLInputElement | null} */ (document.getElementById('create-name'));
const createType = /** @type {HTMLInputElement | null} */ (document.getElementById('create-type'));
const createPath = /** @type {HTMLInputElement | null} */ (document.getElementById('create-path'));
const createTags = /** @type {HTMLInputElement | null} */ (document.getElementById('create-tags'));
const createDefaults = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('create-defaults'));

const detailsEmpty = /** @type {HTMLElement | null} */ (document.getElementById('details-empty'));
const detailsPanel = /** @type {HTMLElement | null} */ (document.getElementById('details-panel'));
const detailId = /** @type {HTMLElement | null} */ (document.getElementById('detail-id'));
const detailVersion = /** @type {HTMLElement | null} */ (document.getElementById('detail-version'));
const detailCreated = /** @type {HTMLElement | null} */ (document.getElementById('detail-created'));
const detailUpdated = /** @type {HTMLElement | null} */ (document.getElementById('detail-updated'));
const editName = /** @type {HTMLInputElement | null} */ (document.getElementById('edit-name'));
const editType = /** @type {HTMLInputElement | null} */ (document.getElementById('edit-type'));
const editPath = /** @type {HTMLInputElement | null} */ (document.getElementById('edit-path'));
const editTags = /** @type {HTMLInputElement | null} */ (document.getElementById('edit-tags'));
const editDefaults = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('edit-defaults'));
const saveEditBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('save-edit-btn'));
const deleteBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('delete-prefab-btn'));

const state = {
  prefabs: /** @type {PrefabRecord[]} */ ([]),
  selectedId: /** @type {string | null} */ (null),
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
    invalidPasswordMessage: 'Status: invalid password',
    aliasRequiredMessage: 'Status: alias is required to unlock.',
    sessionExpiredMessage: 'Status: session expired. Unlock again.',
    readyMessage: 'Status: prefab registry loaded',
    onLocked() {
      state.prefabs = [];
      state.selectedId = null;
      renderList();
      renderDetails();
    },
    async onRestore() {
      await reloadPrefabs();
    },
  }
);

/**
 * @param {string} raw
 * @returns {string[]}
 */
function parseTagInput(raw) {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * @param {string} text
 * @returns {Record<string, unknown>}
 */
function parseDefaults(text) {
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Defaults must be a JSON object.');
    }
    return /** @type {Record<string, unknown>} */ (parsed);
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Invalid defaults JSON.');
  }
}

/**
 * @returns {PrefabRecord | null}
 */
function selectedPrefab() {
  if (!state.selectedId) return null;
  return state.prefabs.find((entry) => entry.id === state.selectedId) ?? null;
}

function renderList() {
  if (!listEl || !countEl) return;
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

    const tags = prefab.tags.length > 0 ? prefab.tags.join(', ') : 'no tags';

    item.innerHTML = [
      `<strong>${escapeHtml(prefab.name)}</strong>`,
      `<div class="meta mono">${escapeHtml(prefab.id)}</div>`,
      `<div class="meta">${escapeHtml(prefab.entityType)} · ${escapeHtml(tags)}</div>`,
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
    if (detailsEmpty) detailsEmpty.hidden = false;
    if (detailsPanel) detailsPanel.hidden = true;
    return;
  }

  if (detailsEmpty) detailsEmpty.hidden = true;
  if (detailsPanel) detailsPanel.hidden = false;

  if (detailId) detailId.textContent = prefab.id;
  if (detailVersion) detailVersion.textContent = String(prefab.version || 1);
  if (detailCreated) detailCreated.textContent = prefab.createdAt || '--';
  if (detailUpdated) detailUpdated.textContent = prefab.updatedAt || '--';

  if (editName) editName.value = prefab.name;
  if (editType) editType.value = prefab.entityType;
  if (editPath) editPath.value = prefab.assetPath;
  if (editTags) editTags.value = prefab.tags.join(', ');
  if (editDefaults) editDefaults.value = JSON.stringify(prefab.defaults, null, 2);
}

async function reloadPrefabs() {
  const payload = await session.api.getPrefabs();
  const prefabs = Array.isArray(payload?.prefabs) ? payload.prefabs : [];
  /** @type {PrefabRecord[]} */
  const nextPrefabs = [];
  for (const entryRaw of prefabs) {
    const entry = /** @type {Record<string, unknown>} */ (entryRaw ?? {});
    const tags = Array.isArray(entry.tags) ? entry.tags.map((tagRaw) => String(tagRaw)) : [];
    nextPrefabs.push({
      id: String(entry.id ?? ''),
      name: String(entry.name ?? ''),
      entityType: String(entry.entityType ?? ''),
      assetPath: String(entry.assetPath ?? ''),
      tags,
      defaults:
        entry.defaults && typeof entry.defaults === 'object' && !Array.isArray(entry.defaults)
          ? /** @type {Record<string, unknown>} */ (entry.defaults)
          : {},
      version: Math.max(1, Number(entry.version ?? 1)),
      createdAt: String(entry.createdAt ?? ''),
      updatedAt: String(entry.updatedAt ?? ''),
    });
  }
  state.prefabs = nextPrefabs;
  if (!selectedPrefab()) {
    state.selectedId = state.prefabs[0]?.id ?? null;
  }
  renderList();
  renderDetails();
}

createForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    await session.api.createPrefab({
      name: createName?.value.trim() ?? '',
      entityType: createType?.value.trim() ?? '',
      assetPath: createPath?.value.trim() ?? '',
      tags: parseTagInput(createTags?.value ?? ''),
      defaults: parseDefaults(createDefaults?.value ?? ''),
    });
    await reloadPrefabs();
    createForm.reset();
    if (createDefaults) createDefaults.value = '{}';
    session.setStatus('Status: prefab created', 'ok');
  } catch (err) {
    if (session.handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    session.setStatus(`Status: ${error.message}`, 'error');
  }
});

saveEditBtn?.addEventListener('click', async () => {
  const prefab = selectedPrefab();
  if (!prefab) return;

  try {
    await session.api.updatePrefab(prefab.id, {
      name: editName?.value.trim() ?? '',
      entityType: editType?.value.trim() ?? '',
      assetPath: editPath?.value.trim() ?? '',
      tags: parseTagInput(editTags?.value ?? ''),
      defaults: parseDefaults(editDefaults?.value ?? ''),
    });
    await reloadPrefabs();
    session.setStatus('Status: prefab updated', 'ok');
  } catch (err) {
    if (session.handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    session.setStatus(`Status: ${error.message}`, 'error');
  }
});

deleteBtn?.addEventListener('click', async () => {
  const prefab = selectedPrefab();
  if (!prefab) return;

  const confirmed = window.confirm(`Delete prefab "${prefab.name}"?`);
  if (!confirmed) return;

  try {
    await session.api.deletePrefab(prefab.id);
    state.selectedId = null;
    await reloadPrefabs();
    session.setStatus('Status: prefab deleted', 'ok');
  } catch (err) {
    if (session.handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    session.setStatus(`Status: ${error.message}`, 'error');
  }
});

session.boot().catch(() => {});
