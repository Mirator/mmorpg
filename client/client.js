import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const app = document.getElementById('app');
const statusEl = document.getElementById('status');
const fpsEl = document.getElementById('fps');
const coordsEl = document.getElementById('coords');

const MAP_SIZE = 8000;
const GRID_DIVS = 400;
const INTERP_DELAY_MS = 100;
const MAX_SNAPSHOT_AGE_MS = 2000;
const MAX_SNAPSHOTS = 60;
const CAMERA_LERP_SPEED = 5;
const CLIENT_SPEED = 3;

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

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE),
  new THREE.MeshStandardMaterial({ color: 0x2a3b2f, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const grid = new THREE.GridHelper(MAP_SIZE, GRID_DIVS, 0x2b3b52, 0x1a2636);
scene.add(grid);

const targetMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.25, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xffcc00 })
);
targetMarker.visible = false;
scene.add(targetMarker);

const playerMeshes = new Map();
let myId = null;

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

function normalize2(x, z) {
  const len = Math.hypot(x, z);
  if (len === 0) return { x: 0, z: 0 };
  return { x: x / len, z: z / len };
}

function applyWASD(input = {}) {
  const forward = normalize2(-1, -1);
  const right = normalize2(1, -1);

  let x = 0;
  let z = 0;

  if (input.w) {
    x += forward.x;
    z += forward.z;
  }
  if (input.s) {
    x -= forward.x;
    z -= forward.z;
  }
  if (input.d) {
    x += right.x;
    z += right.z;
  }
  if (input.a) {
    x -= right.x;
    z -= right.z;
  }

  return normalize2(x, z);
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
  const t = performance.now();
  snapshots.push({ t, players });
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

function updateLocalPrediction(dt, serverPos, input) {
  if (!serverPos) return null;

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
    predictedLocalPos.x += dir.x * CLIENT_SPEED * dt;
    predictedLocalPos.z += dir.z * CLIENT_SPEED * dt;
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

ws.addEventListener('open', () => {
  statusEl.textContent = 'connected';
  send({ type: 'hello' });
});

ws.addEventListener('close', () => {
  statusEl.textContent = 'disconnected';
});

ws.addEventListener('message', (event) => {
  let msg;
  try {
    msg = JSON.parse(event.data);
  } catch {
    return;
  }

  if (msg.type === 'welcome') {
    myId = msg.id;
    if (msg.snapshot?.players) {
      pushSnapshot(msg.snapshot.players);
    }
    return;
  }

  if (msg.type === 'state' && msg.players) {
    pushSnapshot(msg.players);
  }
});

const keys = { w: false, a: false, s: false, d: false };

function sendInput() {
  seq += 1;
  send({ type: 'input', keys: { ...keys }, seq });
}

function handleKey(event, isDown) {
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

window.addEventListener('keydown', (event) => handleKey(event, true));
window.addEventListener('keyup', (event) => handleKey(event, false));

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

renderer.domElement.addEventListener('click', (event) => {
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

function animate() {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrameTime) / 1000);
  lastFrameTime = now;

  const serverLocalPos = renderInterpolatedPlayers(now);
  const predictedPos = updateLocalPrediction(dt, serverLocalPos, keys);
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
  requestAnimationFrame(animate);
}

animate();
