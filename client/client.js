import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { initWorld, updateResources, updateMobs, animateWorld } from './world.js';
import { applyWASD } from '/shared/math.js';
import { formatCurrency, splitCurrency, VENDOR_SELL_PRICES } from '/shared/economy.js';
import {
  ABILITY_SLOTS,
  DEFAULT_CLASS_ID,
  getAbilitiesForClass,
  getClassById,
  isValidClassId,
} from '/shared/classes.js';
import { totalXpForLevel, xpToNext } from '/shared/progression.js';
import {
  setStatus,
  updateHud,
  showPrompt,
  clearPrompt,
  showEvent,
  flashDamage,
} from './ui.js';
import { createInventoryUI } from './inventory.js';
import { createVendorUI } from './vendor.js';

const app = document.getElementById('app');
const fpsEl = document.getElementById('fps');
const coordsEl = document.getElementById('coords');
const classModal = document.getElementById('class-modal');
const skillsPanel = document.getElementById('skills-panel');
const skillsClassEl = document.getElementById('skills-class');
const skillsLevelEl = document.getElementById('skills-level');
const skillsXpEl = document.getElementById('skills-xp');
const skillsListEl = document.getElementById('skills-list');
const inventoryPanel = document.getElementById('inventory-panel');
const inventoryGrid = document.getElementById('inventory-grid');
const vendorDialog = document.getElementById('vendor-dialog');
const vendorPanel = document.getElementById('vendor-panel');
const vendorDialogName = document.getElementById('vendor-dialog-name');
const vendorPanelName = document.getElementById('vendor-panel-name');
const vendorTradeBtn = document.getElementById('vendor-trade-btn');
const vendorCloseBtn = document.getElementById('vendor-close-btn');
const vendorPanelCloseBtn = document.getElementById('vendor-panel-close');
const vendorPricesEl = document.getElementById('vendor-sell-prices');
const inventoryCoinsEl = document.getElementById('inventory-coins');
const abilityBar = document.getElementById('ability-bar');

let inventoryUI = null;
let vendorUI = null;

const CLASS_STORAGE_KEY = 'mmorpg_class_id';
const PLAYER_STORAGE_KEY = 'mmorpg_player_id';
const urlParams = new URLSearchParams(window.location.search);
const isGuestSession = urlParams.get('guest') === '1';
const playerStorage = isGuestSession ? sessionStorage : localStorage;
let selectedClassId = null;
let classModalOpen = false;
let skillsOpen = false;
const abilitySlots = [];
const localCooldowns = new Map();
let skillsRenderKey = '';
let currentMe = null;

const INTERP_DELAY_MS = 100;
const MAX_SNAPSHOT_AGE_MS = 2000;
const MAX_SNAPSHOTS = 60;
const CAMERA_LERP_SPEED = 5;
const DEFAULT_PLAYER_SPEED = 3;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

const frustumSize = 24;
let camera;
const cameraOffset = new THREE.Vector3(20, 20, 20);
const cameraTarget = new THREE.Vector3();
const cameraDesired = new THREE.Vector3();

function createCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.OrthographicCamera(
    (-frustumSize * aspect) / 2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    -frustumSize / 2,
    0.1,
    10000
  );
  camera.position.copy(cameraOffset);
  camera.zoom = 1.4;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

createCamera();

const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);
const dirLight = new THREE.DirectionalLight(0xffffff, 0.7);
dirLight.position.set(10, 20, 5);
scene.add(dirLight);

const targetMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.25, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xffcc00 })
);
targetMarker.visible = false;
scene.add(targetMarker);

const playerMeshes = new Map();
let myId = null;
let worldState = null;
let worldConfig = null;

let latestPlayers = {};
let latestMe = null;
let latestResources = [];
let latestMobs = [];
let nearestVendor = null;
let inVendorRange = false;
let playerId = null;

function formatItemName(kind) {
  if (!kind) return 'Item';
  return kind
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function renderVendorPrices() {
  if (!vendorPricesEl) return;
  vendorPricesEl.innerHTML = '';
  const entries = Object.entries(VENDOR_SELL_PRICES ?? {});
  if (entries.length === 0) {
    vendorPricesEl.textContent = 'No items can be sold right now.';
    return;
  }
  for (const [kind, price] of entries) {
    const row = document.createElement('div');
    row.className = 'vendor-price-row';
    const name = document.createElement('div');
    name.className = 'vendor-price-name';
    name.textContent = formatItemName(kind);
    const value = document.createElement('div');
    value.className = 'vendor-price-value';
    value.textContent = formatCurrency(price);
    row.appendChild(name);
    row.appendChild(value);
    vendorPricesEl.appendChild(row);
  }
}

function loadClassId() {
  const stored = localStorage.getItem(CLASS_STORAGE_KEY);
  if (stored && isValidClassId(stored)) {
    return stored;
  }
  return null;
}

function saveClassId(classId) {
  if (classId) {
    localStorage.setItem(CLASS_STORAGE_KEY, classId);
  }
}

function isValidPlayerId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9._-]{1,64}$/.test(value);
}

function createPlayerId() {
  if (crypto?.randomUUID) {
    return crypto.randomUUID();
  }
  return `p-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 10)}`;
}

function loadPlayerId() {
  const stored = playerStorage.getItem(PLAYER_STORAGE_KEY);
  if (isValidPlayerId(stored)) {
    return stored;
  }
  const fresh = createPlayerId();
  playerStorage.setItem(PLAYER_STORAGE_KEY, fresh);
  return fresh;
}

function savePlayerId(id) {
  if (isValidPlayerId(id)) {
    playerStorage.setItem(PLAYER_STORAGE_KEY, id);
  }
}

function setClassModalOpen(open) {
  classModalOpen = !!open;
  classModal?.classList.toggle('open', classModalOpen);
  if (classModalOpen) {
    clearPrompt();
  }
}

function sendClassSelection(classId) {
  if (!classId) return;
  seq += 1;
  send({ type: 'classSelect', classId, seq });
}

function applyClassSelection(classId) {
  if (!isValidClassId(classId)) return;
  selectedClassId = classId;
  saveClassId(classId);
  setClassModalOpen(false);
  sendClassSelection(classId);
  updateAbilityBar(currentMe);
  updateSkillsPanel(currentMe);
}

function getCurrentClassId(me) {
  return me?.classId ?? selectedClassId ?? DEFAULT_CLASS_ID;
}

function setSkillsOpen(open) {
  skillsOpen = !!open;
  skillsPanel?.classList.toggle('open', skillsOpen);
  if (skillsOpen) {
    clearPrompt();
    keys.w = false;
    keys.a = false;
    keys.s = false;
    keys.d = false;
    sendInput();
  }
}

function toggleSkills() {
  if (isInventoryOpen() || isDialogOpen() || isTradeOpen()) return;
  setSkillsOpen(!skillsOpen);
}

function buildAbilityBar() {
  if (!abilityBar) return;
  abilityBar.innerHTML = '';
  abilitySlots.length = 0;
  for (let slot = 1; slot <= ABILITY_SLOTS; slot += 1) {
    const el = document.createElement('div');
    el.className = 'ability-slot empty';
    el.dataset.slot = String(slot);
    el.style.setProperty('--cooldown', '0');
    const key = document.createElement('div');
    key.className = 'ability-key';
    key.textContent = slot === 10 ? '0' : String(slot);
    const name = document.createElement('div');
    name.className = 'ability-name';
    name.textContent = '';
    el.appendChild(key);
    el.appendChild(name);
    el.addEventListener('click', () => {
      useAbility(slot);
    });
    abilityBar.appendChild(el);
    abilitySlots.push(el);
  }
}

function updateAbilityBar(me) {
  if (!abilityBar || abilitySlots.length === 0) return;
  const classId = getCurrentClassId(me);
  const abilities = getAbilitiesForClass(classId, me?.level ?? 1);
  const abilityBySlot = new Map(abilities.map((ability) => [ability.slot, ability]));
  const serverNow = getServerNow();

  for (let slot = 1; slot <= ABILITY_SLOTS; slot += 1) {
    const ability = abilityBySlot.get(slot);
    const slotEl = abilitySlots[slot - 1];
    if (!slotEl) continue;
    const nameEl = slotEl.querySelector('.ability-name');
    if (ability) {
      slotEl.classList.remove('empty');
      if (nameEl) nameEl.textContent = ability.name;
    } else {
      slotEl.classList.add('empty');
      if (nameEl) nameEl.textContent = '';
      slotEl.style.setProperty('--cooldown', '0');
      continue;
    }

    let remaining = 0;
    if (ability.id === 'basic_attack') {
      const localCooldown = localCooldowns.get(slot) ?? 0;
      const serverCooldown = me?.attackCooldownUntil ?? 0;
      const cooldownEnd = Math.max(localCooldown, serverCooldown);
      remaining = Math.max(0, cooldownEnd - serverNow);
    }
    const fraction = ability.cooldownMs
      ? Math.min(1, remaining / ability.cooldownMs)
      : 0;
    slotEl.style.setProperty('--cooldown', fraction.toFixed(3));
  }
}

function updateSkillsPanel(me) {
  if (!skillsPanel || !skillsOpen) return;
  const classId = getCurrentClassId(me);
  const klass = getClassById(classId);
  if (skillsClassEl) {
    skillsClassEl.textContent = klass?.name ?? classId ?? '--';
  }
  if (skillsLevelEl) {
    skillsLevelEl.textContent = `${me?.level ?? 1}`;
  }
  if (skillsXpEl) {
    const needed = me?.xpToNext ?? xpToNext(me?.level ?? 1);
    skillsXpEl.textContent = needed ? `${me?.xp ?? 0}/${needed}` : 'MAX';
  }

  const renderKey = `${classId}:${me?.level ?? 1}`;
  if (renderKey === skillsRenderKey) return;
  skillsRenderKey = renderKey;
  if (!skillsListEl) return;
  skillsListEl.innerHTML = '';
  const abilities = getAbilitiesForClass(classId, me?.level ?? 1);
  for (const ability of abilities) {
    const row = document.createElement('div');
    row.className = 'skill-row';
    const name = document.createElement('div');
    name.className = 'skill-name';
    name.textContent = ability.name;
    const meta = document.createElement('div');
    meta.className = 'skill-meta';
    meta.textContent = `Slot ${ability.slot} · CD ${Math.round(
      (ability.cooldownMs ?? 0) / 1000
    )}s`;
    row.appendChild(name);
    row.appendChild(meta);
    skillsListEl.appendChild(row);
  }
}

const lastStats = {
  hp: null,
  inv: null,
  currencyCopper: null,
  level: null,
  totalXp: null,
};

let manualStepping = false;
let virtualNow = performance.now();
let serverTimeOffsetMs = 0;
let hasServerTime = false;
let lastServerTimestamp = null;

function setWorld(config) {
  if (worldState?.group) {
    scene.remove(worldState.group);
  }
  worldConfig = config ?? null;
  worldState = initWorld(scene, worldConfig);
}

setWorld(null);

function createPlayerMesh(isLocal) {
  const geometry = new THREE.BoxGeometry(1, 2, 1);
  const material = new THREE.MeshStandardMaterial({
    color: isLocal ? 0x4da3ff : 0xff7b2f,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 1;
  return mesh;
}

function ensurePlayerMesh(id) {
  if (playerMeshes.has(id)) return playerMeshes.get(id);
  const mesh = createPlayerMesh(id === myId);
  playerMeshes.set(id, mesh);
  scene.add(mesh);
  return mesh;
}

function setLocalPlayerVisual() {
  if (!myId) return;
  const mesh = playerMeshes.get(myId);
  if (mesh) {
    mesh.material.color.set(0x4da3ff);
  }
}

const snapshots = [];
let predictedLocalPos = null;
const correction = 0.1;
const snapThreshold = 5;

function syncPlayers(players) {
  const seen = new Set(Object.keys(players));
  for (const id of seen) {
    ensurePlayerMesh(id);
  }
  for (const id of playerMeshes.keys()) {
    if (!seen.has(id)) {
      const mesh = playerMeshes.get(id);
      scene.remove(mesh);
      playerMeshes.delete(id);
    }
  }
  setLocalPlayerVisual();
}

function pushSnapshot(players) {
  const t = manualStepping ? virtualNow : performance.now();
  snapshots.push({ t, players });
  latestPlayers = players;
  syncPlayers(players);

  while (snapshots.length > MAX_SNAPSHOTS) {
    snapshots.shift();
  }
  while (snapshots.length > 2 && t - snapshots[0].t > MAX_SNAPSHOT_AGE_MS) {
    snapshots.shift();
  }
}

function renderInterpolatedPlayers(now) {
  if (snapshots.length === 0) return null;

  const renderTime = now - INTERP_DELAY_MS;
  while (snapshots.length >= 2 && snapshots[1].t <= renderTime) {
    snapshots.shift();
  }

  const older = snapshots[0];
  const newer = snapshots[1] ?? snapshots[0];
  const span = newer.t - older.t;
  let alpha = 0;
  if (span > 0) {
    alpha = (renderTime - older.t) / span;
  }
  alpha = Math.max(0, Math.min(1, alpha));

  let localPos = null;
  for (const [id, newerPos] of Object.entries(newer.players)) {
    const mesh = ensurePlayerMesh(id);
    const olderPos = older.players?.[id];
    const x = olderPos
      ? olderPos.x + (newerPos.x - olderPos.x) * alpha
      : newerPos.x;
    const z = olderPos
      ? olderPos.z + (newerPos.z - olderPos.z) * alpha
      : newerPos.z;
    mesh.position.set(x, 1, z);
    if (id === myId) {
      localPos = { x, z };
    }
  }

  return localPos;
}

function updateServerTime(serverNow) {
  if (!Number.isFinite(serverNow)) return;
  serverTimeOffsetMs = serverNow - Date.now();
  hasServerTime = true;
  lastServerTimestamp = serverNow;
}

function getServerNow() {
  return hasServerTime ? Date.now() + serverTimeOffsetMs : Date.now();
}

function getLocalPlayer() {
  const publicPlayer = latestPlayers?.[myId];
  if (!publicPlayer) return null;
  if (latestMe && latestMe.id && latestMe.id !== myId) {
    return publicPlayer;
  }
  return { ...publicPlayer, ...(latestMe ?? {}) };
}

function updateLocalPrediction(dt, serverPos, input) {
  if (!serverPos) return null;

  const speed = worldConfig?.playerSpeed ?? DEFAULT_PLAYER_SPEED;

  if (!predictedLocalPos) {
    predictedLocalPos = { x: serverPos.x, z: serverPos.z };
  } else {
    const errorX = serverPos.x - predictedLocalPos.x;
    const errorZ = serverPos.z - predictedLocalPos.z;
    const errorDist = Math.hypot(errorX, errorZ);
    if (errorDist > snapThreshold) {
      predictedLocalPos.x = serverPos.x;
      predictedLocalPos.z = serverPos.z;
    } else {
      predictedLocalPos.x += errorX * correction;
      predictedLocalPos.z += errorZ * correction;
    }
  }

  const dir = applyWASD(input);
  if (dir.x !== 0 || dir.z !== 0) {
    predictedLocalPos.x += dir.x * speed * dt;
    predictedLocalPos.z += dir.z * speed * dt;
  }

  return predictedLocalPos;
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (-frustumSize * aspect) / 2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', resize);
resize();

const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
playerId = loadPlayerId();
const wsUrl = new URL(`${wsProtocol}://${location.host}`);
wsUrl.searchParams.set('playerId', playerId);
if (isGuestSession) {
  wsUrl.searchParams.set('guest', '1');
}
const ws = new WebSocket(wsUrl.toString());
let seq = 0;

function send(msg) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

if (inventoryPanel && inventoryGrid) {
  inventoryUI = createInventoryUI({
    panel: inventoryPanel,
    grid: inventoryGrid,
    cols: 5,
    onSwap: (from, to) => {
      seq += 1;
      send({ type: 'inventorySwap', from, to, seq });
    },
    onDropExternal: ({ slot, target }) => {
      if (!vendorUI || !vendorUI.isTradeOpen()) return false;
      const dropzone = target?.closest?.('.vendor-dropzone');
      if (!dropzone) return false;
      const vendor = vendorUI.getVendor();
      if (!vendor?.id) return false;
      seq += 1;
      send({ type: 'vendorSell', slot, vendorId: vendor.id, seq });
      return true;
    },
  });
}

if (vendorDialog && vendorPanel) {
  vendorUI = createVendorUI({
    dialog: vendorDialog,
    panel: vendorPanel,
    dialogName: vendorDialogName,
    panelName: vendorPanelName,
    tradeButton: vendorTradeBtn,
    closeButton: vendorCloseBtn,
    panelCloseButton: vendorPanelCloseBtn,
  });
  vendorTradeBtn?.addEventListener('click', () => {
    setInventoryOpen(true);
  });
  const closeTrade = () => {
    setInventoryOpen(false);
  };
  vendorCloseBtn?.addEventListener('click', closeTrade);
  vendorPanelCloseBtn?.addEventListener('click', closeTrade);
}

renderVendorPrices();

buildAbilityBar();
selectedClassId = loadClassId();
setClassModalOpen(!selectedClassId);
if (classModal) {
  classModal.querySelectorAll('.class-option').forEach((button) => {
    button.addEventListener('click', () => {
      const classId = button.getAttribute('data-class');
      applyClassSelection(classId);
    });
  });
}

ws.addEventListener('open', () => {
  setStatus('connected');
  send({ type: 'hello' });
  if (selectedClassId) {
    sendClassSelection(selectedClassId);
  }
});

ws.addEventListener('close', () => {
  setStatus('disconnected');
});

function handleStateMessage(msg) {
  if (Number.isFinite(msg.t)) {
    updateServerTime(msg.t);
  }
  if (msg.world) {
    if (!worldConfig || worldConfig.mapSize !== msg.world.mapSize) {
      setWorld(msg.world);
    }
  }

  if (msg.players) {
    pushSnapshot(msg.players);
    updateLocalUi();
  }

  if (msg.resources) {
    latestResources = msg.resources;
    updateResources(worldState, latestResources);
  }

  if (msg.mobs) {
    latestMobs = msg.mobs;
    updateMobs(worldState, msg.mobs);
  }
}

function updateLocalUi() {
  const me = getLocalPlayer();
  const serverNow = getServerNow();
  currentMe = me;
  if (me) {
    updateHud(me, serverNow);
    if (inventoryUI) {
      inventoryUI.setInventory(me.inventory ?? [], {
        slots: me.invSlots ?? worldConfig?.playerInvSlots ?? me.inventory?.length ?? 0,
        stackMax: me.invStackMax ?? worldConfig?.playerInvStackMax ?? 1,
      });
    }
    if (inventoryCoinsEl) {
      inventoryCoinsEl.textContent = formatCurrency(me.currencyCopper ?? 0);
    }
    if (lastStats.hp !== null && me.hp < lastStats.hp) {
      flashDamage();
    }

    const totalXp = totalXpForLevel(me.level ?? 1, me.xp ?? 0);
    let eventMessage = null;
    if (lastStats.level !== null && me.level > lastStats.level) {
      eventMessage = `Level Up! (${me.level})`;
    } else if (lastStats.totalXp !== null && totalXp > lastStats.totalXp) {
      eventMessage = `XP +${totalXp - lastStats.totalXp}`;
    }

    if (!eventMessage && lastStats.inv !== null && me.inv > lastStats.inv) {
      eventMessage = 'Harvested +1';
    }
    if (
      !eventMessage &&
      lastStats.currencyCopper !== null &&
      (me.currencyCopper ?? 0) > lastStats.currencyCopper
    ) {
      const diff = (me.currencyCopper ?? 0) - lastStats.currencyCopper;
      eventMessage = `Sold +${formatCurrency(diff)}`;
    }
    if (eventMessage) {
      showEvent(eventMessage);
    }

    lastStats.hp = me.hp;
    lastStats.inv = me.inv;
    lastStats.currencyCopper = me.currencyCopper ?? 0;
    lastStats.level = me.level ?? 1;
    lastStats.totalXp = totalXp;
    updateAbilityBar(me);
    updateSkillsPanel(me);
  } else {
    updateHud(null, serverNow);
    if (inventoryUI) {
      inventoryUI.setInventory([], {
        slots: worldConfig?.playerInvSlots ?? 0,
        stackMax: worldConfig?.playerInvStackMax ?? 1,
      });
    }
    if (inventoryCoinsEl) {
      inventoryCoinsEl.textContent = '--';
    }
    lastStats.hp = null;
    lastStats.inv = null;
    lastStats.currencyCopper = null;
    lastStats.level = null;
    lastStats.totalXp = null;
    updateAbilityBar(null);
    updateSkillsPanel(null);
  }
}

ws.addEventListener('message', (event) => {
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch {
    return;
  }

  if (msg.type === 'welcome') {
    myId = msg.id;
    if (myId && myId !== playerId) {
      playerId = myId;
      savePlayerId(myId);
    }
    if (msg.snapshot) {
      handleStateMessage(msg.snapshot);
    }
    return;
  }

  if (msg.type === 'state') {
    handleStateMessage(msg);
  }

  if (msg.type === 'me') {
    if (Number.isFinite(msg.t)) {
      updateServerTime(msg.t);
    }
    latestMe = msg.data ?? null;
    updateLocalUi();
  }
});

const keys = { w: false, a: false, s: false, d: false };

function sendInput() {
  seq += 1;
  send({ type: 'input', keys: { ...keys }, seq });
}

function sendInteract() {
  seq += 1;
  send({ type: 'action', kind: 'interact', seq });
}

function useAbility(slot) {
  if (isUiBlocking()) return;
  const classId = getCurrentClassId(currentMe);
  const abilities = getAbilitiesForClass(classId, currentMe?.level ?? 1);
  const ability = abilities.find((item) => item.slot === slot);
  if (!ability) return;
  const now = getServerNow();
  const localCooldown = localCooldowns.get(slot) ?? 0;
  const serverCooldown = currentMe?.attackCooldownUntil ?? 0;
  if (Math.max(localCooldown, serverCooldown) > now) return;
  localCooldowns.set(slot, now + (ability.cooldownMs ?? 0));
  updateAbilityBar(currentMe);
  seq += 1;
  send({ type: 'action', kind: 'ability', slot, seq });
}

function getAbilitySlotFromEvent(event) {
  const code = event.code || '';
  const digitMatch = code.match(/^(Digit|Numpad)(\d)$/);
  if (digitMatch) {
    const digit = Number(digitMatch[2]);
    return digit === 0 ? 10 : digit;
  }
  const key = event.key;
  if (typeof key === 'string' && key.length === 1 && key >= '0' && key <= '9') {
    const digit = Number(key);
    return digit === 0 ? 10 : digit;
  }
  return null;
}

function getNearestVendor(pos) {
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

function isInventoryOpen() {
  return inventoryUI?.isOpen?.() ?? false;
}

function isDialogOpen() {
  return vendorUI?.isDialogOpen?.() ?? false;
}

function isTradeOpen() {
  return vendorUI?.isTradeOpen?.() ?? false;
}

function isClassModalOpen() {
  return classModalOpen;
}

function isSkillsOpen() {
  return skillsOpen;
}

function isUiBlocking() {
  return (
    isInventoryOpen() ||
    isDialogOpen() ||
    isTradeOpen() ||
    isClassModalOpen() ||
    isSkillsOpen()
  );
}

function setInventoryOpen(next) {
  if (!inventoryUI) return;
  const open = !!next;
  inventoryUI.setOpen(open);
  if (open) {
    keys.w = false;
    keys.a = false;
    keys.s = false;
    keys.d = false;
    sendInput();
    clearPrompt();
  }
}

function toggleInventory() {
  if (isTradeOpen() || isDialogOpen() || isClassModalOpen() || isSkillsOpen()) return;
  setInventoryOpen(!isInventoryOpen());
}

function handleKey(event, isDown) {
  if (isUiBlocking()) return;
  const key = event.key.toLowerCase();
  if (!['w', 'a', 's', 'd'].includes(key)) return;
  if (event.repeat) return;
  if (keys[key] === isDown) return;
  keys[key] = isDown;
  if (isDown) {
    targetMarker.visible = false;
  }
  sendInput();
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    renderer.domElement.requestFullscreen?.().catch(() => {});
  } else {
    document.exitFullscreen?.().catch(() => {});
  }
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'f' && !event.repeat) {
    toggleFullscreen();
    return;
  }
  if (key === 'i' && !event.repeat) {
    toggleInventory();
    return;
  }
  if (key === 'k' && !event.repeat) {
    toggleSkills();
    return;
  }
  if ((key === 'b' || key === 's') && isTradeOpen() && vendorUI && !event.repeat) {
    vendorUI.setTab(key === 'b' ? 'buy' : 'sell');
    return;
  }
  if (key === 'e' && !event.repeat) {
    if (isTradeOpen()) return;
    if (isDialogOpen() && vendorUI) {
      vendorUI.openTrade();
      setInventoryOpen(true);
      return;
    }
    if (isInventoryOpen()) return;
    const me = getLocalPlayer();
    const pos = me ? { x: me.x, z: me.z } : null;
    const { vendor, distance } = pos ? getNearestVendor(pos) : { vendor: null, distance: Infinity };
    const maxDist = worldConfig?.vendorInteractRadius ?? 2.5;
    const targetVendor = vendor ?? nearestVendor;
    const inRange = vendor ? distance <= maxDist : inVendorRange;
    if (inRange && targetVendor && vendorUI) {
      vendorUI.openDialog(targetVendor);
      clearPrompt();
      return;
    }
    sendInteract();
    return;
  }
  if (isUiBlocking()) return;
  if (!event.repeat) {
    const abilitySlot = getAbilitySlotFromEvent(event);
    if (abilitySlot) {
      useAbility(abilitySlot);
      return;
    }
  }
  handleKey(event, true);
});
window.addEventListener('keyup', (event) => {
  if (isUiBlocking()) return;
  handleKey(event, false);
});

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

renderer.domElement.addEventListener('click', (event) => {
  if (isUiBlocking()) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const point = new THREE.Vector3();
  const hit = raycaster.ray.intersectPlane(groundPlane, point);
  if (hit) {
    seq += 1;
    send({ type: 'moveTarget', x: point.x, z: point.z, seq });
    targetMarker.position.set(point.x, 0.15, point.z);
    targetMarker.visible = true;
  }
});

let lastFrameTime = performance.now();
let fpsLastTime = lastFrameTime;
let fpsFrameCount = 0;

function stepFrame(dt, now) {
  const serverLocalPos = renderInterpolatedPlayers(now);
  const localState = getLocalPlayer();
  if (localState?.dead && serverLocalPos) {
    predictedLocalPos = { x: serverLocalPos.x, z: serverLocalPos.z };
  }
  const canPredict = !localState?.dead;
  const predictedPos = canPredict
    ? updateLocalPrediction(dt, serverLocalPos, keys)
    : serverLocalPos;
  const viewPos = predictedPos ?? serverLocalPos;

  if (predictedPos && myId) {
    const mesh = playerMeshes.get(myId);
    if (mesh) {
      mesh.position.set(predictedPos.x, 1, predictedPos.z);
    }
  }

  if (viewPos) {
    cameraDesired.set(
      viewPos.x + cameraOffset.x,
      cameraOffset.y,
      viewPos.z + cameraOffset.z
    );
    const lerpFactor = 1 - Math.exp(-CAMERA_LERP_SPEED * dt);
    camera.position.lerp(cameraDesired, lerpFactor);
    cameraTarget.set(viewPos.x, 0, viewPos.z);
    camera.lookAt(cameraTarget);
    if (coordsEl) {
      coordsEl.textContent = `${viewPos.x.toFixed(1)}, ${viewPos.z.toFixed(1)}`;
    }
  } else if (coordsEl) {
    coordsEl.textContent = '--, --';
  }

  if (worldState) {
    animateWorld(worldState, now);
  }

  updateAbilityBar(currentMe);
  if (skillsOpen) {
    updateSkillsPanel(currentMe);
  }

  nearestVendor = null;
  inVendorRange = false;
  if (viewPos) {
    const { vendor, distance } = getNearestVendor(viewPos);
    const maxDist = worldConfig?.vendorInteractRadius ?? 2.5;
    nearestVendor = vendor;
    if (vendor && distance <= maxDist) {
      inVendorRange = true;
    }
  }

  if (isUiBlocking()) {
    clearPrompt();
  } else if (inVendorRange && nearestVendor) {
    showPrompt(`Press E to talk to ${nearestVendor.name ?? 'Vendor'}`);
  } else if (viewPos && latestResources.length) {
    const radius = worldConfig?.harvestRadius ?? 2;
    const invCap =
      localState?.invCap ??
      (worldConfig?.playerInvSlots && worldConfig?.playerInvStackMax
        ? worldConfig.playerInvSlots * worldConfig.playerInvStackMax
        : 5);
    const inv = localState?.inv ?? 0;
    let near = false;
    if (!localState?.dead && inv < invCap) {
      for (const resource of latestResources) {
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
      showPrompt('Press E to harvest');
    } else {
      clearPrompt();
    }
  } else {
    clearPrompt();
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

  renderer.render(scene, camera);
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
  const me = getLocalPlayer();
  const base = worldConfig?.base ?? worldState?.base ?? null;
  const obstacles = worldConfig?.obstacles ?? worldState?.obstacles ?? [];
  const mapSize = worldConfig?.mapSize ?? worldState?.mapSize ?? 0;
  const harvestRadius = worldConfig?.harvestRadius ?? 2;
  const inventorySlots = Array.isArray(me?.inventory) ? me.inventory : [];
  const inventoryOpen = isInventoryOpen();
  const tradeOpen = isTradeOpen();
  const dialogOpen = isDialogOpen();
  const classId = getCurrentClassId(me);
  const abilities = getAbilitiesForClass(classId, me?.level ?? 1);
  const serverNow = getServerNow();
  const vendor = vendorUI?.getVendor?.() ?? null;
  const tradeTab = tradeOpen ? vendorUI?.getTab?.() ?? null : null;
  const currencyCopper = me?.currencyCopper ?? 0;
  const inventorySlotCount =
    me?.invSlots ?? worldConfig?.playerInvSlots ?? inventorySlots.length;
  const inventoryStackMax =
    me?.invStackMax ?? worldConfig?.playerInvStackMax ?? 0;
  return {
    mode: 'play',
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
    serverTime: lastServerTimestamp,
    player: me
      ? {
          id: myId,
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
    classSelection: {
      open: isClassModalOpen(),
      selectedClassId: selectedClassId ?? null,
    },
    skills: {
      open: skillsOpen,
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
    resources: latestResources.map((r) => ({
      id: r.id,
      x: r.x,
      z: r.z,
      available: r.available,
      respawnAt: r.respawnAt ?? 0,
    })),
    mobs: latestMobs.map((m) => ({
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
    seq += 1;
    send({ type: 'moveTarget', x, z, seq });
  },
  clearInput: () => {
    seq += 1;
    send({ type: 'input', keys: { w: false, a: false, s: false, d: false }, seq });
  },
  interact: () => {
    seq += 1;
    send({ type: 'action', kind: 'interact', seq });
  },
  getState: () => buildTextState(),
};
