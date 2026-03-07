// @ts-check
import {
  WORLD_CONFIG,
  RESOURCE_CONFIG,
  PLAYER_CONFIG,
  VENDOR_CONFIG,
  MOB_CONFIG,
} from '../../shared/config.js';
import { validateMapConfig } from '../../shared/mapConfig.js';
import { resolveVendorBuyItems } from '../../shared/economy.js';
import { buildStructureCollisionRects, isMedievalBuildingKind } from '../../shared/medievalBuildings.js';

const WORLD_SEED = WORLD_CONFIG.seed;

const MAP_SIZE = WORLD_CONFIG.mapSize;
const BASE_RADIUS = WORLD_CONFIG.baseRadius;
const OBSTACLE_COUNT = WORLD_CONFIG.obstacleCount;
const RESOURCE_COUNT = WORLD_CONFIG.resourceCount;
const MOB_COUNT = WORLD_CONFIG.mobCount;
const MOB_RESPAWN_MS = MOB_CONFIG.respawnMs;

const HARVEST_RADIUS = RESOURCE_CONFIG.harvestRadius;
const HARVEST_DURATION_MS = RESOURCE_CONFIG.harvestDurationMs;
const RESOURCE_RESPAWN_MS = RESOURCE_CONFIG.respawnMs;

const PLAYER_MAX_HP = PLAYER_CONFIG.maxHp;
const PLAYER_SPEED = PLAYER_CONFIG.speed;
const PLAYER_WALK_SPEED = PLAYER_SPEED * (PLAYER_CONFIG.walkSpeedMultiplier ?? 0.6);
const PLAYER_INV_SLOTS = PLAYER_CONFIG.invSlots;
const PLAYER_INV_STACK_MAX = PLAYER_CONFIG.invStackMax;
const PLAYER_INV_CAP = PLAYER_INV_SLOTS * PLAYER_INV_STACK_MAX;
const VENDOR_INTERACT_RADIUS = VENDOR_CONFIG.interactRadius;

function mulberry32(/** @type {any} */ seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randomRange(/** @type {any} */ rng, /** @type {any} */ min, /** @type {any} */ max) {
  return min + (max - min) * rng();
}

function distance2(/** @type {any} */ x1, /** @type {any} */ z1, /** @type {any} */ x2, /** @type {any} */ z2) {
  const dx = x1 - x2;
  const dz = z1 - z2;
  return dx * dx + dz * dz;
}

function farEnoughFromObstacles(/** @type {any} */ x, /** @type {any} */ z, /** @type {any} */ obstacles, /** @type {any} */ minDist) {
  for (const obs of obstacles) {
    if (distance2(x, z, obs.x, obs.z) < (obs.r + minDist) ** 2) {
      return false;
    }
  }
  return true;
}

function generateObstacles(/** @type {any} */ rng) {
  const half = MAP_SIZE / 2;
  const /** @type {any} */ obstacles = [];
  const maxTries = OBSTACLE_COUNT * 30;
  let tries = 0;

  while (obstacles.length < OBSTACLE_COUNT && tries < maxTries) {
    tries += 1;
    const r = randomRange(rng, 5, 14);
    const x = randomRange(rng, -half + r, half - r);
    const z = randomRange(rng, -half + r, half - r);
    const distFromBase = Math.sqrt(distance2(x, z, 0, 0));
    if (distFromBase < BASE_RADIUS + r + 8) continue;
    if (!farEnoughFromObstacles(x, z, obstacles, 8)) continue;
    obstacles.push({ x, y: 0, z, r });
  }

  return obstacles;
}

const /** @type {any} */ RESOURCE_TYPES_LIST = ['crystal', 'ore', 'herb', 'tree', 'flower'];

function generateResourceNodes(/** @type {any} */ rng, /** @type {any} */ obstacles) {
  const half = MAP_SIZE / 2;
  const /** @type {any} */ nodes = [];
  const maxTries = RESOURCE_COUNT * 40;
  let tries = 0;

  while (nodes.length < RESOURCE_COUNT && tries < maxTries) {
    tries += 1;
    const x = randomRange(rng, -half + 4, half - 4);
    const z = randomRange(rng, -half + 4, half - 4);
    const distFromBase = Math.sqrt(distance2(x, z, 0, 0));
    if (distFromBase < BASE_RADIUS + 6) continue;
    if (!farEnoughFromObstacles(x, z, obstacles, 6)) continue;
    const type = RESOURCE_TYPES_LIST[Math.floor(rng() * RESOURCE_TYPES_LIST.length)];
    nodes.push({ id: `r${nodes.length + 1}`, x, y: 0, z, type });
  }

  return nodes;
}

function generateSpawnPoints() {
  const /** @type {any} */ points = [];
  const count = 6;
  const radius = BASE_RADIUS * 0.7;
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    points.push({
      x: Math.cos(angle) * radius,
      y: 0,
      z: Math.sin(angle) * radius,
    });
  }
  return points;
}

export function createSimulatedWorld() {
  const rng = mulberry32(WORLD_SEED);
  const obstacles = generateObstacles(rng);
  const collisionObstacles = obstacles.map((/** @type {any} */ obs) => ({ ...obs }));
  const resourceNodes = generateResourceNodes(rng, obstacles);
  const spawnPoints = generateSpawnPoints();
  const /** @type {any} */ base = { x: 0, y: 0, z: 0, radius: BASE_RADIUS };
  const /** @type {any} */ vendors = [
    {
      id: 'vendor-1',
      name: 'General Vendor',
      x: base.x + base.radius + 4,
      y: 0,
      z: base.z - 2,
      buyItems: resolveVendorBuyItems({}),
    },
  ];

  return {
    mapSize: MAP_SIZE,
    base,
    obstacles,
    collisionObstacles,
    collisionRects: [],
    structures: [],
    resourceNodes,
    spawnPoints,
    mobSpawns: [],
    mobCount: MOB_COUNT,
    mobRespawnMs: MOB_RESPAWN_MS,
    harvestRadius: HARVEST_RADIUS,
    harvestDurationMs: HARVEST_DURATION_MS,
    resourceRespawnMs: RESOURCE_RESPAWN_MS,
    playerMaxHp: PLAYER_MAX_HP,
    playerSpeed: PLAYER_SPEED,
    playerWalkSpeed: PLAYER_WALK_SPEED,
    playerInvCap: PLAYER_INV_CAP,
    playerInvSlots: PLAYER_INV_SLOTS,
    playerInvStackMax: PLAYER_INV_STACK_MAX,
    vendors,
    vendorInteractRadius: VENDOR_INTERACT_RADIUS,
  };
}

export function createWorldFromConfig(/** @type {any} */ mapConfig) {
  const errors = validateMapConfig(mapConfig);
  if (errors.length) {
    throw new Error(`Invalid map config: ${errors.join(' ')}`);
  }

  const /** @type {any} */ base = {
    x: mapConfig.base.x,
    y: mapConfig.base.y ?? 0,
    z: mapConfig.base.z,
    radius: mapConfig.base.radius,
  };
  const obstacles = mapConfig.obstacles.map((/** @type {any} */ obs) => ({
    x: obs.x,
    y: obs.y ?? 0,
    z: obs.z,
    r: obs.radius ?? obs.r,
  }));
  const structures = mapConfig.structures.map((/** @type {any} */ structure) => ({
    id: structure.id,
    kind: structure.kind,
    x: structure.x,
    y: structure.y ?? 0,
    z: structure.z,
    rotation: structure.rotation ?? 0,
    colliderRadius: structure.colliderRadius,
    collides: structure.collides !== false,
  }));
  const collisionRects = structures
    .filter((/** @type {any} */ structure) =>
      structure.collides !== false &&
      isMedievalBuildingKind(structure.kind)
    )
    .flatMap((/** @type {any} */ structure) => buildStructureCollisionRects(structure));
  const collisionObstacles = [
    ...obstacles,
    ...structures
      .filter((/** @type {any} */ structure) =>
        structure.collides !== false &&
        !isMedievalBuildingKind(structure.kind) &&
        Number.isFinite(structure.colliderRadius) &&
        structure.colliderRadius > 0
      )
      .map((/** @type {any} */ structure) => ({
        x: structure.x,
        y: structure.y ?? 0,
        z: structure.z,
        r: structure.colliderRadius,
      })),
  ];
  const resourceNodes = mapConfig.resourceNodes.map((/** @type {any} */ node) => ({
    id: node.id,
    x: node.x,
    y: node.y ?? 0,
    z: node.z,
    type: node.type ?? 'crystal',
    respawnMs: node.respawnMs,
  }));
  const spawnPoints = mapConfig.spawnPoints.map((/** @type {any} */ point) => ({
    x: point.x,
    y: point.y ?? 0,
    z: point.z,
  }));
  const vendors = mapConfig.vendors.map((/** @type {any} */ vendor) => {
    const buyItems = resolveVendorBuyItems(vendor);
    return {
      id: vendor.id,
      name: vendor.name,
      x: vendor.x,
      y: vendor.y ?? 0,
      z: vendor.z,
      buyItems,
    };
  });
  const mobSpawns = mapConfig.mobSpawns.map((/** @type {any} */ spawn) => ({
    id: spawn.id,
    x: spawn.x,
    y: spawn.y ?? 0,
    z: spawn.z,
    mobType: spawn.mobType ?? 'orc',
    aggressive: spawn.aggressive !== false,
    level: spawn.level,
    levelVariance: spawn.levelVariance ?? 0,
  }));

  return {
    mapSize: mapConfig.mapSize,
    mapYMin: mapConfig.mapYMin,
    mapYMax: mapConfig.mapYMax,
    base,
    obstacles,
    collisionObstacles,
    collisionRects,
    structures,
    resourceNodes,
    spawnPoints,
    mobSpawns,
    mobCount: mobSpawns.length,
    mobRespawnMs: MOB_RESPAWN_MS,
    harvestRadius: HARVEST_RADIUS,
    harvestDurationMs: HARVEST_DURATION_MS,
    resourceRespawnMs: RESOURCE_RESPAWN_MS,
    playerMaxHp: PLAYER_MAX_HP,
    playerSpeed: PLAYER_SPEED,
    playerWalkSpeed: PLAYER_WALK_SPEED,
    playerInvCap: PLAYER_INV_CAP,
    playerInvSlots: PLAYER_INV_SLOTS,
    playerInvStackMax: PLAYER_INV_STACK_MAX,
    vendors,
    vendorInteractRadius: VENDOR_INTERACT_RADIUS,
  };
}

export function createWorld(/** @type {any} */ mapConfig) {
  return createWorldFromConfig(mapConfig);
}

export function worldSnapshot(/** @type {any} */ world) {
  return {
    mapSize: world.mapSize,
    mapYMin: world.mapYMin,
    mapYMax: world.mapYMax,
    base: world.base,
    obstacles: world.obstacles,
    collisionObstacles: world.collisionObstacles ?? world.obstacles,
    collisionRects: world.collisionRects ?? [],
    structures: world.structures ?? [],
    harvestRadius: world.harvestRadius,
    harvestDurationMs: world.harvestDurationMs,
    playerSpeed: world.playerSpeed,
    playerWalkSpeed: world.playerWalkSpeed ?? PLAYER_WALK_SPEED,
    playerInvSlots: world.playerInvSlots,
    playerInvStackMax: world.playerInvStackMax,
    vendors: world.vendors ?? [],
    vendorInteractRadius: world.vendorInteractRadius ?? VENDOR_INTERACT_RADIUS,
  };
}
