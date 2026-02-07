import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const app = document.getElementById('app');
const statusEl = document.getElementById('status');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
app.appendChild(renderer.domElement);

const frustumSize = 24;
let camera;

function createCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  camera = new THREE.OrthographicCamera(
    (-frustumSize * aspect) / 2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    -frustumSize / 2,
    0.1,
    1000
  );
  camera.position.set(20, 20, 20);
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
  new THREE.PlaneGeometry(80, 80),
  new THREE.MeshStandardMaterial({ color: 0x2a3b2f, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const grid = new THREE.GridHelper(80, 40, 0x2b3b52, 0x1a2636);
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

function applySnapshot(players) {
  const seen = new Set(Object.keys(players));
  for (const [id, p] of Object.entries(players)) {
    const mesh = ensurePlayerMesh(id);
    mesh.position.set(p.x, 1, p.z);
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
      applySnapshot(msg.snapshot.players);
    }
    return;
  }

  if (msg.type === 'state' && msg.players) {
    applySnapshot(msg.players);
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

function animate() {
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
