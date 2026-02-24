// @ts-check
// @ts-nocheck

import { ensureAdminAlias, getStoredAdminAlias, renderAdminAlias } from './admin-alias.js';
import { createDesignerApi } from './designer-api.js';

const POLL_INTERVAL_MS = 1000;
const MAP_REFRESH_EVERY_POLLS = 10;
const ACCOUNTS_REFRESH_INTERVAL_MS = 30 * 1000;
const ACCOUNTS_PAGE_SIZE = 50;
const ERROR_WINDOW_MS = 60 * 60 * 1000;

const form = /** @type {HTMLFormElement} */ (document.getElementById('auth-form'));
const passInput = /** @type {HTMLInputElement} */ (document.getElementById('admin-pass'));
const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const refreshBtn = /** @type {HTMLButtonElement} */ (document.getElementById('refresh-btn'));
const zoneBody = /** @type {HTMLElement} */ (document.getElementById('zone-body'));
const aliasLabel = /** @type {HTMLElement} */ (document.getElementById('alias-label'));
const aliasBtn = /** @type {HTMLButtonElement} */ (document.getElementById('alias-btn'));
const lockBtn = /** @type {HTMLButtonElement} */ (document.getElementById('lock-btn'));

const playersEl = /** @type {HTMLElement} */ (document.getElementById('count-players'));
const densityEl = /** @type {HTMLElement} */ (document.getElementById('density-value'));
const lastActivityEl = /** @type {HTMLElement} */ (document.getElementById('last-activity'));
const errorsEl = /** @type {HTMLElement} */ (document.getElementById('errors-value'));
const lastDeployEl = /** @type {HTMLElement} */ (document.getElementById('last-deploy'));

const accountsTotalEl = /** @type {HTMLElement} */ (document.getElementById('accounts-total'));
const charactersTotalEl = /** @type {HTMLElement} */ (document.getElementById('characters-total'));
const charactersOnlineTotalEl = /** @type {HTMLElement} */ (document.getElementById('characters-online-total'));
const accountsUpdatedEl = /** @type {HTMLElement} */ (document.getElementById('accounts-updated'));
const accountsBody = /** @type {HTMLElement} */ (document.getElementById('accounts-body'));
const accountsPrevBtn = /** @type {HTMLButtonElement} */ (document.getElementById('accounts-prev-btn'));
const accountsNextBtn = /** @type {HTMLButtonElement} */ (document.getElementById('accounts-next-btn'));
const accountsPageLabel = /** @type {HTMLElement} */ (document.getElementById('accounts-page-label'));

let pollTimer = /** @type {ReturnType<typeof setInterval> | null} */ (null);
let pollCount = 0;

const state = {
  alias: '',
  api: /** @type {ReturnType<typeof createDesignerApi>} */ (createDesignerApi({ getAlias })),
  latestAdminState: /** @type {any | null} */ (null),
  latestMapConfig: /** @type {any | null} */ (null),
  latestAudit: /** @type {any[]} */ ([]),
  latestPatches: /** @type {any[]} */ ([]),
  accountsPage: 1,
  accountsPageSize: ACCOUNTS_PAGE_SIZE,
  latestAccountsPayload: /** @type {any | null} */ (null),
  lastAccountsFetchedAt: 0,
};

function setStatus(message, tone = 'neutral') {
  statusEl.textContent = message;
  statusEl.className = `status ${tone}`;
}

function getAlias() {
  return state.alias;
}

function stopPolling() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
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

function setControlsEnabled(enabled) {
  refreshBtn.disabled = !enabled;
  renderAccountsPagination();
}

function resetAccountsState() {
  state.accountsPage = 1;
  state.latestAccountsPayload = null;
  state.lastAccountsFetchedAt = 0;
  renderAccounts();
}

function renderAccountsPagination() {
  const page = Math.max(1, Number(state.latestAccountsPayload?.pagination?.page ?? state.accountsPage ?? 1));
  const totalPages = Math.max(1, Number(state.latestAccountsPayload?.pagination?.totalPages ?? 1));
  const disabled = refreshBtn.disabled;
  accountsPageLabel.textContent = `Page ${page} / ${totalPages}`;
  accountsPrevBtn.disabled = disabled || page <= 1;
  accountsNextBtn.disabled = disabled || page >= totalPages;
}

function renderCharacterList(characters) {
  const wrapper = document.createElement('div');
  wrapper.className = 'accounts-character-list';

  if (!Array.isArray(characters) || characters.length === 0) {
    wrapper.textContent = '--';
    return wrapper;
  }

  for (const character of characters) {
    const line = document.createElement('div');
    line.className = 'accounts-character-line';

    const statusPill = document.createElement('span');
    statusPill.className = `accounts-online-pill ${character.isOnline ? 'online' : 'offline'}`;
    statusPill.textContent = character.isOnline ? 'online' : 'offline';

    const text = document.createElement('span');
    text.textContent = `${character.name} (${character.classId} Lv${character.level}) · Last seen ${formatTime(character.lastSeenAt)}`;

    line.appendChild(statusPill);
    line.appendChild(text);
    wrapper.appendChild(line);
  }

  return wrapper;
}

function renderAccounts() {
  const payload = state.latestAccountsPayload;
  const accounts = Array.isArray(payload?.accounts) ? payload.accounts : [];
  const totalAccounts = Number(payload?.pagination?.totalAccounts ?? 0);
  const totalCharacters = Number(
    payload?.totals?.totalCharacters
      ?? accounts.reduce((sum, account) => sum + Number(account?.characterCount ?? 0), 0)
  );
  const onlineCharacters = Number(
    payload?.totals?.onlineCharacters
      ?? accounts.reduce((sum, account) => sum + Number(account?.onlineCharacterCount ?? 0), 0)
  );

  accountsTotalEl.textContent = String(totalAccounts);
  charactersTotalEl.textContent = String(totalCharacters);
  charactersOnlineTotalEl.textContent = String(onlineCharacters);
  accountsUpdatedEl.textContent = `Updated: ${formatTime(payload?.generatedAt ?? state.lastAccountsFetchedAt)}`;

  accountsBody.textContent = '';
  if (accounts.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.className = 'accounts-empty-cell';
    cell.textContent = refreshBtn.disabled
      ? 'Unlock admin session to view accounts.'
      : 'No accounts found.';
    row.appendChild(cell);
    accountsBody.appendChild(row);
    renderAccountsPagination();
    return;
  }

  for (const account of accounts) {
    const row = document.createElement('tr');

    const accountCell = document.createElement('td');
    accountCell.className = 'accounts-account-cell';
    const name = document.createElement('strong');
    name.textContent = account.username ?? '--';
    const id = document.createElement('div');
    id.className = 'accounts-account-id mono';
    id.textContent = account.id ?? '--';
    accountCell.appendChild(name);
    accountCell.appendChild(id);

    const createdCell = document.createElement('td');
    createdCell.textContent = formatTime(account.createdAt);

    const signedInCell = document.createElement('td');
    signedInCell.textContent = formatTime(account.lastSignedInAt);

    const seenCell = document.createElement('td');
    seenCell.textContent = formatTime(account.lastSeenAt);

    const onlineCell = document.createElement('td');
    onlineCell.textContent = account.isOnline
      ? `Yes (${account.onlineCharacterCount}/${account.characterCount})`
      : 'No';

    const charactersCell = document.createElement('td');
    charactersCell.appendChild(renderCharacterList(account.characters));

    row.appendChild(accountCell);
    row.appendChild(createdCell);
    row.appendChild(signedInCell);
    row.appendChild(seenCell);
    row.appendChild(onlineCell);
    row.appendChild(charactersCell);
    accountsBody.appendChild(row);
  }

  renderAccountsPagination();
}

function handleOperationalError(err) {
  const error = /** @type {Error & { status?: number }} */ (err);
  if (error.status === 401) {
    setStatus('Status: session expired. Unlock again.', 'warning');
    setControlsEnabled(false);
    stopPolling();
    resetAccountsState();
    return true;
  }
  setStatus(`Status: ${error.message}`, 'error');
  return false;
}

async function loadAccountsOverview(forceRefresh = false) {
  const now = Date.now();
  const shouldRefresh = forceRefresh
    || !state.latestAccountsPayload
    || (now - state.lastAccountsFetchedAt) >= ACCOUNTS_REFRESH_INTERVAL_MS;
  if (!shouldRefresh) return;

  const payload = await state.api.getAccountsOverview(state.accountsPage, state.accountsPageSize);
  state.latestAccountsPayload = payload;
  state.lastAccountsFetchedAt = Date.now();
  state.accountsPage = Math.max(1, Number(payload?.pagination?.page ?? state.accountsPage));
  renderAccounts();
}

async function changeAccountsPage(delta) {
  if (refreshBtn.disabled) return;
  const page = Math.max(1, Number(state.latestAccountsPayload?.pagination?.page ?? state.accountsPage ?? 1));
  const totalPages = Math.max(1, Number(state.latestAccountsPayload?.pagination?.totalPages ?? 1));
  const nextPage = Math.max(1, Math.min(totalPages, page + delta));
  if (nextPage === page) return;

  state.accountsPage = nextPage;
  renderAccountsPagination();
  try {
    await loadAccountsOverview(true);
    setStatus('Status: connected', 'ok');
  } catch (err) {
    handleOperationalError(err);
  }
}

async function pollOnce(forceRefresh = false) {
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
    await loadAccountsOverview(forceRefresh);

    pollCount += 1;
    renderMetrics();
    renderZoneList();
    setStatus('Status: connected', 'ok');
  } catch (err) {
    handleOperationalError(err);
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

  state.alias = alias;
  renderAdminAlias(aliasLabel, `Alias: ${alias}`);

  setStatus('Status: unlocking...', 'neutral');
  try {
    await state.api.unlockAdminSession(password);
    passInput.value = '';
    setControlsEnabled(true);
    startPolling();
  } catch (err) {
    const error = /** @type {Error & { status?: number }} */ (err);
    if (error.status === 401) {
      setStatus('Status: invalid password', 'error');
      return;
    }
    setStatus(`Status: ${error.message}`, 'error');
  }
}

async function restoreSession() {
  try {
    await state.api.getAdminSession();
    setControlsEnabled(true);
    setStatus('Status: restoring session...', 'neutral');
    startPolling();
  } catch {
    setControlsEnabled(false);
    resetAccountsState();
    setStatus('Status: locked', 'warning');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  await unlock();
});

refreshBtn.addEventListener('click', async () => {
  await pollOnce(true);
});

accountsPrevBtn.addEventListener('click', async () => {
  await changeAccountsPage(-1);
});

accountsNextBtn.addEventListener('click', async () => {
  await changeAccountsPage(1);
});

aliasBtn.addEventListener('click', () => {
  const alias = ensureAdminAlias({ forcePrompt: true });
  if (!alias) return;
  state.alias = alias;
  renderAdminAlias(aliasLabel, `Alias: ${alias}`);
});

lockBtn.addEventListener('click', async () => {
  try {
    await state.api.logoutAdminSession();
  } catch {
    // ignore and continue to local lock state
  }
  stopPolling();
  setControlsEnabled(false);
  resetAccountsState();
  setStatus('Status: locked', 'warning');
});

state.alias = getStoredAdminAlias();
renderAdminAlias(aliasLabel, state.alias ? `Alias: ${state.alias}` : 'Alias: --');
setStatus('Status: checking session...', 'neutral');
setControlsEnabled(false);
resetAccountsState();
restoreSession().catch(() => {});
