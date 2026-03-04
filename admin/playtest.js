// @ts-check

import { createSessionShell } from './session-shell.js';

const POLL_MS = 1000;

const form = /** @type {HTMLFormElement | null} */ (document.getElementById('auth-form'));
const passInput = /** @type {HTMLInputElement | null} */ (document.getElementById('admin-pass'));
const statusEl = /** @type {HTMLElement | null} */ (document.getElementById('status'));
const aliasLabel = /** @type {HTMLElement | null} */ (document.getElementById('alias-label'));
const aliasBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('alias-btn'));
const lockBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('lock-btn'));

const launchBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('launch-preview-btn'));
const refreshBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById('refresh-telemetry-btn'));
const previewFrame = /** @type {HTMLIFrameElement | null} */ (document.getElementById('preview-frame'));
const previewNote = /** @type {HTMLElement | null} */ (document.getElementById('preview-note'));

const playerCountEl = /** @type {HTMLElement | null} */ (document.getElementById('telemetry-player-count'));
const spawnCountEl = /** @type {HTMLElement | null} */ (document.getElementById('telemetry-spawn-count'));
const mobCountEl = /** @type {HTMLElement | null} */ (document.getElementById('telemetry-mob-count'));
const resourceCountEl = /** @type {HTMLElement | null} */ (document.getElementById('telemetry-resource-count'));
const densityEl = /** @type {HTMLElement | null} */ (document.getElementById('telemetry-density'));
const updatedAtEl = /** @type {HTMLElement | null} */ (document.getElementById('telemetry-updated-at'));

const state = {
  pollTimer: /** @type {ReturnType<typeof setInterval> | null} */ (null),
  mapConfig: /** @type {Record<string, unknown> | null} */ (null),
  previewUrl: '',
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
    readyMessage: 'Status: playtest session ready.',
    onLocked() {
      stopPolling();
      state.mapConfig = null;
      state.previewUrl = '';
      if (previewFrame) previewFrame.src = 'about:blank';
      if (previewNote) previewNote.textContent = '';
      if (playerCountEl) playerCountEl.textContent = '0';
      if (spawnCountEl) spawnCountEl.textContent = '0';
      if (mobCountEl) mobCountEl.textContent = '0';
      if (resourceCountEl) resourceCountEl.textContent = '0';
      if (densityEl) densityEl.textContent = '--';
      if (updatedAtEl) updatedAtEl.textContent = '--';
    },
    async onRestore() {
      await Promise.all([launchPreview(), refreshTelemetry()]);
      startPolling();
    },
  }
);

function stopPolling() {
  if (!state.pollTimer) return;
  clearInterval(state.pollTimer);
  state.pollTimer = null;
}

function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(() => {
    refreshTelemetry().catch((err) => {
      session.handleUnauthorized(err);
    });
  }, POLL_MS);
}

/**
 * @param {number} players
 * @param {number} mapSize
 */
function formatDensity(players, mapSize) {
  if (!Number.isFinite(mapSize) || mapSize <= 0) return '--';
  const area = mapSize * mapSize;
  const value = area > 0 ? (players / area) * 10_000 : 0;
  return value.toFixed(2);
}

async function refreshTelemetry() {
  const [adminState, mapConfig] = await Promise.all([
    session.api.getAdminState(),
    session.api.getMapConfig(),
  ]);

  state.mapConfig = /** @type {Record<string, unknown>} */ (mapConfig ?? {});

  const adminPlayers =
    adminState && typeof adminState === 'object' && adminState.players && typeof adminState.players === 'object'
      ? Object.keys(adminState.players).length
      : 0;
  const mapConfigRecord = /** @type {Record<string, unknown>} */ (mapConfig ?? {});
  const adminStateRecord = /** @type {Record<string, unknown>} */ (adminState ?? {});
  const spawnPoints = Array.isArray(mapConfigRecord.spawnPoints) ? mapConfigRecord.spawnPoints.length : 0;
  const mobSpawns = Array.isArray(mapConfigRecord.mobSpawns) ? mapConfigRecord.mobSpawns.length : 0;
  const mobCount = Array.isArray(adminStateRecord.mobs) ? adminStateRecord.mobs.length : 0;
  const resourceCount = Array.isArray(adminStateRecord.resources) ? adminStateRecord.resources.length : 0;

  if (playerCountEl) playerCountEl.textContent = String(adminPlayers);
  if (spawnCountEl) spawnCountEl.textContent = String(spawnPoints + mobSpawns);
  if (mobCountEl) mobCountEl.textContent = String(mobCount);
  if (resourceCountEl) resourceCountEl.textContent = String(resourceCount);
  if (densityEl) {
    densityEl.textContent = `${formatDensity(adminPlayers, Number(mapConfigRecord.mapSize ?? 0))} / 10k`;
  }
  if (updatedAtEl) {
    updatedAtEl.textContent = new Date(Number(adminStateRecord.t ?? Date.now())).toLocaleTimeString();
  }
}

async function launchPreview() {
  const payload = await session.api.createPlaytestSession();
  const record = /** @type {Record<string, unknown>} */ (payload ?? {});
  state.previewUrl =
    typeof record.clientUrl === 'string' && record.clientUrl ? record.clientUrl : '/?guest=1';
  if (previewFrame) previewFrame.src = state.previewUrl;
  if (previewNote) {
    previewNote.textContent =
      typeof record.note === 'string' && record.note
        ? record.note
        : 'Preview reflects currently saved map state. Publish + restart required for runtime patch application.';
  }
}

launchBtn?.addEventListener('click', async () => {
  try {
    await launchPreview();
    session.setStatus('Status: preview launched.', 'ok');
  } catch (err) {
    if (session.handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    session.setStatus(`Status: ${error.message}`, 'error');
  }
});

refreshBtn?.addEventListener('click', async () => {
  try {
    await refreshTelemetry();
    session.setStatus('Status: telemetry refreshed.', 'ok');
  } catch (err) {
    if (session.handleUnauthorized(err)) return;
    const error = /** @type {Error} */ (err);
    session.setStatus(`Status: ${error.message}`, 'error');
  }
});

window.addEventListener('beforeunload', () => {
  stopPolling();
});

session.boot().catch(() => {});
