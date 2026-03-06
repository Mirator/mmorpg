// @ts-check
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { initWorld, updateResources, updateMobs, updateCorpses, animateWorld } from './world.js';
import {
  ASSET_PATHS,
  assemblePlayerModel,
  loadPlayerAnimations,
  normalizeToHeight,
  pickClips,
} from './assets.js';
import { createEffectsSystem } from './effects.js';
import { showErrorOverlay } from './error-overlay.js';
import {
  buildEquipmentVisualSignature,
  buildEquipmentVisualState,
  normalizeEquipmentVisualState,
} from './playerVisual.js';

const CAMERA_LERP_SPEED = 5;
const FRUSTUM_SIZE = 24;
const CULL_DISTANCE = 100;
const VISIBILITY_UPDATE_DISTANCE = 0.5;
const VISIBILITY_UPDATE_INTERVAL_MS = 150;

export function createRenderSystem(/** @type {any} */ { app }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f14);

  /** @type {any} */
  let renderer;
  let webGLReady = true;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  } catch (err) {
    console.error('WebGL unavailable.', err);
    webGLReady = false;
    const fallbackDiv = document.createElement('div');
    fallbackDiv.style.width = '100%';
    fallbackDiv.style.height = '100%';
    renderer = {
      domElement: fallbackDiv,
      setPixelRatio: () => {},
      setSize: () => {},
      render: () => {},
    };
    app.appendChild(renderer.domElement);
    showErrorOverlay({
      title: 'Graphics unavailable',
      message:
        'WebGL is not supported or disabled. Try updating your browser or enabling hardware acceleration.',
      actions: [
        { label: 'Refresh page', onClick: () => window.location.reload() },
      ],
    });
  }
  if (webGLReady) {
    app.appendChild(renderer.domElement);

    renderer.domElement.addEventListener(
      'webglcontextlost',
      (/** @type {any} */ event) => {
        event.preventDefault();
        webGLReady = false;
        showErrorOverlay({
          title: 'Graphics were reset',
          message: 'The game will need to reload.',
          actions: [
            { label: 'Refresh page', onClick: () => window.location.reload() },
          ],
        });
      },
      false
    );

    renderer.domElement.addEventListener('webglcontextrestored', () => {
      webGLReady = true;
    }, false);
  }

  const cameraOffset = new THREE.Vector3(20, 20, 20);
  const cameraTarget = new THREE.Vector3();
  const cameraDesired = new THREE.Vector3();
  const vendorLabelOverlapEl = document.getElementById('overlay');

  /** @type {any} */
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
  const playerControllers = new Map();
  let /** @type {any} */ playerClipsPromise = null;
  let /** @type {any} */ myId = null;
  let /** @type {any} */ worldState = null;
  const effectsSystem = createEffectsSystem(scene);
  const mobRaycaster = new THREE.Raycaster();
  mobRaycaster.layers.enable(1);

  let /** @type {any} */ placementIndicator = null;
  let placementIndicatorRadius = 2.5;
  let lastVisibilityAt = -Infinity;
  let lastVisibilityX = Number.NaN;
  let lastVisibilityY = Number.NaN;
  let lastVisibilityZ = Number.NaN;

  function setPlacementIndicator(/** @type {any} */ visible, /** @type {any} */ radius = 2.5, /** @type {any} */ placementRange = 10) {
    if (!visible) {
      if (placementIndicator) {
        scene.remove(placementIndicator);
        placementIndicator.geometry.dispose();
        placementIndicator.material.dispose();
        placementIndicator = null;
      }
      return;
    }
    placementIndicatorRadius = radius;
    if (placementIndicator) {
      placementIndicator.geometry.dispose();
      placementIndicator.geometry = new THREE.RingGeometry(radius * 0.8, radius, 32);
    } else {
      const geometry = new THREE.RingGeometry(radius * 0.8, radius, 32);
      const material = new THREE.MeshBasicMaterial({
        color: 0x66cc44,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
      });
      placementIndicator = new THREE.Mesh(geometry, material);
      placementIndicator.rotation.x = -Math.PI / 2;
      placementIndicator.position.y = 0.05;
    }
    if (!scene.children.includes(placementIndicator)) {
      scene.add(placementIndicator);
    }
  }

  function updatePlacementIndicator(/** @type {any} */ pos, /** @type {any} */ isValid) {
    if (!placementIndicator || !pos) return;
    placementIndicator.position.set(pos.x, 0.05, pos.z);
    if (placementIndicator.material) {
      placementIndicator.material.color.setHex(isValid ? 0x66cc44 : 0xcc4444);
    }
  }

  function resize() {
    if (!webGLReady) return;
    renderer.setSize(window.innerWidth, window.innerHeight);
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = (-FRUSTUM_SIZE * aspect) / 2;
    camera.right = (FRUSTUM_SIZE * aspect) / 2;
    camera.top = FRUSTUM_SIZE / 2;
    camera.bottom = -FRUSTUM_SIZE / 2;
    camera.updateProjectionMatrix();
  }

  function createPlayerMesh(/** @type {any} */ isLocal) {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const material = new THREE.MeshStandardMaterial({
      color: isLocal ? 0x4da3ff : 0xff7b2f,
    });
    const placeholder = new THREE.Mesh(geometry, material);
    placeholder.position.y = 1;
    group.add(placeholder);
    group.userData.placeholder = placeholder;
    group.userData.visualState = null;
    group.userData.visualSignature = null;
    group.userData.hydrationToken = 0;
    group.userData.hydrating = false;
    group.userData.needsRehydrate = false;
    return group;
  }

  function ensurePlayerMesh(/** @type {any} */ id) {
    if (playerMeshes.has(id)) return playerMeshes.get(id);
    const mesh = createPlayerMesh(id === myId);
    mesh.userData.playerId = id;
    playerMeshes.set(id, mesh);
    scene.add(mesh);
    return mesh;
  }

  function setLocalPlayerId(/** @type {any} */ id) {
    myId = id;
    const mesh = playerMeshes.get(myId);
    if (mesh?.userData?.placeholder?.material?.color) {
      mesh.userData.placeholder.material.color.set(0x4da3ff);
    }
  }

  function syncPlayers(/** @type {any} */ playerIds) {
    const seen = new Set(playerIds);
    for (const id of seen) {
      ensurePlayerMesh(id);
    }
    for (const id of playerMeshes.keys()) {
      if (!seen.has(id)) {
        const mesh = playerMeshes.get(id);
        scene.remove(mesh);
        playerMeshes.delete(id);
        const controller = playerControllers.get(id);
        if (controller?.mixer) controller.mixer.stopAllAction();
        playerControllers.delete(id);
      }
    }
    if (myId) {
      const mesh = playerMeshes.get(myId);
      if (mesh?.userData?.placeholder?.material?.color) {
        mesh.userData.placeholder.material.color.set(0x4da3ff);
      }
    }
  }

  function resolveVisualStateForPlayer(
    /** @type {string} */ id,
    /** @type {Record<string, any> | null | undefined} */ playerStates,
    /** @type {string | null | undefined} */ localPlayerId,
    /** @type {any} */ localPlayerState
  ) {
    if (localPlayerId && id === localPlayerId && localPlayerState) {
      return buildEquipmentVisualState(localPlayerState.equipment);
    }
    const source = playerStates?.[id];
    if (source?.visual) return normalizeEquipmentVisualState(source.visual);
    if (source?.equipment) return buildEquipmentVisualState(source.equipment);
    return normalizeEquipmentVisualState(null);
  }

  function syncPlayerVisuals(
    /** @type {Record<string, any> | null | undefined} */ playerStates,
    /** @type {{ localPlayerId?: string | null, localPlayerState?: any }} */ options = {}
  ) {
    if (!playerStates || typeof playerStates !== 'object') return;
    const localPlayerId = options.localPlayerId ?? null;
    const localPlayerState = options.localPlayerState ?? null;
    for (const id of Object.keys(playerStates)) {
      const mesh = ensurePlayerMesh(id);
      if (!mesh?.userData) continue;
      const visualState = resolveVisualStateForPlayer(id, playerStates, localPlayerId, localPlayerState);
      const visualSignature = buildEquipmentVisualSignature(visualState);
      if (mesh.userData.visualSignature === visualSignature && !mesh.userData.needsRehydrate) continue;

      mesh.userData.visualState = visualState;
      mesh.userData.nextVisualSignature = visualSignature;
      mesh.userData.needsRehydrate = true;

      if (!mesh.userData.hydrating) {
        hydratePlayerMesh(id, mesh).catch((/** @type {any} */ err) => {
          console.warn('[render] Failed to load player model:', err);
        });
      }
    }
  }

  function updatePlayerPositions(/** @type {any} */ positions, /** @type {any} */ options = {}) {
    const { localPlayerId, inputKeys, playerStates } = options;
    const hasMovementInput = inputKeys && (inputKeys.w || inputKeys.a || inputKeys.s || inputKeys.d);

    for (const [id, pos] of Object.entries(positions)) {
      const mesh = ensurePlayerMesh(id);
      const nextX = pos.x;
      const nextY = pos.y ?? 0;
      const nextZ = pos.z;
      const facingState = playerStates?.[id];
      const dirX = Number(facingState?.dirX);
      const dirZ = Number(facingState?.dirZ);
      const hasFacingDir =
        Number.isFinite(dirX) &&
        Number.isFinite(dirZ) &&
        Math.hypot(dirX, dirZ) > 0.0001;
      if (hasFacingDir) {
        mesh.rotation.y = Math.atan2(dirX, dirZ);
      } else if (Number.isFinite(mesh.userData.lastX) && Number.isFinite(mesh.userData.lastZ)) {
        const dx = nextX - mesh.userData.lastX;
        const dz = nextZ - mesh.userData.lastZ;
        const distSq = dx * dx + dz * dz;
        const isLocalWithNoInput = (id === localPlayerId) && !hasMovementInput;
        if (distSq > 0.0004 && !isLocalWithNoInput) {
          mesh.rotation.y = Math.atan2(dx, dz);
        }
      }
      mesh.position.set(nextX, nextY, nextZ);
      mesh.userData.lastX = nextX;
      mesh.userData.lastY = nextY;
      mesh.userData.lastZ = nextZ;
    }
  }

  function setTargetMarker(/** @type {any} */ pos) {
    if (!pos) {
      targetMarker.visible = false;
      return;
    }
    targetMarker.position.set(pos.x, (pos.y ?? 0) + 0.15, pos.z);
    targetMarker.visible = true;
  }

  function setTargetRing(/** @type {any} */ pos) {
    if (!pos) {
      targetRing.visible = false;
      return;
    }
    targetRing.position.set(pos.x, (pos.y ?? 0) + 0.1, pos.z);
    targetRing.visible = true;
  }

  function pickMob(/** @type {any} */ ndc) {
    if (!worldState?.mobMeshes) return null;
    const meshes = Array.from(worldState.mobMeshes.values());
    if (!meshes.length) return null;
    mobRaycaster.setFromCamera(ndc, camera);
    const hits = mobRaycaster.intersectObjects(meshes, true);
    if (!hits.length) return null;
    let node = hits[0]?.object ?? null;
    while (node) {
      if (node.userData?.mobId) return node.userData.mobId;
      node = node.parent;
    }
    return null;
  }

  function pickTarget(/** @type {any} */ ndc) {
    const /** @type {any} */ targetMeshes = [];
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

  function projectToScreen(/** @type {any} */ pos) {
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const vector = new THREE.Vector3(pos.x, pos.y ?? 1, pos.z);
    vector.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((vector.x + 1) / 2) * rect.width,
      y: rect.top + ((-vector.y + 1) / 2) * rect.height,
    };
  }

  function updateWorld(/** @type {any} */ config) {
    if (worldState?.group) {
      worldState.isActive = false;
      scene.remove(worldState.group);
    }
    worldState = initWorld(scene, config);
    lastVisibilityAt = -Infinity;
    lastVisibilityX = Number.NaN;
    lastVisibilityY = Number.NaN;
    lastVisibilityZ = Number.NaN;
    if (cameraTarget) performVisibilityPass(cameraTarget);
    return worldState;
  }

  function updateWorldResources(/** @type {any} */ resources) {
    updateResources(worldState, resources);
  }

  function updateWorldMobs(/** @type {any} */ mobs) {
    updateMobs(worldState, mobs);
  }

  function updateWorldCorpses(/** @type {any} */ corpses) {
    updateCorpses(worldState, corpses);
  }

  function animateWorldMeshes(/** @type {any} */ now) {
    animateWorld(worldState, now);
  }

  function updateAnimations(
    /** @type {any} */ dt,
    /** @type {any} */ now,
    /** @type {any} */ {
      deadPlayerIds = new Set(),
      harvestingById = new Set(),
      localPlayerId = null,
      inputKeys = null,
      playerStates = null,
    } = {}
  ) {
    updateControllerMap(playerControllers, playerMeshes, dt, now, {
      deadPlayerIds,
      harvestingById,
      localPlayerId,
      inputKeys,
      playerStates,
    });
    if (worldState?.mobControllers && worldState?.mobMeshes) {
      updateControllerMap(worldState.mobControllers, worldState.mobMeshes, dt, now, {
        deadPlayerIds,
        harvestingById,
      });
    }
    if (worldState?.vendorControllers && worldState?.vendorMeshes) {
      updateControllerMap(worldState.vendorControllers, worldState.vendorMeshes, dt, now, {
        deadPlayerIds,
        harvestingById,
      });
    }
  }

  function triggerAttack(/** @type {any} */ id, /** @type {any} */ now, /** @type {any} */ durationMs) {
    if (!id) return;
    const playerController = playerControllers.get(id);
    const mobController = worldState?.mobControllers?.get?.(id);
    const controller = playerController ?? mobController;
    if (!controller) return;
    controller.attackUntil = Math.max(controller.attackUntil ?? 0, now + (durationMs ?? 200));
    if (controller.actions?.attack) {
      playAction(controller, 'attack');
    }
  }

  function updateEffects(/** @type {any} */ now) {
    effectsSystem.update(now);
  }

  const cameraLookDirection = new THREE.Vector3(-1, -1, -1).normalize();

  function updateCamera(/** @type {any} */ viewPos, /** @type {any} */ dt) {
    if (!viewPos) return null;
    cameraDesired.set(
      viewPos.x + cameraOffset.x,
      cameraOffset.y,
      viewPos.z + cameraOffset.z
    );
    const lerpFactor = 1 - Math.exp(-CAMERA_LERP_SPEED * dt);
    camera.position.lerp(cameraDesired, lerpFactor);
    cameraTarget.set(viewPos.x, viewPos.y ?? 0, viewPos.z);
    camera.lookAt(
      camera.position.x + cameraLookDirection.x * 100,
      camera.position.y + cameraLookDirection.y * 100,
      camera.position.z + cameraLookDirection.z * 100
    );
    camera.updateMatrixWorld();
    return cameraTarget;
  }

  const visibilityCheckPos = new THREE.Vector3();
  const labelProjectionPos = new THREE.Vector3();

  function syncVendorLabelVisibility(/** @type {any} */ vendorMesh, /** @type {any} */ overlayRect) {
    const label = vendorMesh?.userData?.nameSprite;
    if (!label) return;
    label.visible = !!vendorMesh.visible;
    if (!label.visible) return;

    if (!overlayRect?.width || !overlayRect?.height) return;

    label.getWorldPosition(labelProjectionPos);
    const screenPos = projectToScreen(labelProjectionPos);
    const padding = 18;
    const insideOverlaySafeZone =
      screenPos.x >= overlayRect.left - padding &&
      screenPos.x <= overlayRect.right + padding &&
      screenPos.y >= overlayRect.top - padding &&
      screenPos.y <= overlayRect.bottom + padding;
    label.visible = !insideOverlaySafeZone;
  }

  function performVisibilityPass(/** @type {any} */ cameraTargetVec) {
    if (!cameraTargetVec || !worldState) return;
    const cullDistSq = CULL_DISTANCE * CULL_DISTANCE;
    let overlayRect = null;
    if (vendorLabelOverlapEl instanceof HTMLElement) {
      const nextRect = vendorLabelOverlapEl.getBoundingClientRect();
      if (nextRect.width && nextRect.height) {
        overlayRect = nextRect;
      }
    }

    const setVisibleByDistance = (/** @type {any} */ obj) => {
      obj.getWorldPosition(visibilityCheckPos);
      obj.visible = visibilityCheckPos.distanceToSquared(cameraTargetVec) <= cullDistSq;
    };

    for (const child of worldState.envGroup.children) {
      if (child.isLOD) child.update(camera);
      setVisibleByDistance(child);
    }
    for (const mesh of worldState.obstacleMeshes) {
      setVisibleByDistance(mesh);
    }
    for (const mesh of worldState.resourceMeshes.values()) {
      setVisibleByDistance(mesh);
    }
    for (const mesh of worldState.corpseMeshes?.values?.() ?? []) {
      setVisibleByDistance(mesh);
    }
    for (const mesh of worldState.mobMeshes.values()) {
      setVisibleByDistance(mesh);
    }
    for (const mesh of worldState.vendorMeshes.values()) {
      setVisibleByDistance(mesh);
      syncVendorLabelVisibility(mesh, overlayRect);
    }
    for (const [id, mesh] of playerMeshes) {
      if (id === myId) {
        mesh.visible = true;
      } else {
        setVisibleByDistance(mesh);
      }
    }
  }

  function updateVisibility(/** @type {any} */ cameraTargetVec, /** @type {any} */ now = performance.now()) {
    if (!cameraTargetVec || !worldState) return;
    const dx = cameraTargetVec.x - lastVisibilityX;
    const dy = cameraTargetVec.y - lastVisibilityY;
    const dz = cameraTargetVec.z - lastVisibilityZ;
    const movedEnough =
      !Number.isFinite(lastVisibilityX) ||
      (dx * dx + dy * dy + dz * dz) >= VISIBILITY_UPDATE_DISTANCE * VISIBILITY_UPDATE_DISTANCE;
    if (!movedEnough && now - lastVisibilityAt < VISIBILITY_UPDATE_INTERVAL_MS) {
      return;
    }
    lastVisibilityAt = now;
    lastVisibilityX = cameraTargetVec.x;
    lastVisibilityY = cameraTargetVec.y;
    lastVisibilityZ = cameraTargetVec.z;
    performVisibilityPass(cameraTargetVec);
  }

  function renderFrame() {
    if (!webGLReady) return;
    renderer.render(scene, camera);
  }

  function getPlayerClips() {
    if (!playerClipsPromise) {
      const overrides = ASSET_PATHS.playerModel
        ? {
            idleNames: ['Idle_Loop', 'Idle_Talking_Loop', 'Idle_No_Loop', 'Idle_FoldArms_Loop'],
            walkNames: ['Walk_Loop', 'Walk_Formal_Loop'],
            walkKeywords: ['walk'],
            walkFallback: null,
            sprintNames: ['Sprint_Loop', 'Jog_Fwd_Loop'],
            sprintKeywords: ['sprint', 'jog', 'run'],
            sprintFallback: null,
            attackNames: ['Sword_Attack', 'Punch_Jab', 'Punch_Cross'],
            attackKeywords: ['attack', 'slash', 'swing', 'punch'],
            interactNames: ['Interact', 'PickUp_Table', 'Fixing_Kneeling'],
            interactKeywords: ['interact', 'pickup', 'fix'],
            deathNames: ['Death'],
            deathKeywords: ['death'],
          }
        : {
            idleNames: ['Idle_Loop', 'Idle_No_Loop'],
            walkNames: ['Walk_Loop', 'Walk_Formal_Loop'],
            walkKeywords: ['walk'],
            walkFallback: null,
            sprintNames: ['Sprint_Loop', 'Jog_Fwd_Loop'],
            sprintKeywords: ['sprint', 'jog', 'run'],
            sprintFallback: null,
            attackNames: ['Sword_Attack', 'Punch_Jab', 'Punch_Cross'],
            attackKeywords: ['attack', 'slash', 'swing', 'punch'],
            interactNames: ['Interact', 'PickUp_Table', 'Fixing_Kneeling'],
            interactKeywords: ['interact', 'pickup', 'fix'],
            deathNames: ['Death'],
            deathKeywords: ['death'],
          };

      playerClipsPromise = loadPlayerAnimations().then((/** @type {any} */ clips) => pickClips(clips, overrides));
    }
    return playerClipsPromise;
  }

  async function hydratePlayerMesh(/** @type {any} */ id, /** @type {any} */ mesh) {
    if (!mesh) return;
    if (!mesh.userData) mesh.userData = {};

    const token = Number(mesh.userData.hydrationToken ?? 0) + 1;
    mesh.userData.hydrationToken = token;
    mesh.userData.hydrating = true;
    mesh.userData.needsRehydrate = false;

    const visualState = normalizeEquipmentVisualState(mesh.userData.visualState);
    const requestedSignature =
      typeof mesh.userData.nextVisualSignature === 'string'
        ? mesh.userData.nextVisualSignature
        : buildEquipmentVisualSignature(visualState);

    try {
      const [model, clipSet] = await Promise.all([
        assemblePlayerModel(visualState),
        getPlayerClips(),
      ]);
      if (!model || !clipSet) return;
      if (!playerMeshes.has(id)) return;
      if (mesh.userData.hydrationToken !== token) return;

      normalizeToHeight(model, 2.0);
      mesh.clear();
      mesh.add(model);
      mesh.userData.visualSignature = requestedSignature;

      const previousController = playerControllers.get(id);
      if (previousController?.mixer) previousController.mixer.stopAllAction();
      playerControllers.delete(id);

      if (clipSet.all.length) {
        const mixer = new THREE.AnimationMixer(model);
        const actions = createActions(mixer, clipSet);
        const walkCycle = buildWalkCycle(model);
        /** @type {{ mixer: any, actions: any, active: 'idle' | 'walk' | 'sprint' | 'attack' | 'interact' | 'death' | null, attackUntil: number, locomotionUntil: number, lastX: number, lastY: number, lastZ: number, walkCycle: any }} */
        const controller = {
          mixer,
          actions,
          active: null,
          attackUntil: 0,
          locomotionUntil: 0,
          lastX: mesh.position.x,
          lastY: mesh.position.y,
          lastZ: mesh.position.z,
          walkCycle,
        };
        if (actions.idle) {
          actions.idle.play();
          controller.active = 'idle';
        }
        playerControllers.set(id, controller);
      }
    } finally {
      if (!mesh.userData || mesh.userData.hydrationToken !== token) return;
      mesh.userData.hydrating = false;
      if (mesh.userData.needsRehydrate) {
        hydratePlayerMesh(id, mesh).catch((/** @type {any} */ err) => {
          console.warn('[render] Failed to refresh player model:', err);
        });
      }
    }
  }

  function createActions(/** @type {any} */ mixer, /** @type {any} */ clipSet) {
    const /** @type {any} */ actions = {
      idle: clipSet.idle ? mixer.clipAction(clipSet.idle) : null,
      walk: clipSet.walk ? mixer.clipAction(clipSet.walk) : null,
      sprint: clipSet.sprint ? mixer.clipAction(clipSet.sprint) : null,
      attack: clipSet.attack ? mixer.clipAction(clipSet.attack) : null,
      interact: clipSet.interact
        ? mixer.clipAction(clipSet.interact)
        : clipSet.attack
          ? mixer.clipAction(clipSet.attack)
          : null,
      death: clipSet.death ? mixer.clipAction(clipSet.death) : null,
    };
    if (actions.attack) {
      actions.attack.setLoop(THREE.LoopOnce, 1);
      actions.attack.clampWhenFinished = true;
    }
    if (actions.interact) {
      actions.interact.setLoop(THREE.LoopRepeat, Infinity);
    }
    if (actions.death) {
      actions.death.setLoop(THREE.LoopOnce, 1);
      actions.death.clampWhenFinished = true;
    }
    return actions;
  }

  function buildWalkCycle(/** @type {any} */ model) {
    /** @type {any} */
    let skeleton = null;
    model.traverse((/** @type {any} */ node) => {
      if (!skeleton && node?.isSkinnedMesh && node.skeleton) {
        skeleton = node.skeleton;
      }
    });
    if (!skeleton) return null;

    const /** @type {any} */ names = [
      'upperarm_l',
      'upperarm_r',
      'thigh_l',
      'thigh_r',
      'calf_l',
      'calf_r',
      'spine_01',
    ];

    const /** @type {any} */ bones = {};
    const /** @type {any} */ rest = {};
    for (const name of names) {
      const bone = skeleton.getBoneByName?.(name) ?? null;
      if (bone) {
        bones[name] = bone;
        rest[name] = bone.quaternion.clone();
      }
    }

    if (!Object.keys(bones).length) return null;

    return {
      bones,
      rest,
      phase: Math.random() * Math.PI * 2,
      root: model,
      wasWalking: false,
      axisX: new THREE.Vector3(1, 0, 0),
      axisZ: new THREE.Vector3(0, 0, 1),
      tmpQuat: new THREE.Quaternion(),
    };
  }

  function resetWalkCycle(/** @type {any} */ walkCycle) {
    if (!walkCycle) return;
    for (const [name, bone] of Object.entries(walkCycle.bones)) {
      const rest = walkCycle.rest[name];
      if (rest) bone.quaternion.copy(rest);
    }
    if (walkCycle.root) {
      walkCycle.root.position.y = 0;
    }
  }

  function applyWalkCycle(/** @type {any} */ walkCycle, /** @type {any} */ now, /** @type {any} */ speed) {
    if (!walkCycle) return;
    const intensity = Math.min(1, speed / 2);
    const t = now * 0.006 + walkCycle.phase;
    const swing = Math.sin(t);
    const lift = Math.cos(t);

    const armSwing = 0.55 * intensity * swing;
    const legSwing = 0.7 * intensity * swing;
    const calfSwing = 0.4 * intensity * Math.max(0, -swing);
    const spineLean = 0.1 * intensity * Math.sin(t + Math.PI / 2);

    const applyRot = (/** @type {any} */ boneName, /** @type {any} */ angle, /** @type {any} */ axis) => {
      const bone = walkCycle.bones[boneName];
      if (!bone) return;
      const rest = walkCycle.rest[boneName];
      if (!rest) return;
      walkCycle.tmpQuat.setFromAxisAngle(axis, angle);
      bone.quaternion.copy(rest).multiply(walkCycle.tmpQuat);
    };

    applyRot('upperarm_l', armSwing, walkCycle.axisX);
    applyRot('upperarm_r', -armSwing, walkCycle.axisX);
    applyRot('thigh_l', -legSwing, walkCycle.axisX);
    applyRot('thigh_r', legSwing, walkCycle.axisX);
    applyRot('calf_l', calfSwing, walkCycle.axisX);
    applyRot('calf_r', -calfSwing, walkCycle.axisX);
    applyRot('spine_01', spineLean, walkCycle.axisZ);

    if (walkCycle.root) {
      walkCycle.root.position.y = 0.05 * intensity * Math.max(0, lift);
    }
    walkCycle.wasWalking = true;
  }

  function playAction(/** @type {any} */ controller, /** @type {any} */ name) {
    if (!controller?.actions) return;
    const next = controller.actions[name];
    if (!next) return;
    if (controller.active === name) return;
    const prev = controller.active ? controller.actions[controller.active] : null;
    if (prev === next) {
      controller.active = name;
      return;
    }
    next.reset();
    next.fadeIn(0.15);
    next.play();
    if (prev) {
      prev.fadeOut(0.15);
    }
    controller.active = name;
  }

  const WALK_HYSTERESIS_MS = 180;

  function updateControllerMap(
    /** @type {any} */ controllers,
    /** @type {any} */ meshes,
    /** @type {any} */ dt,
    /** @type {any} */ now,
    /** @type {any} */ options = {}
  ) {
    if (!controllers || !meshes) return;
    const deadPlayerIds = options.deadPlayerIds ?? new Set();
    const harvestingById = options.harvestingById ?? new Set();
    const localPlayerId = options.localPlayerId ?? null;
    const inputKeys = options.inputKeys ?? null;
    const playerStates = options.playerStates ?? null;
    for (const [id, controller] of controllers.entries()) {
      const mesh = meshes.get(id);
      if (!mesh) continue;
      const dx = mesh.position.x - (controller.lastX ?? mesh.position.x);
      const dy = mesh.position.y - (controller.lastY ?? mesh.position.y);
      const dz = mesh.position.z - (controller.lastZ ?? mesh.position.z);
      const speed = Math.hypot(dx, dy, dz) / Math.max(0.001, dt);
      controller.lastX = mesh.position.x;
      controller.lastY = mesh.position.y;
      controller.lastZ = mesh.position.z;
      const isDead = deadPlayerIds && deadPlayerIds.has(id);
      const isHarvesting = harvestingById && harvestingById.has(id);
      const isAttacking = controller.actions?.attack && controller.attackUntil && now < controller.attackUntil;
      const wantsLocomotion = speed > 0.1;
      const inLocomotionHysteresis =
        (controller.active === 'walk' || controller.active === 'sprint') &&
        controller.locomotionUntil != null &&
        now < controller.locomotionUntil;
      const effectiveWantsLocomotion = wantsLocomotion || inLocomotionHysteresis;
      const walking = id === localPlayerId ? !!inputKeys?.walk : !!playerStates?.[id]?.walking;
      const hasRequestedLocomotionAction = walking
        ? !!controller.actions?.walk
        : !!(controller.actions?.sprint || controller.actions?.walk);
      const useWalkCycle = controller.walkCycle && !hasRequestedLocomotionAction;
      let locomotionAction = null;
      if (effectiveWantsLocomotion) {
        if (
          !wantsLocomotion &&
          inLocomotionHysteresis &&
          (controller.active === 'walk' || controller.active === 'sprint')
        ) {
          locomotionAction = controller.active;
        } else if (walking) {
          locomotionAction = controller.actions?.walk ? 'walk' : null;
        } else {
          locomotionAction = controller.actions?.sprint ? 'sprint' : controller.actions?.walk ? 'walk' : null;
        }
      }

      if (isDead && controller.actions?.death) {
        playAction(controller, 'death');
      } else if (isHarvesting && controller.actions?.interact) {
        controller.locomotionUntil = 0;
        playAction(controller, 'interact');
      } else if (isAttacking) {
        playAction(controller, 'attack');
      } else if (effectiveWantsLocomotion && locomotionAction) {
        if (wantsLocomotion || controller.active !== locomotionAction) {
          controller.locomotionUntil = now + WALK_HYSTERESIS_MS;
        }
        playAction(controller, locomotionAction);
      } else if (controller.actions?.idle) {
        controller.locomotionUntil = 0;
        playAction(controller, 'idle');
      }

      controller.mixer?.update(dt);

      if (useWalkCycle && !isAttacking && !isDead && !isHarvesting) {
        if (effectiveWantsLocomotion) {
          applyWalkCycle(controller.walkCycle, now, speed);
        } else if (controller.walkCycle.wasWalking) {
          resetWalkCycle(controller.walkCycle);
          controller.walkCycle.wasWalking = false;
        }
      } else if (useWalkCycle && controller.walkCycle.wasWalking) {
        resetWalkCycle(controller.walkCycle);
        controller.walkCycle.wasWalking = false;
      }
    }
  }


  return {
    scene,
    renderer,
    camera,
    isWebGLReady: () => webGLReady,
    resize,
    setLocalPlayerId,
    syncPlayers,
    syncPlayerVisuals,
    updatePlayerPositions,
    setTargetMarker,
    setTargetRing,
    pickTarget,
    projectToScreen,
    updateWorld,
    updateWorldResources,
    updateWorldMobs,
    updateWorldCorpses,
    animateWorldMeshes,
    updateAnimations,
    triggerAttack,
    updateEffects,
    updateCamera,
    updateVisibility,
    renderFrame,
    spawnSlash: (/** @type {any} */ from, /** @type {any} */ to, /** @type {any} */ durationMs, /** @type {any} */ now) =>
      effectsSystem.spawnSlash({ to, durationMs, now }),
    spawnProjectile: (/** @type {any} */ from, /** @type {any} */ to, /** @type {any} */ durationMs, /** @type {any} */ now, /** @type {any} */ options = {}) =>
      effectsSystem.spawnProjectile({
        from,
        to,
        durationMs,
        now,
        spawnImpactOnEnd: options.spawnImpactOnEnd !== false,
      }),
    spawnNova: (/** @type {any} */ center, /** @type {any} */ radius, /** @type {any} */ color, /** @type {any} */ durationMs, /** @type {any} */ now) =>
      effectsSystem.spawnNova({ center, radius, color, durationMs, now }),
    spawnCone: (/** @type {any} */ from, /** @type {any} */ direction, /** @type {any} */ coneDegrees, /** @type {any} */ range, /** @type {any} */ color, /** @type {any} */ durationMs, /** @type {any} */ now) =>
      effectsSystem.spawnCone({ from, direction, coneDegrees, range, color, durationMs, now }),
    spawnBuffAura: (/** @type {any} */ center, /** @type {any} */ color, /** @type {any} */ durationMs, /** @type {any} */ now) =>
      effectsSystem.spawnBuffAura({ center, color, durationMs, now }),
    spawnDashTrail: (/** @type {any} */ from, /** @type {any} */ to, /** @type {any} */ durationMs, /** @type {any} */ now) =>
      effectsSystem.spawnDashTrail({ from, to, durationMs, now }),
    spawnHealRing: (/** @type {any} */ center, /** @type {any} */ radius, /** @type {any} */ color, /** @type {any} */ durationMs, /** @type {any} */ now) =>
      effectsSystem.spawnHealRing({ center, radius, color, durationMs, now }),
    spawnCombatText: (/** @type {any} */ pos, /** @type {any} */ payload, /** @type {any} */ now) =>
      effectsSystem.spawnCombatText({ pos, payload, now }),
    spawnHitConfirm: (/** @type {any} */ pos, /** @type {any} */ payload, /** @type {any} */ now) =>
      effectsSystem.spawnHitConfirm({ pos, payload, now }),
    setPlacementIndicator,
    updatePlacementIndicator,
  };
}
