import { createRenderSystem } from './render.js';
import { createGameState } from './state.js';
import { createNet } from './net.js';
import { createInputHandler } from './input.js';
import { createUiState } from './ui-state.js';
import { createMenu } from './menu.js';
import { getAbilitiesForClass } from '/shared/classes.js';
import { splitCurrency } from '/shared/economy.js';
import { xpToNext } from '/shared/progression.js';
import { PLAYER_CONFIG } from '/shared/config.js';

const app = document.getElementById('app');
const fpsEl = document.getElementById('fps');
const coordsEl = document.getElementById('coords');
const accountNameEl = document.getElementById('account-name');
const characterNameEl = document.getElementById('character-name');
const signOutBtn = document.getElementById('signout-btn');

const INTERP_DELAY_MS = 100;
const MAX_SNAPSHOT_AGE_MS = 2000;
const MAX_SNAPSHOTS = 60;
const DEFAULT_PLAYER_SPEED = PLAYER_CONFIG.speed;

const renderSystem = createRenderSystem({ app });
const gameState = createGameState({
  interpDelayMs: INTERP_DELAY_MS,
  maxSnapshots: MAX_SNAPSHOTS,
  maxSnapshotAgeMs: MAX_SNAPSHOT_AGE_MS,
});

let seq = 0;
let net = null;
let playerId = null;
let currentMe = null;
let nearestVendor = null;
let inVendorRange = false;
let closingNet = null;
let inputHandler = null;

const AUTH_TOKEN_KEY = 'mmorpg_auth_token';
const ACCOUNT_KEY = 'mmorpg_account';
const LAST_CHARACTER_PREFIX = 'mmorpg_last_character_';

const ui = createUiState({
  onInventorySwap: (from, to) => {
    seq += 1;
    net?.send({ type: 'inventorySwap', from, to, seq });
  },
  onVendorSell: (slot, vendorId) => {
    seq += 1;
    net?.send({ type: 'vendorSell', slot, vendorId, seq });
  },
  onAbilityClick: (slot) => {
    useAbility(slot);
  },
  onUiOpen: () => {
    inputHandler?.clearMovement();
  },
});

const menu = createMenu({
  onSignIn: handleSignIn,
  onSignUp: handleSignUp,
  onSelectCharacter: connectCharacter,
  onCreateCharacter: handleCreateCharacter,
  onDeleteCharacter: handleDeleteCharacter,
  onSignOut: handleSignOut,
});

const urlParams = new URLSearchParams(window.location.search);
const isGuestSession = urlParams.get('guest') === '1';

let authToken = loadAuthToken();
let currentAccount = null;
let currentCharacter = null;
let lastCharacterId = null;

function loadAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function saveAuthToken(token) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  }
}

function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

function loadStoredAccount() {
  const raw = localStorage.getItem(ACCOUNT_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === 'string') {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function saveStoredAccount(account) {
  if (!account || typeof account.id !== 'string') return;
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
}

function clearStoredAccount() {
  localStorage.removeItem(ACCOUNT_KEY);
}

function getLastCharacterKey() {
  return currentAccount?.id ? `${LAST_CHARACTER_PREFIX}${currentAccount.id}` : null;
}

function loadLastCharacterId() {
  const key = getLastCharacterKey();
  if (!key) return null;
  return localStorage.getItem(key);
}

function saveLastCharacterId(id) {
  const key = getLastCharacterKey();
  if (!key) return;
  if (id) {
    localStorage.setItem(key, id);
  }
}

function clearLastCharacterId() {
  const key = getLastCharacterKey();
  if (!key) return;
  localStorage.removeItem(key);
}

function updateOverlayLabels() {
  if (accountNameEl) {
    accountNameEl.textContent = currentAccount?.username ?? '--';
  }
  if (characterNameEl) {
    characterNameEl.textContent = currentCharacter?.name ?? '--';
  }
}

function clearSessionState() {
  currentAccount = null;
  currentCharacter = null;
  updateOverlayLabels();
}

async function apiFetch(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) {
    throw new Error(payload?.error || 'Request failed');
  }
  return payload;
}

async function loadCharacters() {
  if (!authToken) return;
  const data = await apiFetch('/api/characters', { token: authToken });
  menu.setCharacters(data.characters ?? []);
  lastCharacterId = loadLastCharacterId();
  menu.setSelectedCharacterId(lastCharacterId);
  menu.setStep('characters');
  menu.setOpen(true);
  ui.setMenuOpen(true);
  updateOverlayLabels();
}

async function handleSignIn({ username, password }) {
  menu.setLoading(true);
  menu.setError('auth', '');
  try {
    const data = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    authToken = data.token;
    saveAuthToken(authToken);
    currentAccount = data.account ?? null;
    saveStoredAccount(currentAccount);
    menu.setAccount(currentAccount);
    await loadCharacters();
  } catch (err) {
    menu.setError('auth', err.message || 'Unable to sign in.');
  } finally {
    menu.setLoading(false);
  }
}

async function handleSignUp({ username, password }) {
  menu.setLoading(true);
  menu.setError('auth', '');
  try {
    const data = await apiFetch('/api/auth/signup', {
      method: 'POST',
      body: { username, password },
    });
    authToken = data.token;
    saveAuthToken(authToken);
    currentAccount = data.account ?? null;
    saveStoredAccount(currentAccount);
    menu.setAccount(currentAccount);
    await loadCharacters();
  } catch (err) {
    menu.setError('auth', err.message || 'Unable to create account.');
  } finally {
    menu.setLoading(false);
  }
}

async function handleCreateCharacter({ name, classId }) {
  if (!authToken) return;
  menu.setLoading(true);
  menu.setError('create', '');
  try {
    const data = await apiFetch('/api/characters', {
      method: 'POST',
      token: authToken,
      body: { name, classId },
    });
    const character = data.character;
    if (character) {
      await loadCharacters();
      await connectCharacter(character);
      return;
    }
    menu.setError('create', 'Unable to create character.');
  } catch (err) {
    menu.setError('create', err.message || 'Unable to create character.');
  } finally {
    menu.setLoading(false);
  }
}

async function handleSignOut() {
  menu.setLoading(true);
  try {
    if (authToken) {
      await apiFetch('/api/auth/logout', { method: 'POST', token: authToken });
    }
  } catch {
    // ignore
  }
  clearAuthToken();
  clearStoredAccount();
  authToken = null;
  lastCharacterId = null;
  clearSessionState();
  disconnect();
  menu.setAccount(null);
  menu.setCharacters([]);
  menu.setStep('auth');
  menu.setTab('signin');
  menu.setOpen(true);
  ui.setMenuOpen(true);
  ui.setStatus('menu');
  menu.setLoading(false);
}

async function handleDeleteCharacter(character) {
  if (!authToken || !character?.id) return;
  const confirmDelete = window.confirm(`Delete ${character.name ?? 'this character'}? This cannot be undone.`);
  if (!confirmDelete) return;
  menu.setLoading(true);
  menu.setError('characters', '');
  try {
    await apiFetch(`/api/characters/${character.id}`, { method: 'DELETE', token: authToken });
    if (lastCharacterId === character.id) {
      clearLastCharacterId();
      lastCharacterId = null;
      menu.setSelectedCharacterId(null);
    }
    await loadCharacters();
  } catch (err) {
    menu.setError('characters', err.message || 'Unable to delete character.');
  } finally {
    menu.setLoading(false);
  }
}

async function connectCharacter(character) {
  if (!authToken || !character?.id) return;
  menu.setLoading(true);
  menu.setError('characters', '');
  try {
    saveLastCharacterId(character.id);
    lastCharacterId = character.id;
    menu.setSelectedCharacterId(character.id);
    await startConnection({ character });
    menu.setOpen(false);
    ui.setMenuOpen(false);
  } catch (err) {
    menu.setError('characters', err.message || 'Unable to connect.');
    ui.setMenuOpen(true);
  } finally {
    menu.setLoading(false);
  }
}

function buildWsUrl({ character, guest }) {
  const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = new URL(`${wsProtocol}://${location.host}`);
  if (guest) {
    wsUrl.searchParams.set('guest', '1');
  } else if (character) {
    wsUrl.searchParams.set('token', authToken ?? '');
    wsUrl.searchParams.set('characterId', character.id);
  }
  return wsUrl.toString();
}

function resetClientState() {
  gameState.reset();
  renderSystem.syncPlayers([]);
  renderSystem.setLocalPlayerId(null);
  currentMe = null;
  playerId = null;
  ui.updateLocalUi({ me: null, worldConfig: null, serverNow: Date.now() });
}

function disconnect() {
  if (net) {
    closingNet = net;
    net.close();
    net = null;
  }
  resetClientState();
}

function startConnection({ character, guest = false }) {
  return new Promise((resolve, reject) => {
    disconnect();
    seq = 0;
    if (character) {
      currentCharacter = character;
    }
    updateOverlayLabels();

    const url = buildWsUrl({ character, guest });
    let resolved = false;

    const localNet = createNet({
      url,
      onOpen: () => {
        ui.setStatus('connected');
        localNet.send({ type: 'hello' });
      },
      onClose: () => {
        ui.setStatus('disconnected');
        if (!resolved) {
          resolved = true;
          reject(new Error('Connection closed.'));
        }
        if (closingNet === localNet) {
          closingNet = null;
          return;
        }
        if (!guest) {
          menu.setOpen(true);
          ui.setMenuOpen(true);
          if (authToken) {
            loadCharacters().catch(() => {});
          } else {
            menu.setStep('auth');
          }
        }
      },
      onMessage: (msg) => {
        const now = manualStepping ? virtualNow : performance.now();
        if (msg.type === 'welcome') {
          const id = msg.id;
          if (id && id !== playerId) {
            playerId = id;
          }
          gameState.setLocalPlayerId(id);
          renderSystem.setLocalPlayerId(id);
          if (msg.config) {
            gameState.setConfigSnapshot(msg.config);
          }
          if (msg.snapshot) {
            handleStateMessage(msg.snapshot, now);
          }
          if (!resolved) {
            resolved = true;
            resolve();
          }
          return;
        }

        if (msg.type === 'state') {
          handleStateMessage(msg, now);
        }

        if (msg.type === 'me') {
          if (Number.isFinite(msg.t)) {
            gameState.updateServerTime(msg.t);
          }
          gameState.updateMe(msg.data ?? null);
          updateLocalUi();
        }
      },
    });
    net = localNet;
  });
}

function sendInput(keys) {
  seq += 1;
  net?.send({ type: 'input', keys, seq });
}

function sendInteract() {
  seq += 1;
  net?.send({ type: 'action', kind: 'interact', seq });
}

function sendMoveTarget(pos, opts = {}) {
  if (opts.clearTarget) {
    renderSystem.setTargetMarker(null);
    return;
  }
  if (!pos) return;
  seq += 1;
  net?.send({ type: 'moveTarget', x: pos.x, z: pos.z, seq });
  renderSystem.setTargetMarker(pos);
}

function useAbility(slot) {
  if (ui.isUiBlocking()) return;
  const classId = ui.getCurrentClassId(currentMe);
  const abilities = getAbilitiesForClass(classId, currentMe?.level ?? 1);
  const ability = abilities.find((item) => item.slot === slot);
  if (!ability) return;
  const now = gameState.getServerNow();
  const localCooldown = ui.getLocalCooldown(slot);
  const serverCooldown = currentMe?.attackCooldownUntil ?? 0;
  if (Math.max(localCooldown, serverCooldown) > now) return;
  ui.setLocalCooldown(slot, now + (ability.cooldownMs ?? 0));
  ui.updateAbilityBar(currentMe, now);
  seq += 1;
  net?.send({ type: 'action', kind: 'ability', slot, seq });
}

function handleInteract() {
  if (ui.isTradeOpen()) return;
  if (ui.isDialogOpen() && ui.vendorUI) {
    ui.vendorUI.openTrade();
    ui.setInventoryOpen(true);
    return;
  }
  if (ui.isInventoryOpen()) return;
  const me = gameState.getLocalPlayer();
  const pos = me ? { x: me.x, z: me.z } : null;
  const { vendor, distance } = pos ? getNearestVendor(pos) : { vendor: null, distance: Infinity };
  const maxDist = gameState.getWorldConfig()?.vendorInteractRadius ?? 2.5;
  const targetVendor = vendor ?? nearestVendor;
  const inRange = vendor ? distance <= maxDist : inVendorRange;
  if (inRange && targetVendor && ui.vendorUI) {
    ui.vendorUI.openDialog(targetVendor);
    ui.clearPrompt();
    return;
  }
  sendInteract();
}

function setWorld(config) {
  const worldConfig = config ?? null;
  gameState.setWorldConfig(worldConfig);
  renderSystem.updateWorld(worldConfig);
}

function handleStateMessage(msg, now) {
  if (Number.isFinite(msg.t)) {
    gameState.updateServerTime(msg.t);
  }
  if (msg.world) {
    const currentWorld = gameState.getWorldConfig();
    if (!currentWorld || currentWorld.mapSize !== msg.world.mapSize) {
      setWorld(msg.world);
    }
  }
  if (msg.players) {
    gameState.pushSnapshot(msg.players, now);
    renderSystem.syncPlayers(Object.keys(msg.players));
    updateLocalUi();
  }
  if (msg.resources) {
    gameState.updateResources(msg.resources);
    renderSystem.updateWorldResources(msg.resources);
  }
  if (msg.mobs) {
    gameState.updateMobs(msg.mobs);
    renderSystem.updateWorldMobs(msg.mobs);
  }
}

function updateLocalUi() {
  const me = gameState.getLocalPlayer();
  const serverNow = gameState.getServerNow();
  currentMe = me;
  ui.updateLocalUi({ me, worldConfig: gameState.getWorldConfig(), serverNow });
}

inputHandler = createInputHandler({
  renderer: renderSystem.renderer,
  camera: renderSystem.camera,
  isUiBlocking: ui.isUiBlocking,
  isMenuOpen: ui.isMenuOpen,
  isDialogOpen: ui.isDialogOpen,
  isTradeOpen: ui.isTradeOpen,
  isInventoryOpen: ui.isInventoryOpen,
  isSkillsOpen: ui.isSkillsOpen,
  onToggleInventory: ui.toggleInventory,
  onToggleSkills: ui.toggleSkills,
  onInteract: handleInteract,
  onAbility: useAbility,
  onMoveTarget: sendMoveTarget,
  onInputChange: sendInput,
  onTradeTab: (tab) => ui.vendorUI?.setTab?.(tab),
});

window.addEventListener('resize', renderSystem.resize);
renderSystem.resize();

let lastFrameTime = performance.now();
let fpsLastTime = lastFrameTime;
let fpsFrameCount = 0;
let manualStepping = false;
let virtualNow = performance.now();

function getPlayerSpeed() {
  const worldConfig = gameState.getWorldConfig();
  const configSnapshot = gameState.getConfigSnapshot();
  return worldConfig?.playerSpeed ?? configSnapshot?.player?.speed ?? DEFAULT_PLAYER_SPEED;
}

function stepFrame(dt, now) {
  const { positions, localPos: serverLocalPos } = gameState.renderInterpolatedPlayers(now);
  renderSystem.updatePlayerPositions(positions);

  const localState = gameState.getLocalPlayer();
  if (localState?.dead && serverLocalPos) {
    gameState.resetPrediction(serverLocalPos);
  }

  const canPredict = !localState?.dead;
  const predictedPos = canPredict
    ? gameState.updateLocalPrediction(dt, serverLocalPos, inputHandler.getKeys(), getPlayerSpeed())
    : serverLocalPos;
  const viewPos = predictedPos ?? serverLocalPos;

  if (predictedPos && playerId) {
    renderSystem.updatePlayerPositions({ [playerId]: predictedPos });
  }

  if (viewPos) {
    renderSystem.updateCamera(viewPos, dt);
    if (coordsEl) {
      coordsEl.textContent = `${viewPos.x.toFixed(1)}, ${viewPos.z.toFixed(1)}`;
    }
  } else if (coordsEl) {
    coordsEl.textContent = '--, --';
  }

  renderSystem.animateWorldMeshes(now);

  ui.updateAbilityBar(currentMe, gameState.getServerNow());
  if (ui.isSkillsOpen()) {
    ui.updateSkillsPanel(currentMe);
  }

  nearestVendor = null;
  inVendorRange = false;
  if (viewPos) {
    const { vendor, distance } = getNearestVendor(viewPos);
    const maxDist = gameState.getWorldConfig()?.vendorInteractRadius ?? 2.5;
    nearestVendor = vendor;
    if (vendor && distance <= maxDist) {
      inVendorRange = true;
    }
  }

  if (ui.isUiBlocking()) {
    ui.clearPrompt();
  } else if (inVendorRange && nearestVendor) {
    ui.showPrompt(`Press E to talk to ${nearestVendor.name ?? 'Vendor'}`);
  } else if (viewPos && gameState.getLatestResources().length) {
    const radius = gameState.getWorldConfig()?.harvestRadius ?? 2;
    const invCap =
      localState?.invCap ??
      (gameState.getWorldConfig()?.playerInvSlots &&
      gameState.getWorldConfig()?.playerInvStackMax
        ? gameState.getWorldConfig().playerInvSlots * gameState.getWorldConfig().playerInvStackMax
        : 5);
    const inv = localState?.inv ?? 0;
    let near = false;
    if (!localState?.dead && inv < invCap) {
      for (const resource of gameState.getLatestResources()) {
        if (!resource.available) continue;
        const dx = resource.x - viewPos.x;
        const dz = resource.z - viewPos.z;
        if (dx * dx + dz * dz <= radius * radius) {
          near = true;
          break;
        }
      }
    }
    if (near) {
      ui.showPrompt('Press E to harvest');
    } else {
      ui.clearPrompt();
    }
  } else {
    ui.clearPrompt();
  }

  fpsFrameCount += 1;
  if (now - fpsLastTime >= 1000) {
    const fps = (fpsFrameCount * 1000) / (now - fpsLastTime);
    if (fpsEl) {
      fpsEl.textContent = fps.toFixed(0);
    }
    fpsFrameCount = 0;
    fpsLastTime = now;
  }

  renderSystem.renderFrame();
}

function animate() {
  if (manualStepping) {
    requestAnimationFrame(animate);
    return;
  }
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;
  stepFrame(dt, now);
  requestAnimationFrame(animate);
}

animate();

window.advanceTime = (ms) => {
  manualStepping = true;
  const stepMs = 1000 / 60;
  const steps = Math.max(1, Math.round(ms / stepMs));
  for (let i = 0; i < steps; i += 1) {
    virtualNow += stepMs;
    stepFrame(stepMs / 1000, virtualNow);
  }
  return Promise.resolve();
};

function buildTextState() {
  const me = gameState.getLocalPlayer();
  const worldConfig = gameState.getWorldConfig();
  const base = worldConfig?.base ?? null;
  const obstacles = worldConfig?.obstacles ?? [];
  const mapSize = worldConfig?.mapSize ?? 0;
  const harvestRadius = worldConfig?.harvestRadius ?? 2;
  const inventorySlots = Array.isArray(me?.inventory) ? me.inventory : [];
  const inventoryOpen = ui.isInventoryOpen();
  const tradeOpen = ui.isTradeOpen();
  const dialogOpen = ui.isDialogOpen();
  const classId = ui.getCurrentClassId(me);
  const abilities = getAbilitiesForClass(classId, me?.level ?? 1);
  const serverNow = gameState.getServerNow();
  const vendor = ui.vendorUI?.getVendor?.() ?? null;
  const tradeTab = tradeOpen ? ui.vendorUI?.getTab?.() ?? null : null;
  const currencyCopper = me?.currencyCopper ?? 0;
  const inventorySlotCount =
    me?.invSlots ?? worldConfig?.playerInvSlots ?? inventorySlots.length;
  const inventoryStackMax =
    me?.invStackMax ?? worldConfig?.playerInvStackMax ?? 0;
  const menuState = menu.getState();

  return {
    mode: ui.isMenuOpen() ? 'menu' : 'play',
    menu: {
      ...menuState,
      account: currentAccount?.username ?? null,
      character: currentCharacter?.name ?? null,
    },
    coordSystem: {
      origin: 'map center',
      axes: { x: 'right', z: 'down', y: 'up' },
      units: 'world units',
    },
    world: {
      mapSize,
      base,
      harvestRadius,
      vendors: worldConfig?.vendors ?? [],
      vendorInteractRadius: worldConfig?.vendorInteractRadius ?? 2.5,
      obstacles: obstacles.map((o) => ({ x: o.x, z: o.z, r: o.r })),
    },
    serverTime: gameState.getServerNow(),
    player: me
      ? {
          id: playerId,
          x: me.x,
          z: me.z,
          hp: me.hp,
          maxHp: me.maxHp,
          classId,
          level: me.level ?? 1,
          xp: me.xp ?? 0,
          xpToNext: me.xpToNext ?? xpToNext(me.level ?? 1),
          attackCooldownUntil: me.attackCooldownUntil ?? 0,
          inv: me.inv,
          invCap: me.invCap,
          invSlots: me.invSlots,
          invStackMax: me.invStackMax,
          currencyCopper,
          currency: splitCurrency(currencyCopper),
          dead: me.dead,
          respawnAt: me.respawnAt ?? 0,
        }
      : null,
    skills: {
      open: ui.isSkillsOpen(),
    },
    abilities: abilities.map((ability) => ({
      id: ability.id,
      name: ability.name,
      slot: ability.slot,
      cooldownMs: ability.cooldownMs ?? 0,
      cooldownRemainingMs:
        ability.id === 'basic_attack'
          ? Math.max(0, (me?.attackCooldownUntil ?? 0) - serverNow)
          : 0,
    })),
    trade: {
      dialogOpen,
      tradeOpen,
      tab: tradeTab,
      vendorId: vendor?.id ?? null,
    },
    inventory: {
      open: inventoryOpen,
      slots: inventorySlotCount,
      stackMax: inventoryStackMax,
      items: inventorySlots
        .map((item, index) =>
          item
            ? {
                slot: index,
                id: item.id ?? null,
                kind: item.kind ?? null,
                name: item.name ?? null,
                count: item.count ?? 0,
              }
            : null
        )
        .filter(Boolean),
    },
    resources: gameState.getLatestResources().map((r) => ({
      id: r.id,
      x: r.x,
      z: r.z,
      available: r.available,
      respawnAt: r.respawnAt ?? 0,
    })),
    mobs: gameState.getLatestMobs().map((m) => ({
      id: m.id,
      x: m.x,
      z: m.z,
      state: m.state,
      targetId: m.targetId ?? null,
      level: m.level ?? 1,
      hp: m.hp ?? 0,
      maxHp: m.maxHp ?? 0,
      dead: !!m.dead,
      respawnAt: m.respawnAt ?? 0,
    })),
  };
}

window.render_game_to_text = () => JSON.stringify(buildTextState());

window.__game = {
  moveTo: (x, z) => {
    sendMoveTarget({ x, z });
  },
  clearInput: () => {
    sendInput({ w: false, a: false, s: false, d: false });
  },
  interact: () => {
    sendInteract();
  },
  getState: () => buildTextState(),
};

function getNearestVendor(pos) {
  const worldConfig = gameState.getWorldConfig();
  if (!pos || !Array.isArray(worldConfig?.vendors)) {
    return { vendor: null, distance: Infinity };
  }
  let bestVendor = null;
  let bestDist = Infinity;
  for (const vendor of worldConfig.vendors) {
    const dx = vendor.x - pos.x;
    const dz = vendor.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < bestDist) {
      bestDist = dist;
      bestVendor = vendor;
    }
  }
  return { vendor: bestVendor, distance: bestDist };
}

if (signOutBtn) {
  signOutBtn.addEventListener('click', () => {
    handleSignOut();
  });
}

if (isGuestSession) {
  ui.setMenuOpen(false);
  menu.setOpen(false);
  currentAccount = { username: 'Guest' };
  currentCharacter = { name: 'Guest' };
  updateOverlayLabels();
  startConnection({ guest: true }).catch(() => {});
} else if (authToken) {
  currentAccount = loadStoredAccount();
  menu.setAccount(currentAccount);
  ui.setMenuOpen(true);
  menu.setOpen(true);
  loadCharacters().catch(() => {
    clearAuthToken();
    clearStoredAccount();
    authToken = null;
    menu.setStep('auth');
  });
} else {
  ui.setMenuOpen(true);
  menu.setOpen(true);
  ui.setStatus('menu');
}
