import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import {
  assembleVendorModel,
  cloneSkinned,
  loadGltf,
  loadPlayerAnimations,
  normalizeToHeight,
  pickClips,
} from './assets.js';

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
};

let mobPrototypePromise = null;
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

function getMobPrototype() {
  if (!mobPrototypePromise) {
    mobPrototypePromise = loadGltf(ASSET_PATHS.monsters.orc);
  }
  return mobPrototypePromise;
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
  const texture = buildTileTexture();
  texture.repeat.set(mapSize / tileSize, mapSize / tileSize);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(mapSize, mapSize),
    new THREE.MeshStandardMaterial({
      map: texture,
      color: COLORS.ground,
      emissive: 0x121a16,
      emissiveIntensity: 0.35,
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

  village.position.set(base.x, 0, base.z);
  return village;
}

function buildObstacleMesh(obstacle) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(obstacle.r, obstacle.r, 2.4, 10),
    new THREE.MeshStandardMaterial({ color: COLORS.obstacle, roughness: 1 })
  );
  mesh.position.set(obstacle.x, 1.2, obstacle.z);
  return mesh;
}

function buildResourceMesh() {
  const group = new THREE.Group();
  const crystal = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 1.6, 6),
    new THREE.MeshStandardMaterial({
      color: COLORS.resource,
      emissive: COLORS.resource,
      emissiveIntensity: 0.2,
      roughness: 0.4,
    })
  );
  crystal.position.y = 0.8;
  group.add(crystal);
  group.userData.crystal = crystal;
  group.userData.pulseOffset = Math.random() * Math.PI * 2;
  return group;
}

function buildMobMesh(worldState, mobId) {
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

  hydrateMobMesh(worldState, mobId, group).catch((err) => {
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

  group.position.set(vendor.x, 0, vendor.z);
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
    vendorMeshes,
    vendorControllers: new Map(),
    isActive: true,
    lastResources: [],
    lastMobs: [],
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
    let mesh = worldState.resourceMeshes.get(resource.id);
    if (!mesh) {
      mesh = buildResourceMesh();
      worldState.resourceMeshes.set(resource.id, mesh);
      worldState.group.add(mesh);
    }
    mesh.position.set(resource.x, 0, resource.z);
    mesh.userData.available = resource.available;
    const crystal = mesh.userData.crystal;
    if (crystal) {
      if (resource.available) {
        crystal.material.color.setHex(COLORS.resource);
        crystal.material.emissive.setHex(COLORS.resource);
        crystal.material.emissiveIntensity = 0.25;
      } else {
        crystal.material.color.setHex(COLORS.resourceDim);
        crystal.material.emissive.setHex(COLORS.resourceDim);
        crystal.material.emissiveIntensity = 0.05;
      }
    }
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
      mesh = buildMobMesh(worldState, mob.id);
      worldState.mobMeshes.set(mob.id, mesh);
      worldState.group.add(mesh);
    }
    mesh.userData.mobId = mob.id;
    const prev = mesh.userData.lastPos;
    const nextPos = new THREE.Vector3(mob.x, 0, mob.z);
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

async function hydrateMobMesh(worldState, mobId, group) {
  if (!worldState?.isActive) return;
  const gltf = await getMobPrototype();
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
  model.position.set(placement.x, 0, placement.z);
  model.rotation.y = placement.rotation ?? 0;
  envGroup.add(model);
}

async function addTreeClusters(worldState, envGroup, obstacles) {
  if (!worldState?.isActive) return;
  const gltf = await getEnvironmentPrototype('trees');
  if (!worldState.isActive) return;
  const picks = Array.isArray(obstacles) ? obstacles.slice(0, 4) : [];
  for (const obstacle of picks) {
    const model = cloneStatic(gltf.scene);
    normalizeToHeight(model, 5);
    model.position.set(obstacle.x + 2, 0, obstacle.z + 2);
    model.rotation.y = (Math.random() * Math.PI) / 2;
    envGroup.add(model);
  }
}

async function loadEnvironmentModels(worldState, envGroup, base, obstacles) {
  if (!worldState?.isActive) return;
  const ring = (base?.radius ?? 8) + 6;
  const diag = ring * 0.7;
  const placements = [
    { key: 'market', x: base.x + ring, z: base.z, rotation: Math.PI / 2, height: 4.8 },
    { key: 'barracks', x: base.x - ring, z: base.z, rotation: -Math.PI / 2, height: 5.6 },
    { key: 'storage', x: base.x, z: base.z + ring, rotation: Math.PI, height: 4.4 },
    { key: 'houseA', x: base.x, z: base.z - ring, rotation: 0, height: 3.6 },
    { key: 'houseB', x: base.x + diag, z: base.z + diag, rotation: Math.PI / 4, height: 3.8 },
  ];

  await Promise.all(
    placements.map((placement) =>
      addEnvironmentModel(worldState, envGroup, placement.key, placement)
    )
  );

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
