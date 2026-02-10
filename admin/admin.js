const POLL_INTERVAL_MS = 1000;
const PAGE_SIZE = 20;

const form = document.getElementById('auth-form');
const passInput = document.getElementById('admin-pass');
const statusEl = document.getElementById('status');
const lastUpdateEl = document.getElementById('last-update');
const playersCountEl = document.getElementById('count-players');
const resourcesCountEl = document.getElementById('count-resources');
const mobsCountEl = document.getElementById('count-mobs');
const worldMapEl = document.getElementById('world-map');
const worldHarvestEl = document.getElementById('world-harvest');
const worldBaseEl = document.getElementById('world-base');
const worldObstaclesEl = document.getElementById('world-obstacles');
const playersBody = document.getElementById('players-body');
const resourcesBody = document.getElementById('resources-body');
const mobsBody = document.getElementById('mobs-body');
const playersPrev = document.getElementById('players-prev');
const playersNext = document.getElementById('players-next');
const playersPageInfo = document.getElementById('players-page-info');
const resourcesPrev = document.getElementById('resources-prev');
const resourcesNext = document.getElementById('resources-next');
const resourcesPageInfo = document.getElementById('resources-page-info');
const mobsPrev = document.getElementById('mobs-prev');
const mobsNext = document.getElementById('mobs-next');
const mobsPageInfo = document.getElementById('mobs-page-info');

let pollTimer = null;
let latestState = null;
let adminPassword = '';
const paging = {
  players: { page: 0, prev: playersPrev, next: playersNext, info: playersPageInfo },
  resources: {
    page: 0,
    prev: resourcesPrev,
    next: resourcesNext,
    info: resourcesPageInfo,
  },
  mobs: { page: 0, prev: mobsPrev, next: mobsNext, info: mobsPageInfo },
};

function setStatus(message, tone = 'neutral') {
  statusEl.textContent = message;
  statusEl.className = `status ${tone}`;
}

function formatNumber(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '--';
}

function formatItemKind(kind) {
  if (!kind) return '--';
  return kind
    .replace(/^weapon_/, '')
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatBase(base) {
  if (!base) return '--';
  return `${formatNumber(base.x)}, ${formatNumber(base.z)} (r=${formatNumber(
    base.radius,
    1
  )})`;
}

function formatRespawn(respawnAt) {
  if (!respawnAt) return '--';
  const remainingMs = Math.max(0, respawnAt - Date.now());
  const remainingSec = Math.ceil(remainingMs / 1000);
  return `${remainingSec}s`;
}

function buildRow(cells) {
  const tr = document.createElement('tr');
  for (const cell of cells) {
    const td = document.createElement('td');
    td.textContent = cell;
    tr.appendChild(td);
  }
  return tr;
}

function replaceTableBody(tbody, rows) {
  const frag = document.createDocumentFragment();
  for (const row of rows) {
    frag.appendChild(row);
  }
  tbody.textContent = '';
  tbody.appendChild(frag);
}

function clampPage(page, total) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return Math.min(Math.max(0, page), totalPages - 1);
}

function updatePager(pager, total) {
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

function savePassword(password) {
  adminPassword = password;
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function fetchAdminState(password) {
  const res = await fetch('/admin/state', {
    headers: {
      'x-admin-pass': password,
    },
  });

  if (res.status === 401) {
    const err = new Error('Unauthorized');
    err.code = 401;
    throw err;
  }

  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }

  return res.json();
}

function renderState(state) {
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

  const playerEntries = Object.entries(players).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const playerSlice = updatePager(paging.players, playerEntries.length);
  const playerRows = playerEntries
    .slice(playerSlice.startIndex, playerSlice.endIndex)
    .map(([id, player]) =>
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
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const resourceSlice = updatePager(paging.resources, resourceEntries.length);
  const resourceRows = resourceEntries
    .slice(resourceSlice.startIndex, resourceSlice.endIndex)
    .map((resource) =>
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
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const mobSlice = updatePager(paging.mobs, mobEntries.length);
  const mobRows = mobEntries
    .slice(mobSlice.startIndex, mobSlice.endIndex)
    .map((mob) =>
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
    if (err.code === 401) {
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

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const password = passInput.value.trim();
  if (!password) return;
  savePassword(password);
  setStatus('Status: connecting...', 'neutral');
  startPolling();
});

function wirePager(pager, direction) {
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
