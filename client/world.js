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

const LOD_FAR_DISTANCE = 63; // 50 * 1.25

const COLORS = {
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

const RESOURCE_TYPE_COLORS = {
  crystal: { active: 0x5ef2c2, dim: 0x1b2a28 },
  ore: { active: 0x8b7355, dim: 0x3d3228 },
  herb: { active: 0x5ec24e, dim: 0x1b2a1b },
  tree: { active: 0x8b6914, dim: 0x3d3228 },
  flower: { active: 0xe85d9a, dim: 0x4a2a35 },
};

const mobPrototypeCache = new Map();
let vendorPrototypePromise = null;
let vendorClipsPromise = null;
const environmentCache = new Map();

function getVendorPrototype() {
  if (!vendorPrototypePromise) {
    vendorPrototypePromise = assembleVendorModel();
  }
  return vendorPrototypePromise;
}

function getVendorClips() {
  if (!vendorClipsPromise) {
    vendorClipsPromise = loadPlayerAnimations().then((clips) =>
      pickClips(clips, {
        idleNames: ['Idle_Loop', 'Idle_No_Loop', 'Idle_Talking_Loop', 'Idle_FoldArms_Loop'],
        idleKeywords: ['idle'],
      })
    );
  }
  return vendorClipsPromise;
}

function cloneStatic(scene) {
  return scene.clone(true);
}

function createLODModel(fullModel, impostorType = 'box') {
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

function getMobPrototype(mobType) {
  const type = mobType ?? 'orc';
  const url = ASSET_PATHS.monsters[type] ?? ASSET_PATHS.monsters.orc;
  if (!mobPrototypeCache.has(type)) {
    mobPrototypeCache.set(type, loadGltf(url));
  }
  return mobPrototypeCache.get(type);
}

function getEnvironmentPrototype(key) {
  if (!environmentCache.has(key)) {
    const url = ASSET_PATHS.environment[key];
    environmentCache.set(key, loadGltf(url));
  }
  return environmentCache.get(key);
}

function buildTileTexture() {
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

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

function buildGround(mapSize) {
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

function buildVillage(base) {
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

  const hutCount = 6;
  const hutRadius = base.radius * 0.65;
  for (let i = 0; i < hutCount; i += 1) {
    const angle = (i / hutCount) * Math.PI * 2;
    const hx = Math.cos(angle) * hutRadius;
    const hz = Math.sin(angle) * hutRadius;
    const hut = new THREE.Group();
    const walls = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 1.6, 8),
      new THREE.MeshStandardMaterial({
        color: 0x6d5841,
        roughness: 1,
      })
    );
    walls.position.y = 0.8;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(1.4, 1.2, 8),
      new THREE.MeshStandardMaterial({
        color: 0x8c3f2d,
        roughness: 0.7,
      })
    );
    roof.position.y = 2;
    hut.add(walls, roof);
    hut.position.set(hx, 0, hz);
    hut.userData.placeholder = true;
    village.add(hut);
  }

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

  village.position.set(base.x, base.y ?? 0, base.z);
  village.userData.base = base;
  return village;
}

function buildObstacleMesh(obstacle) {
  const group = new THREE.Group();
  const placeholder = new THREE.Mesh(
    new THREE.CylinderGeometry(obstacle.r, obstacle.r, 2.4, 10),
    new THREE.MeshStandardMaterial({ color: COLORS.obstacle, roughness: 1 })
  );
  placeholder.position.y = 1.2;
  group.add(placeholder);
  group.position.set(obstacle.x, obstacle.y ?? 0, obstacle.z);
  group.userData.placeholder = placeholder;
  group.userData.obstacle = obstacle;
  return group;
}

function buildCorpseMesh() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.15, 0.4),
    new THREE.MeshStandardMaterial({
      color: COLORS.corpse,
      roughness: 1,
    })
  );
  base.position.y = 0.075;
  group.add(base);
  const cross = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.5, 0.08),
    new THREE.MeshStandardMaterial({
      color: COLORS.corpseCross,
      roughness: 1,
    })
  );
  cross.position.set(0, 0.4, 0);
  group.add(cross);
  const crossBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.08, 0.08),
    new THREE.MeshStandardMaterial({
      color: COLORS.corpseCross,
      roughness: 1,
    })
  );
  crossBar.position.set(0, 0.55, 0);
  group.add(crossBar);
  return group;
}

function buildResourceMesh(type = 'crystal') {
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
  group.userData.pulseOffset = Math.random() * Math.PI * 2;

  hydrateResourceMesh(type, group).catch((err) => {
    console.warn('[world] Failed to load resource node model:', err);
  });

  return group;
}

function applyResourceMaterialColors(ref, colors, available) {
  if (!ref) return;
  const intensity = available ? 0.25 : 0.05;
  const color = available ? colors.active : colors.dim;
  const mats = [];
  if (ref.isMesh && ref.material) {
    mats.push(...(Array.isArray(ref.material) ? ref.material : [ref.material]));
  }
  ref.traverse?.((n) => {
    if (n?.isMesh && n.material) mats.push(...(Array.isArray(n.material) ? n.material : [n.material]));
  });
  mats.forEach((m) => {
    if (m.color) m.color.setHex(color);
    if (m.emissive) m.emissive.setHex(color);
    if (m.emissiveIntensity !== undefined) m.emissiveIntensity = intensity;
  });
}

async function hydrateResourceMesh(type, group) {
  const url = ASSET_PATHS.resourceNodes?.[type] ?? ASSET_PATHS.resourceNodes?.crystal;
  if (!url) return;
  const gltf = await loadGltf(url);
  if (!gltf?.scene) return;
  const model = gltf.scene.clone(true);
  normalizeToHeight(model, 1.6);
  model.position.y = 0.8;
  group.remove(group.userData.placeholder);
  group.userData.placeholder = null;
  group.userData.crystal = model;
  group.add(model);
  group.rotation.y = Math.random() * Math.PI * 2;
}

function buildMobMesh(worldState, mob) {
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

  hydrateMobMesh(worldState, mobId, mobType, group).catch((err) => {
    console.warn('[world] Failed to load mob model:', err);
  });

  return group;
}

function makeNameSprite(text) {
  const canvas = document.createElement('canvas');
  const padding = 24;
  const fontSize = 22;
  const ctx = canvas.getContext('2d');
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

function buildVendorMesh(vendor, worldState) {
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

  group.position.set(vendor.x, vendor.y ?? 0, vendor.z);
  group.userData.vendorId = vendor.id;

  hydrateVendorMesh(worldState, vendor.id, group).catch((err) => {
    console.warn('[world] Failed to load vendor model:', err);
  });

  return group;
}

async function hydrateVendorMesh(worldState, vendorId, group) {
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

export function initWorld(scene, world) {
  const mapSize = world?.mapSize ?? 400;
  const base = world?.base ?? { x: 0, z: 0, radius: 8 };

  const group = new THREE.Group();
  const envGroup = new THREE.Group();
  envGroup.name = 'environment';
  const ground = buildGround(mapSize);
  const baseMesh = buildVillage(base);
  const obstacleMeshes = (world?.obstacles ?? []).map(buildObstacleMesh);
  const vendorMeshes = new Map();

  const worldState = {
    mapSize,
    base,
    obstacles: world?.obstacles ?? [],
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
    isActive: true,
    lastResources: [],
    lastMobs: [],
    lastCorpses: [],
  };

  for (const vendor of world?.vendors ?? []) {
    const vendorMesh = buildVendorMesh(vendor, worldState);
    vendorMeshes.set(vendor.id, vendorMesh);
    group.add(vendorMesh);
  }

  group.add(ground, baseMesh, envGroup, ...obstacleMeshes);
  scene.add(group);

  loadEnvironmentModels(worldState, envGroup, base, worldState.obstacles).catch(
    (err) => {
      console.warn('[world] Failed to load environment models:', err);
    }
  );

  return worldState;
}

export function updateResources(worldState, resources) {
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
      applyResourceMaterialColors(mesh.userData.crystal, colors, true);
    }
    mesh.position.set(resource.x, resource.y ?? 0, resource.z);
    mesh.userData.available = resource.available;
    applyResourceMaterialColors(mesh.userData.crystal, colors, resource.available);
  }

  for (const [id, mesh] of worldState.resourceMeshes.entries()) {
    if (!seen.has(id)) {
      worldState.group.remove(mesh);
      worldState.resourceMeshes.delete(id);
    }
  }
}

export function updateMobs(worldState, mobs) {
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
    const prev = mesh.userData.lastPos;
    const nextPos = new THREE.Vector3(mob.x, mob.y ?? 0, mob.z);
    if (prev) {
      const dx = nextPos.x - prev.x;
      const dz = nextPos.z - prev.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > 0.0004) {
        mesh.rotation.y = Math.atan2(dx, dz);
      }
    }
    mesh.position.copy(nextPos);
    mesh.userData.lastPos = nextPos;
  }

  for (const [id, mesh] of worldState.mobMeshes.entries()) {
    if (!seen.has(id)) {
      worldState.group.remove(mesh);
      worldState.mobMeshes.delete(id);
      worldState.mobControllers.delete(id);
    }
  }
}

export function updateCorpses(worldState, corpses) {
  if (!worldState) return;
  worldState.lastCorpses = corpses;
  const seen = new Set();

  for (const corpse of corpses) {
    seen.add(corpse.id);
    let mesh = worldState.corpseMeshes.get(corpse.id);
    if (!mesh) {
      mesh = buildCorpseMesh();
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

function createMobActions(mixer, clipSet) {
  const actions = {
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

async function hydrateMobMesh(worldState, mobId, mobType, group) {
  if (!worldState?.isActive) return;
  const type = mobType ?? group.userData?.mobType ?? 'orc';
  const gltf = await getMobPrototype(type);
  if (!worldState.isActive) return;
  if (worldState.mobMeshes.get(mobId) !== group) return;

  const model = cloneSkinned(gltf.scene);
  normalizeToHeight(model, 1.6);
  group.clear();
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

async function addEnvironmentModel(worldState, envGroup, key, placement) {
  if (!worldState?.isActive) return;
  const gltf = await getEnvironmentPrototype(key);
  if (!worldState.isActive) return;

  const model = cloneStatic(gltf.scene);
  normalizeToHeight(model, placement.height ?? 4);
  const lod = createLODModel(model, 'box');
  lod.position.set(placement.x, placement.y ?? 0, placement.z);
  lod.rotation.y = placement.rotation ?? 0;
  envGroup.add(lod);
}

async function addTreeClusters(worldState, envGroup, obstacles) {
  if (!worldState?.isActive) return;
  const gltf = await getEnvironmentPrototype('trees');
  if (!worldState.isActive) return;
  const picks = Array.isArray(obstacles) ? obstacles.slice(0, 4) : [];
  for (const obstacle of picks) {
    const model = cloneStatic(gltf.scene);
    normalizeToHeight(model, 5);
    const lod = createLODModel(model, 'cone');
    lod.position.set(obstacle.x + 2, obstacle.y ?? 0, obstacle.z + 2);
    lod.rotation.y = (Math.random() * Math.PI) / 2;
    envGroup.add(lod);
  }
}

async function loadObstacleRocks(worldState) {
  if (!worldState?.isActive || !ASSET_PATHS.rocks?.length) return;
  const rockUrls = ASSET_PATHS.rocks;
  const rockPrototypes = await Promise.all(rockUrls.map((url) => loadGltf(url)));
  if (!worldState.isActive) return;

  for (const mesh of worldState.obstacleMeshes) {
    const placeholder = mesh.userData?.placeholder;
    const obstacle = mesh.userData?.obstacle;
    if (!placeholder || !obstacle) continue;

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
    mesh.remove(placeholder);
    mesh.userData.placeholder = null;
    mesh.add(model);
    mesh.rotation.y = Math.random() * Math.PI * 2;
  }
}

async function loadEnvironmentModels(worldState, envGroup, base, obstacles) {
  if (!worldState?.isActive) return;
  const ring = (base?.radius ?? 8) + 6;
  const diag = ring * 0.7;
  const towerRadius = 65;
  const placements = [
    { key: 'market', x: base.x + ring, z: base.z, rotation: Math.PI / 2, height: 4.8 },
    { key: 'barracks', x: base.x - ring, z: base.z, rotation: -Math.PI / 2, height: 5.6 },
    { key: 'storage', x: base.x, z: base.z + ring, rotation: Math.PI, height: 4.4 },
    { key: 'houseA', x: base.x, z: base.z - ring, rotation: 0, height: 3.6 },
    { key: 'houseB', x: base.x + diag, z: base.z + diag, rotation: Math.PI / 4, height: 3.8 },
    { key: 'bellTower', x: base.x, z: base.z + towerRadius, rotation: 0, height: 8 },
  ];

  await Promise.all([
    ...placements.map((placement) =>
      addEnvironmentModel(worldState, envGroup, placement.key, placement)
    ),
    loadObstacleRocks(worldState),
  ]);

  await addTreeClusters(worldState, envGroup, obstacles);
  if (worldState.isActive) worldState.envReady = true;
}

export function animateWorld(worldState, now) {
  if (!worldState) return;
  for (const mesh of worldState.resourceMeshes.values()) {
    const available = mesh.userData.available;
    if (!available) {
      mesh.scale.set(0.85, 0.6, 0.85);
      continue;
    }
    const offset = mesh.userData.pulseOffset ?? 0;
    const pulse = 1 + 0.08 * Math.sin(now * 0.004 + offset);
    mesh.scale.set(pulse, pulse, pulse);
  }
}
