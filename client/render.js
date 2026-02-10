import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { initWorld, updateResources, updateMobs, animateWorld } from './world.js';
import { createEffectsSystem } from './effects.js';

const CAMERA_LERP_SPEED = 5;
const FRUSTUM_SIZE = 24;

export function createRenderSystem({ app }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f14);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  } catch (err) {
    console.error('WebGL unavailable, falling back to canvas renderer.', err);
    const canvas = document.createElement('canvas');
    renderer = {
      domElement: canvas,
      setPixelRatio: () => {},
      setSize: (width, height) => {
        canvas.width = width;
        canvas.height = height;
      },
      render: () => {},
    };
  }
  app.appendChild(renderer.domElement);

  const cameraOffset = new THREE.Vector3(20, 20, 20);
  const cameraTarget = new THREE.Vector3();
  const cameraDesired = new THREE.Vector3();

  let camera;

  function createCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.OrthographicCamera(
      (-FRUSTUM_SIZE * aspect) / 2,
      (FRUSTUM_SIZE * aspect) / 2,
      FRUSTUM_SIZE / 2,
      -FRUSTUM_SIZE / 2,
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

  const targetRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.85, 0.08, 12, 32),
    new THREE.MeshStandardMaterial({
      color: 0xfff2a8,
      emissive: 0xffcc00,
      emissiveIntensity: 0.5,
    })
  );
  targetRing.rotation.x = Math.PI / 2;
  targetRing.position.y = 0.1;
  targetRing.visible = false;
  scene.add(targetRing);

  const playerMeshes = new Map();
  let myId = null;
  let worldState = null;
  const effectsSystem = createEffectsSystem(scene);
  const mobRaycaster = new THREE.Raycaster();

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = (-FRUSTUM_SIZE * aspect) / 2;
    camera.right = (FRUSTUM_SIZE * aspect) / 2;
    camera.top = FRUSTUM_SIZE / 2;
    camera.bottom = -FRUSTUM_SIZE / 2;
    camera.updateProjectionMatrix();
  }

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
    mesh.userData.playerId = id;
    playerMeshes.set(id, mesh);
    scene.add(mesh);
    return mesh;
  }

  function setLocalPlayerId(id) {
    myId = id;
    const mesh = playerMeshes.get(myId);
    if (mesh) {
      mesh.material.color.set(0x4da3ff);
    }
  }

  function syncPlayers(playerIds) {
    const seen = new Set(playerIds);
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
    if (myId) {
      const mesh = playerMeshes.get(myId);
      if (mesh) {
        mesh.material.color.set(0x4da3ff);
      }
    }
  }

  function updatePlayerPositions(positions) {
    for (const [id, pos] of Object.entries(positions)) {
      const mesh = ensurePlayerMesh(id);
      mesh.position.set(pos.x, 1, pos.z);
    }
  }

  function setTargetMarker(pos) {
    if (!pos) {
      targetMarker.visible = false;
      return;
    }
    targetMarker.position.set(pos.x, 0.15, pos.z);
    targetMarker.visible = true;
  }

  function setTargetRing(pos) {
    if (!pos) {
      targetRing.visible = false;
      return;
    }
    targetRing.position.set(pos.x, 0.1, pos.z);
    targetRing.visible = true;
  }

  function pickMob(ndc) {
    if (!worldState?.mobMeshes) return null;
    const meshes = Array.from(worldState.mobMeshes.values());
    if (!meshes.length) return null;
    mobRaycaster.setFromCamera(ndc, camera);
    const hits = mobRaycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const hit = hits[0]?.object;
    return hit?.userData?.mobId ?? null;
  }

  function pickTarget(ndc) {
    const targetMeshes = [];
    if (worldState?.mobMeshes) {
      targetMeshes.push(...worldState.mobMeshes.values());
    }
    if (worldState?.vendorMeshes) {
      targetMeshes.push(...worldState.vendorMeshes.values());
    }
    if (playerMeshes.size) {
      targetMeshes.push(...playerMeshes.values());
    }
    if (!targetMeshes.length) return null;
    mobRaycaster.setFromCamera(ndc, camera);
    const hits = mobRaycaster.intersectObjects(targetMeshes, true);
    for (const hit of hits) {
      let node = hit.object;
      while (node) {
        if (node.userData?.mobId) {
          return { kind: 'mob', id: node.userData.mobId };
        }
        if (node.userData?.vendorId) {
          return { kind: 'vendor', id: node.userData.vendorId };
        }
        if (node.userData?.playerId) {
          if (node.userData.playerId !== myId) {
            return { kind: 'player', id: node.userData.playerId };
          }
        }
        node = node.parent;
      }
    }
    return null;
  }

  function projectToScreen(pos) {
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const vector = new THREE.Vector3(pos.x, 1, pos.z);
    vector.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((vector.x + 1) / 2) * rect.width,
      y: rect.top + ((-vector.y + 1) / 2) * rect.height,
    };
  }

  function updateWorld(config) {
    if (worldState?.group) {
      scene.remove(worldState.group);
    }
    worldState = initWorld(scene, config);
    return worldState;
  }

  function updateWorldResources(resources) {
    updateResources(worldState, resources);
  }

  function updateWorldMobs(mobs) {
    updateMobs(worldState, mobs);
  }

  function animateWorldMeshes(now) {
    animateWorld(worldState, now);
  }

  function updateEffects(now) {
    effectsSystem.update(now);
  }

  function updateCamera(viewPos, dt) {
    if (!viewPos) return null;
    cameraDesired.set(
      viewPos.x + cameraOffset.x,
      cameraOffset.y,
      viewPos.z + cameraOffset.z
    );
    const lerpFactor = 1 - Math.exp(-CAMERA_LERP_SPEED * dt);
    camera.position.lerp(cameraDesired, lerpFactor);
    cameraTarget.set(viewPos.x, 0, viewPos.z);
    camera.lookAt(cameraTarget);
    camera.updateMatrixWorld();
    return cameraTarget;
  }

  function renderFrame() {
    renderer.render(scene, camera);
  }

  return {
    scene,
    renderer,
    camera,
    resize,
    setLocalPlayerId,
    syncPlayers,
    updatePlayerPositions,
    setTargetMarker,
    setTargetRing,
    pickTarget,
    projectToScreen,
    updateWorld,
    updateWorldResources,
    updateWorldMobs,
    animateWorldMeshes,
    updateEffects,
    updateCamera,
    renderFrame,
    spawnSlash: (from, to, durationMs, now) =>
      effectsSystem.spawnSlash({ from, to, durationMs, now }),
    spawnProjectile: (from, to, durationMs, now) =>
      effectsSystem.spawnProjectile({ from, to, durationMs, now }),
  };
}
