import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { initWorld, updateResources, updateMobs, animateWorld } from './world.js';
import { applyWASD } from '/shared/math.js';
import {
  setStatus,
  updateHud,
  updateScoreboard,
  showPrompt,
  clearPrompt,
  showEvent,
  flashDamage,
} from './ui.js';
import { createInventoryUI } from './inventory.js';

const app = document.getElementById('app');
const fpsEl = document.getElementById('fps');
const coordsEl = document.getElementById('coords');
const inventoryPanel = document.getElementById('inventory-panel');
const inventoryGrid = document.getElementById('inventory-grid');

let inventoryUI = null;

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

const lastStats = {
  hp: null,
  inv: null,
  score: null,
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
const ws = new WebSocket(`${wsProtocol}://${location.host}`);
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
  });
}

ws.addEventListener('open', () => {
  setStatus('connected');
  send({ type: 'hello' });
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
    updateScoreboard(msg.players, myId);
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
  if (me) {
    updateHud(me, serverNow);
    if (inventoryUI) {
      inventoryUI.setInventory(me.inventory ?? [], {
        slots: me.invSlots ?? worldConfig?.playerInvSlots ?? me.inventory?.length ?? 0,
        stackMax: me.invStackMax ?? worldConfig?.playerInvStackMax ?? 1,
      });
    }
    if (lastStats.hp !== null && me.hp < lastStats.hp) {
      flashDamage();
    }
    if (lastStats.inv !== null && me.inv > lastStats.inv) {
      showEvent('Harvested +1');
    }
    if (lastStats.score !== null && me.score > lastStats.score) {
      showEvent(`Deposited +${me.score - lastStats.score}`);
    }
    lastStats.hp = me.hp;
    lastStats.inv = me.inv;
    lastStats.score = me.score;
  } else {
    updateHud(null, serverNow);
    if (inventoryUI) {
      inventoryUI.setInventory([], {
        slots: worldConfig?.playerInvSlots ?? 0,
        stackMax: worldConfig?.playerInvStackMax ?? 1,
      });
    }
    lastStats.hp = null;
    lastStats.inv = null;
    lastStats.score = null;
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

function isInventoryOpen() {
  return inventoryUI?.isOpen?.() ?? false;
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
  setInventoryOpen(!isInventoryOpen());
}

function handleKey(event, isDown) {
  if (isInventoryOpen()) return;
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
  if (isInventoryOpen()) return;
  if (key === 'e' && !event.repeat) {
    sendInteract();
    return;
  }
  handleKey(event, true);
});
window.addEventListener('keyup', (event) => {
  if (isInventoryOpen()) return;
  handleKey(event, false);
});

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

renderer.domElement.addEventListener('click', (event) => {
  if (isInventoryOpen()) return;
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

  if (isInventoryOpen()) {
    clearPrompt();
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
          inv: me.inv,
          invCap: me.invCap,
          invSlots: me.invSlots,
          invStackMax: me.invStackMax,
          score: me.score,
          dead: me.dead,
          respawnAt: me.respawnAt ?? 0,
        }
      : null,
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
