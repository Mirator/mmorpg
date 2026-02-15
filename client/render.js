import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { initWorld, updateResources, updateMobs, updateCorpses, animateWorld } from './world.js';
import {
  ASSET_PATHS,
  assemblePlayerModel,
  cloneSkinned,
  loadPlayerAnimations,
  normalizeToHeight,
  pickClips,
} from './assets.js';
import { createEffectsSystem } from './effects.js';
import { showErrorOverlay } from './error-overlay.js';

const CAMERA_LERP_SPEED = 5;
const FRUSTUM_SIZE = 24;
const CULL_DISTANCE = 100;

export function createRenderSystem({ app }) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f14);

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
      (event) => {
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
  let playerPrototypePromise = null;
  let playerClipsPromise = null;
  let myId = null;
  let worldState = null;
  const effectsSystem = createEffectsSystem(scene);
  const mobRaycaster = new THREE.Raycaster();
  mobRaycaster.layers.enable(1);

  let placementIndicator = null;
  let placementIndicatorRadius = 2.5;

  function setPlacementIndicator(visible, radius = 2.5, placementRange = 10) {
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

  function updatePlacementIndicator(pos, isValid) {
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

  function createPlayerMesh(isLocal) {
    const group = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 2, 1);
    const material = new THREE.MeshStandardMaterial({
      color: isLocal ? 0x4da3ff : 0xff7b2f,
    });
    const placeholder = new THREE.Mesh(geometry, material);
    placeholder.position.y = 1;
    group.add(placeholder);
    group.userData.placeholder = placeholder;
    return group;
  }

  function ensurePlayerMesh(id) {
    if (playerMeshes.has(id)) return playerMeshes.get(id);
    const mesh = createPlayerMesh(id === myId);
    mesh.userData.playerId = id;
    playerMeshes.set(id, mesh);
    scene.add(mesh);
    hydratePlayerMesh(id, mesh).catch((err) => {
      console.warn('[render] Failed to load player model:', err);
    });
    return mesh;
  }

  function setLocalPlayerId(id) {
    myId = id;
    const mesh = playerMeshes.get(myId);
    if (mesh?.userData?.placeholder?.material?.color) {
      mesh.userData.placeholder.material.color.set(0x4da3ff);
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

  function updatePlayerPositions(positions, options = {}) {
    const { localPlayerId, inputKeys } = options;
    const hasMovementInput = inputKeys && (inputKeys.w || inputKeys.a || inputKeys.s || inputKeys.d);

    for (const [id, pos] of Object.entries(positions)) {
      const mesh = ensurePlayerMesh(id);
      const prev = mesh.userData.lastPos;
      const nextPos = new THREE.Vector3(pos.x, pos.y ?? 0, pos.z);
      if (prev) {
        const dx = nextPos.x - prev.x;
        const dz = nextPos.z - prev.z;
        const distSq = dx * dx + dz * dz;
        const isLocalWithNoInput = (id === localPlayerId) && !hasMovementInput;
        if (distSq > 0.0004 && !isLocalWithNoInput) {
          mesh.rotation.y = Math.atan2(dx, dz);
        }
      }
      mesh.position.copy(nextPos);
      mesh.userData.lastPos = nextPos;
    }
  }

  function setTargetMarker(pos) {
    if (!pos) {
      targetMarker.visible = false;
      return;
    }
    targetMarker.position.set(pos.x, (pos.y ?? 0) + 0.15, pos.z);
    targetMarker.visible = true;
  }

  function setTargetRing(pos) {
    if (!pos) {
      targetRing.visible = false;
      return;
    }
    targetRing.position.set(pos.x, (pos.y ?? 0) + 0.1, pos.z);
    targetRing.visible = true;
  }

  function pickMob(ndc) {
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
    const vector = new THREE.Vector3(pos.x, pos.y ?? 1, pos.z);
    vector.project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + ((vector.x + 1) / 2) * rect.width,
      y: rect.top + ((-vector.y + 1) / 2) * rect.height,
    };
  }

  function updateWorld(config) {
    if (worldState?.group) {
      worldState.isActive = false;
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

  function updateWorldCorpses(corpses) {
    updateCorpses(worldState, corpses);
  }

  function animateWorldMeshes(now) {
    animateWorld(worldState, now);
  }

  function updateAnimations(dt, now, deadPlayerIds = new Set()) {
    updateControllerMap(playerControllers, playerMeshes, dt, now, deadPlayerIds);
    if (worldState?.mobControllers && worldState?.mobMeshes) {
      updateControllerMap(worldState.mobControllers, worldState.mobMeshes, dt, now);
    }
    if (worldState?.vendorControllers && worldState?.vendorMeshes) {
      updateControllerMap(worldState.vendorControllers, worldState.vendorMeshes, dt, now);
    }
  }

  function triggerAttack(id, now, durationMs) {
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

  function updateEffects(now) {
    effectsSystem.update(now);
  }

  const cameraLookDirection = new THREE.Vector3(-1, -1, -1).normalize();

  function updateCamera(viewPos, dt) {
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

  function updateVisibility(cameraTargetVec) {
    if (!cameraTargetVec || !worldState) return;
    const cullDistSq = CULL_DISTANCE * CULL_DISTANCE;

    const setVisibleByDistance = (obj) => {
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
    }
    for (const [id, mesh] of playerMeshes) {
      if (id === myId) {
        mesh.visible = true;
      } else {
        setVisibleByDistance(mesh);
      }
    }
  }

  function renderFrame() {
    if (!webGLReady) return;
    renderer.render(scene, camera);
  }

  function getPlayerPrototype() {
    if (!playerPrototypePromise) {
      playerPrototypePromise = assemblePlayerModel();
    }
    return playerPrototypePromise;
  }

  function getPlayerClips() {
    if (!playerClipsPromise) {
      const overrides = ASSET_PATHS.playerModel
        ? {
            idleNames: ['Idle_Loop', 'Idle_Talking_Loop', 'Idle_No_Loop', 'Idle_FoldArms_Loop'],
            walkNames: ['Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Walk_Formal_Loop'],
            attackNames: ['Sword_Attack', 'Punch_Jab', 'Punch_Cross'],
            attackKeywords: ['attack', 'slash', 'swing', 'punch'],
            deathNames: ['Death'],
            deathKeywords: ['death'],
          }
        : {
            idleNames: ['Idle_Loop', 'Idle_No_Loop'],
            walkNames: ['Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Walk_Formal_Loop'],
            attackNames: ['Sword_Attack', 'Punch_Jab', 'Punch_Cross'],
            attackKeywords: ['attack', 'slash', 'swing', 'punch'],
            deathNames: ['Death'],
            deathKeywords: ['death'],
          };

      playerClipsPromise = loadPlayerAnimations().then((clips) => pickClips(clips, overrides));
    }
    return playerClipsPromise;
  }

  async function hydratePlayerMesh(id, mesh) {
    if (!mesh) return;
    if (!mesh.userData) mesh.userData = {};
    if (mesh.userData.hydrating) return;
    mesh.userData.hydrating = true;

    const [prototype, clipSet] = await Promise.all([
      getPlayerPrototype(),
      getPlayerClips(),
    ]);
    if (!prototype || !clipSet) return;
    if (!playerMeshes.has(id)) return;

    const model = cloneSkinned(prototype);
    normalizeToHeight(model, 2.0);
    mesh.clear();
    mesh.add(model);

    if (clipSet.all.length) {
      const mixer = new THREE.AnimationMixer(model);
      const actions = createActions(mixer, clipSet);
      const walkCycle = buildWalkCycle(model);
      const controller = {
        mixer,
        actions,
        active: null,
        attackUntil: 0,
        lastPos: mesh.position.clone(),
        walkCycle,
      };
      if (actions.idle) {
        actions.idle.play();
        controller.active = 'idle';
      }
      playerControllers.set(id, controller);
    }
  }

  function createActions(mixer, clipSet) {
    const actions = {
      idle: clipSet.idle ? mixer.clipAction(clipSet.idle) : null,
      walk: clipSet.walk ? mixer.clipAction(clipSet.walk) : null,
      attack: clipSet.attack ? mixer.clipAction(clipSet.attack) : null,
      death: clipSet.death ? mixer.clipAction(clipSet.death) : null,
    };
    if (actions.attack) {
      actions.attack.setLoop(THREE.LoopOnce, 1);
      actions.attack.clampWhenFinished = true;
    }
    if (actions.death) {
      actions.death.setLoop(THREE.LoopOnce, 1);
      actions.death.clampWhenFinished = true;
    }
    return actions;
  }

  function buildWalkCycle(model) {
    let skeleton = null;
    model.traverse((node) => {
      if (!skeleton && node?.isSkinnedMesh && node.skeleton) {
        skeleton = node.skeleton;
      }
    });
    if (!skeleton) return null;

    const names = [
      'upperarm_l',
      'upperarm_r',
      'thigh_l',
      'thigh_r',
      'calf_l',
      'calf_r',
      'spine_01',
    ];

    const bones = {};
    const rest = {};
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

  function resetWalkCycle(walkCycle) {
    if (!walkCycle) return;
    for (const [name, bone] of Object.entries(walkCycle.bones)) {
      const rest = walkCycle.rest[name];
      if (rest) bone.quaternion.copy(rest);
    }
    if (walkCycle.root) {
      walkCycle.root.position.y = 0;
    }
  }

  function applyWalkCycle(walkCycle, now, speed) {
    if (!walkCycle) return;
    const intensity = Math.min(1, speed / 2);
    const t = now * 0.006 + walkCycle.phase;
    const swing = Math.sin(t);
    const lift = Math.cos(t);

    const armSwing = 0.55 * intensity * swing;
    const legSwing = 0.7 * intensity * swing;
    const calfSwing = 0.4 * intensity * Math.max(0, -swing);
    const spineLean = 0.1 * intensity * Math.sin(t + Math.PI / 2);

    const applyRot = (boneName, angle, axis) => {
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

  function playAction(controller, name) {
    if (!controller?.actions) return;
    const next = controller.actions[name];
    if (!next) return;
    if (controller.active === name) return;
    const prev = controller.active ? controller.actions[controller.active] : null;
    next.reset();
    next.fadeIn(0.15);
    next.play();
    if (prev) {
      prev.fadeOut(0.15);
    }
    controller.active = name;
  }

  const WALK_HYSTERESIS_MS = 180;

  function updateControllerMap(controllers, meshes, dt, now, deadPlayerIds) {
    if (!controllers || !meshes) return;
    for (const [id, controller] of controllers.entries()) {
      const mesh = meshes.get(id);
      if (!mesh) continue;
      const lastPos = controller.lastPos ?? mesh.position.clone();
      const speed = mesh.position.distanceTo(lastPos) / Math.max(0.001, dt);
      controller.lastPos = mesh.position.clone();
      const isDead = deadPlayerIds && deadPlayerIds.has(id);
      const isAttacking = controller.actions?.attack && controller.attackUntil && now < controller.attackUntil;
      const wantsWalk = speed > 0.1;
      const inWalkHysteresis =
        controller.active === 'walk' &&
        controller.walkUntil != null &&
        now < controller.walkUntil;
      const effectiveWantsWalk = wantsWalk || inWalkHysteresis;
      const useWalkCycle = controller.walkCycle && !controller.actions?.walk;

      if (isDead && controller.actions?.death) {
        playAction(controller, 'death');
      } else if (isAttacking) {
        playAction(controller, 'attack');
      } else if (effectiveWantsWalk && controller.actions?.walk) {
        if (controller.active !== 'walk') {
          controller.walkUntil = now + WALK_HYSTERESIS_MS;
        }
        playAction(controller, 'walk');
      } else if (controller.actions?.idle) {
        controller.walkUntil = 0;
        playAction(controller, 'idle');
      }

      controller.mixer?.update(dt);

      if (useWalkCycle && !isAttacking && !isDead) {
        if (effectiveWantsWalk) {
          applyWalkCycle(controller.walkCycle, now, speed);
        } else if (controller.walkCycle.wasWalking) {
          resetWalkCycle(controller.walkCycle);
          controller.walkCycle.wasWalking = false;
        }
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
    spawnSlash: (from, to, durationMs, now) =>
      effectsSystem.spawnSlash({ from, to, durationMs, now }),
    spawnProjectile: (from, to, durationMs, now) =>
      effectsSystem.spawnProjectile({ from, to, durationMs, now }),
    spawnNova: (center, radius, color, durationMs, now) =>
      effectsSystem.spawnNova({ center, radius, color, durationMs, now }),
    spawnCone: (from, direction, coneDegrees, range, color, durationMs, now) =>
      effectsSystem.spawnCone({ from, direction, coneDegrees, range, color, durationMs, now }),
    spawnBuffAura: (center, color, durationMs, now) =>
      effectsSystem.spawnBuffAura({ center, color, durationMs, now }),
    spawnDashTrail: (from, to, durationMs, now) =>
      effectsSystem.spawnDashTrail({ from, to, durationMs, now }),
    spawnHealRing: (center, radius, color, durationMs, now) =>
      effectsSystem.spawnHealRing({ center, radius, color, durationMs, now }),
    setPlacementIndicator,
    updatePlacementIndicator,
  };
}
