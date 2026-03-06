// @ts-check
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  ASSET_PATHS,
  assemblePlayerModel,
  cloneSkinned,
  loadPlayerAnimations,
  normalizeToHeight,
  pickClips,
} from './assets.js';
import {
  buildEquipmentVisualSignature,
  buildEquipmentVisualState,
  normalizeEquipmentVisualState,
} from './playerVisual.js';

function noop() {}

function centerModelOnGroundXZ(/** @type {any} */ model) {
  const box = new THREE.Box3();
  let hasCoreBounds = false;

  model.traverse((/** @type {any} */ node) => {
    const isRenderable = !!(node?.isMesh || node?.isSkinnedMesh);
    if (!isRenderable) return;
    const nodeName = String(node?.name ?? '');
    if (nodeName === 'EquippedWeapon' || nodeName === 'EquippedOffhand') return;
    const nodeBox = new THREE.Box3().setFromObject(node);
    if (nodeBox.isEmpty()) return;
    if (!hasCoreBounds) {
      box.copy(nodeBox);
      hasCoreBounds = true;
    } else {
      box.union(nodeBox);
    }
  });

  if (!hasCoreBounds) {
    box.setFromObject(model);
  }
  const center = new THREE.Vector3();
  box.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
}

function getPreviewClipOverrides() {
  if (ASSET_PATHS.playerModel) {
    return {
      idleNames: ['Idle_Loop', 'Idle_Talking_Loop', 'Idle_No_Loop', 'Idle_FoldArms_Loop'],
      idleKeywords: ['idle'],
    };
  }
  return {
    idleNames: ['Idle_Loop', 'Idle_No_Loop'],
    idleKeywords: ['idle'],
  };
}

function createFallbackModel() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.28, 1.0, 6, 12),
    new THREE.MeshStandardMaterial({
      color: 0x7fa7d8,
      emissive: 0x101720,
      emissiveIntensity: 0.6,
      roughness: 0.45,
      metalness: 0.05,
    })
  );
  body.position.y = 0.85;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.19, 12, 12),
    new THREE.MeshStandardMaterial({
      color: 0xf0d6b4,
      roughness: 0.7,
      metalness: 0.02,
    })
  );
  head.position.y = 1.7;
  group.add(head);
  return group;
}

function hasRenderableBounds(/** @type {any} */ object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);
  return Number.isFinite(size.x) && Number.isFinite(size.y) && Number.isFinite(size.z) && size.y > 0;
}

export function createCharacterPreview(/** @type {HTMLElement | null} */ container) {
  if (!container) {
    return {
      setOpen: noop,
      setVisible: noop,
      setPlayer: noop,
      dispose: noop,
    };
  }
  const host = container;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
  camera.position.set(0, 1.25, 2.8);
  camera.lookAt(0, 1.1, 0);
  camera.updateProjectionMatrix();

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const keyLight = new THREE.DirectionalLight(0xfff1dd, 0.8);
  keyLight.position.set(2.5, 4.5, 2.5);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x9ec7ff, 0.4);
  fillLight.position.set(-2.5, 2.5, -2.5);
  scene.add(fillLight);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.65, 0.1, 24),
    new THREE.MeshStandardMaterial({
      color: 0x3b3125,
      roughness: 0.9,
      metalness: 0.05,
    })
  );
  pedestal.position.y = 0.05;
  scene.add(pedestal);
  const fallbackModel = createFallbackModel();
  scene.add(fallbackModel);

  let /** @type {any} */ renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
  } catch (err) {
    console.warn('[character-preview] WebGL unavailable:', err);
    return {
      setOpen: noop,
      setVisible: noop,
      setPlayer: noop,
      dispose: noop,
    };
  }

  let disposed = false;
  let isOpen = false;
  let isVisible = true;
  let playerKey = '';
  let requestToken = 0;
  let rafId = 0;
  let /** @type {any} */ model = null;
  let /** @type {any} */ activeVisual = fallbackModel;
  let /** @type {any} */ mixer = null;
  const clock = new THREE.Clock();

  const resizeObserver = new ResizeObserver(() => {
    resize();
  });
  resizeObserver.observe(host);

  function canRun() {
    return !disposed && !!renderer && isOpen && isVisible;
  }

  function renderNow() {
    if (!renderer || disposed) return;
    renderer.render(scene, camera);
  }

  function stopLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  function tick() {
    if (!canRun()) {
      rafId = 0;
      return;
    }
    const dt = Math.min(0.05, clock.getDelta());
    if (mixer) mixer.update(dt);
    renderNow();
    rafId = requestAnimationFrame(tick);
  }

  function updateLoopState() {
    if (canRun()) {
      if (!rafId) {
        clock.getDelta();
        rafId = requestAnimationFrame(tick);
      }
    } else {
      stopLoop();
    }
  }

  function resize() {
    if (!renderer || disposed) return;
    const width = Math.max(1, Math.floor(host.clientWidth));
    const height = Math.max(1, Math.floor(host.clientHeight));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderNow();
  }

  function clearModel() {
    if (mixer) {
      mixer.stopAllAction();
      mixer = null;
    }
    if (model) {
      scene.remove(model);
      model = null;
    }
    fallbackModel.visible = true;
    activeVisual = fallbackModel;
  }

  async function setPlayer(/** @type {any} */ player) {
    if (disposed) return;
    const visualState = player?.visual
      ? normalizeEquipmentVisualState(player.visual)
      : buildEquipmentVisualState(player?.equipment);
    const visualSignature = buildEquipmentVisualSignature(visualState);
    const nextKey = player
      ? `${String(player.id ?? 'local')}:${String(player.name ?? '')}:${String(player.classId ?? '')}:${visualSignature}`
      : '';
    if (nextKey === playerKey && (model || requestToken > 0)) return;
    playerKey = nextKey;
    const token = ++requestToken;
    if (!player) {
      clearModel();
      renderNow();
      return;
    }

    const [prototype, clips] = await Promise.all([
      assemblePlayerModel(visualState),
      loadPlayerAnimations(),
    ]);
    if (disposed || token !== requestToken) return;
    if (!prototype) return;

    clearModel();
    const candidate = cloneSkinned(prototype);
    normalizeToHeight(candidate, 1.9);
    centerModelOnGroundXZ(candidate);
    candidate.position.y = 0.1;
    if (!hasRenderableBounds(candidate)) {
      console.warn('[character-preview] Player model had invalid bounds, keeping fallback preview.');
      renderNow();
      return;
    }
    model = candidate;
    // Keep preview front-facing inside the character sheet viewport.
    model.rotation.y = 0;
    fallbackModel.visible = false;
    scene.add(model);
    activeVisual = model;

    const clipSet = pickClips(clips ?? [], getPreviewClipOverrides());
    if (clipSet?.idle) {
      mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(clipSet.idle).play();
    }
    renderNow();
    updateLoopState();
  }

  function setOpen(/** @type {any} */ next) {
    isOpen = !!next;
    updateLoopState();
  }

  function setVisible(/** @type {any} */ next) {
    isVisible = !!next;
    updateLoopState();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopLoop();
    resizeObserver.disconnect();
    clearModel();
    if (renderer?.domElement?.parentElement === host) {
      host.removeChild(renderer.domElement);
    }
    renderer?.dispose?.();
    renderer = null;
  }

  resize();
  renderNow();

  return {
    setOpen,
    setVisible,
    setPlayer,
    dispose,
  };
}
