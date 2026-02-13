import { createRenderSystem } from './render.js';
import { createGameState } from './state.js';
import { createNet } from './net.js';
import { createInputHandler } from './input.js';
import { createUiState } from './ui-state.js';
import { createMenu } from './menu.js';
import { preloadAllAssets } from './assets.js';
import { resolveTarget } from './targeting.js';
import { getAbilitiesForClass } from '/shared/classes.js';
import { splitCurrency } from '/shared/economy.js';
import { xpToNext } from '/shared/progression.js';
import { PLAYER_CONFIG } from '/shared/config.js';
import { getEquippedWeapon } from '/shared/equipment.js';

const app = document.getElementById('app');
const fpsEl = document.getElementById('fps');
const coordsEl = document.getElementById('coords');
const accountNameEl = document.getElementById('account-name');
const characterNameEl = document.getElementById('overlay-character-name');
const signOutBtn = document.getElementById('signout-btn');
const overlayEl = document.getElementById('overlay');
const loadingScreenEl = document.getElementById('loading-screen');
const loadingTextEl = document.getElementById('loading-text');

function showLoadingScreen(text = 'Loading...') {
  if (loadingTextEl) loadingTextEl.textContent = text;
  loadingScreenEl?.classList.add('visible');
}

function hideLoadingScreen() {
  loadingScreenEl?.classList.remove('visible');
}

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
let selectedTarget = null;

const combatEvents = [];
const MAX_COMBAT_EVENTS = 12;
const COMBAT_EVENT_TTL_MS = 2500;

function recordCombatEvent(event, now) {
  if (!event) return;
  combatEvents.push({ ...event, t: now });
  pruneCombatEvents(now);
}

function pruneCombatEvents(now) {
  while (combatEvents.length > MAX_COMBAT_EVENTS) {
    combatEvents.shift();
  }
  let idx = 0;
  while (idx < combatEvents.length && now - combatEvents[idx].t > COMBAT_EVENT_TTL_MS) {
    idx += 1;
  }
  if (idx > 0) {
    combatEvents.splice(0, idx);
  }
}

const ACCOUNT_KEY = 'mmorpg_account';
const LAST_CHARACTER_PREFIX = 'mmorpg_last_character_';

const ui = createUiState({
  onInventorySwap: (from, to) => {
    seq += 1;
    net?.send({ type: 'inventorySwap', from, to, seq });
  },
  onEquipmentSwap: ({ fromType, fromSlot, toType, toSlot }) => {
    seq += 1;
    net?.send({ type: 'equipSwap', fromType, fromSlot, toType, toSlot, seq });
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
  onRespawn: () => {
    sendRespawn();
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

let authToken = null;
let currentAccount = null;
let currentCharacter = null;
let lastCharacterId = null;

function saveAuthToken(token) {
  authToken = token ?? null;
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

async function apiFetch(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
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
  const data = await apiFetch('/api/characters');
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
    saveAuthToken(data.token ?? null);
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
    saveAuthToken(data.token ?? null);
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
  menu.setLoading(true);
  menu.setError('create', '');
  try {
    const data = await apiFetch('/api/characters', {
      method: 'POST',
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
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // ignore
  }
  saveAuthToken(null);
  clearStoredAccount();
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
  if (!character?.id) return;
  const confirmDelete = window.confirm(`Delete ${character.name ?? 'this character'}? This cannot be undone.`);
  if (!confirmDelete) return;
  menu.setLoading(true);
  menu.setError('characters', '');
  try {
    await apiFetch(`/api/characters/${character.id}`, { method: 'DELETE' });
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
  if (!character?.id) return;
  menu.setLoading(true);
  menu.setError('characters', '');
  try {
    saveLastCharacterId(character.id);
    lastCharacterId = character.id;
    menu.setSelectedCharacterId(character.id);
    showLoadingScreen('Loading assets...');
    await preloadAllAssets();
    showLoadingScreen('Connecting...');
    await startConnection({ character });
    hideLoadingScreen();
    menu.setOpen(false);
    ui.setMenuOpen(false);
  } catch (err) {
    hideLoadingScreen();
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
          loadCharacters().catch(() => {
            clearSessionState();
            menu.setAccount(null);
            menu.setStep('auth');
          });
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

        if (msg.type === 'combatEvent') {
          const events = Array.isArray(msg.events) ? msg.events : [];
          const eventTime = Number.isFinite(msg.t) ? msg.t : gameState.getServerNow();
          for (const event of events) {
            handleCombatEvent(event, now, eventTime);
          }
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
  net?.send({ type: 'moveTarget', x: pos.x, y: pos.y ?? 0, z: pos.z, seq });
  renderSystem.setTargetMarker(pos);
}

function sendRespawn() {
  seq += 1;
  net?.send({ type: 'respawn', seq });
}

function getTargetSelectRange() {
  const config = gameState.getConfigSnapshot();
  return config?.combat?.targetSelectRange ?? 25;
}

function getAliveTargetById(targetId) {
  if (!targetId) return null;
  const mobs = gameState.getLatestMobs();
  return mobs.find((mob) => mob.id === targetId && !mob.dead && mob.hp > 0) ?? null;
}

function getAlivePlayerById(targetId) {
  if (!targetId) return null;
  const players = gameState.getLatestPlayers();
  const target =
    players && typeof players === 'object' ? players[targetId] : null;
  if (!target || target.dead) return null;
  return { id: targetId, ...target };
}

function selectTarget(selection) {
  if (!selection || !selection.id || !selection.kind) {
    selectedTarget = null;
    seq += 1;
    net?.send({ type: 'targetSelect', targetId: null, targetKind: null, seq });
    return;
  }

  selectedTarget = { kind: selection.kind, id: selection.id };
  seq += 1;
  if (selection.kind === 'mob') {
    net?.send({ type: 'targetSelect', targetId: selection.id, targetKind: 'mob', seq });
  } else if (selection.kind === 'player') {
    net?.send({ type: 'targetSelect', targetId: selection.id, targetKind: 'player', seq });
  } else {
    net?.send({ type: 'targetSelect', targetId: null, targetKind: null, seq });
  }
}

function cycleTarget() {
  const me = gameState.getLocalPlayer();
  if (!me) return;
  const range = getTargetSelectRange();
  const range2 = range * range;
  const mobs = gameState.getLatestMobs().filter((mob) => !mob.dead && mob.hp > 0);
  const inRange = mobs
    .map((mob) => {
      const dx = mob.x - me.x;
      const dz = mob.z - me.z;
      return { mob, dist2: dx * dx + dz * dz };
    })
    .filter((entry) => entry.dist2 <= range2)
    .sort((a, b) => {
      if (a.dist2 !== b.dist2) return a.dist2 - b.dist2;
      return String(a.mob.id).localeCompare(String(b.mob.id));
    });
  if (!inRange.length) {
    selectTarget(null);
    return;
  }
  const currentMobId = selectedTarget?.kind === 'mob' ? selectedTarget.id : null;
  const idx = inRange.findIndex((entry) => entry.mob.id === currentMobId);
  const next = inRange[(idx + 1) % inRange.length].mob;
  selectTarget({ kind: 'mob', id: next.id });
}

function useAbility(slot) {
  if (ui.isUiBlocking()) return;
  const classId = ui.getCurrentClassId(currentMe);
  const weaponDef = getEquippedWeapon(currentMe?.equipment, classId);
  const abilities = getAbilitiesForClass(classId, currentMe?.level ?? 1, weaponDef);
  const ability = abilities.find((item) => item.slot === slot);
  if (!ability) return;
  if (ability.targetType === 'targeted') {
    if (ability.targetKind === 'player') {
      if (selectedTarget?.kind === 'player') {
        const target = getAlivePlayerById(selectedTarget.id);
        if (!target || !currentMe) return;
        const dx = target.x - currentMe.x;
        const dz = target.z - currentMe.z;
        if (dx * dx + dz * dz > (ability.range ?? 0) * (ability.range ?? 0)) {
          return;
        }
      }
    } else {
      const mobTargetId = selectedTarget?.kind === 'mob' ? selectedTarget.id : null;
      const target = getAliveTargetById(mobTargetId);
      if (!target || !currentMe) return;
      const dx = target.x - currentMe.x;
      const dz = target.z - currentMe.z;
      if (dx * dx + dz * dz > (ability.range ?? 0) * (ability.range ?? 0)) {
        return;
      }
    }
  }
  const now = gameState.getServerNow();
  const localCooldown = ui.getLocalCooldown(slot);
  const serverCooldown =
    ability.id === 'basic_attack'
      ? currentMe?.attackCooldownUntil ?? 0
      : currentMe?.abilityCooldowns?.[ability.id] ?? 0;
  if (Math.max(localCooldown, serverCooldown) > now) return;
  const cost = ability.resourceCost ?? 0;
  if (cost > 0 && (currentMe?.resource ?? 0) < cost) return;
  const localCooldownDuration = ability.windUpMs ?? ability.cooldownMs ?? 0;
  ui.setLocalCooldown(slot, now + localCooldownDuration);
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
  const pos = me ? { x: me.x, y: me.y ?? 0, z: me.z } : null;
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

function handleCombatEvent(event, now, serverTime) {
  if (!event || event.kind !== 'basic_attack') return;
  const timestamp = Number.isFinite(serverTime) ? serverTime : gameState.getServerNow();
  recordCombatEvent(event, timestamp);
  renderSystem?.triggerAttack?.(event.attackerId, now, event.durationMs);
  if (event.attackType === 'ranged') {
    renderSystem.spawnProjectile(event.from, event.to, event.durationMs, now);
  } else {
    renderSystem.spawnSlash(event.from, event.to, event.durationMs, now);
  }
}

function updateLocalUi() {
  const me = gameState.getLocalPlayer();
  const serverNow = gameState.getServerNow();
  currentMe = me;
  if (me && Object.prototype.hasOwnProperty.call(me, 'targetId')) {
    if (me.targetId) {
      selectedTarget = { kind: 'mob', id: me.targetId };
    } else if (selectedTarget?.kind === 'mob') {
      selectedTarget = null;
    }
  } else if (!me) {
    selectedTarget = null;
  }
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
  onTargetSelect: selectTarget,
  onCycleTarget: cycleTarget,
  pickTarget: (ndc) => renderSystem.pickTarget(ndc),
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
  const baseSpeed =
    worldConfig?.playerSpeed ?? configSnapshot?.player?.speed ?? DEFAULT_PLAYER_SPEED;
  const multiplier = currentMe?.moveSpeedMultiplier ?? 1;
  return baseSpeed * multiplier;
}

function stepFrame(dt, now) {
  const { positions, localPos: serverLocalPos } = gameState.renderInterpolatedPlayers(now);
  renderSystem.updatePlayerPositions(positions, {
    localPlayerId: playerId ?? null,
    inputKeys: inputHandler.getKeys(),
  });

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
    renderSystem.updatePlayerPositions(
      { [playerId]: predictedPos },
      { localPlayerId: playerId, inputKeys: inputHandler.getKeys() }
    );
  }

  if (viewPos) {
    renderSystem.updateCamera(viewPos, dt);
    if (coordsEl) {
      coordsEl.textContent = `${viewPos.x.toFixed(1)}, ${(viewPos.y ?? 0).toFixed(1)}, ${viewPos.z.toFixed(1)}`;
    }
  } else if (coordsEl) {
    coordsEl.textContent = '--, --, --';
  }

  renderSystem.animateWorldMeshes(now);
  const players = gameState.getLatestPlayers();
  const deadPlayerIds = new Set();
  if (players && typeof players === 'object') {
    for (const [id, p] of Object.entries(players)) {
      if (p?.dead) deadPlayerIds.add(id);
    }
  }
  renderSystem.updateAnimations(dt, now, deadPlayerIds);
  renderSystem.updateEffects(now);
  const resolvedTarget = resolveTarget(selectedTarget, {
    mobs: gameState.getLatestMobs(),
    players: gameState.getLatestPlayers(),
    vendors: gameState.getWorldConfig()?.vendors ?? [],
  });
  if (!resolvedTarget && selectedTarget) {
    selectedTarget = null;
  }
  if (resolvedTarget?.pos) {
    renderSystem.setTargetRing({
      x: resolvedTarget.pos.x,
      y: resolvedTarget.pos.y ?? 0,
      z: resolvedTarget.pos.z,
    });
  } else {
    renderSystem.setTargetRing(null);
  }
  ui.updateTargetHud(resolvedTarget);

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

  pruneCombatEvents(gameState.getServerNow());

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
  const weaponDef = getEquippedWeapon(me?.equipment, classId);
  const abilities = getAbilitiesForClass(classId, me?.level ?? 1, weaponDef);
  const serverNow = gameState.getServerNow();
  const vendor = ui.vendorUI?.getVendor?.() ?? null;
  const tradeTab = tradeOpen ? ui.vendorUI?.getTab?.() ?? null : null;
  const currencyCopper = me?.currencyCopper ?? 0;
  const inventorySlotCount =
    me?.invSlots ?? worldConfig?.playerInvSlots ?? inventorySlots.length;
  const inventoryStackMax =
    me?.invStackMax ?? worldConfig?.playerInvStackMax ?? 0;
  const menuState = menu.getState();
  const target = resolveTarget(selectedTarget, {
    mobs: gameState.getLatestMobs(),
    players: gameState.getLatestPlayers(),
    vendors: worldConfig?.vendors ?? [],
  });

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
          targetId: me.targetId ?? null,
          targetKind: me.targetKind ?? null,
          resourceType: me.resourceType ?? null,
          resourceMax: me.resourceMax ?? 0,
          resource: me.resource ?? 0,
          abilityCooldowns: me.abilityCooldowns ?? {},
          moveSpeedMultiplier: me.moveSpeedMultiplier ?? 1,
          equipment: me.equipment ?? null,
          weapon: weaponDef
            ? {
                kind: weaponDef.kind,
                name: weaponDef.name,
                attackType: weaponDef.attackType,
                range: weaponDef.range,
              }
            : null,
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
    target: target
      ? {
          kind: target.kind,
          id: target.id,
          name: target.name ?? null,
          level: target.level ?? null,
          hp: target.hp ?? null,
          maxHp: target.maxHp ?? null,
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
      range: ability.range ?? 0,
      attackType: ability.attackType ?? null,
      targetType: ability.targetType ?? 'none',
      targetKind: ability.targetKind ?? null,
      cooldownRemainingMs: Math.max(
        0,
        (ability.id === 'basic_attack'
          ? me?.attackCooldownUntil ?? 0
          : me?.abilityCooldowns?.[ability.id] ?? 0) - serverNow
      ),
    })),
    combat: {
      targetSelectRange: getTargetSelectRange(),
      recentEvents: combatEvents
        .filter((event) => event.attackerId === playerId)
        .map((event) => ({
          kind: event.kind ?? null,
          attackType: event.attackType ?? null,
          attackerId: event.attackerId ?? null,
          targetId: event.targetId ?? null,
          from: event.from ?? null,
          to: event.to ?? null,
          hit: !!event.hit,
          durationMs: event.durationMs ?? 0,
          t: event.t ?? null,
        })),
    },
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
  projectToScreen: (x, z) => {
    return renderSystem.projectToScreen({ x, z });
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

if (overlayEl) {
  overlayEl.addEventListener('mouseenter', () => {
    overlayEl.classList.add('hovered');
  });
  overlayEl.addEventListener('mouseleave', () => {
    overlayEl.classList.remove('hovered');
  });
}

if (isGuestSession) {
  ui.setMenuOpen(false);
  menu.setOpen(false);
  currentAccount = { username: 'Guest' };
  currentCharacter = { name: 'Guest' };
  updateOverlayLabels();
  (async () => {
    showLoadingScreen('Loading assets...');
    try {
      await preloadAllAssets();
      showLoadingScreen('Connecting...');
      await startConnection({ guest: true });
    } catch {
      // connection failed
    } finally {
      hideLoadingScreen();
    }
  })();
} else {
  currentAccount = loadStoredAccount();
  menu.setAccount(currentAccount);
  ui.setMenuOpen(true);
  menu.setOpen(true);
  if (currentAccount) {
    loadCharacters().catch(() => {
      saveAuthToken(null);
      clearStoredAccount();
      clearSessionState();
      menu.setAccount(null);
      menu.setStep('auth');
      menu.setTab('signin');
      ui.setStatus('menu');
    });
  } else {
    menu.setStep('auth');
    menu.setTab('signin');
    ui.setStatus('menu');
  }
}
