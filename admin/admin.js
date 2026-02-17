// @ts-check
const POLL_INTERVAL_MS = 1000;
const PAGE_SIZE = 20;

const form = /** @type {HTMLFormElement} */ (document.getElementById('auth-form'));
const passInput = /** @type {HTMLInputElement} */ (document.getElementById('admin-pass'));
const statusEl = /** @type {HTMLElement} */ (document.getElementById('status'));
const lastUpdateEl = /** @type {HTMLElement} */ (document.getElementById('last-update'));
const playersCountEl = /** @type {HTMLElement} */ (document.getElementById('count-players'));
const resourcesCountEl = /** @type {HTMLElement} */ (document.getElementById('count-resources'));
const mobsCountEl = /** @type {HTMLElement} */ (document.getElementById('count-mobs'));
const worldMapEl = /** @type {HTMLElement} */ (document.getElementById('world-map'));
const worldHarvestEl = /** @type {HTMLElement} */ (document.getElementById('world-harvest'));
const worldBaseEl = /** @type {HTMLElement} */ (document.getElementById('world-base'));
const worldObstaclesEl = /** @type {HTMLElement} */ (document.getElementById('world-obstacles'));
const playersBody = /** @type {HTMLElement} */ (document.getElementById('players-body'));
const resourcesBody = /** @type {HTMLElement} */ (document.getElementById('resources-body'));
const mobsBody = /** @type {HTMLElement} */ (document.getElementById('mobs-body'));
const playersPrev = /** @type {HTMLButtonElement} */ (document.getElementById('players-prev'));
const playersNext = /** @type {HTMLButtonElement} */ (document.getElementById('players-next'));
const playersPageInfo = /** @type {HTMLElement} */ (document.getElementById('players-page-info'));
const resourcesPrev = /** @type {HTMLButtonElement} */ (document.getElementById('resources-prev'));
const resourcesNext = /** @type {HTMLButtonElement} */ (document.getElementById('resources-next'));
const resourcesPageInfo = /** @type {HTMLElement} */ (document.getElementById('resources-page-info'));
const mobsPrev = /** @type {HTMLButtonElement} */ (document.getElementById('mobs-prev'));
const mobsNext = /** @type {HTMLButtonElement} */ (document.getElementById('mobs-next'));
const mobsPageInfo = /** @type {HTMLElement} */ (document.getElementById('mobs-page-info'));

/**
 * @typedef {Error & { code?: number }} CodedError
 */

let /** @type {any} */ pollTimer = null;
let /** @type {any} */ latestState = null;
let adminPassword = '';
const /** @type {any} */ paging = {
  players: { page: 0, prev: playersPrev, next: playersNext, info: playersPageInfo },
  resources: {
    page: 0,
    prev: resourcesPrev,
    next: resourcesNext,
    info: resourcesPageInfo,
  },
  mobs: { page: 0, prev: mobsPrev, next: mobsNext, info: mobsPageInfo },
};

function setStatus(/** @type {any} */ message, /** @type {any} */ tone = 'neutral') {
  statusEl.textContent = message;
  statusEl.className = `status ${tone}`;
}

function formatNumber(/** @type {any} */ value, /** @type {any} */ digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '--';
}

function formatItemKind(/** @type {any} */ kind) {
  if (!kind) return '--';
  return kind
    .replace(/^weapon_/, '')
    .split('_')
    .map((/** @type {any} */ part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatBase(/** @type {any} */ base) {
  if (!base) return '--';
  return `${formatNumber(base.x)}, ${formatNumber(base.z)} (r=${formatNumber(
    base.radius,
    1
  )})`;
}

function formatRespawn(/** @type {any} */ respawnAt) {
  if (!respawnAt) return '--';
  const remainingMs = Math.max(0, respawnAt - Date.now());
  const remainingSec = Math.ceil(remainingMs / 1000);
  return `${remainingSec}s`;
}

function buildRow(/** @type {any} */ cells) {
  const tr = document.createElement('tr');
  for (const cell of cells) {
    const td = document.createElement('td');
    td.textContent = cell;
    tr.appendChild(td);
  }
  return tr;
}

function replaceTableBody(/** @type {any} */ tbody, /** @type {any} */ rows) {
  const frag = document.createDocumentFragment();
  for (const row of rows) {
    frag.appendChild(row);
  }
  tbody.textContent = '';
  tbody.appendChild(frag);
}

function clampPage(/** @type {any} */ page, /** @type {any} */ total) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return Math.min(Math.max(0, page), totalPages - 1);
}

function updatePager(/** @type {any} */ pager, /** @type {any} */ total) {
  pager.page = clampPage(pager.page, total);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const start = total === 0 ? 0 : pager.page * PAGE_SIZE + 1;
  const end = Math.min(total, (pager.page + 1) * PAGE_SIZE);
  pager.info.textContent = `${start}-${end} of ${total}`;
  pager.prev.disabled = pager.page === 0;
  pager.next.disabled = pager.page >= totalPages - 1;
  return { startIndex: pager.page * PAGE_SIZE, endIndex: end };
}

function readPassword() {
  return adminPassword;
}

function savePassword(/** @type {any} */ password) {
  adminPassword = password;
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function fetchAdminState(/** @type {any} */ password) {
  const res = await fetch('/admin/state', {
    headers: {
      'x-admin-pass': password,
    },
  });

  if (res.status === 401) {
    const err = /** @type {CodedError} */ (new Error('Unauthorized'));
    err.code = 401;
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }

  return res.json();
}

function renderState(/** @type {any} */ state) {
  latestState = state;
  const players = state.players ?? {};
  const resources = Array.isArray(state.resources) ? state.resources : [];
  const mobs = Array.isArray(state.mobs) ? state.mobs : [];

  playersCountEl.textContent = Object.keys(players).length.toString();
  resourcesCountEl.textContent = resources.length.toString();
  mobsCountEl.textContent = mobs.length.toString();
  lastUpdateEl.textContent = new Date(state.t ?? Date.now()).toLocaleTimeString();

  worldMapEl.textContent = state.world?.mapSize ?? '--';
  worldHarvestEl.textContent = formatNumber(state.world?.harvestRadius ?? NaN, 2);
  worldBaseEl.textContent = formatBase(state.world?.base);
  worldObstaclesEl.textContent = state.world?.obstacles?.length ?? 0;

  const playerEntries = Object.entries(players).sort((/** @type {any} */ [a], /** @type {any} */ [b]) =>
    a.localeCompare(b)
  );
  const playerSlice = updatePager(paging.players, playerEntries.length);
  const playerRows = playerEntries
    .slice(playerSlice.startIndex, playerSlice.endIndex)
    .map((/** @type {any} */ [id, player]) =>
    buildRow([
      id,
      player.classId ?? '--',
      formatItemKind(player.weaponKind),
      player.level ?? '--',
      player.xpToNext
        ? `${player.xp ?? 0}/${player.xpToNext}`
        : player.xp ?? '--',
      player.hp ?? '--',
      player.inv ?? '--',
      player.currencyCopper ?? '--',
      formatNumber(player.x),
      formatNumber(player.z),
      player.dead ? 'yes' : 'no',
      player.dead ? formatRespawn(player.respawnAt) : '--',
    ])
    );
  replaceTableBody(playersBody, playerRows);

  const resourceEntries = resources
    .slice()
    .sort((/** @type {any} */ a, /** @type {any} */ b) => String(a.id).localeCompare(String(b.id)));
  const resourceSlice = updatePager(paging.resources, resourceEntries.length);
  const resourceRows = resourceEntries
    .slice(resourceSlice.startIndex, resourceSlice.endIndex)
    .map((/** @type {any} */ resource) =>
    buildRow([
      resource.id ?? '--',
      formatNumber(resource.x),
      formatNumber(resource.z),
      resource.available ? 'yes' : 'no',
      resource.available ? '--' : formatRespawn(resource.respawnAt),
    ])
    );
  replaceTableBody(resourcesBody, resourceRows);

  const mobEntries = mobs
    .slice()
    .sort((/** @type {any} */ a, /** @type {any} */ b) => String(a.id).localeCompare(String(b.id)));
  const mobSlice = updatePager(paging.mobs, mobEntries.length);
  const mobRows = mobEntries
    .slice(mobSlice.startIndex, mobSlice.endIndex)
    .map((/** @type {any} */ mob) =>
    buildRow([
      mob.id ?? '--',
      mob.level ?? '--',
      mob.maxHp
        ? `${mob.hp ?? 0}/${mob.maxHp}`
        : mob.hp ?? '--',
      formatNumber(mob.x),
      formatNumber(mob.z),
      mob.state ?? '--',
      mob.targetId ?? '--',
      mob.dead ? 'yes' : 'no',
      mob.dead ? formatRespawn(mob.respawnAt) : '--',
    ])
    );
  replaceTableBody(mobsBody, mobRows);
}

async function pollOnce() {
  const password = readPassword();
  if (!password) {
    setStatus('Status: waiting for password', 'warning');
    return;
  }

  try {
    const state = await fetchAdminState(password);
    renderState(state);
    setStatus('Status: connected', 'ok');
  } catch (err) {
    const error = /** @type {CodedError} */ (err);
    if (error.code === 401) {
      setStatus('Status: invalid password', 'error');
      stopPolling();
      return;
    }
    setStatus('Status: offline', 'error');
  }
}

function startPolling() {
  stopPolling();
  pollOnce();
  pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
}

form.addEventListener('submit', (/** @type {any} */ event) => {
  event.preventDefault();
  const password = passInput.value.trim();
  if (!password) return;
  savePassword(password);
  setStatus('Status: connecting...', 'neutral');
  startPolling();
});

function wirePager(/** @type {any} */ pager, /** @type {any} */ direction) {
  if (!pager?.prev || !pager?.next) return;
  const delta = direction === 'next' ? 1 : -1;
  const button = direction === 'next' ? pager.next : pager.prev;
  button.addEventListener('click', () => {
    pager.page = clampPage(pager.page + delta, Number.MAX_SAFE_INTEGER);
    if (latestState) {
      renderState(latestState);
    }
  });
}

wirePager(paging.players, 'prev');
wirePager(paging.players, 'next');
wirePager(paging.resources, 'prev');
wirePager(paging.resources, 'next');
wirePager(paging.mobs, 'prev');
wirePager(paging.mobs, 'next');

setStatus('Status: waiting for password', 'warning');
