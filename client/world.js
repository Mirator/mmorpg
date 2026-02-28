// @ts-check
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  ASSET_PATHS,
  assembleVendorModel,
  cloneSkinned,
  getTexture,
  loadGltf,
  loadPlayerAnimations,
  normalizeToHeight,
  pickClips,
} from './assets.js';
import {
  CHARACTER_HEIGHT,
  computeEnvironmentScale,
  ENV_SCALE_PROFILE,
  ENV_SCALE_TARGETS,
} from './environmentScale.js';

const LOD_FAR_DISTANCE = 63; // 50 * 1.25

const /** @type {any} */ COLORS = {
  ground: 0x1b2620,
  tile: 0x2a3b30,
  tileBorder: 0x465a4d,
  base: 0x4da3ff,
  village: 0xd8b880,
  villageShadow: 0x7b5f3e,
  resource: 0x5ef2c2,
  resourceDim: 0x1b2a28,
  mob: 0xff4d4d,
  obstacle: 0x3a3f44,
  vendor: 0xffd54f,
  corpse: 0x4a5568,
  corpseCross: 0x718096,
};

const /** @type {any} */ MOB_TARGET_HEIGHTS = {
  wolf: 0.6,
  fox: 0.5,
  stag: 1.8,
  bull: 1.0,
};

const /** @type {any} */ RESOURCE_TYPE_COLORS = {
  crystal: { active: 0x5ef2c2, dim: 0x1b2a28 },
  ore: { active: 0x8b7355, dim: 0x3d3228 },
  herb: { active: 0x5ec24e, dim: 0x1b2a1b },
  tree: { active: 0x8b6914, dim: 0x3d3228 },
  flower: { active: 0xe85d9a, dim: 0x4a2a35 },
};
const /** @type {any} */ RESOURCE_TARGET_HEIGHTS = {
  crystal: 1.6,
  ore: 1.6,
  herb: 1.6,
  flower: 1.6,
  tree: 4.8,
};
const CORPSE_MARKER_HEIGHT = 1.2;

const mobPrototypeCache = new Map();
let /** @type {any} */ vendorPrototypePromise = null;
let /** @type {any} */ vendorClipsPromise = null;
const environmentCache = new Map();

/**
 * @param {HTMLCanvasElement} canvas
 * @returns {CanvasRenderingContext2D}
 */
function requireCanvas2dContext(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable');
  }
  return ctx;
}

function getVendorPrototype() {
  if (!vendorPrototypePromise) {
    vendorPrototypePromise = assembleVendorModel();
  }
  return vendorPrototypePromise;
}

function getVendorClips() {
  if (!vendorClipsPromise) {
    vendorClipsPromise = loadPlayerAnimations().then((/** @type {any} */ clips) =>
      pickClips(clips, {
        idleNames: ['Idle_Loop', 'Idle_No_Loop', 'Idle_Talking_Loop', 'Idle_FoldArms_Loop'],
        idleKeywords: ['idle'],
      })
    );
  }
  return vendorClipsPromise;
}

function cloneStatic(/** @type {any} */ scene) {
  return scene.clone(true);
}

function centerModelOnGroundXZ(/** @type {any} */ model) {
  const box = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  box.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
}

function getModelBounds(/** @type {any} */ model) {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  return { x: size.x, y: size.y, z: size.z };
}

function applyEnvironmentScaleToModel(
  /** @type {any} */ model,
  /** @type {any} */ { key, category, baseRadius, profile }
) {
  const scaleInfo = computeEnvironmentScale({
    key,
    category,
    modelBounds: getModelBounds(model),
    baseRadius,
    profile,
  });
  if (!scaleInfo.valid) return scaleInfo;

  model.scale.set(scaleInfo.scale.x, scaleInfo.scale.y, scaleInfo.scale.z);
  model.updateMatrixWorld(true);
  const nextBox = new THREE.Box3().setFromObject(model);
  model.position.y -= nextBox.min.y;
  model.updateMatrixWorld(true);
  return scaleInfo;
}

function recordEnvironmentScale(/** @type {any} */ worldState, /** @type {any} */ id, /** @type {any} */ entry) {
  if (!worldState?.environmentScaleDebug) return;
  worldState.environmentScaleDebug.set(id, entry);
}

function exposeEnvironmentScaleDebug(/** @type {any} */ worldState) {
  if (typeof window === 'undefined') return;
  (/** @type {any} */ (window)).__debugEnvironmentScale = () => ({
    profile: ENV_SCALE_PROFILE,
    characterHeight: CHARACTER_HEIGHT,
    targets: ENV_SCALE_TARGETS[ENV_SCALE_PROFILE],
    entries: Array.from(worldState.environmentScaleDebug?.values?.() ?? []).sort((a, b) =>
      String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
    ),
  });
}

function createLODModel(/** @type {any} */ fullModel, /** @type {any} */ impostorType = 'box') {
  const box = new THREE.Box3().setFromObject(fullModel);
  const size = new THREE.Vector3();
  box.getSize(size);
  const center = new THREE.Vector3();
  box.getCenter(center);

  let impostor;
  if (impostorType === 'cone') {
    impostor = new THREE.Mesh(
      new THREE.ConeGeometry(Math.max(size.x, size.z) * 0.5, size.y, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a4a38, roughness: 1 })
    );
    impostor.position.y = center.y;
  } else {
    impostor = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshStandardMaterial({ color: 0x6d5841, roughness: 1 })
    );
    impostor.position.copy(center);
  }

  const lod = new THREE.LOD();
  lod.addLevel(fullModel, 0);
  lod.addLevel(impostor, LOD_FAR_DISTANCE);
  return lod;
}

function getMobPrototype(/** @type {any} */ mobType) {
  const type = mobType ?? 'orc';
  const monsterPaths = /** @type {Record<string, string>} */ (ASSET_PATHS.monsters ?? {});
  const url = monsterPaths[type] ?? monsterPaths.orc;
  if (!mobPrototypeCache.has(type)) {
    mobPrototypeCache.set(type, loadGltf(url));
  }
  return mobPrototypeCache.get(type);
}

function getEnvironmentPrototype(/** @type {any} */ key) {
  const environmentPaths = /** @type {Record<string, string>} */ (ASSET_PATHS.environment ?? {});
  if (!environmentCache.has(key)) {
    const url = environmentPaths[key];
    environmentCache.set(key, loadGltf(url));
  }
  return environmentCache.get(key);
}

function buildTileTexture() {
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = requireCanvas2dContext(canvas);

  const seed = 41293;
  let state = seed;
  const rand = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  ctx.fillStyle = '#1f2b24';
  ctx.fillRect(0, 0, size, size);

  const cell = 4;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const n = rand();
      const shade = n > 0.6 ? '#2f3f33' : n > 0.25 ? '#243228' : '#1c271f';
      ctx.fillStyle = shade;
      ctx.fillRect(x, y, cell, cell);
    }
  }

  for (let i = 0; i < 80; i += 1) {
    const radius = 6 + rand() * 18;
    const x = rand() * size;
    const y = rand() * size;
    const alpha = 0.08 + rand() * 0.12;
    ctx.fillStyle = `rgba(10, 16, 12, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

function buildGround(/** @type {any} */ mapSize) {
  const tileSize = 14;
  let texture = getTexture(ASSET_PATHS.groundTexture);
  if (!texture) {
    texture = buildTileTexture();
  }
  texture = texture.clone();
  texture.repeat.set(mapSize / tileSize, mapSize / tileSize);
  if (texture.anisotropy !== undefined) {
    texture.anisotropy = 4;
  }

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(mapSize, mapSize),
    new THREE.MeshStandardMaterial({
      map: texture,
      color: 0x6b9e5a,
      emissive: 0x0a0e0c,
      emissiveIntensity: 0.25,
      roughness: 1,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  return ground;
}

function buildVillage(/** @type {any} */ base) {
  const village = new THREE.Group();

  const plaza = new THREE.Mesh(
    new THREE.CircleGeometry(base.radius * 0.9, 32),
    new THREE.MeshStandardMaterial({
      color: COLORS.village,
      emissive: COLORS.villageShadow,
      emissiveIntensity: 0.25,
      roughness: 0.9,
    })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.03;
  village.add(plaza);
  village.userData.plaza = plaza;

  const totem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.5, 1.6, 10),
    new THREE.MeshStandardMaterial({
      color: COLORS.base,
      emissive: COLORS.base,
      emissiveIntensity: 0.2,
    })
  );
  totem.position.y = 0.8;
  village.add(totem);
  village.userData.centerFallback = totem;

  village.position.set(base.x, base.y ?? 0, base.z);
  village.userData.base = base;
  return village;
}

async function hydrateVillageCenter(
  /** @type {any} */ worldState,
  /** @type {any} */ village,
  /** @type {any} */ placement = null
) {
  if (!worldState?.isActive) return;
  if (worldState.baseMesh !== village) return;
  const modelUrl = ASSET_PATHS.villageCenterModel;
  if (!modelUrl) return;

  const gltf = await loadGltf(modelUrl);
  if (!worldState.isActive) return;
  if (worldState.baseMesh !== village) return;
  if (!gltf?.scene) return;

  const model = cloneStatic(gltf.scene);
  const scaleInfo = applyEnvironmentScaleToModel(model, {
    key: 'villageCenterModel',
    category: 'villageCenter',
    baseRadius: worldState.base?.radius ?? 8,
    profile: ENV_SCALE_PROFILE,
  });
  centerModelOnGroundXZ(model);
  const targetPlacement = placement ?? {
    x: village.position?.x ?? 0,
    y: village.position?.y ?? 0,
    z: village.position?.z ?? 0,
    rotation: 0,
  };
  const offsetX = (targetPlacement.x ?? 0) - (village.position?.x ?? 0);
  const offsetY = (targetPlacement.y ?? 0) - (village.position?.y ?? 0);
  const offsetZ = (targetPlacement.z ?? 0) - (village.position?.z ?? 0);
  model.position.x += offsetX;
  model.position.y += offsetY;
  model.position.z += offsetZ;
  model.rotation.y = targetPlacement.rotation ?? 0;
  recordEnvironmentScale(worldState, 'villageCenterModel', {
    ...scaleInfo,
    id: 'villageCenterModel',
    key: 'villageCenterModel',
    category: 'villageCenter',
    placement: {
      x: targetPlacement.x ?? 0,
      y: targetPlacement.y ?? 0,
      z: targetPlacement.z ?? 0,
      rotation: targetPlacement.rotation ?? 0,
    },
  });

  const existing = village.userData.centerModel;
  if (existing) village.remove(existing);
  if (village.userData.centerFallback) {
    village.remove(village.userData.centerFallback);
    village.userData.centerFallback = null;
  }
  village.userData.centerModel = model;
  village.add(model);
}

function buildObstacleMesh(/** @type {any} */ obstacle) {
  const group = new THREE.Group();
  group.position.set(obstacle.x, obstacle.y ?? 0, obstacle.z);
  group.userData.obstacle = obstacle;
  return group;
}

function buildCorpseMesh(/** @type {any} */ worldState, /** @type {any} */ corpseId) {
  const group = new THREE.Group();
  const fallback = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.15, 0.4),
    new THREE.MeshStandardMaterial({
      color: COLORS.corpse,
      roughness: 1,
    })
  );
  base.position.y = 0.075;
  fallback.add(base);
  const cross = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.5, 0.08),
    new THREE.MeshStandardMaterial({
      color: COLORS.corpseCross,
      roughness: 1,
    })
  );
  cross.position.set(0, 0.4, 0);
  fallback.add(cross);
  const crossBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.08, 0.08),
    new THREE.MeshStandardMaterial({
      color: COLORS.corpseCross,
      roughness: 1,
    })
  );
  crossBar.position.set(0, 0.55, 0);
  fallback.add(crossBar);
  group.add(fallback);
  group.userData.placeholder = fallback;
  group.userData.corpseId = corpseId;
  group.rotation.y = Math.random() * Math.PI * 2;

  hydrateCorpseMesh(worldState, corpseId, group).catch((/** @type {any} */ err) => {
    console.warn('[world] Failed to load corpse marker model:', err);
  });

  return group;
}

function buildResourceMesh(/** @type {any} */ type = 'crystal') {
  const colors = RESOURCE_TYPE_COLORS[type] ?? RESOURCE_TYPE_COLORS.crystal;
  const group = new THREE.Group();
  const placeholder = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1.6, 6),
    new THREE.MeshStandardMaterial({
      color: colors.active,
      emissive: colors.active,
      emissiveIntensity: 0.2,
      roughness: 0.4,
    })
  );
  placeholder.position.y = 0.8;
  group.add(placeholder);
  group.userData.crystal = placeholder;
  group.userData.placeholder = placeholder;
  group.userData.type = type;

  hydrateResourceMesh(type, group).catch((/** @type {any} */ err) => {
    console.warn('[world] Failed to load resource node model:', err);
  });

  return group;
}

function applyResourceMaterialColors(
  /** @type {any} */ ref,
  /** @type {any} */ colors,
  /** @type {any} */ available,
  /** @type {any} */ resourceType = 'crystal'
) {
  if (resourceType === 'tree') return;
  if (!ref) return;
  const intensity = available ? 0.25 : 0.05;
  const color = available ? colors.active : colors.dim;
  const /** @type {any} */ mats = [];
  if (ref.isMesh && ref.material) {
    mats.push(...(Array.isArray(ref.material) ? ref.material : [ref.material]));
  }
  ref.traverse?.((/** @type {any} */ n) => {
    if (n?.isMesh && n.material) mats.push(...(Array.isArray(n.material) ? n.material : [n.material]));
  });
  mats.forEach((/** @type {any} */ m) => {
    if (m.color) m.color.setHex(color);
    if (m.emissive) m.emissive.setHex(color);
    if (m.emissiveIntensity !== undefined) m.emissiveIntensity = intensity;
  });
}

async function hydrateResourceMesh(/** @type {any} */ type, /** @type {any} */ group) {
  const resourceNodePaths = /** @type {Record<string, string>} */ (ASSET_PATHS.resourceNodes ?? {});
  const url = resourceNodePaths[type] ?? resourceNodePaths.crystal;
  if (!url) return;
  const gltf = await loadGltf(url);
  if (!gltf?.scene) return;
  const model = gltf.scene.clone(true);
  const targetHeight = RESOURCE_TARGET_HEIGHTS[type] ?? RESOURCE_TARGET_HEIGHTS.crystal;
  normalizeToHeight(model, targetHeight);
  model.position.y = 0;
  group.remove(group.userData.placeholder);
  group.userData.placeholder = null;
  group.userData.crystal = model;
  group.add(model);
  group.rotation.y = Math.random() * Math.PI * 2;
}

async function hydrateCorpseMesh(/** @type {any} */ worldState, /** @type {any} */ corpseId, /** @type {any} */ group) {
  if (!worldState?.isActive) return;
  const modelUrl = ASSET_PATHS.corpseMarker;
  if (!modelUrl) return;

  const gltf = await loadGltf(modelUrl);
  if (!worldState.isActive) return;
  if (worldState.corpseMeshes.get(corpseId) !== group) return;
  if (!gltf?.scene) return;

  const model = cloneStatic(gltf.scene);
  normalizeToHeight(model, CORPSE_MARKER_HEIGHT);
  centerModelOnGroundXZ(model);

  const fallback = group.userData.placeholder;
  if (fallback) {
    group.remove(fallback);
    group.userData.placeholder = null;
  }
  group.userData.marker = model;
  group.add(model);
}

function buildMobMesh(/** @type {any} */ worldState, /** @type {any} */ mob) {
  const mobId = mob?.id;
  const mobType = mob?.mobType ?? 'orc';
  const group = new THREE.Group();
  const placeholder = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.0, 4, 8),
    new THREE.MeshStandardMaterial({
      color: COLORS.mob,
      emissive: 0x4d0b0b,
      emissiveIntensity: 0.35,
      roughness: 0.6,
    })
  );
  placeholder.position.y = 1.1;
  group.add(placeholder);
  group.userData.placeholder = placeholder;
  group.userData.mobType = mobType;

  const targetHelper = new THREE.Mesh(
    new THREE.SphereGeometry(1.8, 16, 16),
    new THREE.MeshBasicMaterial()
  );
  targetHelper.position.y = 1.0;
  targetHelper.layers.set(1);
  group.add(targetHelper);

  hydrateMobMesh(worldState, mobId, mobType, group).catch((/** @type {any} */ err) => {
    console.warn('[world] Failed to load mob model:', err);
  });

  return group;
}

function makeNameSprite(/** @type {any} */ text) {
  const canvas = document.createElement('canvas');
  const padding = 24;
  const fontSize = 22;
  const ctx = requireCanvas2dContext(canvas);
  ctx.font = `bold ${fontSize}px Rajdhani, sans-serif`;
  const metrics = ctx.measureText(text);
  const textWidth = Math.ceil(metrics.width);
  const width = textWidth + padding * 2;
  const height = fontSize + padding;
  canvas.width = width;
  canvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffe9a8';
  ctx.font = `bold ${fontSize}px Rajdhani, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(width / 80, height / 80, 1);
  sprite.position.y = 3.0;
  return sprite;
}

function buildVendorMesh(/** @type {any} */ vendor, /** @type {any} */ worldState) {
  const group = new THREE.Group();
  const placeholder = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.0, 4, 8),
    new THREE.MeshStandardMaterial({
      color: COLORS.vendor,
      emissive: 0x6a4b00,
      emissiveIntensity: 0.2,
      roughness: 0.6,
    })
  );
  placeholder.position.y = 1.1;
  group.add(placeholder);
  group.userData.placeholder = placeholder;

  const name = makeNameSprite(vendor?.name ?? 'Vendor');
  group.add(name);
  group.userData.nameSprite = name;

  group.position.set(vendor.x, vendor.y ?? 0, vendor.z);
  group.userData.vendorId = vendor.id;

  hydrateVendorMesh(worldState, vendor.id, group).catch((/** @type {any} */ err) => {
    console.warn('[world] Failed to load vendor model:', err);
  });

  return group;
}

async function hydrateVendorMesh(/** @type {any} */ worldState, /** @type {any} */ vendorId, /** @type {any} */ group) {
  if (!worldState?.isActive) return;
  const [prototype, clipSet] = await Promise.all([
    getVendorPrototype(),
    getVendorClips(),
  ]);
  if (!prototype) return;
  if (!worldState.isActive) return;
  if (worldState.vendorMeshes.get(vendorId) !== group) return;

  const model = cloneSkinned(prototype);
  normalizeToHeight(model, 2.0);
  group.remove(group.userData.placeholder);
  group.userData.placeholder = null;
  group.add(model);

  if (clipSet?.idle) {
    const mixer = new THREE.AnimationMixer(model);
    const idleAction = mixer.clipAction(clipSet.idle);
    idleAction.play();
    worldState.vendorControllers.set(vendorId, {
      mixer,
      actions: { idle: idleAction },
      active: 'idle',
      lastPos: group.position.clone(),
    });
  }
}

export function initWorld(/** @type {any} */ scene, /** @type {any} */ world) {
  const mapSize = world?.mapSize ?? 400;
  const base = world?.base ?? { x: 0, z: 0, radius: 8 };

  const group = new THREE.Group();
  const envGroup = new THREE.Group();
  envGroup.name = 'environment';
  const ground = buildGround(mapSize);
  const baseMesh = buildVillage(base);
  const obstacleMeshes = (world?.obstacles ?? []).map(buildObstacleMesh);
  const vendorMeshes = new Map();

  const /** @type {any} */ worldState = {
    mapSize,
    base,
    obstacles: world?.obstacles ?? [],
    structures: world?.structures ?? [],
    group,
    envGroup,
    envReady: false,
    ground,
    baseMesh,
    obstacleMeshes,
    resourceMeshes: new Map(),
    mobMeshes: new Map(),
    mobControllers: new Map(),
    corpseMeshes: new Map(),
    vendorMeshes,
    vendorControllers: new Map(),
    environmentScaleDebug: new Map(),
    isActive: true,
    lastResources: [],
    lastMobs: [],
    lastCorpses: [],
  };
  exposeEnvironmentScaleDebug(worldState);

  for (const vendor of world?.vendors ?? []) {
    const vendorMesh = buildVendorMesh(vendor, worldState);
    vendorMeshes.set(vendor.id, vendorMesh);
    group.add(vendorMesh);
  }

  group.add(ground, baseMesh, envGroup, ...obstacleMeshes);
  scene.add(group);

  const villageCenterPlacement =
    worldState.structures.find((/** @type {any} */ structure) => structure?.kind === 'villageCenter') ??
    null;
  if (villageCenterPlacement) {
    hydrateVillageCenter(worldState, baseMesh, villageCenterPlacement).catch((/** @type {any} */ err) => {
      console.warn('[world] Failed to load village center model:', err);
    });
  }

  loadEnvironmentModels(worldState, envGroup).catch(
    (/** @type {any} */ err) => {
      console.warn('[world] Failed to load environment models:', err);
    }
  );

  return worldState;
}

export function updateResources(/** @type {any} */ worldState, /** @type {any} */ resources) {
  if (!worldState) return;
  worldState.lastResources = resources;
  const seen = new Set();

  for (const resource of resources) {
    seen.add(resource.id);
    const resourceType = resource.type ?? 'crystal';
    const colors = RESOURCE_TYPE_COLORS[resourceType] ?? RESOURCE_TYPE_COLORS.crystal;
    let mesh = worldState.resourceMeshes.get(resource.id);
    if (!mesh) {
      mesh = buildResourceMesh(resourceType);
      worldState.resourceMeshes.set(resource.id, mesh);
      worldState.group.add(mesh);
    } else if (mesh.userData.type !== resourceType) {
      mesh.userData.type = resourceType;
      applyResourceMaterialColors(mesh.userData.crystal, colors, true, resourceType);
    }
    mesh.position.set(resource.x, resource.y ?? 0, resource.z);
    mesh.userData.available = resource.available;
    mesh.visible = resource.available !== false;
    applyResourceMaterialColors(mesh.userData.crystal, colors, resource.available, resourceType);
  }

  for (const [id, mesh] of worldState.resourceMeshes.entries()) {
    if (!seen.has(id)) {
      worldState.group.remove(mesh);
      worldState.resourceMeshes.delete(id);
    }
  }
}

export function updateMobs(/** @type {any} */ worldState, /** @type {any} */ mobs) {
  if (!worldState) return;
  worldState.lastMobs = mobs;
  const seen = new Set();

  for (const mob of mobs) {
    if (mob.dead) continue;
    seen.add(mob.id);
    let mesh = worldState.mobMeshes.get(mob.id);
    if (!mesh) {
      mesh = buildMobMesh(worldState, mob);
      worldState.mobMeshes.set(mob.id, mesh);
      worldState.group.add(mesh);
    }
    mesh.userData.mobId = mob.id;
    const nextX = mob.x;
    const nextY = mob.y ?? 0;
    const nextZ = mob.z;
    if (Number.isFinite(mesh.userData.lastX) && Number.isFinite(mesh.userData.lastZ)) {
      const dx = nextX - mesh.userData.lastX;
      const dz = nextZ - mesh.userData.lastZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > 0.0004) {
        mesh.rotation.y = Math.atan2(dx, dz);
      }
    }
    mesh.position.set(nextX, nextY, nextZ);
    mesh.userData.lastX = nextX;
    mesh.userData.lastY = nextY;
    mesh.userData.lastZ = nextZ;
  }

  for (const [id, mesh] of worldState.mobMeshes.entries()) {
    if (!seen.has(id)) {
      worldState.group.remove(mesh);
      worldState.mobMeshes.delete(id);
      worldState.mobControllers.delete(id);
    }
  }
}

export function updateCorpses(/** @type {any} */ worldState, /** @type {any} */ corpses) {
  if (!worldState) return;
  worldState.lastCorpses = corpses;
  const seen = new Set();

  for (const corpse of corpses) {
    seen.add(corpse.id);
    let mesh = worldState.corpseMeshes.get(corpse.id);
    if (!mesh) {
      mesh = buildCorpseMesh(worldState, corpse.id);
      worldState.corpseMeshes.set(corpse.id, mesh);
      worldState.group.add(mesh);
    }
    const x = corpse.x ?? corpse.pos?.x ?? 0;
    const y = corpse.y ?? corpse.pos?.y ?? 0;
    const z = corpse.z ?? corpse.pos?.z ?? 0;
    mesh.position.set(x, y, z);
  }

  for (const [id, mesh] of worldState.corpseMeshes.entries()) {
    if (!seen.has(id)) {
      worldState.group.remove(mesh);
      worldState.corpseMeshes.delete(id);
    }
  }
}

function createMobActions(/** @type {any} */ mixer, /** @type {any} */ clipSet) {
  const /** @type {any} */ actions = {
    idle: clipSet.idle ? mixer.clipAction(clipSet.idle) : null,
    walk: clipSet.walk ? mixer.clipAction(clipSet.walk) : null,
    attack: clipSet.attack ? mixer.clipAction(clipSet.attack) : null,
  };
  if (actions.attack) {
    actions.attack.setLoop(THREE.LoopOnce, 1);
    actions.attack.clampWhenFinished = true;
  }
  return actions;
}

async function hydrateMobMesh(/** @type {any} */ worldState, /** @type {any} */ mobId, /** @type {any} */ mobType, /** @type {any} */ group) {
  if (!worldState?.isActive) return;
  const type = mobType ?? group.userData?.mobType ?? 'orc';
  const gltf = await getMobPrototype(type);
  if (!worldState.isActive) return;
  if (worldState.mobMeshes.get(mobId) !== group) return;

  const model = cloneSkinned(gltf.scene);
  const targetHeight = MOB_TARGET_HEIGHTS[type] ?? 1.6;
  normalizeToHeight(model, targetHeight);
  if (group.userData.placeholder) {
    group.remove(group.userData.placeholder);
    group.userData.placeholder = null;
  }
  group.add(model);

  const clipSet = pickClips(gltf.animations ?? [], {
    idleKeywords: ['idle'],
    walkKeywords: ['walk', 'run'],
    attackKeywords: ['bite', 'attack', 'hit'],
  });

  if (clipSet.all.length) {
    const mixer = new THREE.AnimationMixer(model);
    const actions = createMobActions(mixer, clipSet);
    if (actions.idle) actions.idle.play();
    worldState.mobControllers.set(mobId, {
      mixer,
      actions,
      active: actions.idle ? 'idle' : null,
      attackUntil: 0,
      lastPos: group.position.clone(),
    });
  }
}

async function addEnvironmentModel(/** @type {any} */ worldState, /** @type {any} */ envGroup, /** @type {any} */ key, /** @type {any} */ placement) {
  if (!worldState?.isActive) return;
  const gltf = await getEnvironmentPrototype(key);
  if (!worldState.isActive) return;

  const model = cloneStatic(gltf.scene);
  const scaleInfo = applyEnvironmentScaleToModel(model, {
    key,
    category: placement.category ?? 'house',
    baseRadius: worldState.base?.radius ?? 8,
    profile: ENV_SCALE_PROFILE,
  });
  centerModelOnGroundXZ(model);
  recordEnvironmentScale(worldState, placement.id ?? key, {
    ...scaleInfo,
    id: placement.id ?? key,
    key,
    category: placement.category ?? 'house',
    placement: {
      x: placement.x,
      y: placement.y ?? 0,
      z: placement.z,
      rotation: placement.rotation ?? 0,
    },
  });
  const lod = createLODModel(model, 'box');
  lod.position.set(placement.x, placement.y ?? 0, placement.z);
  lod.rotation.y = placement.rotation ?? 0;
  envGroup.add(lod);
}

function getStructureCategory(/** @type {any} */ kind) {
  if (kind === 'market' || kind === 'barracks') return 'civic';
  if (kind === 'storage') return 'mill';
  if (kind === 'houseA' || kind === 'houseB') return 'house';
  if (kind === 'bellTower') return 'tower';
  return 'house';
}

async function loadObstacleRocks(/** @type {any} */ worldState) {
  if (!worldState?.isActive || !ASSET_PATHS.rocks?.length) return;
  const rockUrls = ASSET_PATHS.rocks;
  const rockPrototypes = await Promise.all(rockUrls.map((/** @type {any} */ url) => loadGltf(url)));
  if (!worldState.isActive) return;

  for (const mesh of worldState.obstacleMeshes) {
    const obstacle = mesh.userData?.obstacle;
    if (!obstacle) continue;

    const idx = Math.floor(Math.random() * rockPrototypes.length);
    const gltf = rockPrototypes[idx];
    if (!gltf?.scene) continue;

    const model = cloneStatic(gltf.scene);
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const targetSize = (obstacle.r ?? 1.5) * 2.5;
    const scale = targetSize / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;
    mesh.add(model);
    mesh.rotation.y = Math.random() * Math.PI * 2;
  }
}

async function loadEnvironmentModels(/** @type {any} */ worldState, /** @type {any} */ envGroup) {
  if (!worldState?.isActive) return;
  const structures = Array.isArray(worldState.structures) ? worldState.structures : [];
  const environmentPaths = /** @type {Record<string, string>} */ (ASSET_PATHS.environment ?? {});
  const placements = structures
    .filter((/** @type {any} */ structure) =>
      structure?.kind &&
      structure.kind !== 'villageCenter' &&
      typeof environmentPaths[structure.kind] === 'string'
    )
    .map((/** @type {any} */ structure) => ({
      id: structure.id ?? structure.kind,
      key: structure.kind,
      category: getStructureCategory(structure.kind),
      x: structure.x ?? 0,
      y: structure.y ?? 0,
      z: structure.z ?? 0,
      rotation: structure.rotation ?? 0,
    }));

  await Promise.all([
    ...placements.map((/** @type {any} */ placement) =>
      addEnvironmentModel(worldState, envGroup, placement.key, placement)
    ),
    loadObstacleRocks(worldState),
  ]);

  if (worldState.isActive) worldState.envReady = true;
}

export function animateWorld(/** @type {any} */ worldState, /** @type {any} */ now) {
  if (!worldState) return;
}
