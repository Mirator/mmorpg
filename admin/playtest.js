// @ts-check
// @ts-nocheck

import { ensureAdminAlias, renderAdminAlias } from './admin-alias.js';
import { createDesignerApi } from './designer-api.js';

const POLL_MS = 1000;

const form = /** @type {HTMLFormElement} */ (document.getElementById('auth-form'));
const passInput = /** @type {HTMLInputElement} */ (document.getElementById('admin-pass'));
const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const aliasLabel = /** @type {HTMLElement} */ (document.getElementById('alias-label'));
const aliasBtn = /** @type {HTMLButtonElement} */ (document.getElementById('alias-btn'));

const launchBtn = /** @type {HTMLButtonElement} */ (document.getElementById('launch-preview-btn'));
const refreshBtn = /** @type {HTMLButtonElement} */ (document.getElementById('refresh-telemetry-btn'));
const previewFrame = /** @type {HTMLIFrameElement} */ (document.getElementById('preview-frame'));
const previewNote = /** @type {HTMLElement} */ (document.getElementById('preview-note'));

const playerCountEl = /** @type {HTMLElement} */ (document.getElementById('telemetry-player-count'));
const spawnCountEl = /** @type {HTMLElement} */ (document.getElementById('telemetry-spawn-count'));
const mobCountEl = /** @type {HTMLElement} */ (document.getElementById('telemetry-mob-count'));
const resourceCountEl = /** @type {HTMLElement} */ (document.getElementById('telemetry-resource-count'));
const densityEl = /** @type {HTMLElement} */ (document.getElementById('telemetry-density'));
const updatedAtEl = /** @type {HTMLElement} */ (document.getElementById('telemetry-updated-at'));

const state = {
  password: '',
  alias: '',
  api: /** @type {ReturnType<typeof createDesignerApi> | null} */ (null),
  pollTimer: /** @type {ReturnType<typeof setInterval> | null} */ (null),
  mapConfig: /** @type {any | null} */ (null),
  previewUrl: '',
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

function stopPolling() {
  if (!state.pollTimer) return;
  clearInterval(state.pollTimer);
  state.pollTimer = null;
}

function formatDensity(players, mapSize) {
  if (!Number.isFinite(mapSize) || mapSize <= 0) return '--';
  const area = mapSize * mapSize;
  const value = area > 0 ? (players / area) * 10_000 : 0;
  return value.toFixed(2);
}

async function refreshTelemetry() {
  if (!state.api) return;
  const [adminState, mapConfig] = await Promise.all([
    state.api.getAdminState(),
    state.api.getMapConfig(),
  ]);

  state.mapConfig = mapConfig;

  const players = adminState?.players ? Object.keys(adminState.players).length : 0;
  const spawnCount =
    (Array.isArray(mapConfig?.spawnPoints) ? mapConfig.spawnPoints.length : 0) +
    (Array.isArray(mapConfig?.mobSpawns) ? mapConfig.mobSpawns.length : 0);
  const mobCount = Array.isArray(adminState?.mobs) ? adminState.mobs.length : 0;
  const resourceCount = Array.isArray(adminState?.resources) ? adminState.resources.length : 0;

  playerCountEl.textContent = String(players);
  spawnCountEl.textContent = String(spawnCount);
  mobCountEl.textContent = String(mobCount);
  resourceCountEl.textContent = String(resourceCount);
  densityEl.textContent = `${formatDensity(players, Number(mapConfig?.mapSize ?? 0))} / 10k`;
  updatedAtEl.textContent = new Date(adminState?.t ?? Date.now()).toLocaleTimeString();
}

async function launchPreview() {
  if (!state.api) return;

  const payload = await state.api.createPlaytestSession();
  state.previewUrl = payload?.clientUrl || '/?guest=1';
  previewFrame.src = state.previewUrl;
  previewNote.textContent = payload?.note ||
    'Preview reflects currently saved map state. Publish + restart required for runtime patch application.';
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
    await Promise.all([launchPreview(), refreshTelemetry()]);
    stopPolling();
    state.pollTimer = setInterval(() => {
      refreshTelemetry().catch(() => {});
    }, POLL_MS);
    setStatus('Status: playtest session ready.', 'ok');
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

launchBtn.addEventListener('click', async () => {
  if (!state.api) return;
  try {
    await launchPreview();
    setStatus('Status: preview launched.', 'ok');
  } catch (err) {
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
});

refreshBtn.addEventListener('click', async () => {
  if (!state.api) return;
  try {
    await refreshTelemetry();
    setStatus('Status: telemetry refreshed.', 'ok');
  } catch (err) {
    const error = /** @type {Error} */ (err);
    setStatus(`Status: ${error.message}`, 'error');
  }
});

window.addEventListener('beforeunload', () => {
  stopPolling();
});

renderAdminAlias(aliasLabel, 'Alias: --');
setStatus('Status: locked', 'warning');
