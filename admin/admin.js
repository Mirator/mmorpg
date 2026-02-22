// @ts-check
// @ts-nocheck

import { ensureAdminAlias, renderAdminAlias } from './admin-alias.js';
import { createDesignerApi } from './designer-api.js';

const POLL_INTERVAL_MS = 1000;
const MAP_REFRESH_EVERY_POLLS = 10;
const ERROR_WINDOW_MS = 60 * 60 * 1000;

const form = /** @type {HTMLFormElement} */ (document.getElementById('auth-form'));
const passInput = /** @type {HTMLInputElement} */ (document.getElementById('admin-pass'));
const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const refreshBtn = /** @type {HTMLButtonElement} */ (document.getElementById('refresh-btn'));
const zoneBody = /** @type {HTMLElement} */ (document.getElementById('zone-body'));
const aliasLabel = /** @type {HTMLElement} */ (document.getElementById('alias-label'));
const aliasBtn = /** @type {HTMLButtonElement} */ (document.getElementById('alias-btn'));

const playersEl = /** @type {HTMLElement} */ (document.getElementById('count-players'));
const densityEl = /** @type {HTMLElement} */ (document.getElementById('density-value'));
const lastActivityEl = /** @type {HTMLElement} */ (document.getElementById('last-activity'));
const errorsEl = /** @type {HTMLElement} */ (document.getElementById('errors-value'));
const lastDeployEl = /** @type {HTMLElement} */ (document.getElementById('last-deploy'));

let pollTimer = /** @type {ReturnType<typeof setInterval> | null} */ (null);
let pollCount = 0;

const state = {
  password: '',
  alias: '',
  api: /** @type {ReturnType<typeof createDesignerApi> | null} */ (null),
  latestAdminState: /** @type {any | null} */ (null),
  latestMapConfig: /** @type {any | null} */ (null),
  latestAudit: /** @type {any[]} */ ([]),
  latestPatches: /** @type {any[]} */ ([]),
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
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

function setControlsEnabled(enabled) {
  refreshBtn.disabled = !enabled;
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? Number(value).toFixed(digits) : '--';
}

function formatTime(value) {
  if (!value) return '--';
  const time = Number.isFinite(value)
    ? Number(value)
    : Date.parse(String(value));
  if (!Number.isFinite(time)) return '--';
  return new Date(time).toLocaleString();
}

function summarizeProps(config) {
  if (!config) return '--';
  const obstacles = Array.isArray(config.obstacles) ? config.obstacles.length : 0;
  const structures = Array.isArray(config.structures) ? config.structures.length : 0;
  const resources = Array.isArray(config.resourceNodes) ? config.resourceNodes.length : 0;
  const vendors = Array.isArray(config.vendors) ? config.vendors.length : 0;
  return String(obstacles + structures + resources + vendors);
}

function latestPublishedPatchDate() {
  let latest = null;
  for (const patch of state.latestPatches) {
    if (patch.status !== 'Published') continue;
    const t = Date.parse(String(patch.publishedAt || patch.updatedAt || patch.createdAt || ''));
    if (!Number.isFinite(t)) continue;
    if (latest === null || t > latest) {
      latest = t;
    }
  }
  return latest;
}

function errorCountRollingWindow() {
  const now = Date.now();
  return state.latestAudit.filter((entry) => {
    if (entry.status !== 'error') return false;
    const t = Date.parse(String(entry.t || ''));
    if (!Number.isFinite(t)) return false;
    return now - t <= ERROR_WINDOW_MS;
  }).length;
}

function renderZoneList() {
  const mapSize = state.latestMapConfig?.mapSize ?? state.latestAdminState?.world?.mapSize ?? '--';
  const spawnCount = [
    Array.isArray(state.latestMapConfig?.spawnPoints) ? state.latestMapConfig.spawnPoints.length : 0,
    Array.isArray(state.latestMapConfig?.mobSpawns) ? state.latestMapConfig.mobSpawns.length : 0,
  ].reduce((a, b) => a + b, 0);

  const tr = document.createElement('tr');
  tr.innerHTML = [
    '<td>world-map</td>',
    `<td>${mapSize}</td>`,
    `<td>${spawnCount}</td>`,
    `<td>${summarizeProps(state.latestMapConfig)}</td>`,
    `<td>${formatTime(state.latestAdminState?.t ?? Date.now())}</td>`,
    '<td><a class="zone-open-link" href="/admin/map" id="open-zone-btn">Open Zone</a></td>',
  ].join('');

  zoneBody.textContent = '';
  zoneBody.appendChild(tr);
}

function renderMetrics() {
  const players = state.latestAdminState?.players ? Object.keys(state.latestAdminState.players).length : 0;
  const mapSize = Number(state.latestMapConfig?.mapSize ?? state.latestAdminState?.world?.mapSize ?? 0);
  const mapArea = mapSize > 0 ? mapSize * mapSize : 0;
  const density = mapArea > 0 ? (players / mapArea) * 10_000 : 0;

  playersEl.textContent = String(players);
  densityEl.textContent = `${formatNumber(density, 2)} / 10k`;
  lastActivityEl.textContent = formatTime(state.latestAdminState?.t ?? Date.now());
  errorsEl.textContent = `${errorCountRollingWindow()} (last 60m)`;

  const latestDeploy = latestPublishedPatchDate();
  lastDeployEl.textContent = latestDeploy ? formatTime(latestDeploy) : 'No publish yet';
}

async function pollOnce(forceRefresh = false) {
  if (!state.api) {
    setStatus('Status: waiting for unlock', 'warning');
    return;
  }

  try {
    state.latestAdminState = await state.api.getAdminState();

    if (!state.latestMapConfig || forceRefresh || pollCount % MAP_REFRESH_EVERY_POLLS === 0) {
      state.latestMapConfig = await state.api.getMapConfig();
    }

    const [auditPayload, patchesPayload] = await Promise.all([
      state.api.getAudit(200),
      state.api.getPatches(),
    ]);

    state.latestAudit = Array.isArray(auditPayload?.audit) ? auditPayload.audit : [];
    state.latestPatches = Array.isArray(patchesPayload?.patches) ? patchesPayload.patches : [];

    pollCount += 1;
    renderMetrics();
    renderZoneList();
    setStatus('Status: connected', 'ok');
  } catch (err) {
    const error = /** @type {Error & { status?: number }} */ (err);
    if (error.status === 401) {
      setStatus('Status: invalid password', 'error');
      setControlsEnabled(false);
      stopPolling();
      return;
    }
    setStatus(`Status: ${error.message}`, 'error');
  }
}

function startPolling() {
  stopPolling();
  pollOnce(true);
  pollTimer = setInterval(() => {
    pollOnce(false).catch(() => {});
  }, POLL_INTERVAL_MS);
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
  state.api = createDesignerApi({
    getPassword,
    getAlias,
  });

  setStatus('Status: connecting...', 'neutral');
  setControlsEnabled(true);
  startPolling();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await unlock();
});

refreshBtn.addEventListener('click', async () => {
  await pollOnce(true);
});

aliasBtn.addEventListener('click', () => {
  const alias = ensureAdminAlias({ forcePrompt: true });
  if (!alias) return;
  state.alias = alias;
  renderAdminAlias(aliasLabel, `Alias: ${alias}`);
});

renderAdminAlias(aliasLabel, 'Alias: --');
setStatus('Status: waiting for password', 'warning');
setControlsEnabled(false);
